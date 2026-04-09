const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8"
  });

  return result.status === 0;
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, value, "utf8");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeLog(filePath, value) {
  fs.writeFileSync(filePath, value, "utf8");
}

function buildStageBuildScript(stagePath) {
  return `$ErrorActionPreference = "Stop"
Set-Location "${stagePath.replace(/"/g, '""')}"

if (Test-Path ".\\gradlew.bat") {
  .\\gradlew.bat build
  exit $LASTEXITCODE
}

if (Get-Command gradle -ErrorAction SilentlyContinue) {
  gradle build
  exit $LASTEXITCODE
}

Write-Error "Aucun gradlew.bat ni gradle n'est disponible pour ce stage."
`;
}

function prepareStageDiagnostics(stage) {
  const scriptsDir = path.join(stage.path, "scripts");
  const notesDir = path.join(stage.path, "notes");
  ensureDir(scriptsDir);
  ensureDir(notesDir);

  const buildScriptPath = path.join(scriptsDir, "build-stage.ps1");
  writeText(buildScriptPath, buildStageBuildScript(stage.path));

  const report = {
    preparedAt: new Date().toISOString(),
    loader: stage.loader,
    gameVersion: stage.gameVersion,
    java: stage.java,
    gradleWrapperPresent: fs.existsSync(path.join(stage.path, "gradlew.bat")),
    gradleAvailableOnHost: commandAvailable("gradle"),
    javaAvailableOnHost: commandAvailable("java"),
    buildScriptPath
  };

  writeJson(path.join(notesDir, "build-diagnostic.json"), report);
  return report;
}

function prepareWorkspaceDiagnostics(workspace) {
  const reports = (workspace?.stages || []).map((stage) => ({
    stagePath: stage.path,
    ...prepareStageDiagnostics(stage)
  }));

  return {
    preparedAt: new Date().toISOString(),
    stageReports: reports
  };
}

function collectErrorSummary(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /error|failed|failure|exception/i.test(line))
    .slice(0, 12);
}

function parseBuildIssues(output, stagePath) {
  const lines = String(output || "").split(/\r?\n/);
  const issues = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const windowsPathMatch = trimmed.match(/^([A-Za-z]:\\[^:]+(?:\.\w+)):(\d+):(?:(\d+):)?\s*(error|warning)?\s*:?\s*(.+)$/i);
    const unixPathMatch = trimmed.match(/^((?:\.\/|\/)[^:]+(?:\.\w+)):(\d+):(?:(\d+):)?\s*(error|warning)?\s*:?\s*(.+)$/i);
    const gradlePathMatch = trimmed.match(/^\*\s*What went wrong:\s*(.+)$/i);
    const simpleJavaMatch = trimmed.match(/^(.+?\.(?:java|kt|groovy)):(\d+):\s*(.+)$/i);

    let issue = null;

    if (windowsPathMatch || unixPathMatch) {
      const match = windowsPathMatch || unixPathMatch;
      issue = {
        type: "compiler",
        file: match[1],
        line: Number.parseInt(match[2], 10),
        column: match[3] ? Number.parseInt(match[3], 10) : null,
        severity: (match[4] || "error").toLowerCase(),
        message: match[5].trim()
      };
    } else if (simpleJavaMatch) {
      issue = {
        type: "compiler",
        file: path.isAbsolute(simpleJavaMatch[1]) ? simpleJavaMatch[1] : path.join(stagePath, simpleJavaMatch[1]),
        line: Number.parseInt(simpleJavaMatch[2], 10),
        column: null,
        severity: "error",
        message: simpleJavaMatch[3].trim()
      };
    } else if (gradlePathMatch) {
      issue = {
        type: "gradle",
        file: null,
        line: null,
        column: null,
        severity: "error",
        message: gradlePathMatch[1].trim()
      };
    } else if (/error|failed|failure|exception/i.test(trimmed)) {
      issue = {
        type: "generic",
        file: null,
        line: null,
        column: null,
        severity: "error",
        message: trimmed
      };
    }

    if (!issue) {
      continue;
    }

    const key = JSON.stringify(issue);
    if (!seen.has(key)) {
      seen.add(key);
      issues.push(issue);
    }

    if (issues.length >= 25) {
      break;
    }
  }

  return issues;
}

function ensureStageBuildScript(stage) {
  const scriptsDir = path.join(stage.path, "scripts");
  ensureDir(scriptsDir);
  const buildScriptPath = path.join(scriptsDir, "build-stage.ps1");
  if (!fs.existsSync(buildScriptPath)) {
    writeText(buildScriptPath, buildStageBuildScript(stage.path));
  }
  return buildScriptPath;
}

function runStageBuild(stage) {
  const notesDir = path.join(stage.path, "notes");
  ensureDir(notesDir);

  const buildScriptPath = ensureStageBuildScript(stage);
  const startedAt = new Date().toISOString();
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", buildScriptPath],
    {
      cwd: stage.path,
      encoding: "utf8",
      timeout: 15 * 60 * 1000
    }
  );

  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  const combinedOutput = [stdout, stderr].filter(Boolean).join("\n");
  const timedOut = result.signal === "SIGTERM" && result.status === null;
  const issues = parseBuildIssues(combinedOutput, stage.path);

  const report = {
    stagePath: stage.path,
    loader: stage.loader,
    gameVersion: stage.gameVersion,
    java: stage.java,
    startedAt,
    finishedAt: new Date().toISOString(),
    command: `powershell -NoProfile -ExecutionPolicy Bypass -File "${buildScriptPath}"`,
    success: result.status === 0,
    exitCode: result.status,
    signal: result.signal,
    timedOut,
    stdout,
    stderr,
    errorSummary: collectErrorSummary(combinedOutput),
    issues,
    buildScriptPath,
    logPath: path.join(notesDir, "build-output.log")
  };

  writeLog(
    report.logPath,
    [
      `# Build stage`,
      `Stage: ${stage.path}`,
      `Started: ${report.startedAt}`,
      `Finished: ${report.finishedAt}`,
      `Exit code: ${report.exitCode}`,
      `Signal: ${report.signal || "-"}`,
      ``,
      `## STDOUT`,
      stdout || "(empty)",
      ``,
      `## STDERR`,
      stderr || "(empty)"
    ].join("\n")
  );
  writeJson(path.join(notesDir, "build-result.json"), report);

  return report;
}

function runSingleStageBuild(workspace, stagePath) {
  const stage = (workspace?.stages || []).find((item) => item.path === stagePath);
  if (!stage) {
    throw new Error("Stage introuvable pour ce build.");
  }

  return runStageBuild(stage);
}

function runWorkspaceBuilds(workspace) {
  if (!workspace?.stages?.length) {
    throw new Error("Aucun stage disponible pour lancer un build.");
  }

  const reportsDir = workspace.reportsPath || path.join(workspace.workspaceRoot || "", "reports");
  if (reportsDir) {
    ensureDir(reportsDir);
  }

  const stageReports = workspace.stages.map((stage) => runStageBuild(stage));
  const summary = {
    startedAt: stageReports[0]?.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    workspaceRoot: workspace.workspaceRoot,
    stageCount: stageReports.length,
    successCount: stageReports.filter((report) => report.success).length,
    failureCount: stageReports.filter((report) => !report.success).length,
    stageReports
  };

  if (reportsDir) {
    writeJson(path.join(reportsDir, "build-results.json"), summary);
  }

  return summary;
}

module.exports = {
  prepareWorkspaceDiagnostics,
  runSingleStageBuild,
  runWorkspaceBuilds
};
