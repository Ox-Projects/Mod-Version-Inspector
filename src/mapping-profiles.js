const { compareVersions } = require("./version-rules");

function normalizeLoader(loader) {
  const value = String(loader || "").toLowerCase();
  if (value.includes("fabric")) return "fabric";
  if (value.includes("quilt")) return "quilt";
  if (value.includes("liteloader")) return "liteloader";
  if (value.includes("forge")) return "forge";
  if (value.includes("bukkit") || value.includes("spigot") || value.includes("paper")) return "bukkit";
  return "generic";
}

function resolveForgeProfile(gameVersion) {
  if (compareVersions(gameVersion, "1.20.1") >= 0) {
    return {
      mappingSystem: "mojmap",
      namespace: "official",
      bridgeFromLegacy: ["srg", "mcp", "forge-legacy"],
      sourcePackages: [
        "net.minecraft.world.level",
        "net.minecraftforge.registries",
        "net.minecraftforge.event",
        "net.minecraftforge.fml.event.lifecycle"
      ],
      notes: [
        "Forge 1.20.x privilégie les mappings officiels Mojang.",
        "Les noms MCP/SRG les plus anciens doivent être traduits avant toute adaptation d'API."
      ]
    };
  }

  if (compareVersions(gameVersion, "1.16.5") >= 0) {
    return {
      mappingSystem: "mojmap",
      namespace: "official",
      bridgeFromLegacy: ["srg", "mcp"],
      sourcePackages: [
        "net.minecraft.world",
        "net.minecraftforge.fml.event.lifecycle",
        "net.minecraftforge.event",
        "net.minecraftforge.registries"
      ],
      notes: [
        "Forge 1.16.5 sert souvent de palier de transition entre MCP ancien et branches modernes."
      ]
    };
  }

  return {
    mappingSystem: "mcp",
    namespace: "mcp",
    bridgeFromLegacy: ["mcp"],
    sourcePackages: ["net.minecraft", "cpw.mods.fml"],
    notes: [
      "Branche Forge legacy : les noms MCP d'origine sont encore dominants."
    ]
  };
}

function resolveFabricProfile(gameVersion) {
  if (compareVersions(gameVersion, "1.20.1") >= 0) {
    return {
      mappingSystem: "yarn",
      namespace: "intermediary-v2",
      bridgeFromLegacy: ["old-yarn", "legacy-fabric"],
      sourcePackages: ["net.minecraft.registry", "net.minecraft.util"],
      notes: [
        "Fabric récent demande surtout Yarn moderne et la famille Registries/RegistryKey."
      ]
    };
  }

  return {
    mappingSystem: "yarn",
    namespace: "intermediary",
    bridgeFromLegacy: ["old-yarn"],
    sourcePackages: ["net.minecraft.util.registry", "net.minecraft.util"],
    notes: [
      "Fabric ancien garde encore plusieurs imports de registries sous net.minecraft.util.registry."
    ]
  };
}

function resolveQuiltProfile(gameVersion) {
  return {
    mappingSystem: "quilt-mappings",
    namespace: compareVersions(gameVersion, "1.20.1") >= 0 ? "intermediary-v2" : "intermediary",
    bridgeFromLegacy: ["old-yarn", "fabric-intermediary"],
    sourcePackages: ["org.quiltmc", "net.minecraft"],
    notes: [
      "Quilt reste proche de l'écosystème Fabric mais peut demander des adaptations QSL spécifiques."
    ]
  };
}

function resolveBukkitProfile() {
  return {
    mappingSystem: "bukkit-api",
    namespace: "spigot-api",
    bridgeFromLegacy: ["craftbukkit", "nms"],
    sourcePackages: ["org.bukkit", "io.papermc"],
    notes: [
      "Les plugins Bukkit/Paper se remappent surtout au niveau API serveur, pas via mappings Minecraft classiques."
    ]
  };
}

function resolveMappingProfile(loader, gameVersion) {
  const normalizedLoader = normalizeLoader(loader);

  const common = {
    loader: normalizedLoader,
    gameVersion
  };

  if (normalizedLoader === "forge") {
    return {
      ...common,
      ...resolveForgeProfile(gameVersion)
    };
  }

  if (normalizedLoader === "fabric") {
    return {
      ...common,
      ...resolveFabricProfile(gameVersion)
    };
  }

  if (normalizedLoader === "quilt") {
    return {
      ...common,
      ...resolveQuiltProfile(gameVersion)
    };
  }

  if (normalizedLoader === "bukkit") {
    return {
      ...common,
      ...resolveBukkitProfile(gameVersion)
    };
  }

  return {
    ...common,
    mappingSystem: "generic",
    namespace: "generic",
    bridgeFromLegacy: [],
    sourcePackages: [],
    notes: ["Aucun profil de mappings spécifique disponible pour ce loader."]
  };
}

module.exports = {
  resolveMappingProfile
};
