const LOADER_LABELS = {
  fabric: "Fabric",
  forge: "Forge",
  quilt: "Quilt",
  liteloader: "LiteLoader",
  bukkit: "Bukkit / Spigot / Paper"
};
const { buildKnowledgeContext } = require("./knowledge-base");
const { compareVersions } = require("./version-rules");

const LOADER_TRACKS = {
  fabric: ["1.14.4", "1.16.5", "1.18.2", "1.20.1", "1.21.1"],
  forge: ["1.7.10", "1.12.2", "1.16.5", "1.18.2", "1.20.1"],
  quilt: ["1.18.2", "1.19.4", "1.20.1", "1.21.1"],
  liteloader: ["1.7.10", "1.8.9", "1.12.2"],
  bukkit: ["1.8.8", "1.12.2", "1.16.5", "1.20.1", "1.21.1"]
};

const JAVA_BY_GAME = [
  { min: "1.21", java: "Java 21" },
  { min: "1.18", java: "Java 17" },
  { min: "1.17", java: "Java 16" },
  { min: "1.13", java: "Java 8" },
  { min: "0.0", java: "Java 8" }
];

function normalizeLoader(loader) {
  const value = String(loader || "").toLowerCase();
  if (value.includes("fabric")) return "fabric";
  if (value.includes("quilt")) return "quilt";
  if (value.includes("liteloader")) return "liteloader";
  if (value.includes("forge")) return "forge";
  if (value.includes("bukkit") || value.includes("spigot") || value.includes("paper")) return "bukkit";
  return "unknown";
}

function parseGameVersion(input) {
  if (!input) {
    return null;
  }

  const match = String(input).match(/(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

function estimateJavaForGame(gameVersion) {
  if (!gameVersion) {
    return null;
  }

  const normalized = parseGameVersion(gameVersion);
  if (!normalized) {
    return null;
  }

  const entry = JAVA_BY_GAME.find((candidate) => compareVersions(normalized, candidate.min) >= 0);
  return entry ? entry.java : null;
}

function buildTrackPath(trackVersions, fromVersion, toVersion) {
  if (!trackVersions?.length || !fromVersion || !toVersion) {
    return [];
  }

  const start = parseGameVersion(fromVersion);
  const target = parseGameVersion(toVersion);
  if (!start || !target) {
    return [];
  }

  const ascending = compareVersions(start, target) < 0;
  const sorted = [...trackVersions].sort(compareVersions);
  const checkpoints = ascending ? sorted : sorted.reverse();
  const between = checkpoints.filter((version) => {
    if (ascending) {
      return compareVersions(version, start) > 0 && compareVersions(version, target) < 0;
    }
    return compareVersions(version, start) < 0 && compareVersions(version, target) > 0;
  });

  return [start, ...between, target];
}

function buildRiskSummary({ sourceLoader, targetLoader, sourceGame, targetGame, sourceJava, targetJava }) {
  const risks = [];

  if (sourceLoader !== targetLoader) {
    risks.push("Changement de mod loader : une réécriture partielle des APIs et des points d'entrée sera nécessaire.");
  }

  if (sourceGame && targetGame && Math.abs(compareVersions(sourceGame, targetGame)) >= 2) {
    risks.push("Écart important entre versions du jeu : le portage doit passer par plusieurs étapes intermédiaires.");
  }

  if (sourceJava && targetJava && sourceJava !== targetJava) {
    risks.push("Version Java différente : il faudra recompiler et adapter les APIs Java utilisées.");
  }

  if (!risks.length) {
    risks.push("Portage probablement modéré : surtout validation des mappings, registres et événements.");
  }

  return risks;
}

function buildManualTasks(sourceLoader, targetLoader, inspection) {
  const common = [
    "Vérifier les registres d'items, blocs, entités et menus.",
    "Contrôler les événements, hooks et points d'initialisation du mod.",
    "Tester le rendu, les assets et le chargement des ressources.",
    "Revalider la compilation et le lancement dans un environnement de dev propre."
  ];

  if (inspection?.detection?.isMcreator) {
    common.unshift(
      "Identifier les éléments générés par MCreator (procedures, elements, ModElements) avant de modifier le code."
    );
    common.unshift("Vérifier si une partie du mod peut être régénérée proprement depuis le projet MCreator d'origine.");
  }

  if (sourceLoader === targetLoader) {
    return common;
  }

  return [
    "Migrer les points d'entrée du mod vers le loader cible.",
    "Adapter les API loader-spécifiques : événements, registres, networking, data generation.",
    "Réécrire les accès aux mappings si les noms changent fortement.",
    ...common
  ];
}

function planMigration(inspection, target) {
  if (!inspection?.detection) {
    throw new Error("Aucune inspection valide fournie pour planifier la migration.");
  }

  const sourceLoader = normalizeLoader(inspection.detection.loader);
  const targetLoader = normalizeLoader(target.loader || inspection.detection.loader);
  const sourceGame = parseGameVersion(inspection.detection.gameVersion);
  const targetGame = parseGameVersion(target.gameVersion);
  const sourceJava = inspection.detection.java || null;
  const targetJava = target.java || estimateJavaForGame(targetGame) || sourceJava;
  const isMcreator = Boolean(inspection.detection.isMcreator);

  if (!targetGame) {
    throw new Error("Choisis une version du jeu cible pour générer un plan de migration.");
  }

  const sameLoaderTrack = sourceLoader !== "unknown" && sourceLoader === targetLoader;
  const sourceTrack = LOADER_TRACKS[sourceLoader] || [];
  const targetTrack = LOADER_TRACKS[targetLoader] || [];
  const staircase = sameLoaderTrack
    ? buildTrackPath(sourceTrack, sourceGame || targetGame, targetGame)
    : [
        sourceGame || "source inconnue",
        ...(sourceTrack.length && sourceGame ? [sourceTrack[sourceTrack.length - 1]] : []),
        ...(targetTrack.length ? [targetTrack[0]] : []),
        targetGame
      ].filter((value, index, array) => value && array.indexOf(value) === index);

  const phases = staircase.map((gameVersion, index) => {
    const previous = staircase[index - 1] || sourceGame || gameVersion;
    const javaTarget = estimateJavaForGame(gameVersion) || targetJava;
    const phaseLoader = index === staircase.length - 1 ? targetLoader : sameLoaderTrack ? sourceLoader : index === 0 ? sourceLoader : targetLoader;

    return {
      title: index === 0 ? `Préparer la base ${previous}` : `Migrer ${previous} -> ${gameVersion}`,
      previousGameVersion: previous,
      gameVersion,
      java: javaTarget,
      loader: LOADER_LABELS[phaseLoader] || inspection.detection.loader,
      notes:
        index === 0
          ? "Décompiler, remapper et remettre le projet en état compilable avant de changer de palier."
          : "Ajuster mappings, événements, registres, rendu et dépendances avant de passer au palier suivant."
    };
  });

  return {
    source: {
      loader: inspection.detection.loader,
      gameVersion: sourceGame || inspection.detection.gameVersion || "Inconnue",
      java: sourceJava || "Inconnue"
    },
    target: {
      loader: LOADER_LABELS[targetLoader] || target.loader || inspection.detection.loader,
      gameVersion: targetGame,
      java: targetJava || "À déterminer"
    },
    strategy: sameLoaderTrack ? "Migration en escalier sur le même loader" : "Migration hybride avec changement de loader",
    staircase,
    knowledge: buildKnowledgeContext({
      targetLoader: LOADER_LABELS[targetLoader] || target.loader || inspection.detection.loader,
      targetJava: targetJava || "À déterminer",
      staircase,
      generator: isMcreator ? "MCreator" : null,
      targetGameVersion: targetGame
    }),
    risks: buildRiskSummary({
      sourceLoader,
      targetLoader,
      sourceGame,
      targetGame,
      sourceJava,
      targetJava
    }).concat(
      isMcreator
        ? ["Mod généré avec MCreator : la structure auto-générée peut compliquer les gros portages de version."]
        : []
    ),
    manualTasks: buildManualTasks(sourceLoader, targetLoader, inspection),
    phases
  };
}

module.exports = {
  LOADER_LABELS,
  LOADER_TRACKS,
  estimateJavaForGame,
  planMigration
};
