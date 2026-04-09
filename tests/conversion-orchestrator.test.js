const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { convertArtifact } = require("../src/conversion-orchestrator");

test("orchestre automatiquement plan workspace patchs et builds", async () => {
  const workspace = {
    workspaceRoot: "C:\\temp\\workspace",
    reportsPath: "C:\\temp\\workspace\\reports",
    stages: [
      {
        path: "C:\\temp\\workspace\\stages\\01-demo",
        loader: "Forge",
        gameVersion: "1.20.1",
        java: "Java 17"
      }
    ]
  };

  const conversion = await convertArtifact({
    inspection: {
      detection: {
        loader: "Forge",
        gameVersion: "1.12.2",
        java: "Java 8"
      }
    },
    target: {
      loader: "Forge",
      gameVersion: "1.20.1",
      java: "Java 17"
    },
    baseDir: "C:\\temp\\migrations",
    dependencies: {
      planMigration: () => ({ phases: [{}], staircase: ["1.12.2", "1.20.1"] }),
      createMigrationWorkspace: () => workspace,
      prepareDecompilation: async () => ({ decompiled: false, message: "Décompilation ignorée pour le test." }),
      applyAutomaticPatches: () => ({ patchedStageCount: 1, stageCount: 1, stageReports: [] }),
      runWorkspaceBuilds: () => ({
        stageCount: 1,
        successCount: 1,
        failureCount: 0,
        stageReports: [
          {
            stagePath: workspace.stages[0].path,
            success: true
          }
        ]
      })
    }
  });

  assert.equal(conversion.workspace.workspaceRoot, workspace.workspaceRoot);
  assert.equal(conversion.steps.length, 5);
  assert.equal(conversion.steps[0].name, "plan");
  assert.equal(conversion.steps[4].name, "build");
  assert.equal(conversion.result.finalStagePath, workspace.stages[0].path);
  assert.equal(conversion.result.primaryOutputPath, workspace.stages[0].path);
  assert.equal(conversion.summary.patchedStageCount, 1);
  assert.equal(conversion.summary.buildSuccessCount, 1);
  assert.equal(conversion.summary.buildFailureCount, 0);
  assert.equal(conversion.success, true);
});

test("choisit en sortie principale le premier artefact jar réussi trouvé", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mvi-convert-"));
  const stage1 = path.join(tempDir, "stages", "01");
  const stage2 = path.join(tempDir, "stages", "02");
  fs.mkdirSync(path.join(stage1, "build", "libs"), { recursive: true });
  fs.mkdirSync(path.join(stage2, "build", "libs"), { recursive: true });
  fs.writeFileSync(path.join(stage1, "build", "libs", "mod-stage1.jar"), "jar");
  fs.writeFileSync(path.join(stage2, "build", "libs", "mod-stage2.jar"), "jar");

  const workspace = {
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      { path: stage1, loader: "Forge", gameVersion: "1.16.5", java: "Java 8" },
      { path: stage2, loader: "Forge", gameVersion: "1.20.1", java: "Java 17" }
    ]
  };

  const conversion = await convertArtifact({
    inspection: {
      detection: {
        loader: "Forge",
        gameVersion: "1.12.2",
        java: "Java 8"
      }
    },
    target: {
      loader: "Forge",
      gameVersion: "1.20.1",
      java: "Java 17"
    },
    baseDir: tempDir,
    dependencies: {
      planMigration: () => ({ phases: [{}, {}], staircase: ["1.12.2", "1.16.5", "1.20.1"] }),
      createMigrationWorkspace: () => workspace,
      prepareDecompilation: async () => ({ decompiled: false, message: "Décompilation ignorée pour le test." }),
      applyAutomaticPatches: () => ({ patchedStageCount: 0, stageCount: 2, stageReports: [] }),
      runWorkspaceBuilds: () => ({
        stageCount: 2,
        successCount: 1,
        failureCount: 1,
        stageReports: [
          { stagePath: stage1, success: true },
          { stagePath: stage2, success: false }
        ]
      })
    }
  });

  assert.equal(conversion.result.primaryOutputPath, path.join(stage1, "build", "libs", "mod-stage1.jar"));
  assert.equal(conversion.result.primaryOutputStagePath, stage1);
  assert.equal(conversion.result.primaryOutputDirectoryPath, path.join(stage1, "build", "libs"));
  assert.match(conversion.summary.recommendation, /artefact intermédiaire/i);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
