const fs = require("fs");
const path = require("path");
const { collectVersionDiagnostics } = require("./version-rules");
const { applySourceRemap, collectFamilyDiagnostics } = require("./source-remapper");

const METADATA_FILE_NAMES = [
  "fabric.mod.json",
  "quilt.mod.json",
  "META-INF/mods.toml",
  "mcmod.info",
  "plugin.yml",
  "paper-plugin.yml",
  "litemod.json"
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, value, "utf8");
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
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

function normalizeLoader(loader) {
  const value = String(loader || "").toLowerCase();
  if (value.includes("fabric")) return "fabric";
  if (value.includes("quilt")) return "quilt";
  if (value.includes("liteloader")) return "liteloader";
  if (value.includes("forge")) return "forge";
  if (value.includes("bukkit") || value.includes("spigot") || value.includes("paper")) return "bukkit";
  return "generic";
}

function collectMetadataFiles(stagePath) {
  const roots = [
    path.join(stagePath, "input", "source-extracted"),
    path.join(stagePath, "src", "imported", "resources")
  ];

  return roots.flatMap((root) =>
    walkFiles(root)
      .map((filePath) => ({
        path: filePath,
        relativePath: path.relative(root, filePath).replace(/\\/g, "/"),
        root
      }))
      .filter((file) => METADATA_FILE_NAMES.some((name) => file.relativePath.endsWith(name)))
  );
}

function targetMetadataRelativePath(loader) {
  switch (loader) {
    case "forge":
      return "META-INF/mods.toml";
    case "fabric":
      return "fabric.mod.json";
    case "quilt":
      return "quilt.mod.json";
    case "bukkit":
      return "plugin.yml";
    default:
      return null;
  }
}

function disableConflictingMetadata(stagePath, targetRelativePath) {
  const importedResourcesDir = path.join(stagePath, "src", "imported", "resources");
  const disabledRoot = path.join(stagePath, "notes", "disabled-metadata");
  const importedFiles = walkFiles(importedResourcesDir);
  const disabled = [];

  importedFiles.forEach((filePath) => {
    const relativePath = path.relative(importedResourcesDir, filePath).replace(/\\/g, "/");
    if (!METADATA_FILE_NAMES.some((name) => relativePath.endsWith(name))) {
      return;
    }

    if (targetRelativePath && relativePath === targetRelativePath) {
      return;
    }

    const targetPath = path.join(disabledRoot, relativePath);
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(filePath, targetPath);
    fs.rmSync(filePath, { force: true });
    disabled.push({
      from: filePath,
      to: targetPath,
      relativePath
    });
  });

  return disabled;
}

function ensureTargetMetadata(stagePath, loader) {
  const previewPath = path.join(stagePath, "notes", "metadata-preview.json");
  if (!fs.existsSync(previewPath)) {
    return null;
  }

  const preview = readJson(previewPath);
  const relativePath = targetMetadataRelativePath(loader);
  if (!relativePath || !preview.files?.includes(relativePath)) {
    return null;
  }

  const targetPath = path.join(stagePath, "src", "main", "resources", ...relativePath.split("/"));
  return {
    relativePath,
    path: targetPath,
    exists: fs.existsSync(targetPath),
    modId: preview.modId || null
  };
}

function collectMcreatorHints(stagePath) {
  const importedJavaDir = path.join(stagePath, "src", "imported", "java");
  const javaFiles = walkFiles(importedJavaDir).map((filePath) => path.relative(importedJavaDir, filePath).replace(/\\/g, "/"));
  const findings = [];

  if (javaFiles.some((entry) => /ModElements\.java$/i.test(entry))) {
    findings.push("Classe ModElements détectée dans les sources importées.");
  }

  if (javaFiles.some((entry) => /\/procedures\//i.test(entry))) {
    findings.push("Dossier procedures détecté dans les sources importées.");
  }

  if (javaFiles.some((entry) => /\/elements\//i.test(entry))) {
    findings.push("Dossier elements détecté dans les sources importées.");
  }

  return findings;
}

function collectJavaFiles(stagePath) {
  const importedJavaDir = path.join(stagePath, "src", "imported", "java");
  return walkFiles(importedJavaDir).filter((filePath) => filePath.toLowerCase().endsWith(".java"));
}

const LEGACY_SOURCE_PATTERNS = [
  {
    loader: "forge",
    pattern: /\bFMLPreInitializationEvent\b/g,
    label: "Cycle de vie Forge legacy",
    suggestion: "Remplacer FMLPreInitializationEvent par une initialisation moderne via FMLCommonSetupEvent ou EventBusSubscriber."
  },
  {
    loader: "forge",
    pattern: /\bFMLInitializationEvent\b/g,
    label: "Cycle de vie Forge legacy",
    suggestion: "Adapter FMLInitializationEvent vers les phases modernes Forge."
  },
  {
    loader: "forge",
    pattern: /\bGameRegistry\b/g,
    label: "Registry legacy Forge",
    suggestion: "Revoir les enregistrements via DeferredRegister ou l'EventBus Forge moderne."
  },
  {
    loader: "forge",
    pattern: /\b@SidedProxy\b/g,
    label: "Proxy legacy Forge",
    suggestion: "Remplacer @SidedProxy par DistExecutor, EventBusSubscriber ou une structure client/serveur moderne."
  },
  {
    loader: "forge",
    pattern: /\bRegistryEvent\.Register\b/g,
    label: "Registry event intermédiaire Forge",
    suggestion: "Évaluer un passage vers DeferredRegister si la version cible le permet."
  },
  {
    loader: "fabric",
    pattern: /\bRegistry\.register\b/g,
    label: "Enregistrement Fabric direct",
    suggestion: "Vérifier les APIs Registry selon la version cible et l'usage éventuel de RegistryKey/Registries."
  },
  {
    loader: "fabric",
    pattern: /\bnew Identifier\s*\(/g,
    label: "Identifiant Fabric/Minecraft",
    suggestion: "Vérifier la compatibilité des imports Identifier et des registres ciblés."
  },
  {
    loader: "generic",
    pattern: /\bTODO\b/g,
    label: "TODO existant",
    suggestion: "Un TODO existe déjà dans le code importé; il mérite une vérification pendant le portage."
  }
];

function applyTextReplacement(content, searchValue, replaceValue) {
  if (!content.includes(searchValue)) {
    return {
      nextContent: content,
      changed: false
    };
  }

  return {
    nextContent: content.split(searchValue).join(replaceValue),
    changed: true
  };
}

function applyRegexReplacement(content, pattern, replaceValue) {
  const nextContent = content.replace(pattern, replaceValue);
  return {
    nextContent,
    changed: nextContent !== content
  };
}

function applyForgeSourceTransforms(filePath, content) {
  let nextContent = content;
  const applied = [];
  const replacements = [
    {
      kind: "text",
      from: "cpw.mods.fml.common.Mod;",
      to: "net.minecraftforge.fml.common.Mod;",
      label: "Import Mod legacy Forge mis à jour"
    },
    {
      kind: "text",
      from: "cpw.mods.fml.common.eventhandler.SubscribeEvent;",
      to: "net.minecraftforge.eventbus.api.SubscribeEvent;",
      label: "SubscribeEvent legacy Forge mis à jour"
    },
    {
      kind: "text",
      from: "net.minecraftforge.fml.common.eventhandler.SubscribeEvent;",
      to: "net.minecraftforge.eventbus.api.SubscribeEvent;",
      label: "SubscribeEvent Forge modernisé"
    },
    {
      kind: "text",
      from: "cpw.mods.fml.relauncher.SideOnly;",
      to: "net.minecraftforge.api.distmarker.OnlyIn;",
      label: "Annotation SideOnly remplacée par OnlyIn"
    },
    {
      kind: "text",
      from: "cpw.mods.fml.relauncher.Side;",
      to: "net.minecraftforge.api.distmarker.Dist;",
      label: "Enum Side remplacé par Dist"
    },
    {
      kind: "text",
      from: "net.minecraftforge.fml.relauncher.SideOnly;",
      to: "net.minecraftforge.api.distmarker.OnlyIn;",
      label: "Annotation SideOnly modernisée"
    },
    {
      kind: "text",
      from: "net.minecraftforge.fml.relauncher.Side;",
      to: "net.minecraftforge.api.distmarker.Dist;",
      label: "Enum Side modernisé"
    },
    {
      kind: "regex",
      from: /@SideOnly\s*\(\s*Side\.CLIENT\s*\)/g,
      to: "@OnlyIn(Dist.CLIENT)",
      label: "Annotation client legacy remplacée"
    },
    {
      kind: "regex",
      from: /@SideOnly\s*\(\s*Side\.SERVER\s*\)/g,
      to: "@OnlyIn(Dist.DEDICATED_SERVER)",
      label: "Annotation serveur legacy remplacée"
    }
  ];

  replacements.forEach((replacement) => {
    const outcome =
      replacement.kind === "text"
        ? applyTextReplacement(nextContent, replacement.from, replacement.to)
        : applyRegexReplacement(nextContent, replacement.from, replacement.to);

    if (outcome.changed) {
      nextContent = outcome.nextContent;
      applied.push(replacement.label);
    }
  });

  return {
    filePath,
    changed: nextContent !== content,
    content: nextContent,
    applied
  };
}

function applyFabricSourceTransforms(filePath, content) {
  let nextContent = content;
  const applied = [];
  const replacements = [
    {
      kind: "text",
      from: "import net.fabricmc.api.ModInitializer;",
      to: "import net.fabricmc.api.ModInitializer;",
      label: "Structure Fabric vérifiée"
    },
    {
      kind: "text",
      from: "implements ClientModInitializer, ModInitializer",
      to: "implements ModInitializer, ClientModInitializer",
      label: "Ordre des interfaces Fabric normalisé"
    },
    {
      kind: "regex",
      from: /public\s+static\s+final\s+String\s+MODID\s*=\s*"([A-Z0-9_]+)";/g,
      to: (_match, modId) => `public static final String MODID = "${String(modId).toLowerCase()}";`,
      label: "MODID Fabric normalisé en minuscules"
    }
  ];

  replacements.forEach((replacement) => {
    const outcome =
      replacement.kind === "text"
        ? applyTextReplacement(nextContent, replacement.from, replacement.to)
        : applyRegexReplacement(nextContent, replacement.from, replacement.to);

    if (outcome.changed) {
      nextContent = outcome.nextContent;
      applied.push(replacement.label);
    }
  });

  return {
    filePath,
    changed: nextContent !== content,
    content: nextContent,
    applied
  };
}

function applyMcreatorSourceTransforms(filePath, content) {
  let nextContent = content;
  const applied = [];
  const replacements = [
    {
      kind: "regex",
      from: /@Elements\.[^\r\n]+\r?\n/g,
      to: "",
      label: "Annotation interne MCreator retirée"
    },
    {
      kind: "regex",
      from: /\bpublic\s+static\s+final\s+org\.apache\.logging\.log4j\.Logger\s+LOGGER\b/g,
      to: "public static final org.apache.logging.log4j.Logger LOGGER",
      label: "Champ LOGGER MCreator conservé sans changement de structure"
    }
  ];

  replacements.forEach((replacement) => {
    const outcome = applyRegexReplacement(nextContent, replacement.from, replacement.to);
    if (outcome.changed) {
      nextContent = outcome.nextContent;
      applied.push(replacement.label);
    }
  });

  return {
    filePath,
    changed: nextContent !== content,
    content: nextContent,
    applied
  };
}

function applyGenericSourceTransforms(filePath, content) {
  let nextContent = content;
  const applied = [];
  const replacements = [
    {
      kind: "regex",
      from: /\r\n/g,
      to: "\n",
      label: "Fin de lignes normalisée"
    }
  ];

  replacements.forEach((replacement) => {
    const outcome = applyRegexReplacement(nextContent, replacement.from, replacement.to);
    if (outcome.changed) {
      nextContent = outcome.nextContent;
      applied.push(replacement.label);
    }
  });

  return {
    filePath,
    changed: nextContent !== content,
    content: nextContent,
    applied
  };
}

function applySourceTransforms(stagePath, loader, targetGameVersion = null) {
  const javaFiles = collectJavaFiles(stagePath);
  const contextPath = path.join(stagePath, "src", "main", "resources", "stage-context.json");
  const context = fs.existsSync(contextPath) ? readJson(contextPath) : {};
  const results = [];

  javaFiles.forEach((filePath) => {
    const original = fs.readFileSync(filePath, "utf8");
    const generic = applyGenericSourceTransforms(filePath, original);
    const remapped = applySourceRemap({
      loader,
      targetGameVersion: targetGameVersion || context?.phase?.gameVersion || null,
      mappingProfile: context?.mappingProfile || null,
      filePath,
      content: generic.content
    });
    const loaderSpecific =
      loader === "forge"
        ? applyForgeSourceTransforms(filePath, remapped.content)
        : loader === "fabric"
          ? applyFabricSourceTransforms(filePath, remapped.content)
          : {
              filePath,
              changed: false,
              content: remapped.content,
              applied: []
            };
    const mcreatorSpecific = context.isMcreator
      ? applyMcreatorSourceTransforms(filePath, loaderSpecific.content)
      : {
          filePath,
          changed: false,
          content: loaderSpecific.content,
          applied: []
        };

    const applied = [
      ...generic.applied,
      ...remapped.applied
        .map((item) => `[${item.family}] ${item.label}${item.count > 1 ? ` (${item.count})` : ""}`)
        .filter((item) => !generic.applied.includes(item)),
      ...loaderSpecific.applied.filter((item) => !generic.applied.includes(item)),
      ...mcreatorSpecific.applied.filter(
        (item) =>
          !generic.applied.includes(item) &&
          !loaderSpecific.applied.includes(item) &&
          !remapped.applied.some((entry) => item === entry.label)
      )
    ];
    const finalContent = mcreatorSpecific.content;
    const changed = finalContent !== original;

    if (changed) {
      fs.writeFileSync(filePath, finalContent, "utf8");
    }

    results.push({
      filePath,
      relativePath: path.relative(path.join(stagePath, "src", "imported", "java"), filePath).replace(/\\/g, "/"),
      changed,
      applied
    });
  });

  return results.filter((item) => item.changed || item.applied.length);
}

function collectSourceDiagnostics(stagePath, loader, explicitTargetGameVersion = null) {
  const javaFiles = collectJavaFiles(stagePath);
  const rules = LEGACY_SOURCE_PATTERNS.filter((rule) => rule.loader === loader || rule.loader === "generic");
  const contextPath = path.join(stagePath, "src", "main", "resources", "stage-context.json");
  const context = fs.existsSync(contextPath) ? readJson(contextPath) : {};
  const targetGameVersion = explicitTargetGameVersion || context?.phase?.gameVersion || null;
  const diagnostics = [];

  javaFiles.forEach((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(path.join(stagePath, "src", "imported", "java"), filePath).replace(/\\/g, "/");

    rules.forEach((rule) => {
      const matches = [...content.matchAll(rule.pattern)];
      if (!matches.length) {
        return;
      }

      diagnostics.push({
        relativePath,
        label: rule.label,
        count: matches.length,
        suggestion: rule.suggestion
      });
    });

    if (targetGameVersion) {
      diagnostics.push(
        ...collectVersionDiagnostics({
          loader,
          targetGameVersion,
          content,
          relativePath
        }),
        ...collectFamilyDiagnostics({
          loader,
          targetGameVersion,
          mappingProfile: context?.mappingProfile || null,
          content,
          relativePath
        })
      );
    }
  });

  return diagnostics.slice(0, 40);
}

function buildMarkdownReport(report) {
  const lines = [
    "# Rapport de patchs automatiques",
    "",
    `Stage : ${report.stagePath}`,
    `Loader cible : ${report.loader}`,
    `Profil de mappings : ${report.mappingProfile?.mappingSystem || "inconnu"} (${report.mappingProfile?.namespace || "-"})`,
    `Métadonnées source détectées : ${report.detectedMetadata.length}`,
    `Métadonnées désactivées : ${report.disabledMetadata.length}`,
    ""
  ];

  if (report.targetMetadata) {
    lines.push(`Métadonnée cible conservée : ${report.targetMetadata.relativePath}`);
    lines.push("");
  }

  if (report.mappingProfile?.notes?.length) {
    lines.push("## Profil de mappings");
    report.mappingProfile.notes.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  if (report.detectedMetadata.length) {
    lines.push("## Métadonnées détectées");
    report.detectedMetadata.forEach((item) => lines.push(`- ${item.relativePath}`));
    lines.push("");
  }

  if (report.disabledMetadata.length) {
    lines.push("## Métadonnées désactivées");
    report.disabledMetadata.forEach((item) => lines.push(`- ${item.relativePath}`));
    lines.push("");
  }

  if (report.mcreatorHints.length) {
    lines.push("## Indices MCreator");
    report.mcreatorHints.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  if (report.sourcePatches.length) {
    lines.push("## Fichiers Java ajustés");
    report.sourcePatches.forEach((item) =>
      lines.push(`- ${item.relativePath} : ${item.applied.join(", ") || "Transformation générique"}`)
    );
    lines.push("");
  }

  if (report.sourceRemaps?.length) {
    lines.push("## Remapping source heuristique");
    report.sourceRemaps.forEach((item) =>
      lines.push(`- ${item.relativePath} : ${item.applied.filter((label) => label.toLowerCase().includes("remapp")).join(", ")}`)
    );
    lines.push("");
  }

  if (report.sourceDiagnostics.length) {
    lines.push("## Diagnostics source restants");
    report.sourceDiagnostics.forEach((item) =>
      lines.push(`- ${item.relativePath} | ${item.label}${item.count ? ` (${item.count})` : ""} : ${item.suggestion}`)
    );
    lines.push("");
  }

  if (report.actions.length) {
    lines.push("## Actions effectuées");
    report.actions.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  return lines.join("\n");
}

function applyStageAutomaticPatches(stage) {
  const stagePath = stage.path;
  const notesDir = path.join(stagePath, "notes");
  ensureDir(notesDir);

  const loader = normalizeLoader(stage.loader);
  const detectedMetadata = collectMetadataFiles(stagePath);
  const targetMetadata = ensureTargetMetadata(stagePath, loader);
  const disabledMetadata = disableConflictingMetadata(stagePath, targetMetadata?.relativePath || null);
  const contextPath = path.join(stagePath, "src", "main", "resources", "stage-context.json");
  const context = fs.existsSync(contextPath) ? readJson(contextPath) : {};
  const mcreatorHints = context.isMcreator ? collectMcreatorHints(stagePath) : [];
  const sourcePatches = applySourceTransforms(stagePath, loader, stage.gameVersion);
  const sourceDiagnostics = collectSourceDiagnostics(stagePath, loader, stage.gameVersion);
  const sourceRemaps = sourcePatches.filter((item) =>
    item.applied.some((label) => label.toLowerCase().includes("remapp"))
  );
  const mappingProfile = context?.mappingProfile || null;

  const actions = [];
  if (targetMetadata?.exists) {
    actions.push(`Métadonnée cible ${targetMetadata.relativePath} conservée dans src/main/resources.`);
  }
  if (disabledMetadata.length) {
    actions.push(`${disabledMetadata.length} métadonnée(s) incompatible(s) déplacée(s) vers notes/disabled-metadata.`);
  }
  if (mcreatorHints.length) {
    actions.push("Indices MCreator consignés pour faciliter le tri du code généré.");
  }
  if (sourcePatches.length) {
    actions.push(`${sourcePatches.length} fichier(s) Java importé(s) ajusté(s) automatiquement.`);
  }
  if (sourceRemaps.length) {
    actions.push(`${sourceRemaps.length} fichier(s) Java ont reçu un remapping source heuristique.`);
  }
  if (mappingProfile?.mappingSystem) {
    actions.push(`Profil de mappings appliqué : ${mappingProfile.mappingSystem} (${mappingProfile.namespace}).`);
  }
  if (sourceDiagnostics.length) {
    actions.push(`${sourceDiagnostics.length} diagnostic(s) source restant(s) ont été signalé(s).`);
  }
  if (!actions.length) {
    actions.push("Aucun patch automatique nécessaire pour ce stage.");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    stagePath,
    loader: stage.loader,
    mappingProfile,
    targetMetadata,
    detectedMetadata,
    disabledMetadata,
    mcreatorHints,
    sourcePatches,
    sourceRemaps,
    sourceDiagnostics,
    actions
  };

  writeJson(path.join(notesDir, "auto-patch-report.json"), report);
  writeText(path.join(notesDir, "auto-patch-report.md"), buildMarkdownReport(report));

  return report;
}

function applyAutomaticPatches(workspace) {
  if (!workspace?.stages?.length) {
    throw new Error("Aucun stage disponible pour appliquer des patchs.");
  }

  const stageReports = workspace.stages.map((stage) => applyStageAutomaticPatches(stage));
  const summary = {
    generatedAt: new Date().toISOString(),
    workspaceRoot: workspace.workspaceRoot,
    stageCount: stageReports.length,
    patchedStageCount: stageReports.filter((report) => report.actions.some((action) => !action.startsWith("Aucun patch"))).length,
    stageReports
  };

  if (workspace.reportsPath) {
    ensureDir(workspace.reportsPath);
    writeJson(path.join(workspace.reportsPath, "auto-patch-summary.json"), summary);
  }

  return summary;
}

module.exports = {
  applyAutomaticPatches
};
