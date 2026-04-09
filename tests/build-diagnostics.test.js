const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { runWorkspaceBuilds } = require("../src/build-diagnostics");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mvi-build-"));
}

test("genere un rapport de build meme quand gradle est absent", () => {
  const tempDir = createTempDir();
  const workspace = {
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: path.join(tempDir, "stage-01"),
        loader: "Forge",
        gameVersion: "1.12.2",
        java: "Java 8"
      }
    ]
  };

  fs.mkdirSync(workspace.stages[0].path, { recursive: true });

  const summary = runWorkspaceBuilds(workspace);
  const stageReport = summary.stageReports[0];

  assert.equal(summary.stageCount, 1);
  assert.equal(summary.failureCount, 1);
  assert.equal(fs.existsSync(stageReport.logPath), true);
  assert.ok(stageReport.errorSummary.length >= 1);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("extrait des erreurs structurees fichier ligne depuis la sortie de build", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-01");
  fs.mkdirSync(stagePath, { recursive: true });

  fs.writeFileSync(
    path.join(stagePath, "gradlew.bat"),
    [
      "@echo off",
      "echo src\\main\\java\\demo\\Example.java:42: error: cannot find symbol",
      "echo * What went wrong: Execution failed for task ':compileJava'.",
      "exit /b 1"
    ].join("\r\n"),
    "utf8"
  );

  const summary = runWorkspaceBuilds({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Forge",
        gameVersion: "1.20.1",
        java: "Java 17"
      }
    ]
  });

  const stageReport = summary.stageReports[0];
  assert.equal(stageReport.success, false);
  assert.ok(stageReport.issues.some((issue) => issue.file && issue.line === 42));
  assert.ok(stageReport.issues.some((issue) => issue.type === "gradle"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});
