const fs = require("fs");
const path = require("path");
const { planMigration } = require("./migration-planner");
const { createMigrationWorkspace } = require("./workspace-generator");
const { prepareDecompilation } = require("./decompiler-manager");
const { applyAutomaticPatches } = require("./auto-patcher");
const { runWorkspaceBuilds } = require("./build-diagnostics");

function walkFiles(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return [];
  }

  const stack = [rootDir];
  const files = [];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        files.push(fullPath);
      }
    });
  }

  return files;
}

function findStageArtifacts(stagePath) {
  const libsDir = path.join(stagePath, "build", "libs");
  return walkFiles(libsDir)
    .filter((filePath) => filePath.toLowerCase().endsWith(".jar"))
    .filter((filePath) => !/(?:-sources|-javadoc)\.jar$/i.test(filePath));
}

function buildFinalResult(workspace, buildSummary) {
  const stages = workspace?.stages || [];
  const stageBuilds = buildSummary?.stageReports || [];
  const artifactCandidates = stages.flatMap((stage) => {
    const stageBuild = stageBuilds.find((report) => report.stagePath === stage.path) || null;
    return findStageArtifacts(stage.path).map((artifactPath) => ({
      stagePath: stage.path,
      artifactPath,
      success: Boolean(stageBuild?.success)
    }));
  });

  const preferredArtifact =
    artifactCandidates.find((candidate) => candidate.success) ||
    artifactCandidates[0] ||
    null;
  const finalStage = stages[stages.length - 1] || null;
  const finalStageBuild = stageBuilds.find((report) => report.stagePath === finalStage?.path) || null;
  const finalStageArtifacts = finalStage ? findStageArtifacts(finalStage.path) : [];

  return {
    finalStagePath: finalStage?.path || null,
    finalStageSucceeded: Boolean(finalStageBuild?.success),
    outputArtifacts: artifactCandidates.map((candidate) => candidate.artifactPath),
    finalStageArtifacts,
    primaryOutputPath: preferredArtifact?.artifactPath || finalStage?.path || workspace?.workspaceRoot || null,
    primaryOutputStagePath: preferredArtifact?.stagePath || finalStage?.path || null,
    primaryOutputDirectoryPath: preferredArtifact ? path.dirname(preferredArtifact.artifactPath) : finalStage?.path || workspace?.workspaceRoot || null
  };
}

function summarizeConversion({ patchSummary, buildSummary, result }) {
  const blockedFamilyDiagnostics = (patchSummary?.stageReports || []).flatMap((report) =>
    (report.sourceDiagnostics || []).filter((item) => String(item.label || "").includes("Famille de remap"))
  ).length;
  const buildFailureCount = buildSummary?.failureCount || 0;
  const outputArtifactCount = result?.outputArtifacts?.length || 0;

  let recommendation = "Le résultat principal est prêt à être vérifié.";
  if (buildFailureCount > 0 && outputArtifactCount === 0) {
    recommendation = "Consulte les erreurs de build et les diagnostics de patch avant de retenter la conversion.";
  } else if (buildFailureCount > 0 && outputArtifactCount > 0) {
    recommendation = "Un artefact intermédiaire existe, mais certains stages restent à corriger pour aller jusqu'au palier final.";
  } else if (blockedFamilyDiagnostics > 0) {
    recommendation = "Le build est exploitable, mais certains remaps ont été bloqués par le profil du stage.";
  }

  return {
    patchedStageCount: patchSummary?.patchedStageCount || 0,
    buildSuccessCount: buildSummary?.successCount || 0,
    buildFailureCount,
    outputArtifactCount,
    blockedFamilyDiagnostics,
    recommendation
  };
}

async function convertArtifact({
  inspection,
  target,
  baseDir,
  dependencies = {
    planMigration,
    createMigrationWorkspace,
    prepareDecompilation,
    applyAutomaticPatches,
    runWorkspaceBuilds
  }
}) {
  if (!inspection?.detection) {
    throw new Error("Aucune inspection valide fournie pour lancer la conversion.");
  }

  const steps = [];

  const plan = dependencies.planMigration(inspection, target);
  steps.push({
    name: "plan",
    success: true,
    message: "Plan de migration généré."
  });

  const workspace = dependencies.createMigrationWorkspace({
    inspection,
    plan,
    baseDir
  });
  steps.push({
    name: "workspace",
    success: true,
    message: `Workspace créé dans ${workspace.workspaceRoot}.`
  });

  let decompilation = null;
  try {
    decompilation = await dependencies.prepareDecompilation(workspace);
    steps.push({
      name: "decompilation",
      success: Boolean(decompilation.decompiled),
      message: decompilation.message
    });
  } catch (error) {
    decompilation = {
      decompiled: false,
      message: error.message || "Décompilation impossible."
    };
    steps.push({
      name: "decompilation",
      success: false,
      message: decompilation.message
    });
  }

  const patchSummary = dependencies.applyAutomaticPatches(workspace);
  steps.push({
    name: "patches",
    success: true,
    message:
      patchSummary.patchedStageCount > 0
        ? `${patchSummary.patchedStageCount} stage(s) patché(s).`
        : "Aucun patch automatique nécessaire."
  });

  const buildSummary = dependencies.runWorkspaceBuilds(workspace);
  steps.push({
    name: "build",
    success: buildSummary.failureCount === 0,
    message:
      buildSummary.failureCount === 0
        ? "Tous les stages ont compilé."
        : `${buildSummary.failureCount} stage(s) en échec.`
  });

  const result = buildFinalResult(workspace, buildSummary);

  return {
    startedAt: steps[0] ? new Date().toISOString() : null,
    inspection,
    target,
    plan,
    workspace,
    decompilation,
    patchSummary,
    buildSummary,
    result,
    summary: summarizeConversion({ patchSummary, buildSummary, result }),
    success: Boolean(result.finalStageSucceeded && result.primaryOutputPath),
    steps
  };
}

module.exports = {
  convertArtifact
};
