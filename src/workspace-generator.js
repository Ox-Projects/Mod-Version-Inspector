const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { buildHints } = require("./migration-hints");
const { prepareWorkspaceDiagnostics } = require("./build-diagnostics");
const { resolveToolchainProfile } = require("./toolchain-profiles");
const { resolveMappingProfile } = require("./mapping-profiles");

const ARCHIVE_EXTENSIONS = new Set([".jar", ".zip", ".litemod", ".liteloadermod"]);

function sanitizeSegment(value) {
  return String(value || "workspace")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function isZipLike(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return true;
  }

  const fd = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    return header[0] === 0x50 && header[1] === 0x4b;
  } finally {
    fs.closeSync(fd);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, value, "utf8");
}

function normalizeLoader(loader) {
  const value = String(loader || "").toLowerCase();
  if (value.includes("fabric")) return "fabric";
  if (value.includes("quilt")) return "quilt";
  if (value.includes("liteloader")) return "liteloader";
  if (value.includes("forge")) return "forge";
  if (value.includes("bukkit") || value.includes("spigot") || value.includes("paper")) return "bukkit";
  return "generic";
}

function buildReadme(inspection, plan, workspaceRoot) {
  const phases = (plan?.phases || [])
    .map(
      (phase, index) =>
        `${index + 1}. ${phase.title}\n   Loader: ${phase.loader}\n   Jeu: ${phase.gameVersion}\n   Java: ${phase.java}\n   Notes: ${phase.notes}`
    )
    .join("\n\n");

  const risks = (plan?.risks || []).map((risk) => `- ${risk}`).join("\n");
  const tasks = (plan?.manualTasks || []).map((task) => `- ${task}`).join("\n");

  return `# Workspace de migration

Mod source : ${inspection.detection.modName}
Fichier source : ${inspection.file.name}
Loader source : ${inspection.detection.modLoader}
Version du jeu source : ${inspection.detection.gameVersion || "Inconnue"}
Version Java source : ${inspection.detection.java}

Cible loader : ${plan?.target?.loader || "Inconnue"}
Cible jeu : ${plan?.target?.gameVersion || "Inconnue"}
Cible Java : ${plan?.target?.java || "Inconnue"}

Stratégie

${plan?.strategy || "Aucun plan fourni"}

Escalier

${(plan?.staircase || []).join(" -> ") || "Non défini"}

Phases

${phases || "Aucune phase générée"}

Risques

${risks || "- Aucun risque listé"}

Actions manuelles

${tasks || "- Aucune action listée"}

Contenu du workspace

- \`artifact/\` : copie du mod d'origine
- \`extracted/\` : contenu extrait si l'artefact est une archive
- \`reports/inspection.json\` : inspection complète du mod
- \`reports/migration-plan.json\` : plan de migration généré
- \`reports/archive-inventory.json\` : inventaire des classes et ressources du mod
- \`notes/porting-checklist.md\` : checklist de travail
- \`stages/\` : un squelette de projet par phase de migration

Racine du workspace

\`${workspaceRoot}\`
`;
}

function buildChecklist(plan) {
  const manual = (plan?.manualTasks || []).map((task) => `- [ ] ${task}`).join("\n");
  const phases = (plan?.phases || [])
    .map((phase) => `## ${phase.title}\n- [ ] Préparer un environnement ${phase.loader}\n- [ ] Cibler Minecraft ${phase.gameVersion}\n- [ ] Compiler avec ${phase.java}\n- [ ] ${phase.notes}`)
    .join("\n\n");

  return `# Checklist de portage

## Préparation
- [ ] Vérifier que le mod source se lance ou se décompile correctement
- [ ] Identifier les dépendances manquantes
- [ ] Sauvegarder une copie propre avant modifications

## Phases
${phases || "- [ ] Définir les phases de migration"}

## Actions manuelles transverses
${manual || "- [ ] Ajouter les tâches manuelles"}
`;
}

function buildWorkspaceGuide(plan, workspaceRoot, createdStages) {
  const lines = [
    "# Guide workspace",
    "",
    `Workspace : ${workspaceRoot}`,
    `Nombre de stages : ${createdStages.length}`,
    "",
    "Ordre recommandé",
    "- Lancer `scripts/init-workspace.ps1` pour initialiser les wrappers stage par stage quand c'est possible.",
    "- Lancer `scripts/build-workspace.ps1` pour compiler tous les stages.",
    "- Consulter `reports/build-results.json` et les logs de chaque stage.",
    ""
  ];

  if (plan?.phases?.length) {
    lines.push("Stages");
    createdStages.forEach((stage, index) => {
      lines.push(`- ${String(index + 1).padStart(2, "0")} | ${stage.loader} | ${stage.gameVersion} | ${stage.path}`);
    });
  }

  return lines.join("\n");
}

function listArchiveInventory(artifactPath) {
  if (!isZipLike(artifactPath)) {
    return {
      classCount: 0,
      resourceCount: 0,
      packages: [],
      metadataFiles: [],
      classes: [],
      resources: []
    };
  }

  const zip = new AdmZip(artifactPath);
  const entries = zip.getEntries().map((entry) => entry.entryName.replace(/\\/g, "/"));
  const classes = entries.filter((entry) => entry.endsWith(".class"));
  const resources = entries.filter((entry) => !entry.endsWith("/") && !entry.endsWith(".class"));
  const metadataFiles = resources.filter((entry) =>
    ["fabric.mod.json", "quilt.mod.json", "META-INF/mods.toml", "mcmod.info", "plugin.yml", "paper-plugin.yml", "litemod.json"].some(
      (name) => entry.endsWith(name)
    )
  );
  const packages = Array.from(
    new Set(
      classes
        .map((entry) => entry.split("/").slice(0, -1).join("."))
        .filter(Boolean)
    )
  ).sort();

  return {
    classCount: classes.length,
    resourceCount: resources.length,
    packages,
    metadataFiles,
    classes,
    resources
  };
}

function copyDirectoryContents(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  ensureDir(targetDir);
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}

function buildStageReadme(phase, index) {
  return `# Stage ${String(index + 1).padStart(2, "0")} - ${phase.title}

Loader cible : ${phase.loader}
Minecraft cible : ${phase.gameVersion}
Java cible : ${phase.java}

Objectif

${phase.notes}

Checklist rapide

- [ ] Importer ou recopier les sources de l'étape précédente
- [ ] Mettre à jour les mappings et dépendances
- [ ] Vérifier les métadonnées générées pour le loader cible
- [ ] Initialiser la toolchain de stage si nécessaire
- [ ] Corriger les erreurs de compilation
- [ ] Valider le lancement de test pour ce palier
`;
}

function buildGradleProperties(phase) {
  return `org.gradle.jvmargs=-Xmx2G
minecraft_version=${phase.gameVersion}
java_version=${String(phase.java).replace("Java ", "")}
mod_name=${sanitizeSegment(phase.title)}
`;
}

function buildSettingsGradle(phase) {
  return `rootProject.name = '${phase.title.replace(/'/g, "")}'\n`;
}

function buildGitIgnore() {
  return `.gradle/
build/
run/
out/
*.iml
.idea/
`;
}

function buildToolchainGuide(profile, phase) {
  const lines = [
    "# Guide de toolchain",
    "",
    `Loader : ${phase.loader}`,
    `Minecraft cible : ${phase.gameVersion}`,
    `Java cible : ${phase.java}`,
    `Gradle recommandé : ${profile.gradleVersion || "à déterminer"}`,
    ""
  ];

  if (profile.type === "forge") {
    lines.push(`ForgeGradle : ${profile.pluginVersion}`);
    lines.push(`Mappings : ${profile.mappingsChannel}:${profile.mappingsVersion}`);
    lines.push(`Dépendance Forge : ${profile.dependencyNotation}`);
    lines.push("");
  }

  if (profile.type === "fabric") {
    lines.push(`Loom : ${profile.loomVersion}`);
    lines.push(`Fabric Loader : ${profile.loaderVersion}`);
    lines.push(`Yarn build : ${profile.yarnBuild}`);
    lines.push("");
  }

  if (profile.type === "quilt") {
    lines.push(`Quilt Loom : ${profile.loomVersion}`);
    lines.push(`Quilt Loader : ${profile.loaderVersion}`);
    lines.push(`Mappings build : ${profile.mappingsBuild}`);
    lines.push("");
  }

  if (profile.type === "bukkit") {
    lines.push(`API version : ${profile.apiVersion}`);
    lines.push("");
  }

  if (profile.repositories?.length) {
    lines.push("Repositories");
    profile.repositories.forEach((repo) => lines.push(`- ${repo}`));
    lines.push("");
  }

  if (profile.notes?.length) {
    lines.push("Notes");
    profile.notes.forEach((note) => lines.push(`- ${note}`));
    lines.push("");
  }

  lines.push("Étapes suggérées");
  lines.push("- Vérifier que Java cible est installé.");
  lines.push("- Lancer le script `scripts/init-stage.ps1` pour initialiser le wrapper Gradle si possible.");
  lines.push("- Utiliser ensuite `scripts/build-stage.ps1` pour compiler le stage.");

  return lines.join("\n");
}

function buildToolchainInitScript(profile) {
  const gradleVersion = profile.gradleVersion || "8.5";
  return `$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\\..

if (Test-Path ".\\gradlew.bat") {
  Write-Host "Wrapper Gradle déjà présent."
  exit 0
}

if (-not (Get-Command gradle -ErrorAction SilentlyContinue)) {
  Write-Error "Gradle n'est pas installé sur la machine. Installe Gradle ${gradleVersion} ou ajoute un wrapper manuellement."
}

gradle wrapper --gradle-version ${gradleVersion}
`;
}

function buildWorkspaceInitScript(stages) {
  const body = stages
    .map(
      (stage) => `Write-Host "Initialisation du stage: ${stage.path.replace(/"/g, '""')}"
& "${path.join(stage.path, "scripts", "init-stage.ps1").replace(/"/g, '""')}"\n`
    )
    .join("\n");

  return `$ErrorActionPreference = "Continue"
${body}
`;
}

function buildWorkspaceBuildScript(stages) {
  const body = stages
    .map(
      (stage) => `Write-Host "Build du stage: ${stage.path.replace(/"/g, '""')}"
& "${path.join(stage.path, "scripts", "build-stage.ps1").replace(/"/g, '""')}"\n`
    )
    .join("\n");

  return `$ErrorActionPreference = "Continue"
${body}
`;
}

function buildBuildGradle(loader, phase) {
  const profile = resolveToolchainProfile(loader, phase.gameVersion, phase.java);
  const javaVersion = profile.javaVersion;

  if (loader === "fabric") {
    return `plugins {
    id 'fabric-loom' version '${profile.loomVersion}'
}

repositories {
    ${profile.repositories.join("\n    ")}
}

dependencies {
    minecraft "com.mojang:minecraft:${phase.gameVersion}"
    mappings "net.fabricmc:yarn:${phase.gameVersion}+build.${profile.yarnBuild}:v2"
    modImplementation "net.fabricmc:fabric-loader:${profile.loaderVersion}"
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(${javaVersion})
    }
}
`;
  }

  if (loader === "forge") {
    return `plugins {
    id 'net.minecraftforge.gradle' version '${profile.pluginVersion}'
}

repositories {
    ${profile.repositories.join("\n    ")}
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(${javaVersion})
    }
}

minecraft {
    mappings channel: '${profile.mappingsChannel}', version: '${profile.mappingsVersion}'
}

dependencies {
    minecraft '${profile.dependencyNotation}'
}
`;
  }

  if (loader === "quilt") {
    return `plugins {
    id 'org.quiltmc.loom' version '${profile.loomVersion}'
}

repositories {
    ${profile.repositories.join("\n    ")}
}

dependencies {
    minecraft "com.mojang:minecraft:${phase.gameVersion}"
    mappings "org.quiltmc:quilt-mappings:${phase.gameVersion}+build.${profile.mappingsBuild}:intermediary-v2"
    modImplementation "org.quiltmc:quilt-loader:${profile.loaderVersion}"
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(${javaVersion})
    }
}
`;
  }

  return `plugins {
    id 'java'
}

repositories {
    mavenCentral()
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(${javaVersion})
    }
}
`;
}

function buildMainJava(phase, packageName) {
  const className = `Stage${sanitizeSegment(phase.gameVersion).replace(/-/g, "_").replace(/\./g, "_")}Bootstrap`;

  return {
    className,
    content: `package ${packageName};

public final class ${className} {
    private ${className}() {
    }

    public static String stageInfo() {
        return "${phase.title.replace(/"/g, '\\"')} | ${phase.loader} | ${phase.gameVersion} | ${phase.java}";
    }
}
`
  };
}

function buildModId(inspection) {
  const source = inspection?.detection?.modName || inspection?.file?.name || "migration-mod";
  const sanitized = sanitizeSegment(source).replace(/-/g, "_");
  return sanitized || "migration_mod";
}

function buildForgeMetadata(inspection, phase, modId) {
  const version = inspection?.detection?.modVersion || "1.0.0";
  const displayName = inspection?.detection?.modName || "Migration Mod";

  return `modLoader="javafml"
loaderVersion="[1,)"
license="All Rights Reserved"

[[mods]]
modId="${modId}"
version="${version}"
displayName="${displayName.replace(/"/g, '\\"')}"
authors="Mod Version Inspector"
description='''Stage de migration généré pour ${phase.gameVersion}.'''

[[dependencies.${modId}]]
modId="minecraft"
mandatory=true
versionRange="${phase.gameVersion}"
ordering="NONE"
side="BOTH"
`;
}

function buildFabricMetadata(inspection, phase, modId, bootstrapClass) {
  const version = inspection?.detection?.modVersion || "1.0.0";
  return {
    schemaVersion: 1,
    id: modId,
    version,
    name: inspection?.detection?.modName || "Migration Mod",
    description: `Stage de migration généré pour ${phase.gameVersion}.`,
    authors: ["Mod Version Inspector"],
    environment: "*",
    entrypoints: {
      main: [bootstrapClass]
    },
    depends: {
      "fabric-loader": ">=0.15.0",
      minecraft: phase.gameVersion
    },
    custom: {
      generatedBy: "Mod Version Inspector",
      generatedForStage: phase.title
    }
  };
}

function buildQuiltMetadata(inspection, phase, modId, bootstrapClass) {
  const version = inspection?.detection?.modVersion || "1.0.0";
  return {
    schema_version: 1,
    quilt_loader: {
      group: "local.migration",
      id: modId,
      version,
      metadata: {
        name: inspection?.detection?.modName || "Migration Mod",
        description: `Stage de migration généré pour ${phase.gameVersion}.`
      },
      entrypoints: {
        init: bootstrapClass
      },
      depends: [
        { id: "quilt_loader", versions: ">=0.26.0" },
        { id: "minecraft", versions: phase.gameVersion }
      ]
    }
  };
}

function buildPluginYml(inspection, phase, bootstrapClass) {
  const version = inspection?.detection?.modVersion || "1.0.0";
  const pluginName = (inspection?.detection?.modName || "MigrationMod").replace(/[^\w.-]/g, "");
  return `name: ${pluginName}
version: ${version}
main: ${bootstrapClass}
api-version: ${phase.gameVersion}
authors:
  - Mod Version Inspector
description: Stage de migration généré automatiquement.
`;
}

function writeStageMetadata(loader, resourcesDir, inspection, phase, packageName, bootstrapClass) {
  const modId = buildModId(inspection);

  if (loader === "forge") {
    const metaInfDir = path.join(resourcesDir, "META-INF");
    ensureDir(metaInfDir);
    writeText(path.join(metaInfDir, "mods.toml"), buildForgeMetadata(inspection, phase, modId));
    return {
      loader,
      files: ["META-INF/mods.toml"],
      modId
    };
  }

  if (loader === "fabric") {
    writeJson(path.join(resourcesDir, "fabric.mod.json"), buildFabricMetadata(inspection, phase, modId, bootstrapClass));
    return {
      loader,
      files: ["fabric.mod.json"],
      modId
    };
  }

  if (loader === "quilt") {
    writeJson(path.join(resourcesDir, "quilt.mod.json"), buildQuiltMetadata(inspection, phase, modId, bootstrapClass));
    return {
      loader,
      files: ["quilt.mod.json"],
      modId
    };
  }

  if (loader === "bukkit") {
    writeText(path.join(resourcesDir, "plugin.yml"), buildPluginYml(inspection, phase, bootstrapClass));
    return {
      loader,
      files: ["plugin.yml"],
      modId
    };
  }

  return {
    loader,
    files: [],
    modId
  };
}

function createStageScaffold(stagesDir, plan, inspection) {
  const createdStages = [];
  const packageName = "local.migration.stage";

  (plan?.phases || []).forEach((phase, index) => {
    const loader = normalizeLoader(phase.loader);
    const stageDir = path.join(
      stagesDir,
      `${String(index + 1).padStart(2, "0")}-${sanitizeSegment(phase.gameVersion)}-${sanitizeSegment(phase.loader)}`
    );

    const mainJavaDir = path.join(stageDir, "src", "main", "java", ...packageName.split("."));
    const resourcesDir = path.join(stageDir, "src", "main", "resources");
    const importedJavaDir = path.join(stageDir, "src", "imported", "java");
    const importedResourcesDir = path.join(stageDir, "src", "imported", "resources");
    const inputDir = path.join(stageDir, "input");
    const notesDir = path.join(stageDir, "notes");
    const scriptsDir = path.join(stageDir, "scripts");
    ensureDir(mainJavaDir);
    ensureDir(resourcesDir);
    ensureDir(importedJavaDir);
    ensureDir(importedResourcesDir);
    ensureDir(inputDir);
    ensureDir(notesDir);
    ensureDir(scriptsDir);

    const { className, content } = buildMainJava(phase, packageName);
    const bootstrapClass = `${packageName}.${className}`;
    const hints = buildHints(phase, plan, inspection);
    const metadata = writeStageMetadata(loader, resourcesDir, inspection, phase, packageName, bootstrapClass);
    const toolchainProfile = resolveToolchainProfile(loader, phase.gameVersion, phase.java);
    const mappingProfile = resolveMappingProfile(loader, phase.gameVersion);

    writeText(path.join(stageDir, "README.md"), buildStageReadme(phase, index));
    writeText(path.join(stageDir, "build.gradle"), buildBuildGradle(loader, phase));
    writeText(path.join(stageDir, "settings.gradle"), buildSettingsGradle(phase));
    writeText(path.join(stageDir, "gradle.properties"), buildGradleProperties(phase));
    writeText(path.join(stageDir, ".gitignore"), buildGitIgnore());
    writeText(path.join(mainJavaDir, `${className}.java`), content);
    writeText(path.join(notesDir, "migration-hints.md"), hints.map((hint) => `- ${hint}`).join("\n"));
    writeJson(path.join(notesDir, "metadata-preview.json"), metadata);
    writeJson(path.join(notesDir, "toolchain-profile.json"), toolchainProfile);
    writeJson(path.join(notesDir, "mapping-profile.json"), mappingProfile);
    writeText(path.join(notesDir, "toolchain-guide.md"), buildToolchainGuide(toolchainProfile, phase));
    writeText(path.join(scriptsDir, "init-stage.ps1"), buildToolchainInitScript(toolchainProfile));
    writeJson(path.join(resourcesDir, "stage-context.json"), {
      sourceMod: inspection.detection.modName,
      phase,
      packageName,
      bootstrapClass,
      hints,
      metadata,
      toolchainProfile,
      mappingProfile,
      generator: inspection?.detection?.generator || null,
      isMcreator: Boolean(inspection?.detection?.isMcreator)
    });

    createdStages.push({
      path: stageDir,
      loader: phase.loader,
      gameVersion: phase.gameVersion,
      java: phase.java,
      hints,
      metadata,
      toolchainProfile,
      mappingProfile
    });
  });

  return createdStages;
}

function createMigrationWorkspace({ inspection, plan, baseDir }) {
  if (!inspection?.file?.path) {
    throw new Error("Impossible de créer le workspace : aucune inspection valide.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const modName = sanitizeSegment(inspection.detection?.modName || inspection.file.name);
  const workspaceRoot = path.join(baseDir, `${modName}-${timestamp}`);
  const artifactDir = path.join(workspaceRoot, "artifact");
  const extractedDir = path.join(workspaceRoot, "extracted");
  const reportsDir = path.join(workspaceRoot, "reports");
  const notesDir = path.join(workspaceRoot, "notes");
  const scriptsDir = path.join(workspaceRoot, "scripts");
  const stagesDir = path.join(workspaceRoot, "stages");

  ensureDir(artifactDir);
  ensureDir(reportsDir);
  ensureDir(notesDir);
  ensureDir(scriptsDir);
  ensureDir(stagesDir);

  const sourceArtifactPath = inspection.file.path;
  const copiedArtifactPath = path.join(artifactDir, path.basename(sourceArtifactPath));
  fs.copyFileSync(sourceArtifactPath, copiedArtifactPath);

  let extracted = false;
  if (isZipLike(sourceArtifactPath)) {
    ensureDir(extractedDir);
    const zip = new AdmZip(sourceArtifactPath);
    zip.extractAllTo(extractedDir, true);
    extracted = true;
  }

  const inventory = listArchiveInventory(sourceArtifactPath);

  writeJson(path.join(reportsDir, "inspection.json"), inspection);
  writeJson(path.join(reportsDir, "migration-plan.json"), plan || {});
  writeJson(path.join(reportsDir, "archive-inventory.json"), inventory);
  writeText(path.join(notesDir, "README.md"), buildReadme(inspection, plan, workspaceRoot));
  writeText(path.join(notesDir, "porting-checklist.md"), buildChecklist(plan));

  const createdStages = createStageScaffold(stagesDir, plan, inspection);
  createdStages.forEach((stage) => {
    if (extracted) {
      copyDirectoryContents(extractedDir, path.join(stage.path, "input", "source-extracted"));
    } else {
      ensureDir(path.join(stage.path, "input"));
      fs.copyFileSync(copiedArtifactPath, path.join(stage.path, "input", path.basename(copiedArtifactPath)));
    }

    writeJson(path.join(stage.path, "notes", "inventory-snapshot.json"), inventory);
  });
  writeText(path.join(notesDir, "workspace-guide.md"), buildWorkspaceGuide(plan, workspaceRoot, createdStages));
  writeText(path.join(scriptsDir, "init-workspace.ps1"), buildWorkspaceInitScript(createdStages));
  writeText(path.join(scriptsDir, "build-workspace.ps1"), buildWorkspaceBuildScript(createdStages));
  const diagnostics = prepareWorkspaceDiagnostics({ stages: createdStages });
  writeJson(path.join(reportsDir, "build-diagnostics.json"), diagnostics);

  return {
    workspaceRoot,
    artifactPath: copiedArtifactPath,
    extracted,
    extractedPath: extracted ? extractedDir : null,
    reportsPath: reportsDir,
    notesPath: notesDir,
    stagesPath: stagesDir,
    stageCount: createdStages.length,
    stages: createdStages,
    inventory,
    diagnostics
  };
}

module.exports = {
  createMigrationWorkspace
};
