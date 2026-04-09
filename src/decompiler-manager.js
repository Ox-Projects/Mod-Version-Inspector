const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawnSync } = require("child_process");
const { injectDecompiledSources } = require("./stage-sync");

const CFR_VERSION = "0.152";
const CFR_URL = `https://repo1.maven.org/maven2/org/benf/cfr/${CFR_VERSION}/cfr-${CFR_VERSION}.jar`;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_error) {
    return false;
  }
}

function detectJavaRuntime() {
  const result = spawnSync("java", ["-version"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return {
      available: false,
      command: "java",
      version: null,
      details: (result.stderr || result.stdout || "").trim()
    };
  }

  const output = `${result.stderr || ""}\n${result.stdout || ""}`;
  const versionMatch = output.match(/version\s+"([^"]+)"/i);

  return {
    available: true,
    command: "java",
    version: versionMatch ? versionMatch[1] : "inconnue",
    details: output.trim()
  };
}

function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(response.headers.location, destinationPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Téléchargement impossible (HTTP ${response.statusCode}).`));
        response.resume();
        return;
      }

      ensureDir(path.dirname(destinationPath));
      const file = fs.createWriteStream(destinationPath);
      response.pipe(file);

      file.on("finish", () => {
        file.close(() => resolve(destinationPath));
      });

      file.on("error", (error) => {
        file.close(() => reject(error));
      });
    });

    request.on("error", reject);
  });
}

async function ensureCfrJar(workspaceRoot) {
  const toolsDir = path.join(workspaceRoot, "tools", "cfr");
  const cfrJarPath = path.join(toolsDir, `cfr-${CFR_VERSION}.jar`);

  if (!fileExists(cfrJarPath)) {
    await downloadFile(CFR_URL, cfrJarPath);
  }

  return {
    version: CFR_VERSION,
    jarPath: cfrJarPath,
    sourceUrl: CFR_URL
  };
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, value, "utf8");
}

function buildPowerShellScript(javaCommand, cfrJarPath, artifactPath, outputDir) {
  return `$ErrorActionPreference = "Stop"
$java = "${javaCommand.replace(/"/g, '""')}"
$cfr = "${cfrJarPath.replace(/"/g, '""')}"
$artifact = "${artifactPath.replace(/"/g, '""')}"
$out = "${outputDir.replace(/"/g, '""')}"

New-Item -ItemType Directory -Force -Path $out | Out-Null
& $java -jar $cfr $artifact --outputdir $out --caseinsensitivefs true
`;
}

function runCfr(javaCommand, cfrJarPath, artifactPath, outputDir) {
  ensureDir(outputDir);
  const result = spawnSync(javaCommand, ["-jar", cfrJarPath, artifactPath, "--outputdir", outputDir, "--caseinsensitivefs", "true"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "Décompilation CFR impossible.").trim());
  }

  return {
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim()
  };
}

async function prepareDecompilation(workspace) {
  if (!workspace?.workspaceRoot || !workspace?.artifactPath) {
    throw new Error("Workspace invalide pour préparer la décompilation.");
  }

  const java = detectJavaRuntime();
  const cfr = await ensureCfrJar(workspace.workspaceRoot);
  const decompiledDir = path.join(workspace.workspaceRoot, "decompiled-sources");
  const scriptsDir = path.join(workspace.workspaceRoot, "scripts");
  ensureDir(scriptsDir);

  const ps1Path = path.join(scriptsDir, "decompile.ps1");
  writeText(ps1Path, buildPowerShellScript(java.command, cfr.jarPath, workspace.artifactPath, decompiledDir));

  if (!java.available) {
    return {
      java,
      cfr,
      decompiled: false,
      decompiledPath: decompiledDir,
      scriptPath: ps1Path,
      message: "CFR est prêt, mais Java n'est pas installé ou n'est pas accessible. Le script de décompilation a été généré."
    };
  }

  const result = runCfr(java.command, cfr.jarPath, workspace.artifactPath, decompiledDir);
  const injected = injectDecompiledSources(workspace, decompiledDir);

  return {
    java,
    cfr,
    decompiled: true,
    decompiledPath: decompiledDir,
    injected,
    scriptPath: ps1Path,
    output: result,
    message: "Décompilation préparée et exécutée avec succès."
  };
}

module.exports = {
  CFR_VERSION,
  CFR_URL,
  detectJavaRuntime,
  prepareDecompilation
};
