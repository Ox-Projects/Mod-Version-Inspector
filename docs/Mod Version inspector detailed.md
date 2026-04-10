\# Mod Version Inspector — Architecture détaillée



\## Vue d'ensemble des modules



```mermaid

graph TD

&#x20;   MAIN\["main.js\\nElectron Main Process"]

&#x20;   PRELOAD\["preload.js\\ncontextBridge → window.modInspector"]



&#x20;   MAIN -->|IPC handlers| PRELOAD



&#x20;   subgraph SRC\["src/ — Modules métier"]

&#x20;       ANALYZER\["analyzer.js\\ninspectArtifact()"]

&#x20;       PLANNER\["migration-planner.js\\nplanMigration()"]

&#x20;       WORKSPACE\["workspace-generator.js\\ncreateMigrationWorkspace()"]

&#x20;       ORCHESTRATOR\["conversion-orchestrator.js\\nconvertArtifact()"]

&#x20;       PATCHER\["auto-patcher.js\\napplyAutomaticPatches()"]

&#x20;       DECOMPILER\["decompiler-manager.js\\nprepareDecompilation()"]

&#x20;       BUILD\_DIAG\["build-diagnostics.js\\nrunWorkspaceBuilds()"]

&#x20;       BATCH\["batch-benchmark.js\\nrunBenchmark()"]

&#x20;       STAGE\_SYNC\["stage-sync.js\\ninjectDecompiledSources()"]

&#x20;       KB\["knowledge-base.js\\nbuildKnowledgeContext()"]

&#x20;       MAPPING\["mapping-profiles.js\\nresolveMappingProfile()"]

&#x20;       TOOLCHAIN\["toolchain-profiles.js\\nresolveToolchainProfile()"]

&#x20;       HINTS\["migration-hints.js\\nbuildHints()"]

&#x20;       VERSION\["version-rules.js\\ncompareVersions()\\ncollectVersionDiagnostics()"]

&#x20;   end



&#x20;   MAIN --> ANALYZER

&#x20;   MAIN --> PLANNER

&#x20;   MAIN --> WORKSPACE

&#x20;   MAIN --> ORCHESTRATOR

&#x20;   MAIN --> PATCHER

&#x20;   MAIN --> DECOMPILER

&#x20;   MAIN --> BUILD\_DIAG

&#x20;   MAIN --> BATCH

```



\---



\## Pipeline de conversion complet



```mermaid

flowchart TD

&#x20;   INPUT\["Artefact\\n.jar / .zip / .class / .litemod"]



&#x20;   subgraph INSPECT\["1 — Analyse (analyzer.js)"]

&#x20;       A1\["Lecture bytecode .class\\n→ version Java"]

&#x20;       A2\["Parsing mods.toml\\nfabric.mod.json\\nquilt.mod.json\\nplugin.yml\\nMANIFEST.MF"]

&#x20;       A3\["Détection loader\\net game version"]

&#x20;       A4\["Heuristique MCreator\\n(structure ModElements)"]

&#x20;       A1 --> A3

&#x20;       A2 --> A3

&#x20;       A3 --> A4

&#x20;   end



&#x20;   subgraph PLAN\["2 — Planification (migration-planner.js)"]

&#x20;       P1\["Calcul du staircase\\npar loader track"]

&#x20;       P2\["Génération des phases\\n(previousVersion → gameVersion)"]

&#x20;       P3\["Risques \& tâches manuelles"]

&#x20;       P4\["buildKnowledgeContext()\\n(knowledge-base.js)"]

&#x20;       P1 --> P2 --> P3

&#x20;       P2 --> P4

&#x20;   end



&#x20;   subgraph WORKSPACE\_GEN\["3 — Workspace (workspace-generator.js)"]

&#x20;       W1\["createStageScaffold()\\n1 dossier par palier"]

&#x20;       W2\["build.gradle\\nsettings.gradle\\ngradle.properties"]

&#x20;       W3\["Metadata loader\\nmods.toml / fabric.mod.json\\nquilt.mod.json / plugin.yml"]

&#x20;       W4\["toolchain-profile.json\\n(toolchain-profiles.js)"]

&#x20;       W5\["mapping-profile.json\\n(mapping-profiles.js)"]

&#x20;       W6\["Scripts globaux\\ninit-workspace.ps1\\nbuild-workspace.ps1\\nworkspace-guide.md"]

&#x20;       W7\["Scripts par stage\\ninit-stage.ps1\\ntoolchain-guide.md"]

&#x20;       W1 --> W2

&#x20;       W1 --> W3

&#x20;       W1 --> W4

&#x20;       W1 --> W5

&#x20;       W1 --> W6

&#x20;       W1 --> W7

&#x20;   end



&#x20;   subgraph DECOMP\["4 — Décompilation (decompiler-manager.js)"]

&#x20;       D1\["Détection Java runtime"]

&#x20;       D2\["Téléchargement CFR\\n(cfr-0.152.jar)"]

&#x20;       D3\["Exécution CFR\\n→ sources .java"]

&#x20;       D4\["injectDecompiledSources()\\n(stage-sync.js)\\n→ src/imported/java"]

&#x20;       D1 --> D2 --> D3 --> D4

&#x20;   end



&#x20;   subgraph PATCH\["5 — Patchs automatiques (auto-patcher.js)"]

&#x20;       PA1\["applyForgeSourceTransforms()\\nIBlockState, TileEntity,\\n@Mod.EventHandler…"]

&#x20;       PA2\["applyFabricSourceTransforms()\\nRegistry, ModInitializer…"]

&#x20;       PA3\["applyMcreatorSourceTransforms()\\nstructure ModElements"]

&#x20;       PA4\["collectSourceDiagnostics()\\n+ version-rules.js"]

&#x20;       PA5\["collectVersionDiagnostics()\\npatterns par loader/version"]

&#x20;       PA4 --> PA5

&#x20;       PA1 \& PA2 \& PA3 --> PA4

&#x20;   end



&#x20;   subgraph BUILD\["6 — Build (build-diagnostics.js)"]

&#x20;       B1\["build-stage.ps1\\n(gradlew.bat ou gradle)"]

&#x20;       B2\["parseBuildIssues()\\ncompiler / gradle / generic"]

&#x20;       B3\["build-result.json\\nbuild-output.log"]

&#x20;       B1 --> B2 --> B3

&#x20;   end



&#x20;   OUTPUT\["Artefact final .jar\\n+ rapports + workspace"]



&#x20;   INPUT --> INSPECT

&#x20;   INSPECT --> PLAN

&#x20;   PLAN --> WORKSPACE\_GEN

&#x20;   WORKSPACE\_GEN --> DECOMP

&#x20;   DECOMP --> PATCH

&#x20;   PATCH --> BUILD

&#x20;   BUILD --> OUTPUT

```



\---



\## Dépendances entre modules



```mermaid

graph LR

&#x20;   ORCHESTRATOR\["conversion-orchestrator.js"]

&#x20;   PLANNER\["migration-planner.js"]

&#x20;   WORKSPACE\["workspace-generator.js"]

&#x20;   DECOMPILER\["decompiler-manager.js"]

&#x20;   PATCHER\["auto-patcher.js"]

&#x20;   BUILD\["build-diagnostics.js"]

&#x20;   STAGE\_SYNC\["stage-sync.js"]

&#x20;   KB\["knowledge-base.js"]

&#x20;   MAPPING\["mapping-profiles.js"]

&#x20;   TOOLCHAIN\["toolchain-profiles.js"]

&#x20;   HINTS\["migration-hints.js"]

&#x20;   VERSION\["version-rules.js"]

&#x20;   BATCH\["batch-benchmark.js"]

&#x20;   ANALYZER\["analyzer.js"]



&#x20;   ORCHESTRATOR --> PLANNER

&#x20;   ORCHESTRATOR --> WORKSPACE

&#x20;   ORCHESTRATOR --> DECOMPILER

&#x20;   ORCHESTRATOR --> PATCHER

&#x20;   ORCHESTRATOR --> BUILD



&#x20;   PLANNER --> KB

&#x20;   PLANNER --> VERSION



&#x20;   KB --> VERSION



&#x20;   WORKSPACE --> TOOLCHAIN

&#x20;   WORKSPACE --> MAPPING

&#x20;   WORKSPACE --> HINTS



&#x20;   TOOLCHAIN --> VERSION

&#x20;   MAPPING --> VERSION

&#x20;   HINTS -.->|buildHints| PLANNER



&#x20;   DECOMPILER --> STAGE\_SYNC



&#x20;   PATCHER --> VERSION



&#x20;   BATCH --> ANALYZER

&#x20;   BATCH --> ORCHESTRATOR

```



\---



\## Loader tracks et staircase



```mermaid

flowchart LR

&#x20;   subgraph FORGE\["Forge"]

&#x20;       F1\["1.7.10"] --> F2\["1.12.2"] --> F3\["1.16.5"] --> F4\["1.18.2"] --> F5\["1.20.1"]

&#x20;   end



&#x20;   subgraph FABRIC\["Fabric"]

&#x20;       FA1\["1.14.4"] --> FA2\["1.16.5"] --> FA3\["1.18.2"] --> FA4\["1.20.1"] --> FA5\["1.21.1"]

&#x20;   end



&#x20;   subgraph QUILT\["Quilt"]

&#x20;       Q1\["1.18.2"] --> Q2\["1.19.4"] --> Q3\["1.20.1"] --> Q4\["1.21.1"]

&#x20;   end



&#x20;   subgraph BUKKIT\["Bukkit / Paper"]

&#x20;       BK1\["1.8.8"] --> BK2\["1.12.2"] --> BK3\["1.16.5"] --> BK4\["1.20.1"] --> BK5\["1.21.1"]

&#x20;   end



&#x20;   subgraph LITELOADER\["LiteLoader"]

&#x20;       L1\["1.7.10"] --> L2\["1.8.9"] --> L3\["1.12.2"]

&#x20;   end



&#x20;   subgraph JAVA\["Java requis"]

&#x20;       J1\["≥ 1.21 → Java 21"]

&#x20;       J2\["≥ 1.18 → Java 17"]

&#x20;       J3\["= 1.17 → Java 16"]

&#x20;       J4\["≥ 1.13 → Java 8"]

&#x20;   end

```



\---



\## IPC Electron — API exposée au renderer



```mermaid

flowchart LR

&#x20;   subgraph RENDERER\["Renderer (window.modInspector)"]

&#x20;       R1\["pickModFile()"]

&#x20;       R2\["pickModFolder()"]

&#x20;       R3\["inspectModFile(filePath)"]

&#x20;       R4\["planMigration(inspection, target)"]

&#x20;       R5\["convertArtifact(inspection, target)"]

&#x20;       R6\["createMigrationWorkspace(inspection, plan)"]

&#x20;       R7\["prepareDecompilation(workspace)"]

&#x20;       R8\["applyAutomaticPatches(workspace)"]

&#x20;       R9\["runStageBuild(workspace, stagePath)"]

&#x20;       R10\["runWorkspaceBuilds(workspace)"]

&#x20;       R11\["runWorkspaceScript(scriptPath)"]

&#x20;       R12\["runBenchmark(folderPath, target, options)"]

&#x20;       R13\["openPath(targetPath)"]

&#x20;       R14\["windowAction(action)"]

&#x20;   end



&#x20;   subgraph MAIN\["Main Process (ipcMain)"]

&#x20;       M1\["dialog.showOpenDialog (file)"]

&#x20;       M2\["dialog.showOpenDialog (folder)"]

&#x20;       M3\["inspectArtifact()"]

&#x20;       M4\["planMigration()"]

&#x20;       M5\["convertArtifact()"]

&#x20;       M6\["createMigrationWorkspace()"]

&#x20;       M7\["prepareDecompilation()"]

&#x20;       M8\["applyAutomaticPatches()"]

&#x20;       M9\["runSingleStageBuild()"]

&#x20;       M10\["runWorkspaceBuilds()"]

&#x20;       M11\["powershell -File scriptPath"]

&#x20;       M12\["runBenchmark()"]

&#x20;       M13\["shell.openPath()"]

&#x20;       M14\["BrowserWindow actions"]

&#x20;   end



&#x20;   R1 -->|IPC| M1

&#x20;   R2 -->|IPC| M2

&#x20;   R3 -->|IPC| M3

&#x20;   R4 -->|IPC| M4

&#x20;   R5 -->|IPC| M5

&#x20;   R6 -->|IPC| M6

&#x20;   R7 -->|IPC| M7

&#x20;   R8 -->|IPC| M8

&#x20;   R9 -->|IPC| M9

&#x20;   R10 -->|IPC| M10

&#x20;   R11 -->|IPC| M11

&#x20;   R12 -->|IPC| M12

&#x20;   R13 -->|IPC| M13

&#x20;   R14 -->|IPC| M14

```



\---



\## Structure des fichiers générés par stage



```mermaid

flowchart TD

&#x20;   ROOT\["workspace-root/"]



&#x20;   ROOT --> GLOBAL\_SCRIPTS\["init-workspace.ps1\\nbuild-workspace.ps1\\nworkspace-guide.md\\nREADME.md\\nchecklist.md"]

&#x20;   ROOT --> TOOLS\["tools/cfr/\\ncfr-0.152.jar"]

&#x20;   ROOT --> DECOMPILED\["decompiled-sources/\\n\*.java (CFR output)"]



&#x20;   ROOT --> S1\["stage-1/\\n(palier source)"]

&#x20;   ROOT --> SN\["stage-N/\\n(palier cible final)"]



&#x20;   S1 --> SRC\_DIR\["src/\\n  main/java/\\n  main/resources/\\n  imported/java/\\n  imported/resources/"]

&#x20;   S1 --> BUILD\_FILES\["build.gradle\\nsettings.gradle\\ngradle.properties\\n.gitignore"]

&#x20;   S1 --> METADATA\["mods.toml\\nfabric.mod.json\\nquilt.mod.json\\nplugin.yml"]

&#x20;   S1 --> PROFILES\["toolchain-profile.json\\nmapping-profile.json"]

&#x20;   S1 --> STAGE\_SCRIPTS\["scripts/\\n  init-stage.ps1\\n  build-stage.ps1\\n  decompile.ps1\\ntoolchain-guide.md"]

&#x20;   S1 --> NOTES\["notes/\\n  build-diagnostic.json\\n  build-result.json\\n  build-output.log\\n  decompiled-import.json\\n  patch-report.md"]

```

