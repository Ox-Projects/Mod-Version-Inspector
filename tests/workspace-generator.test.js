const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const AdmZip = require("adm-zip");
const { createMigrationWorkspace } = require("../src/workspace-generator");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mvi-workspace-"));
}

test("genere les metadonnees du loader cible dans les stages", () => {
  const tempDir = createTempDir();
  const jarPath = path.join(tempDir, "source.jar");
  const zip = new AdmZip();
  zip.addFile("META-INF/mods.toml", Buffer.from('modLoader="javafml"\nloaderVersion="[47,)"\ndisplayName="Demo"\nversion="1.0.0"\n'));
  zip.addFile("pkg/Demo.class", Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34]));
  zip.writeZip(jarPath);

  const inspection = {
    file: {
      path: jarPath,
      name: "source.jar"
    },
    detection: {
      modName: "Demo Mod",
      modVersion: "1.0.0",
      loader: "Forge",
      modLoader: "Forge",
      gameVersion: "1.12.2",
      java: "Java 8"
    }
  };

  const plan = {
    phases: [
      {
        title: "Migrer 1.12.2 -> 1.20.1",
        loader: "Fabric",
        gameVersion: "1.20.1",
        java: "Java 17",
        notes: "Test"
      }
    ]
  };

  const workspace = createMigrationWorkspace({
    inspection,
    plan,
    baseDir: path.join(tempDir, "migrations")
  });

  const stage = workspace.stages[0];
  const fabricMetaPath = path.join(stage.path, "src", "main", "resources", "fabric.mod.json");
  const previewPath = path.join(stage.path, "notes", "metadata-preview.json");
  const toolchainProfilePath = path.join(stage.path, "notes", "toolchain-profile.json");
  const mappingProfilePath = path.join(stage.path, "notes", "mapping-profile.json");
  const toolchainGuidePath = path.join(stage.path, "notes", "toolchain-guide.md");
  const initStageScriptPath = path.join(stage.path, "scripts", "init-stage.ps1");
  const workspaceGuidePath = path.join(workspace.notesPath, "workspace-guide.md");
  const initWorkspaceScriptPath = path.join(workspace.workspaceRoot, "scripts", "init-workspace.ps1");
  const buildWorkspaceScriptPath = path.join(workspace.workspaceRoot, "scripts", "build-workspace.ps1");

  assert.equal(fs.existsSync(fabricMetaPath), true);
  assert.equal(fs.existsSync(previewPath), true);
  assert.equal(fs.existsSync(toolchainProfilePath), true);
  assert.equal(fs.existsSync(mappingProfilePath), true);
  assert.equal(fs.existsSync(toolchainGuidePath), true);
  assert.equal(fs.existsSync(initStageScriptPath), true);
  assert.equal(fs.existsSync(workspaceGuidePath), true);
  assert.equal(fs.existsSync(initWorkspaceScriptPath), true);
  assert.equal(fs.existsSync(buildWorkspaceScriptPath), true);

  const fabricMeta = JSON.parse(fs.readFileSync(fabricMetaPath, "utf8"));
  const toolchainProfile = JSON.parse(fs.readFileSync(toolchainProfilePath, "utf8"));
  const mappingProfile = JSON.parse(fs.readFileSync(mappingProfilePath, "utf8"));
  const toolchainGuide = fs.readFileSync(toolchainGuidePath, "utf8");
  const initStageScript = fs.readFileSync(initStageScriptPath, "utf8");
  const workspaceGuide = fs.readFileSync(workspaceGuidePath, "utf8");
  const initWorkspaceScript = fs.readFileSync(initWorkspaceScriptPath, "utf8");
  assert.equal(fabricMeta.id, "demo_mod");
  assert.equal(fabricMeta.depends.minecraft, "1.20.1");
  assert.equal(toolchainProfile.type, "fabric");
  assert.equal(toolchainProfile.loaderVersion, "0.15.11");
  assert.equal(toolchainProfile.gradleVersion, "8.5");
  assert.equal(mappingProfile.mappingSystem, "yarn");
  assert.equal(mappingProfile.namespace, "intermediary-v2");
  assert.match(toolchainGuide, /Fabric Loader : 0.15.11/);
  assert.match(initStageScript, /gradle wrapper --gradle-version 8.5/);
  assert.match(workspaceGuide, /Nombre de stages : 1/);
  assert.match(initWorkspaceScript, /init-stage\.ps1/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
