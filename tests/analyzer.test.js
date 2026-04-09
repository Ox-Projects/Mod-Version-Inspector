const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const AdmZip = require("adm-zip");
const { inspectArtifact } = require("../src/analyzer");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mvi-analyzer-"));
}

test("detecte un mod MCreator Forge via les classes générées", () => {
  const tempDir = createTempDir();
  const jarPath = path.join(tempDir, "demo-mcreator.jar");
  const zip = new AdmZip();

  zip.addFile(
    "META-INF/mods.toml",
    Buffer.from('modLoader="javafml"\nloaderVersion="[47,)"\ndisplayName="Demo MCreator"\nversion="1.0.0"\n')
  );
  zip.addFile("net/mcreator/demo/DemoModElements.class", Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x34]));
  zip.writeZip(jarPath);

  const result = inspectArtifact(jarPath);

  assert.equal(result.detection.isMcreator, true);
  assert.equal(result.detection.generator, "MCreator");
  assert.equal(result.detection.generatorConfidence, "high");
  assert.ok(result.detection.generatorReasons.length >= 1);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
