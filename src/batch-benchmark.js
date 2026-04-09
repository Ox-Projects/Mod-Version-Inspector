const fs = require("fs");
const path = require("path");
const { inspectArtifact } = require("./analyzer");
const { convertArtifact } = require("./conversion-orchestrator");

const SUPPORTED_EXTENSIONS = new Set([".jar", ".zip", ".class", ".litemod", ".liteloadermod"]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

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

function listSupportedArtifacts(rootDir, maxMods = 100) {
  return walkFiles(rootDir)
    .filter((filePath) => SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, maxMods);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, value, "utf8");
}

function buildMarkdownReport(summary) {
  const lines = [
    "# Rapport de benchmark",
    "",
    `Dossier source : ${summary.folderPath}`,
    `Artefacts analysés : ${summary.totals.artifactCount}`,
    `Inspections réussies : ${summary.totals.inspectionSuccessCount}`,
    `Conversions réussies : ${summary.totals.conversionSuccessCount}`,
    `Conversions partielles : ${summary.totals.partialConversionCount}`,
    `Échecs : ${summary.totals.failureCount}`,
    ""
  ];

  lines.push("## Par loader");
  Object.entries(summary.byLoader)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([loader, count]) => {
      lines.push(`- ${loader} : ${count}`);
    });
  lines.push("");

  lines.push("## Cas récents");
  summary.results.slice(0, 25).forEach((result) => {
    lines.push(
      `- ${result.fileName} | ${result.status} | ${result.loader || "-"} | ${result.gameVersion || "-"} | ${result.outputPath || result.error || "-"}`
    );
  });

  return lines.join("\n");
}

async function runBenchmark({
  folderPath,
  target,
  baseDir,
  maxMods = 100,
  dependencies = {
    inspectArtifact,
    convertArtifact
  }
}) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    throw new Error("Choisis un dossier valide pour lancer le benchmark.");
  }

  const artifacts = listSupportedArtifacts(folderPath, maxMods);
  if (!artifacts.length) {
    throw new Error("Aucun artefact compatible trouvé dans ce dossier.");
  }

  const benchmarkRoot = path.join(baseDir, `benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  ensureDir(benchmarkRoot);
  const results = [];
  const byLoader = {};

  for (const artifactPath of artifacts) {
    const fileName = path.basename(artifactPath);

    try {
      const inspection = await dependencies.inspectArtifact(artifactPath);
      const loader = inspection?.detection?.modLoader || inspection?.detection?.loader || "Inconnu";
      byLoader[loader] = (byLoader[loader] || 0) + 1;

      const conversion = await dependencies.convertArtifact({
        inspection,
        target,
        baseDir: path.join(benchmarkRoot, "migrations")
      });

      results.push({
        fileName,
        artifactPath,
        loader,
        gameVersion: inspection?.detection?.gameVersion || null,
        javaVersion: inspection?.detection?.java || null,
        status: conversion.success ? "success" : "partial",
        outputPath: conversion?.result?.primaryOutputPath || null,
        outputDirectoryPath: conversion?.result?.primaryOutputDirectoryPath || null,
        patchedStages: conversion?.summary?.patchedStageCount || 0,
        buildFailures: conversion?.summary?.buildFailureCount || 0,
        blockedFamilies: conversion?.summary?.blockedFamilyDiagnostics || 0,
        recommendation: conversion?.summary?.recommendation || null
      });
    } catch (error) {
      results.push({
        fileName,
        artifactPath,
        status: "failure",
        error: error.message || "Erreur inconnue"
      });
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    folderPath,
    target,
    totals: {
      artifactCount: artifacts.length,
      inspectionSuccessCount: results.filter((item) => item.status !== "failure" || item.loader).length,
      conversionSuccessCount: results.filter((item) => item.status === "success").length,
      partialConversionCount: results.filter((item) => item.status === "partial").length,
      failureCount: results.filter((item) => item.status === "failure").length
    },
    byLoader,
    results
  };

  const reportsDir = path.join(benchmarkRoot, "reports");
  ensureDir(reportsDir);
  writeJson(path.join(reportsDir, "benchmark-report.json"), summary);
  writeText(path.join(reportsDir, "benchmark-report.md"), buildMarkdownReport(summary));

  return {
    benchmarkRoot,
    reportsPath: reportsDir,
    reportPath: path.join(reportsDir, "benchmark-report.json"),
    markdownReportPath: path.join(reportsDir, "benchmark-report.md"),
    summary
  };
}

module.exports = {
  runBenchmark
};
