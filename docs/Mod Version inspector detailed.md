# Mod Version Inspector — Architecture détaillée

## 1. Vue d'ensemble des modules

```mermaid
graph TD
    MAIN["main.js - Electron Main Process"]
    PRELOAD["preload.js - contextBridge"]

    MAIN -->|IPC handlers| PRELOAD

    subgraph SRC["src/ - Modules metier"]
        ANALYZER["analyzer.js - inspectArtifact()"]
        PLANNER["migration-planner.js - planMigration()"]
        WORKSPACE["workspace-generator.js - createMigrationWorkspace()"]
        ORCHESTRATOR["conversion-orchestrator.js - convertArtifact()"]
        PATCHER["auto-patcher.js - applyAutomaticPatches()"]
        DECOMPILER["decompiler-manager.js - prepareDecompilation()"]
        BUILD_DIAG["build-diagnostics.js - runWorkspaceBuilds()"]
        BATCH["batch-benchmark.js - runBenchmark()"]
        STAGE_SYNC["stage-sync.js - injectDecompiledSources()"]
        KB["knowledge-base.js - buildKnowledgeContext()"]
        MAPPING["mapping-profiles.js - resolveMappingProfile()"]
        TOOLCHAIN["toolchain-profiles.js - resolveToolchainProfile()"]
        HINTS["migration-hints.js - buildHints()"]
        VERSION["version-rules.js - compareVersions()"]
    end

    MAIN --> ANALYZER
    MAIN --> PLANNER
    MAIN --> WORKSPACE
    MAIN --> ORCHESTRATOR
    MAIN --> PATCHER
    MAIN --> DECOMPILER
    MAIN --> BUILD_DIAG
    MAIN --> BATCH
```

## 2. Pipeline de conversion

```mermaid
flowchart TD
    INPUT["Artefact .jar / .zip / .class / .litemod"]

    subgraph INSPECT["1 - Analyse analyzer.js"]
        A1["Lecture bytecode .class -> version Java"]
        A2["Parsing mods.toml / fabric.mod.json / plugin.yml / MANIFEST.MF"]
        A3["Detection loader et game version"]
        A4["Heuristique MCreator structure ModElements"]
        A1 --> A3
        A2 --> A3
        A3 --> A4
    end

    subgraph PLAN["2 - Planification migration-planner.js"]
        P1["Calcul du staircase par loader track"]
        P2["Generation des phases previousVersion -> gameVersion"]
        P3["Risques et taches manuelles"]
        P4["buildKnowledgeContext() knowledge-base.js"]
        P1 --> P2 --> P3
        P2 --> P4
    end

    subgraph WORKSPACE_GEN["3 - Workspace workspace-generator.js"]
        W1["createStageScaffold() - 1 dossier par palier"]
        W2["build.gradle / settings.gradle / gradle.properties"]
        W3["Metadata loader mods.toml / fabric.mod.json / quilt.mod.json / plugin.yml"]
        W4["toolchain-profile.json via toolchain-profiles.js"]
        W5["mapping-profile.json via mapping-profiles.js"]
        W6["Scripts globaux init-workspace.ps1 / build-workspace.ps1 / workspace-guide.md"]
        W7["Scripts par stage init-stage.ps1 / toolchain-guide.md"]
        W1 --> W2
        W1 --> W3
        W1 --> W4
        W1 --> W5
        W1 --> W6
        W1 --> W7
    end

    subgraph DECOMP["4 - Decompilation decompiler-manager.js"]
        D1["Detection Java runtime"]
        D2["Download CFR cfr-0.152.jar"]
        D3["Execution CFR -> sources .java"]
        D4["injectDecompiledSources() stage-sync.js -> src/imported/java"]
        D1 --> D2 --> D3 --> D4
    end

    subgraph PATCH["5 - Patchs automatiques auto-patcher.js"]
        PA1["applyForgeSourceTransforms() IBlockState TileEntity @Mod.EventHandler"]
        PA2["applyFabricSourceTransforms() Registry ModInitializer"]
        PA3["applyMcreatorSourceTransforms() structure ModElements"]
        PA4["collectSourceDiagnostics() + version-rules.js"]
        PA5["collectVersionDiagnostics() patterns par loader/version"]
        PA1 & PA2 & PA3 --> PA4
        PA4 --> PA5
    end

    subgraph BUILD["6 - Build build-diagnostics.js"]
        B1["build-stage.ps1 gradlew.bat ou gradle"]
        B2["parseBuildIssues() compiler / gradle / generic"]
        B3["build-result.json / build-output.log"]
        B1 --> B2 --> B3
    end

    OUTPUT["Artefact final .jar + rapports + workspace"]

    INPUT --> INSPECT --> PLAN --> WORKSPACE_GEN --> DECOMP --> PATCH --> BUILD --> OUTPUT
```

## 3. Dependances entre modules

```mermaid
graph LR
    ORCHESTRATOR["conversion-orchestrator.js"]
    PLANNER["migration-planner.js"]
    WORKSPACE["workspace-generator.js"]
    DECOMPILER["decompiler-manager.js"]
    PATCHER["auto-patcher.js"]
    BUILD["build-diagnostics.js"]
    STAGE_SYNC["stage-sync.js"]
    KB["knowledge-base.js"]
    MAPPING["mapping-profiles.js"]
    TOOLCHAIN["toolchain-profiles.js"]
    HINTS["migration-hints.js"]
    VERSION["version-rules.js"]
    BATCH["batch-benchmark.js"]
    ANALYZER["analyzer.js"]

    ORCHESTRATOR --> PLANNER
    ORCHESTRATOR --> WORKSPACE
    ORCHESTRATOR --> DECOMPILER
    ORCHESTRATOR --> PATCHER
    ORCHESTRATOR --> BUILD

    PLANNER --> KB
    PLANNER --> VERSION
    KB --> VERSION

    WORKSPACE --> TOOLCHAIN
    WORKSPACE --> MAPPING
    WORKSPACE --> HINTS

    TOOLCHAIN --> VERSION
    MAPPING --> VERSION
    HINTS -.->|buildHints| PLANNER

    DECOMPILER --> STAGE_SYNC
    PATCHER --> VERSION

    BATCH --> ANALYZER
    BATCH --> ORCHESTRATOR
```

## 4. Loader tracks et staircase

```mermaid
flowchart LR
    subgraph FORGE["Forge"]
        F1["1.7.10"] --> F2["1.12.2"] --> F3["1.16.5"] --> F4["1.18.2"] --> F5["1.20.1"]
    end

    subgraph FABRIC["Fabric"]
        FA1["1.14.4"] --> FA2["1.16.5"] --> FA3["1.18.2"] --> FA4["1.20.1"] --> FA5["1.21.1"]
    end

    subgraph QUILT["Quilt"]
        Q1["1.18.2"] --> Q2["1.19.4"] --> Q3["1.20.1"] --> Q4["1.21.1"]
    end

    subgraph BUKKIT["Bukkit / Paper"]
        BK1["1.8.8"] --> BK2["1.12.2"] --> BK3["1.16.5"] --> BK4["1.20.1"] --> BK5["1.21.1"]
    end

    subgraph LITELOADER["LiteLoader"]
        L1["1.7.10"] --> L2["1.8.9"] --> L3["1.12.2"]
    end

    subgraph JAVA["Java requis par version"]
        J1["1.21+ -> Java 21"]
        J2["1.18+ -> Java 17"]
        J3["1.17 -> Java 16"]
        J4["1.13+ -> Java 8"]
    end
```

## 5. IPC Electron — API exposee au renderer

```mermaid
flowchart LR
    subgraph RENDERER["Renderer window.modInspector"]
        R1["pickModFile()"]
        R2["pickModFolder()"]
        R3["inspectModFile(filePath)"]
        R4["planMigration(inspection, target)"]
        R5["convertArtifact(inspection, target)"]
        R6["createMigrationWorkspace(inspection, plan)"]
        R7["prepareDecompilation(workspace)"]
        R8["applyAutomaticPatches(workspace)"]
        R9["runStageBuild(workspace, stagePath)"]
        R10["runWorkspaceBuilds(workspace)"]
        R11["runWorkspaceScript(scriptPath)"]
        R12["runBenchmark(folderPath, target, options)"]
        R13["openPath(targetPath)"]
        R14["windowAction(action)"]
    end

    subgraph MAIN["Main Process ipcMain"]
        M1["dialog.showOpenDialog file"]
        M2["dialog.showOpenDialog folder"]
        M3["inspectArtifact()"]
        M4["planMigration()"]
        M5["convertArtifact()"]
        M6["createMigrationWorkspace()"]
        M7["prepareDecompilation()"]
        M8["applyAutomaticPatches()"]
        M9["runSingleStageBuild()"]
        M10["runWorkspaceBuilds()"]
        M11["powershell -File scriptPath"]
        M12["runBenchmark()"]
        M13["shell.openPath()"]
        M14["BrowserWindow actions"]
    end

    R1 -->|IPC| M1
    R2 -->|IPC| M2
    R3 -->|IPC| M3
    R4 -->|IPC| M4
    R5 -->|IPC| M5
    R6 -->|IPC| M6
    R7 -->|IPC| M7
    R8 -->|IPC| M8
    R9 -->|IPC| M9
    R10 -->|IPC| M10
    R11 -->|IPC| M11
    R12 -->|IPC| M12
    R13 -->|IPC| M13
    R14 -->|IPC| M14
```

## 6. Structure des fichiers generes par stage

```mermaid
flowchart TD
    ROOT["workspace-root/"]

    ROOT --> GLOBAL_SCRIPTS["init-workspace.ps1 / build-workspace.ps1 / workspace-guide.md / README.md / checklist.md"]
    ROOT --> TOOLS["tools/cfr/cfr-0.152.jar"]
    ROOT --> DECOMPILED["decompiled-sources/ .java CFR output"]
    ROOT --> S1["stage-1/ palier source"]
    ROOT --> SN["stage-N/ palier cible final"]

    S1 --> SRC_DIR["src/main/java / src/main/resources / src/imported/java / src/imported/resources"]
    S1 --> BUILD_FILES["build.gradle / settings.gradle / gradle.properties / .gitignore"]
    S1 --> METADATA["mods.toml / fabric.mod.json / quilt.mod.json / plugin.yml"]
    S1 --> PROFILES["toolchain-profile.json / mapping-profile.json"]
    S1 --> STAGE_SCRIPTS["scripts/init-stage.ps1 / build-stage.ps1 / decompile.ps1 / toolchain-guide.md"]
    S1 --> NOTES["notes/build-diagnostic.json / build-result.json / build-output.log / decompiled-import.json / patch-report.md"]
```
