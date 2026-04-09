const path = require("path");
const { spawnSync } = require("child_process");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { inspectArtifact } = require("./src/analyzer");
const { planMigration, LOADER_LABELS } = require("./src/migration-planner");
const { createMigrationWorkspace } = require("./src/workspace-generator");
const { prepareDecompilation } = require("./src/decompiler-manager");
const { runSingleStageBuild, runWorkspaceBuilds } = require("./src/build-diagnostics");
const { applyAutomaticPatches } = require("./src/auto-patcher");
const { convertArtifact } = require("./src/conversion-orchestrator");
const { runBenchmark } = require("./src/batch-benchmark");

ipcMain.handle("window-action", (event, action) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return { isMaximized: false };
  }

  switch (action) {
    case "minimize":
      window.minimize();
      return { isMaximized: window.isMaximized() };
    case "toggle-maximize":
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
      return { isMaximized: window.isMaximized() };
    case "close":
      window.close();
      return { isMaximized: window.isMaximized() };
    case "get-state":
      return { isMaximized: window.isMaximized() };
    default:
      return { isMaximized: window.isMaximized() };
  }
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    frame: false,
    backgroundColor: "#17120f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function runWorkspaceScript(scriptPath) {
  if (!scriptPath) {
    throw new Error("Aucun script à exécuter.");
  }

  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    cwd: path.dirname(scriptPath),
    encoding: "utf8",
    timeout: 30 * 60 * 1000
  });

  return {
    success: result.status === 0,
    exitCode: result.status,
    signal: result.signal,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || "")
  };
}

app.whenReady().then(() => {
  ipcMain.handle("app-info", () => ({
    name: app.getName(),
    version: app.getVersion()
  }));

  ipcMain.handle("migration-options", () => ({
    loaders: Object.values(LOADER_LABELS),
    gameVersions: ["1.7.10", "1.8.9", "1.12.2", "1.16.5", "1.18.2", "1.20.1", "1.21.1"],
    javaVersions: ["Java 8", "Java 11", "Java 17", "Java 21", "Java 25"]
  }));

  ipcMain.handle("create-migration-workspace", async (_event, inspection, plan) =>
    createMigrationWorkspace({
      inspection,
      plan,
      baseDir: path.join(app.getAppPath(), "migrations")
    })
  );
  ipcMain.handle("prepare-decompilation", async (_event, workspace) => prepareDecompilation(workspace));
  ipcMain.handle("run-workspace-builds", async (_event, workspace) => runWorkspaceBuilds(workspace));
  ipcMain.handle("run-stage-build", async (_event, workspace, stagePath) => runSingleStageBuild(workspace, stagePath));
  ipcMain.handle("apply-automatic-patches", async (_event, workspace) => applyAutomaticPatches(workspace));
  ipcMain.handle("convert-artifact", async (_event, inspection, target) =>
    convertArtifact({
      inspection,
      target,
      baseDir: path.join(app.getAppPath(), "migrations")
    })
  );
  ipcMain.handle("run-workspace-script", async (_event, scriptPath) => runWorkspaceScript(scriptPath));
  ipcMain.handle("pick-mod-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choisir un dossier de mods",
      properties: ["openDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });
  ipcMain.handle("run-benchmark", async (_event, folderPath, target, options = {}) =>
    runBenchmark({
      folderPath,
      target,
      maxMods: options.maxMods || 100,
      baseDir: path.join(app.getAppPath(), "benchmarks")
    })
  );
  ipcMain.handle("open-path", async (_event, targetPath) => {
    if (!targetPath) {
      throw new Error("Aucun chemin à ouvrir.");
    }

    const error = await shell.openPath(targetPath);
    return {
      success: !error,
      error: error || null
    };
  });

  ipcMain.handle("pick-mod-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choisir un mod Java",
      properties: ["openFile"],
      filters: [
        { name: "Mods et artefacts Java", extensions: ["jar", "zip", "class", "litemod", "liteloadermod"] },
        { name: "Archives Java", extensions: ["jar", "zip", "litemod", "liteloadermod"] },
        { name: "Classes Java", extensions: ["class"] },
        { name: "Tous les fichiers", extensions: ["*"] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle("inspect-mod-file", async (_event, filePath) => inspectArtifact(filePath));
  ipcMain.handle("plan-migration", async (_event, inspection, target) => planMigration(inspection, target));

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
