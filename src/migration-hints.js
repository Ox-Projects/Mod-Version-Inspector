function normalizeLoader(loader) {
  const value = String(loader || "").toLowerCase();
  if (value.includes("fabric")) return "fabric";
  if (value.includes("quilt")) return "quilt";
  if (value.includes("liteloader")) return "liteloader";
  if (value.includes("forge")) return "forge";
  if (value.includes("bukkit") || value.includes("spigot") || value.includes("paper")) return "bukkit";
  return "generic";
}

function parseJavaNumber(javaLabel) {
  const match = String(javaLabel || "").match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function buildHints(phase, plan, inspection) {
  const sourceLoader = normalizeLoader(inspection?.detection?.loader);
  const phaseLoader = normalizeLoader(phase?.loader);
  const sourceJava = parseJavaNumber(inspection?.detection?.java);
  const phaseJava = parseJavaNumber(phase?.java);
  const hints = [];

  if (sourceLoader !== phaseLoader) {
    hints.push("Adapter l'entrée principale du mod au loader cible avant toute autre migration.");
  }

  if (sourceLoader === "forge" && phaseLoader === "fabric") {
    hints.push("Remplacer les bus d'événements Forge par les points d'entrée Fabric et revoir les registries.");
  }

  if (sourceLoader === "fabric" && phaseLoader === "forge") {
    hints.push("Remplacer les initializers Fabric par la structure Forge et revoir les events/networking.");
  }

  if (phaseLoader === "quilt") {
    hints.push("Vérifier les dépendances QSL / Quilt Loader et adapter les metadata du mod.");
  }

  if (phaseLoader === "bukkit") {
    hints.push("Contrôler plugin.yml, les commandes et l'API Bukkit/Paper ciblée.");
  }

  if (phaseJava && sourceJava && phaseJava > sourceJava) {
    hints.push("Mettre à jour la toolchain Java et vérifier les APIs standard remplacées ou obsolètes.");
  }

  if (phaseJava && sourceJava && phaseJava < sourceJava) {
    hints.push("Backport Java : supprimer les features de langage/API trop récentes avant recompilation.");
  }

  if (plan?.staircase?.length > 3) {
    hints.push("Portage long : stabiliser chaque palier avant de passer au suivant.");
  }

  if (inspection?.detection?.isMcreator) {
    hints.push("Mod MCreator détecté : repérer d'abord les classes auto-générées avant les refactors plus larges.");

    if (String(phase?.loader || "").toLowerCase().includes("forge")) {
      hints.push("Sur un mod MCreator Forge, vérifier en priorité ModElements, les registries générées et les procedures.");
    }

    if (String(phase?.loader || "").toLowerCase().includes("fabric")) {
      hints.push("Sur un mod MCreator Fabric, revalider les entrypoints et métadonnées générées avant de corriger le reste.");
    }
  }

  if (!hints.length) {
    hints.push("Valider d'abord les mappings et les packages avant les adaptations d'API plus fines.");
  }

  return hints;
}

module.exports = {
  buildHints
};
