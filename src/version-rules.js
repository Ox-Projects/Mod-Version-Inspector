function compareVersions(left, right) {
  const leftParts = String(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = String(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

const STAGE_RULES = [
  {
    loader: "forge",
    minTarget: "1.16.5",
    diagnostics: [
      {
        pattern: /\bIBlockState\b/g,
        label: "État de bloc legacy",
        suggestion: "Migrer IBlockState vers BlockState pour Forge 1.13+."
      },
      {
        pattern: /\bTileEntity\b/g,
        label: "TileEntity legacy",
        suggestion: "Préparer la transition TileEntity -> BlockEntity sur les branches modernes."
      },
      {
        pattern: /@Mod\.EventHandler/g,
        label: "Lifecycle annotation legacy",
        suggestion: "Supprimer @Mod.EventHandler et revoir le cycle de vie Forge moderne."
      }
    ],
    notes: [
      "Le saut vers Forge 1.16.5 implique souvent DeferredRegister, BlockState et une refonte des registries."
    ]
  },
  {
    loader: "forge",
    minTarget: "1.18.2",
    maxTarget: "1.18.2",
    diagnostics: [
      {
        pattern: /\bWorld\b/g,
        label: "Monde legacy",
        suggestion: "Vérifier les usages de World/Level et les APIs serveur/client à partir de 1.18."
      },
      {
        pattern: /\bTileEntity\b/g,
        label: "TileEntity obsolète",
        suggestion: "Remplacer TileEntity par BlockEntity sur Forge 1.18+."
      }
    ],
    notes: [
      "Le passage à 1.18.2 amène Java 17 et plusieurs changements de monde/rendu."
    ]
  },
  {
    loader: "fabric",
    minTarget: "1.20.1",
    maxTarget: "1.21.1",
    diagnostics: [
      {
        pattern: /\bRegistry\.register\b/g,
        label: "Enregistrement Fabric direct",
        suggestion: "Vérifier si le palier cible demande Registries, RegistryKey ou des helpers plus récents."
      },
      {
        pattern: /\bIdentifier\b/g,
        label: "Identifier Minecraft",
        suggestion: "Valider les imports Identifier et les helpers de registre selon la branche Yarn visée."
      }
    ],
    notes: [
      "Les paliers Fabric récents demandent de surveiller Yarn, Loom et l'évolution des registries."
    ]
  },
  {
    loader: "forge",
    minTarget: "1.20.1",
    diagnostics: [
      {
        pattern: /\bLevel\b/g,
        label: "API monde moderne Forge",
        suggestion: "Vérifier les usages de Level, ClientLevel et ServerLevel sur les branches 1.20+."
      }
    ],
    notes: [
      "Sur Forge 1.20+, vérifier DeferredRegister, les mappings officiels et les APIs Level/Registry les plus récentes."
    ]
  }
];

function findMatchingRules({ loader, targetGameVersion }) {
  return STAGE_RULES.filter((rule) => {
    if (rule.loader !== loader) {
      return false;
    }

    if (rule.minTarget && compareVersions(targetGameVersion, rule.minTarget) < 0) {
      return false;
    }

    if (rule.maxTarget && compareVersions(targetGameVersion, rule.maxTarget) > 0) {
      return false;
    }

    return true;
  });
}

function collectVersionDiagnostics({ loader, targetGameVersion, content, relativePath }) {
  return findMatchingRules({ loader, targetGameVersion }).flatMap((rule) =>
    rule.diagnostics
      .map((diagnostic) => {
        const matches = [...content.matchAll(diagnostic.pattern)];
        if (!matches.length) {
          return null;
        }

        return {
          relativePath,
          label: diagnostic.label,
          count: matches.length,
          suggestion: diagnostic.suggestion
        };
      })
      .filter(Boolean)
  );
}

function getVersionRuleNotes({ loader, targetGameVersion }) {
  return findMatchingRules({ loader, targetGameVersion }).flatMap((rule) => rule.notes || []);
}

module.exports = {
  compareVersions,
  collectVersionDiagnostics,
  getVersionRuleNotes
};
