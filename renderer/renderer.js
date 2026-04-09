const browseButton = document.getElementById("browseButton");
const dropZone = document.getElementById("dropZone");
const statusMessage = document.getElementById("statusMessage");
const resultTag = document.getElementById("resultTag");
const convertButton = document.getElementById("convertButton");
const planButton = document.getElementById("planButton");
const workspaceButton = document.getElementById("workspaceButton");
const decompileButton = document.getElementById("decompileButton");
const patchButton = document.getElementById("patchButton");
const buildStagesButton = document.getElementById("buildStagesButton");
const openWorkspaceButton = document.getElementById("openWorkspaceButton");
const openOutputButton = document.getElementById("openOutputButton");
const openWorkspaceGuideButton = document.getElementById("openWorkspaceGuideButton");
const initWorkspaceButton = document.getElementById("initWorkspaceButton");
const buildWorkspaceButton = document.getElementById("buildWorkspaceButton");
const minimizeButton = document.getElementById("minimizeButton");
const maximizeButton = document.getElementById("maximizeButton");
const closeButton = document.getElementById("closeButton");
const targetLoader = document.getElementById("targetLoader");
const targetGameVersion = document.getElementById("targetGameVersion");
const targetJavaVersion = document.getElementById("targetJavaVersion");
const migrationStatus = document.getElementById("migrationStatus");
const conversionStatus = document.getElementById("conversionStatus");
const workspaceStatus = document.getElementById("workspaceStatus");
const decompileStatus = document.getElementById("decompileStatus");
const patchStatus = document.getElementById("patchStatus");
const buildStatus = document.getElementById("buildStatus");
const migrationStrategy = document.getElementById("migrationStrategy");
const migrationKnowledge = document.getElementById("migrationKnowledge");
const migrationSteps = document.getElementById("migrationSteps");
const migrationRisks = document.getElementById("migrationRisks");
const migrationTasks = document.getElementById("migrationTasks");
const migrationPhases = document.getElementById("migrationPhases");
const buildSummary = document.getElementById("buildSummary");
const buildResults = document.getElementById("buildResults");
const patchSummary = document.getElementById("patchSummary");
const patchResults = document.getElementById("patchResults");
const conversionSummary = document.getElementById("conversionSummary");
const conversionSteps = document.getElementById("conversionSteps");
const workspaceScriptSummary = document.getElementById("workspaceScriptSummary");
const workspaceScriptLogs = document.getElementById("workspaceScriptLogs");

const fields = {
  modName: document.getElementById("modName"),
  modFile: document.getElementById("modFile"),
  javaVersion: document.getElementById("javaVersion"),
  javaDetails: document.getElementById("javaDetails"),
  loaderType: document.getElementById("loaderType"),
  gameVersion: document.getElementById("gameVersion"),
  modVersion: document.getElementById("modVersion"),
  manifestVersion: document.getElementById("manifestVersion"),
  fileDetails: document.getElementById("fileDetails"),
  manifestDetails: document.getElementById("manifestDetails")
};

let currentInspection = null;
let currentPlan = null;
let currentWorkspace = null;
let currentBuildSummary = null;
let currentPatchSummary = null;
let currentConversion = null;
let currentWorkspaceScriptResult = null;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "-";
  }

  const units = ["o", "Ko", "Mo", "Go"];
  let size = bytes;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("fr-CH", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function setStatus(message, state = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${state}`.trim();
}

function setTag(text) {
  resultTag.textContent = text;
}

function setMigrationStatus(message) {
  migrationStatus.textContent = message;
}

function setConversionStatus(message) {
  conversionStatus.textContent = message;
}

function setWorkspaceStatus(message) {
  workspaceStatus.textContent = message;
}

function setDecompileStatus(message) {
  decompileStatus.textContent = message;
}

function setPatchStatus(message) {
  patchStatus.textContent = message;
}

function setBuildStatus(message) {
  buildStatus.textContent = message;
}

function renderWorkspaceScriptResult(label, result) {
  currentWorkspaceScriptResult = { label, result };
  if (!result) {
    workspaceScriptSummary.textContent = "Aucun script global exécuté.";
    workspaceScriptLogs.textContent = "Aucune sortie à afficher.";
    return;
  }

  workspaceScriptSummary.textContent = `${label} | ${result.success ? "succès" : "échec"} | code ${result.exitCode ?? "-"}`;
  const sections = [];
  if (result.stdout?.trim()) {
    sections.push(`STDOUT\n${result.stdout.trim()}`);
  }
  if (result.stderr?.trim()) {
    sections.push(`STDERR\n${result.stderr.trim()}`);
  }
  workspaceScriptLogs.textContent = sections.join("\n\n") || "Aucune sortie à afficher.";
}

function getWorkspaceScriptPath(fileName) {
  if (!currentWorkspace?.workspaceRoot) {
    return null;
  }

  return `${currentWorkspace.workspaceRoot}\\scripts\\${fileName}`;
}

function getWorkspaceGuidePath() {
  if (!currentWorkspace?.notesPath) {
    return null;
  }

  return `${currentWorkspace.notesPath}\\workspace-guide.md`;
}

function renderList(container, items) {
  container.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

function renderChips(container, items) {
  container.innerHTML = "";
  items.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "step-chip";
    chip.textContent = item;
    container.appendChild(chip);
  });
}

function renderPhases(phases) {
  migrationPhases.innerHTML = "";
  phases.forEach((phase) => {
    const card = document.createElement("article");
    card.className = "phase-card";

    const title = document.createElement("h4");
    title.textContent = phase.title;

    const meta = document.createElement("p");
    meta.className = "phase-meta";
    meta.textContent = `${phase.loader} | ${phase.gameVersion} | ${phase.java}`;

    const notes = document.createElement("p");
    notes.className = "phase-notes";
    notes.textContent = phase.notes;

    card.append(title, meta, notes);
    migrationPhases.appendChild(card);
  });
}

function renderBuildResults(summary) {
  currentBuildSummary = summary;
  buildResults.innerHTML = "";

  if (!summary?.stageReports?.length) {
    buildSummary.textContent = "Aucun build exécuté.";
    return;
  }

  buildSummary.textContent = `${summary.successCount} stage(s) réussi(s) sur ${summary.stageCount} | ${summary.failureCount} échec(s)`;

  summary.stageReports.forEach((stageReport) => {
    const card = document.createElement("article");
    card.className = `phase-card ${stageReport.success ? "build-success" : "build-failure"}`;

    const title = document.createElement("h4");
    title.textContent = `${stageReport.success ? "Succès" : "Échec"} | ${stageReport.gameVersion} | ${stageReport.loader}`;

    const meta = document.createElement("p");
    meta.className = "phase-meta";
    meta.textContent = `${stageReport.java} | code ${stageReport.exitCode ?? "-"} | ${stageReport.stagePath}`;

    const notes = document.createElement("p");
    notes.className = "phase-notes";
    notes.textContent =
      stageReport.errorSummary?.length > 0
        ? stageReport.errorSummary.join(" | ")
        : stageReport.success
          ? "Le build s'est terminé sans erreur remontée."
          : "Le build a échoué sans message d'erreur exploitable.";

    const issues = document.createElement("ul");
    issues.className = "report-list build-issues";
    const issueItems = (stageReport.issues || []).slice(0, 5);
    if (issueItems.length) {
      issueItems.forEach((issue) => {
        const li = document.createElement("li");
        const location = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ""}` : issue.type;
        li.textContent = `${location} | ${issue.message}`;
        issues.appendChild(li);
      });
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const openStageButton = document.createElement("button");
    openStageButton.className = "inline-action";
    openStageButton.type = "button";
    openStageButton.textContent = "Ouvrir le stage";
    openStageButton.addEventListener("click", async () => {
      await window.modInspector.openPath(stageReport.stagePath);
    });

    const openLogButton = document.createElement("button");
    openLogButton.className = "inline-action";
    openLogButton.type = "button";
    openLogButton.textContent = "Ouvrir le log";
    openLogButton.addEventListener("click", async () => {
      await window.modInspector.openPath(stageReport.logPath);
    });

    const rebuildButton = document.createElement("button");
    rebuildButton.className = "inline-action";
    rebuildButton.type = "button";
    rebuildButton.textContent = "Relancer ce stage";
    rebuildButton.addEventListener("click", async () => {
      if (!currentWorkspace) {
        return;
      }

      setBuildStatus(`Relance du stage ${stageReport.gameVersion} en cours...`);
      try {
        const updated = await window.modInspector.runStageBuild(currentWorkspace, stageReport.stagePath);
        const updatedReports = (currentBuildSummary?.stageReports || []).map((report) =>
          report.stagePath === updated.stagePath ? updated : report
        );
        const nextSummary = {
          ...(currentBuildSummary || {}),
          stageCount: updatedReports.length,
          successCount: updatedReports.filter((report) => report.success).length,
          failureCount: updatedReports.filter((report) => !report.success).length,
          stageReports: updatedReports
        };
        currentWorkspace = { ...currentWorkspace, buildSummary: nextSummary };
        renderBuildResults(nextSummary);
        setBuildStatus(
          updated.success
            ? `Le stage ${updated.gameVersion} a été reconstruit avec succès.`
            : `Le stage ${updated.gameVersion} est toujours en échec.`
        );
      } catch (error) {
        setBuildStatus(error.message || "Impossible de relancer ce stage.");
      }
    });

    actions.append(openStageButton, openLogButton, rebuildButton);
    card.append(title, meta, notes, issues, actions);
    buildResults.appendChild(card);
  });
}

function renderPatchResults(summary) {
  currentPatchSummary = summary;
  patchResults.innerHTML = "";

  if (!summary?.stageReports?.length) {
    patchSummary.textContent = "Aucun patch automatique appliqué.";
    return;
  }

  patchSummary.textContent = `${summary.patchedStageCount} stage(s) modifié(s) sur ${summary.stageCount}`;

  summary.stageReports.forEach((stageReport) => {
    const card = document.createElement("article");
    card.className = "phase-card";

    const title = document.createElement("h4");
    title.textContent = `${stageReport.loader} | ${stageReport.stagePath}`;

    const meta = document.createElement("p");
    meta.className = "phase-meta";
    meta.textContent = `Métadonnées détectées : ${stageReport.detectedMetadata.length} | désactivées : ${stageReport.disabledMetadata.length} | mappings : ${stageReport.mappingProfile?.mappingSystem || "-"} (${stageReport.mappingProfile?.namespace || "-"})`;

    const notes = document.createElement("p");
    notes.className = "phase-notes";
    notes.textContent = stageReport.actions.join(" | ");

    const details = document.createElement("ul");
    details.className = "report-list build-issues";
    [
      ...stageReport.detectedMetadata.map((item) => `Source détectée : ${item.relativePath}`),
      ...stageReport.disabledMetadata.map((item) => `Désactivée : ${item.relativePath}`),
      ...stageReport.mcreatorHints.map((item) => `MCreator : ${item}`),
      ...((stageReport.mappingProfile?.notes || []).map((item) => `Mappings : ${item}`)),
      ...((stageReport.sourceRemaps || []).map(
        (item) => `Remap source : ${item.relativePath} | ${item.applied.filter((label) => label.toLowerCase().includes("remapp")).join(", ")}`
      )),
      ...stageReport.sourcePatches.map((item) => `Source Java : ${item.relativePath} | ${item.applied.join(", ")}`),
      ...stageReport.sourceDiagnostics.map(
        (item) => `Diagnostic : ${item.relativePath} | ${item.label}${item.count ? ` (${item.count})` : ""} | ${item.suggestion}`
      )
    ]
      .slice(0, 8)
      .forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        details.appendChild(li);
      });

    card.append(title, meta, notes, details);
    patchResults.appendChild(card);
  });
}

function renderConversionResult(conversion) {
  currentConversion = conversion;
  conversionSteps.innerHTML = "";

  if (!conversion) {
    conversionSummary.textContent = "Aucune conversion automatique lancée.";
    return;
  }

  const primaryOutput = conversion.result?.primaryOutputPath || "Aucune sortie exploitable";
  const summaryBits = [
    `${conversion.summary?.patchedStageCount ?? 0} stage(s) patché(s)`,
    `${conversion.summary?.buildSuccessCount ?? 0} build(s) réussi(s)`,
    `${conversion.summary?.buildFailureCount ?? 0} échec(s)`,
    `${conversion.summary?.blockedFamilyDiagnostics ?? 0} blocage(s) de familles`
  ];
  conversionSummary.textContent = conversion.success
    ? `Conversion terminée. Sortie principale : ${primaryOutput} | ${summaryBits.join(" | ")} | ${conversion.summary?.recommendation || ""}`
    : `Conversion terminée partiellement. Sortie de travail : ${primaryOutput} | ${summaryBits.join(" | ")} | ${conversion.summary?.recommendation || ""}`;

  (conversion.steps || []).forEach((step) => {
    const li = document.createElement("li");
    li.textContent = `${step.success ? "OK" : "Info"} | ${step.name} | ${step.message}`;
    conversionSteps.appendChild(li);
  });
}

function applyInspectionDefaults(inspection) {
  if (!inspection?.detection) {
    return;
  }

  if (inspection.detection.modLoader) {
    const matchingLoader = Array.from(targetLoader.options).find((option) =>
      inspection.detection.modLoader.toLowerCase().includes(option.value.toLowerCase())
    );
    if (matchingLoader) {
      targetLoader.value = matchingLoader.value;
    }
  }

  if (inspection.detection.gameVersion) {
    const match = inspection.detection.gameVersion.match(/(\d+\.\d+(?:\.\d+)?)/);
    if (match && Array.from(targetGameVersion.options).some((option) => option.value === match[1])) {
      targetGameVersion.value = match[1];
    }
  }

  if (inspection.detection.java && Array.from(targetJavaVersion.options).some((option) => option.value === inspection.detection.java)) {
    targetJavaVersion.value = inspection.detection.java;
  }
}

function renderMigrationPlan(plan) {
  currentPlan = plan;
  migrationStrategy.textContent = `${plan.strategy} | Source : ${plan.source.loader} ${plan.source.gameVersion} -> Cible : ${plan.target.loader} ${plan.target.gameVersion}`;
  renderList(
    migrationKnowledge,
    [
      ...(plan.knowledge?.javaNotes || []),
      ...(plan.knowledge?.loaderNotes || []),
      ...(plan.knowledge?.breakpointNotes || []),
      ...(plan.knowledge?.generatorNotes || []),
      ...(plan.knowledge?.versionNotes || [])
    ]
  );
  renderChips(migrationSteps, plan.staircase);
  renderList(migrationRisks, plan.risks);
  renderList(migrationTasks, plan.manualTasks);
  renderPhases(plan.phases);
}

function renderPairs(container, pairs) {
  container.innerHTML = "";

  pairs.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;

    const dd = document.createElement("dd");
    dd.textContent = value || "-";

    container.append(dt, dd);
  });
}

function renderResult(result) {
  currentInspection = result;
  fields.modName.textContent = result.detection.modName || result.file.name;
  fields.modFile.textContent = result.file.path;
  fields.javaVersion.textContent = result.detection.java || "-";
  fields.javaDetails.textContent = result.detection.classMajor
    ? `Major class file ${result.detection.classMajor}${result.detection.buildJdk ? ` | Build JDK ${result.detection.buildJdk}` : ""}`
    : "Aucune classe Java lisible trouvée dans le fichier.";
  fields.loaderType.textContent = result.detection.modLoader || result.detection.loader || "-";
  const loaderBits = [
    result.detection.modLoaderVersion ? `Version loader : ${result.detection.modLoaderVersion}` : null,
    result.detection.modLoaderBuild ? `Build/API : ${result.detection.modLoaderBuild}` : null,
    result.detection.gameVersion ? `Version du jeu : ${result.detection.gameVersion}` : null,
    result.detection.isMcreator ? `Générateur : ${result.detection.generator || "MCreator"}` : null
  ].filter(Boolean);
  fields.gameVersion.textContent = loaderBits.join(" | ") || "Version du loader ou du jeu non détectée automatiquement.";
  fields.modVersion.textContent = result.detection.modVersion || "-";
  fields.manifestVersion.textContent =
    result.manifest.implementationVersion || result.manifest.implementationTitle || "Manifeste sans version exploitable.";

  renderPairs(fields.fileDetails, [
    ["Nom", result.file.name],
    ["Type", result.detection.artifactType],
    ["Extension", result.file.extension],
    ["Taille", formatBytes(result.file.sizeBytes)],
    ["Modifié le", formatDate(result.file.modifiedAt)],
    ["Entrées archive", String(result.stats.entryCount)],
    ["Classes", String(result.stats.classCount)]
  ]);

  renderPairs(fields.manifestDetails, [
    ["Mod loader", result.detection.modLoader],
    ["Version loader", result.detection.modLoaderVersion],
    ["Build/API loader", result.detection.modLoaderBuild],
    ["Générateur", result.detection.generator],
    ["Version générateur", result.detection.generatorVersion],
    ["Confiance détection", result.detection.generatorConfidence],
    ["Implementation", result.manifest.implementationTitle],
    ["Version manifeste", result.manifest.implementationVersion],
    ["Main-Class", result.manifest.mainClass],
    ["Dépendances", result.stats.dependencies.join(" | ") || "-"],
    ["Indices générateur", result.detection.generatorReasons.join(" | ") || "-"]
  ]);

  applyInspectionDefaults(result);
  setMigrationStatus("Choisis une cible puis génère un plan de migration.");
  setConversionStatus("Aucune conversion automatique lancée pour ce mod.");
  setWorkspaceStatus("Aucun workspace généré pour ce mod.");
  setDecompileStatus("Aucune décompilation préparée pour ce mod.");
  setPatchStatus("Aucun patch automatique appliqué pour ce mod.");
  setBuildStatus("Aucun build lancé pour ce mod.");
  patchSummary.textContent = "Aucun patch automatique appliqué.";
  patchResults.innerHTML = "";
  conversionSummary.textContent = "Aucune conversion automatique lancée.";
  conversionSteps.innerHTML = "";
  buildSummary.textContent = "Aucun build exécuté.";
  buildResults.innerHTML = "";
  renderWorkspaceScriptResult(null, null);
  currentPlan = null;
  currentWorkspace = null;
  currentBuildSummary = null;
  currentPatchSummary = null;
  currentConversion = null;
  currentWorkspaceScriptResult = null;
}

function updateWindowState(state) {
  maximizeButton.classList.toggle("is-maximized", Boolean(state?.isMaximized));
}

async function inspectFile(filePath) {
  try {
    setTag("Analyse en cours");
    setStatus("Analyse du fichier en cours...", "state-loading");
    const result = await window.modInspector.inspectModFile(filePath);
    renderResult(result);
    setTag("Analyse terminée");
    setStatus("Analyse terminée. Tu peux déposer un autre mod si tu veux comparer.", "state-success");
  } catch (error) {
    setTag("Erreur");
    setStatus(error.message || "Analyse impossible.", "state-error");
  }
}

async function initializeMigrationOptions() {
  const options = await window.modInspector.getMigrationOptions();

  options.loaders.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    targetLoader.appendChild(option);
  });

  options.gameVersions.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    targetGameVersion.appendChild(option);
  });

  options.javaVersions.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    targetJavaVersion.appendChild(option);
  });
}

minimizeButton.addEventListener("click", async () => {
  const state = await window.modInspector.windowAction("minimize");
  updateWindowState(state);
});

maximizeButton.addEventListener("click", async () => {
  const state = await window.modInspector.windowAction("toggle-maximize");
  updateWindowState(state);
});

closeButton.addEventListener("click", async () => {
  await window.modInspector.windowAction("close");
});

browseButton.addEventListener("click", async () => {
  const filePath = await window.modInspector.pickModFile();
  if (filePath) {
    inspectFile(filePath);
  }
});

convertButton.addEventListener("click", async () => {
  if (!currentInspection) {
    setConversionStatus("Analyse d'abord un mod avant de lancer une conversion.");
    return;
  }

  try {
    setTag("Conversion");
    setConversionStatus("Conversion automatique en cours...");
    const conversion = await window.modInspector.convertArtifact(currentInspection, {
      loader: targetLoader.value,
      gameVersion: targetGameVersion.value,
      java: targetJavaVersion.value
    });

    currentPlan = conversion.plan;
    currentWorkspace = conversion.workspace;
    currentBuildSummary = conversion.buildSummary;
    currentPatchSummary = conversion.patchSummary;
    renderMigrationPlan(conversion.plan);
    renderPatchResults(conversion.patchSummary);
    renderBuildResults(conversion.buildSummary);
    renderConversionResult(conversion);
    setWorkspaceStatus(`Workspace créé : ${conversion.workspace.workspaceRoot}`);
    setDecompileStatus(conversion.decompilation?.message || "Décompilation non lancée.");
    setPatchStatus(
      conversion.patchSummary?.patchedStageCount > 0
        ? `Patchs appliqués sur ${conversion.patchSummary.patchedStageCount} stage(s).`
        : "Aucun patch automatique nécessaire."
    );
    setBuildStatus(
      conversion.buildSummary?.failureCount === 0
        ? `Tous les stages ont été construits avec succès (${conversion.buildSummary.successCount}/${conversion.buildSummary.stageCount}).`
        : `${conversion.buildSummary.failureCount} stage(s) en échec sur ${conversion.buildSummary.stageCount}.`
    );
    setConversionStatus(
      conversion.success
        ? `Conversion terminée. Résultat principal : ${conversion.result.primaryOutputPath}`
        : `Conversion terminée partiellement. Consulte le workspace : ${conversion.workspace.workspaceRoot}`
    );
    setTag(conversion.success ? "Conversion terminée" : "Conversion partielle");
  } catch (error) {
    setTag("Erreur");
    setConversionStatus(error.message || "Impossible de lancer la conversion automatique.");
  }
});

openWorkspaceButton.addEventListener("click", async () => {
  if (!currentWorkspace?.workspaceRoot) {
    setWorkspaceStatus("Crée d'abord un workspace avant de l'ouvrir.");
    return;
  }

  const result = await window.modInspector.openPath(currentWorkspace.workspaceRoot);
  if (!result?.success) {
    setWorkspaceStatus(result?.error || "Impossible d'ouvrir le workspace.");
  }
});

openOutputButton.addEventListener("click", async () => {
  const targetPath =
    currentConversion?.result?.primaryOutputPath ||
    currentConversion?.result?.primaryOutputDirectoryPath ||
    currentWorkspace?.workspaceRoot ||
    null;
  if (!targetPath) {
    setConversionStatus("Aucune sortie disponible à ouvrir pour l'instant.");
    return;
  }

  const result = await window.modInspector.openPath(targetPath);
  if (!result?.success) {
    setConversionStatus(result?.error || "Impossible d'ouvrir la sortie de conversion.");
  }
});

openWorkspaceGuideButton.addEventListener("click", async () => {
  const guidePath = getWorkspaceGuidePath();
  if (!guidePath) {
    setWorkspaceStatus("Crée d'abord un workspace avant d'ouvrir le guide.");
    return;
  }

  const result = await window.modInspector.openPath(guidePath);
  if (!result?.success) {
    setWorkspaceStatus(result?.error || "Impossible d'ouvrir le guide du workspace.");
  }
});

initWorkspaceButton.addEventListener("click", async () => {
  const scriptPath = getWorkspaceScriptPath("init-workspace.ps1");
  if (!scriptPath) {
    setWorkspaceStatus("Crée d'abord un workspace avant de lancer son initialisation.");
    return;
  }

  setWorkspaceStatus("Initialisation globale du workspace en cours...");
  const result = await window.modInspector.runWorkspaceScript(scriptPath);
  setWorkspaceStatus(
    result.success
      ? "Initialisation du workspace terminée."
      : `Initialisation du workspace incomplète. Code: ${result.exitCode ?? "-"}`
  );
  renderWorkspaceScriptResult("Init workspace", result);
});

buildWorkspaceButton.addEventListener("click", async () => {
  const scriptPath = getWorkspaceScriptPath("build-workspace.ps1");
  if (!scriptPath) {
    setWorkspaceStatus("Crée d'abord un workspace avant de lancer le build global.");
    return;
  }

  setBuildStatus("Build global du workspace en cours...");
  const result = await window.modInspector.runWorkspaceScript(scriptPath);
  setBuildStatus(
    result.success
      ? "Build global du workspace terminé."
      : `Build global du workspace inachevé. Code: ${result.exitCode ?? "-"}`
  );
  renderWorkspaceScriptResult("Build workspace", result);
});

planButton.addEventListener("click", async () => {
  if (!currentInspection) {
    setMigrationStatus("Analyse d'abord un mod avant de générer un plan.");
    return;
  }

  try {
    setMigrationStatus("Génération du plan de migration en cours...");
    const plan = await window.modInspector.planMigration(currentInspection, {
      loader: targetLoader.value,
      gameVersion: targetGameVersion.value,
      java: targetJavaVersion.value
    });

    renderMigrationPlan(plan);
    setMigrationStatus("Plan de migration généré. Utilise-le comme feuille de route de portage.");
  } catch (error) {
    setMigrationStatus(error.message || "Impossible de générer le plan de migration.");
  }
});

workspaceButton.addEventListener("click", async () => {
  if (!currentInspection) {
    setWorkspaceStatus("Analyse d'abord un mod avant de créer un workspace.");
    return;
  }

  if (!currentPlan) {
    setWorkspaceStatus("Génère d'abord un plan de migration avant de créer le workspace.");
    return;
  }

  try {
    setWorkspaceStatus("Création du workspace de migration en cours...");
    const workspace = await window.modInspector.createMigrationWorkspace(currentInspection, currentPlan);
    currentWorkspace = workspace;
    setWorkspaceStatus(
      `Workspace créé : ${workspace.workspaceRoot} | ${workspace.stageCount} stage(s) généré(s)${
        workspace.extracted ? " | fichiers extraits inclus" : ""
      }`
    );
    setDecompileStatus("Workspace prêt. Tu peux maintenant préparer la décompilation.");
    setPatchStatus("Workspace prêt. Tu peux appliquer les patchs automatiques quand tu veux.");
    setBuildStatus("Workspace prêt. Tu peux lancer les builds quand tu veux.");
  } catch (error) {
    setWorkspaceStatus(error.message || "Impossible de créer le workspace de migration.");
  }
});

decompileButton.addEventListener("click", async () => {
  if (!currentWorkspace) {
    setDecompileStatus("Crée d'abord un workspace avant de préparer la décompilation.");
    return;
  }

  try {
    setDecompileStatus("Préparation de la décompilation en cours...");
    const result = await window.modInspector.prepareDecompilation(currentWorkspace);
    currentWorkspace = { ...currentWorkspace, decompiledPath: result.decompiledPath, decompileScriptPath: result.scriptPath };
    setDecompileStatus(
      result.decompiled
        ? `Décompilation prête : ${result.decompiledPath} | injecté dans ${result.injected.stagePath}`
        : `${result.message} Script : ${result.scriptPath}`
    );
    setPatchStatus("Décompilation prête. Tu peux maintenant appliquer les patchs automatiques.");
    setBuildStatus("Décompilation préparée. Tu peux maintenant lancer les builds des stages.");
  } catch (error) {
    setDecompileStatus(error.message || "Impossible de préparer la décompilation.");
  }
});

patchButton.addEventListener("click", async () => {
  if (!currentWorkspace) {
    setPatchStatus("Crée d'abord un workspace avant d'appliquer les patchs.");
    return;
  }

  try {
    setPatchStatus("Application des patchs automatiques en cours...");
    const summary = await window.modInspector.applyAutomaticPatches(currentWorkspace);
    currentWorkspace = { ...currentWorkspace, patchSummary: summary };
    renderPatchResults(summary);
    setPatchStatus(
      summary.patchedStageCount > 0
        ? `Patchs appliqués sur ${summary.patchedStageCount} stage(s).`
        : "Aucun patch nécessaire n'a été trouvé."
    );
  } catch (error) {
    setPatchStatus(error.message || "Impossible d'appliquer les patchs automatiques.");
  }
});

buildStagesButton.addEventListener("click", async () => {
  if (!currentWorkspace) {
    setBuildStatus("Crée d'abord un workspace avant de lancer les builds.");
    return;
  }

  try {
    setBuildStatus("Build des stages en cours...");
    const summary = await window.modInspector.runWorkspaceBuilds(currentWorkspace);
    currentWorkspace = { ...currentWorkspace, buildSummary: summary };
    renderBuildResults(summary);
    setBuildStatus(
      summary.failureCount === 0
        ? `Tous les stages ont été construits avec succès (${summary.successCount}/${summary.stageCount}).`
        : `${summary.failureCount} stage(s) en échec sur ${summary.stageCount}. Consulte le résumé ci-dessous.`
    );
  } catch (error) {
    setBuildStatus(error.message || "Impossible de lancer les builds des stages.");
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });
});

["dragleave", "dragend"].forEach((eventName) => {
  dropZone.addEventListener(eventName, () => {
    dropZone.classList.remove("is-dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");

  const [file] = event.dataTransfer.files;
  if (!file) {
    return;
  }

  inspectFile(file.path);
});

window.modInspector.windowAction("get-state").then(updateWindowState).catch(() => {});
initializeMigrationOptions().catch(() => {
  setMigrationStatus("Impossible de charger les options de migration.");
});
