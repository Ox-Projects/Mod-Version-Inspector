const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { applyAutomaticPatches } = require("../src/auto-patcher");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mvi-patcher-"));
}

test("desactive les metadonnees incompatibles et conserve la cible du stage", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-01");
  const importedResources = path.join(stagePath, "src", "imported", "resources");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(importedResources, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  fs.writeFileSync(path.join(mainResources, "fabric.mod.json"), JSON.stringify({ id: "demo" }, null, 2), "utf8");
  fs.writeFileSync(path.join(importedResources, "mcmod.info"), '[{"modid":"demo"}]', "utf8");
  fs.writeFileSync(path.join(importedResources, "plugin.yml"), "name: demo", "utf8");
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "fabric", files: ["fabric.mod.json"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false }, null, 2),
    "utf8"
  );

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Fabric",
        gameVersion: "1.20.1",
        java: "Java 17"
      }
    ]
  });

  const stageReport = summary.stageReports[0];
  assert.equal(stageReport.targetMetadata.relativePath, "fabric.mod.json");
  assert.equal(stageReport.disabledMetadata.length, 2);
  assert.equal(fs.existsSync(path.join(importedResources, "mcmod.info")), false);
  assert.equal(fs.existsSync(path.join(notesDir, "disabled-metadata", "mcmod.info")), true);
  assert.equal(fs.existsSync(path.join(notesDir, "auto-patch-report.json")), true);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("modernise certains imports et annotations Forge legacy dans les sources importees", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-02");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(mainResources, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "Example.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import cpw.mods.fml.common.eventhandler.SubscribeEvent;",
      "import cpw.mods.fml.relauncher.SideOnly;",
      "import cpw.mods.fml.relauncher.Side;",
      "@SideOnly(Side.CLIENT)",
      "public class Example {}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
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

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /net\.minecraftforge\.eventbus\.api\.SubscribeEvent/);
  assert.match(patchedSource, /net\.minecraftforge\.api\.distmarker\.OnlyIn/);
  assert.match(patchedSource, /@OnlyIn\(Dist\.CLIENT\)/);
  assert.ok(stageReport.sourcePatches.some((item) => item.relativePath === "demo/Example.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("normalise certains patterns simples de source Fabric", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-03");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(mainResources, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "FabricExample.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import net.fabricmc.api.ModInitializer;",
      "import net.fabricmc.api.ClientModInitializer;",
      "public class FabricExample implements ClientModInitializer, ModInitializer {",
      '  public static final String MODID = "DEMO_MOD";',
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "fabric", files: ["fabric.mod.json"], modId: "demo_mod" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "fabric.mod.json"), JSON.stringify({ id: "demo_mod" }, null, 2), "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Fabric",
        gameVersion: "1.20.1",
        java: "Java 17"
      }
    ]
  });

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /implements ModInitializer, ClientModInitializer/);
  assert.match(patchedSource, /public static final String MODID = "demo_mod";/);
  assert.ok(stageReport.sourcePatches.some((item) => item.relativePath === "demo/FabricExample.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("retire certains marqueurs internes MCreator des sources importees", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-04");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "net", "mcreator", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "DemoProcedure.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package net.mcreator.demo;",
      "@Elements.DemoMod.ModElement.Tag",
      "public class DemoProcedure {",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: true }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Forge",
        gameVersion: "1.16.5",
        java: "Java 8"
      }
    ]
  });

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.doesNotMatch(patchedSource, /@Elements\./);
  assert.ok(stageReport.sourcePatches.some((item) => item.relativePath === "net/mcreator/demo/DemoProcedure.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("signale certains patterns legacy restants dans les sources Forge", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-05");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "LegacyRegistry.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import cpw.mods.fml.common.registry.GameRegistry;",
      "import cpw.mods.fml.common.event.FMLPreInitializationEvent;",
      "public class LegacyRegistry {",
      "  private IBlockState state;",
      "  // TODO migrate this registry",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
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
  assert.ok(stageReport.sourceDiagnostics.some((item) => item.label.includes("TODO existant")));
  assert.ok(stageReport.sourceRemaps.some((item) => item.relativePath === "demo/LegacyRegistry.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("remappe certains types et imports Forge legacy sur une cible moderne", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-06");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "ModernizedNames.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import net.minecraft.block.state.IBlockState;",
      "import net.minecraft.tileentity.TileEntity;",
      "import net.minecraft.world.World;",
      "public class ModernizedNames {",
      "  private IBlockState state;",
      "  private TileEntity entity;",
      "  private World world;",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false, phase: { gameVersion: "1.20.1" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
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

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /import net\.minecraft\.world\.level\.block\.state\.BlockState;/);
  assert.match(patchedSource, /import net\.minecraft\.world\.level\.block\.entity\.BlockEntity;/);
  assert.match(patchedSource, /import net\.minecraft\.world\.level\.Level;/);
  assert.match(patchedSource, /\bBlockState state;/);
  assert.match(patchedSource, /\bBlockEntity entity;/);
  assert.match(patchedSource, /\bLevel world;/);
  assert.ok(stageReport.sourceRemaps.some((item) => item.relativePath === "demo/ModernizedNames.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("remappe certains acces Registry Fabric vers Registries sur une cible recente", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-07");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(mainResources, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "RegistryBridge.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import net.minecraft.util.registry.Registry;",
      "public class RegistryBridge {",
      "  public Object access() {",
      "    return Registry.ITEM;",
      "  }",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false, phase: { gameVersion: "1.20.1" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "fabric", files: ["fabric.mod.json"], modId: "demo_mod" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "fabric.mod.json"), JSON.stringify({ id: "demo_mod" }, null, 2), "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Fabric",
        gameVersion: "1.20.1",
        java: "Java 17"
      }
    ]
  });

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /import net\.minecraft\.registry\.Registry;/);
  assert.match(patchedSource, /import net\.minecraft\.registry\.Registries;/);
  assert.match(patchedSource, /return Registries\.ITEM;/);
  assert.ok(stageReport.sourceRemaps.some((item) => item.relativePath === "demo/RegistryBridge.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("remappe certains evenements de cycle de vie Forge legacy vers setup moderne", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-08");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "LifecycleHooks.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import cpw.mods.fml.common.event.FMLPreInitializationEvent;",
      "import cpw.mods.fml.common.event.FMLInitializationEvent;",
      "public class LifecycleHooks {",
      "  public void preInit(FMLPreInitializationEvent event) {}",
      "  public void init(FMLInitializationEvent event) {}",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false, phase: { gameVersion: "1.16.5" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Forge",
        gameVersion: "1.16.5",
        java: "Java 8"
      }
    ]
  });

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /import net\.minecraftforge\.fml\.event\.lifecycle\.FMLCommonSetupEvent;/);
  assert.doesNotMatch(patchedSource, /FMLPreInitializationEvent/);
  assert.doesNotMatch(patchedSource, /FMLInitializationEvent/);
  assert.match(patchedSource, /preInit\(FMLCommonSetupEvent event\)/);
  assert.match(patchedSource, /init\(FMLCommonSetupEvent event\)/);
  assert.ok(stageReport.sourceRemaps.some((item) => item.relativePath === "demo/LifecycleHooks.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("remappe certains events de registry Forge vers RegisterEvent", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-09");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "RegistryHooks.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import net.minecraftforge.event.RegistryEvent;",
      "public class RegistryHooks {",
      "  public void onRegister(RegistryEvent.Register<Object> event) {}",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false, phase: { gameVersion: "1.20.1" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
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

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /import net\.minecraftforge\.registries\.RegisterEvent;/);
  assert.match(patchedSource, /onRegister\(RegisterEvent event\)/);
  assert.ok(stageReport.sourceRemaps.some((item) => item.relativePath === "demo/RegistryHooks.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("consigne le profil de mappings du stage dans le rapport de patch", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-10");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(mainResources, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  fs.writeFileSync(path.join(importedJavaDir, "Minimal.java"), "package demo;\npublic class Minimal {}\n", "utf8");
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify(
      {
        isMcreator: false,
        phase: { gameVersion: "1.20.1" },
        mappingProfile: {
          mappingSystem: "yarn",
          namespace: "intermediary-v2",
          notes: ["Fabric récent demande surtout Yarn moderne."]
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "fabric", files: ["fabric.mod.json"], modId: "demo_mod" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "fabric.mod.json"), JSON.stringify({ id: "demo_mod" }, null, 2), "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Fabric",
        gameVersion: "1.20.1",
        java: "Java 17"
      }
    ]
  });

  const stageReport = summary.stageReports[0];
  assert.equal(stageReport.mappingProfile.mappingSystem, "yarn");
  assert.equal(stageReport.mappingProfile.namespace, "intermediary-v2");
  assert.ok(stageReport.actions.some((item) => item.includes("Profil de mappings appliqué")));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("n applique pas les remaps Forge modernes si le profil de mappings reste mcp", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-11");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "LegacyLifecycle.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import cpw.mods.fml.common.event.FMLPreInitializationEvent;",
      "public class LegacyLifecycle {",
      "  public void preInit(FMLPreInitializationEvent event) {}",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify(
      {
        isMcreator: false,
        phase: { gameVersion: "1.16.5" },
        mappingProfile: {
          mappingSystem: "mcp",
          namespace: "mcp",
          notes: ["Profil legacy MCP"]
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Forge",
        gameVersion: "1.16.5",
        java: "Java 8"
      }
    ]
  });

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /FMLPreInitializationEvent/);
  assert.equal(stageReport.sourceRemaps.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("n applique pas les remaps Fabric modernes si le profil Yarn reste ancien", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-12");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(mainResources, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "OldFabricRegistry.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import net.minecraft.util.registry.Registry;",
      "public class OldFabricRegistry {",
      "  public Object access() {",
      "    return Registry.ITEM;",
      "  }",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify(
      {
        isMcreator: false,
        phase: { gameVersion: "1.20.1" },
        mappingProfile: {
          mappingSystem: "yarn",
          namespace: "intermediary",
          notes: ["Profil Yarn ancien"]
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "fabric", files: ["fabric.mod.json"], modId: "demo_mod" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "fabric.mod.json"), JSON.stringify({ id: "demo_mod" }, null, 2), "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Fabric",
        gameVersion: "1.20.1",
        java: "Java 17"
      }
    ]
  });

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /Registry\.ITEM/);
  assert.doesNotMatch(patchedSource, /Registries\.ITEM/);
  assert.equal(stageReport.sourceRemaps.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("n applique pas la famille forge.world si le profil n expose pas les packages monde modernes", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-13");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "WorldTypes.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import net.minecraft.block.state.IBlockState;",
      "import net.minecraft.world.World;",
      "public class WorldTypes {",
      "  private IBlockState state;",
      "  private World world;",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify(
      {
        isMcreator: false,
        phase: { gameVersion: "1.20.1" },
        mappingProfile: {
          mappingSystem: "mojmap",
          namespace: "official",
          bridgeFromLegacy: ["mcp", "srg"],
          sourcePackages: ["net.minecraftforge.fml.event.lifecycle"],
          notes: ["Profil sans package world level"]
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
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

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /IBlockState/);
  assert.match(patchedSource, /World world/);
  assert.equal(stageReport.sourceRemaps.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("n applique pas la famille fabric.registry si le profil ne bridge pas old-yarn", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-14");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(mainResources, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "RegistryOnly.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import net.minecraft.util.registry.Registry;",
      "public class RegistryOnly {",
      "  public Object access() {",
      "    return Registry.ITEM;",
      "  }",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify(
      {
        isMcreator: false,
        phase: { gameVersion: "1.20.1" },
        mappingProfile: {
          mappingSystem: "yarn",
          namespace: "intermediary-v2",
          bridgeFromLegacy: [],
          sourcePackages: ["net.minecraft.registry"],
          notes: ["Profil sans bridge old-yarn"]
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "fabric", files: ["fabric.mod.json"], modId: "demo_mod" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "fabric.mod.json"), JSON.stringify({ id: "demo_mod" }, null, 2), "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Fabric",
        gameVersion: "1.20.1",
        java: "Java 17"
      }
    ]
  });

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /Registry\.ITEM/);
  assert.doesNotMatch(patchedSource, /Registries\.ITEM/);
  assert.equal(stageReport.sourceRemaps.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("remappe certains helpers de registry Forge comme ObjectHolder", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-15");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "RegistryHolder.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import cpw.mods.fml.common.registry.GameRegistry.ObjectHolder;",
      '@GameRegistry.ObjectHolder("demo:entry")',
      "public class RegistryHolder {}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false, phase: { gameVersion: "1.20.1" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
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

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /import net\.minecraftforge\.registries\.ObjectHolder;/);
  assert.match(patchedSource, /@ObjectHolder\("demo:entry"\)/);
  assert.ok(stageReport.sourceRemaps.some((item) => item.relativePath === "demo/RegistryHolder.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("remappe certains events Forge legacy vers les packages modernes", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-16");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "TickHooks.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import cpw.mods.fml.common.gameevent.TickEvent;",
      "import cpw.mods.fml.common.eventhandler.EventPriority;",
      "public class TickHooks {",
      "  private TickEvent.ServerTickEvent event;",
      "  private EventPriority priority;",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false, phase: { gameVersion: "1.20.1" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
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

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /import net\.minecraftforge\.event\.TickEvent;/);
  assert.match(patchedSource, /import net\.minecraftforge\.eventbus\.api\.EventPriority;/);
  assert.ok(stageReport.sourceRemaps.some((item) => item.relativePath === "demo/TickHooks.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("remappe certains usages Fabric Identifier vers Identifier.of", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-17");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(mainResources, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "IdentifierUsage.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import net.minecraft.util.Identifier;",
      "public class IdentifierUsage {",
      "  public Object id() {",
      "    return new Identifier(MODID, \"entry\");",
      "  }",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false, phase: { gameVersion: "1.20.1" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "fabric", files: ["fabric.mod.json"], modId: "demo_mod" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "fabric.mod.json"), JSON.stringify({ id: "demo_mod" }, null, 2), "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [
      {
        path: stagePath,
        loader: "Fabric",
        gameVersion: "1.20.1",
        java: "Java 17"
      }
    ]
  });

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /Identifier\.of\(MODID, "entry"\)/);
  assert.ok(stageReport.sourceRemaps.some((item) => item.relativePath === "demo/IdentifierUsage.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("remappe certains usages GameRegistry.findRegistry vers ForgeRegistries", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-20");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "RegistryAccess.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import cpw.mods.fml.common.registry.GameRegistry;",
      "import net.minecraft.item.Item;",
      "import net.minecraft.block.Block;",
      "public class RegistryAccess {",
      "  public Object items() { return GameRegistry.findRegistry(Item.class); }",
      "  public Object blocks() { return GameRegistry.findRegistry(Block.class); }",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false, phase: { gameVersion: "1.20.1" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [{ path: stagePath, loader: "Forge", gameVersion: "1.20.1", java: "Java 17" }]
  });

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /import net\.minecraftforge\.registries\.ForgeRegistries;/);
  assert.match(patchedSource, /ForgeRegistries\.ITEMS/);
  assert.match(patchedSource, /ForgeRegistries\.BLOCKS/);
  assert.ok(stageReport.sourceRemaps.some((item) => item.relativePath === "demo/RegistryAccess.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("signale quand une famille Forge world est bloquee par le profil de mappings", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-18");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(path.join(mainResources, "META-INF"), { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  fs.writeFileSync(
    path.join(importedJavaDir, "BlockedWorld.java"),
    [
      "package demo;",
      "import net.minecraft.block.state.IBlockState;",
      "public class BlockedWorld {",
      "  private IBlockState state;",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify(
      {
        isMcreator: false,
        phase: { gameVersion: "1.20.1" },
        mappingProfile: {
          mappingSystem: "mojmap",
          namespace: "official",
          bridgeFromLegacy: ["mcp", "srg"],
          sourcePackages: ["net.minecraftforge.fml.event.lifecycle"],
          notes: ["Profil sans famille world"]
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "forge", files: ["META-INF/mods.toml"], modId: "demo" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "META-INF", "mods.toml"), 'modLoader="javafml"', "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [{ path: stagePath, loader: "Forge", gameVersion: "1.20.1", java: "Java 17" }]
  });

  const stageReport = summary.stageReports[0];
  assert.ok(stageReport.sourceDiagnostics.some((item) => item.label.includes("Famille de remap Forge world bloquée")));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("signale quand une famille Fabric identifier est bloquee par le profil de mappings", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-19");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(mainResources, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  fs.writeFileSync(
    path.join(importedJavaDir, "BlockedIdentifier.java"),
    [
      "package demo;",
      "import net.minecraft.util.Identifier;",
      "public class BlockedIdentifier {",
      "  public Object id() {",
      "    return new Identifier(MODID, \"entry\");",
      "  }",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify(
      {
        isMcreator: false,
        phase: { gameVersion: "1.20.1" },
        mappingProfile: {
          mappingSystem: "yarn",
          namespace: "intermediary-v2",
          bridgeFromLegacy: ["old-yarn"],
          sourcePackages: ["net.minecraft.registry"],
          notes: ["Profil sans famille identifier"]
        }
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "fabric", files: ["fabric.mod.json"], modId: "demo_mod" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "fabric.mod.json"), JSON.stringify({ id: "demo_mod" }, null, 2), "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [{ path: stagePath, loader: "Fabric", gameVersion: "1.20.1", java: "Java 17" }]
  });

  const stageReport = summary.stageReports[0];
  assert.ok(stageReport.sourceDiagnostics.some((item) => item.label.includes("Famille de remap Fabric identifier bloquée")));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("normalise certains entrypoints Fabric quand le profil le permet", () => {
  const tempDir = createTempDir();
  const stagePath = path.join(tempDir, "stage-21");
  const importedJavaDir = path.join(stagePath, "src", "imported", "java", "demo");
  const mainResources = path.join(stagePath, "src", "main", "resources");
  const notesDir = path.join(stagePath, "notes");

  fs.mkdirSync(importedJavaDir, { recursive: true });
  fs.mkdirSync(mainResources, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const sourcePath = path.join(importedJavaDir, "FabricEntrypoints.java");
  fs.writeFileSync(
    sourcePath,
    [
      "package demo;",
      "import net.fabricmc.api.ClientModInitializer;",
      "import net.fabricmc.api.ModInitializer;",
      "public class FabricEntrypoints implements ClientModInitializer, ModInitializer {",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(mainResources, "stage-context.json"),
    JSON.stringify({ isMcreator: false, phase: { gameVersion: "1.20.1" } }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(notesDir, "metadata-preview.json"),
    JSON.stringify({ loader: "fabric", files: ["fabric.mod.json"], modId: "demo_mod" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(path.join(mainResources, "fabric.mod.json"), JSON.stringify({ id: "demo_mod" }, null, 2), "utf8");

  const summary = applyAutomaticPatches({
    workspaceRoot: tempDir,
    reportsPath: path.join(tempDir, "reports"),
    stages: [{ path: stagePath, loader: "Fabric", gameVersion: "1.20.1", java: "Java 17" }]
  });

  const patchedSource = fs.readFileSync(sourcePath, "utf8");
  const stageReport = summary.stageReports[0];
  assert.match(patchedSource, /implements ModInitializer, ClientModInitializer/);
  assert.ok(stageReport.sourceRemaps.some((item) => item.relativePath === "demo/FabricEntrypoints.java"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});
