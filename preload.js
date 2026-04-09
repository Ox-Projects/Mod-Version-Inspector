const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("modInspector", {
  getAppInfo: () => ipcRenderer.invoke("app-info"),
  getMigrationOptions: () => ipcRenderer.invoke("migration-options"),
  pickModFile: () => ipcRenderer.invoke("pick-mod-file"),
  pickModFolder: () => ipcRenderer.invoke("pick-mod-folder"),
  inspectModFile: (filePath) => ipcRenderer.invoke("inspect-mod-file", filePath),
  convertArtifact: (inspection, target) => ipcRenderer.invoke("convert-artifact", inspection, target),
  runBenchmark: (folderPath, target, options) => ipcRenderer.invoke("run-benchmark", folderPath, target, options),
  planMigration: (inspection, target) => ipcRenderer.invoke("plan-migration", inspection, target),
  createMigrationWorkspace: (inspection, plan) => ipcRenderer.invoke("create-migration-workspace", inspection, plan),
  prepareDecompilation: (workspace) => ipcRenderer.invoke("prepare-decompilation", workspace),
  applyAutomaticPatches: (workspace) => ipcRenderer.invoke("apply-automatic-patches", workspace),
  runStageBuild: (workspace, stagePath) => ipcRenderer.invoke("run-stage-build", workspace, stagePath),
  runWorkspaceBuilds: (workspace) => ipcRenderer.invoke("run-workspace-builds", workspace),
  runWorkspaceScript: (scriptPath) => ipcRenderer.invoke("run-workspace-script", scriptPath),
  openPath: (targetPath) => ipcRenderer.invoke("open-path", targetPath),
  windowAction: (action) => ipcRenderer.invoke("window-action", action)
});
