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

function selectForgeProfile(gameVersion) {
  if (compareVersions(gameVersion, "1.20.1") >= 0) {
    return {
      pluginVersion: "[6.0,6.2)",
      mappingsChannel: "official",
      mappingsVersion: gameVersion,
      dependencyNotation: `net.minecraftforge:forge:${gameVersion}-47.2.0`,
      gradleVersion: "8.5",
      notes: ["Forge moderne : privilégier DeferredRegister et les mappings officiels."]
    };
  }

  if (compareVersions(gameVersion, "1.18.2") >= 0) {
    return {
      pluginVersion: "[5.1,5.2)",
      mappingsChannel: "official",
      mappingsVersion: gameVersion,
      dependencyNotation: `net.minecraftforge:forge:${gameVersion}-40.2.0`,
      gradleVersion: "7.4.2",
      notes: ["Forge 1.18.x : Java 17 requis et APIs de monde/rendu modernisées."]
    };
  }

  if (compareVersions(gameVersion, "1.16.5") >= 0) {
    return {
      pluginVersion: "[5.1,5.2)",
      mappingsChannel: "official",
      mappingsVersion: "1.16.5",
      dependencyNotation: "net.minecraftforge:forge:1.16.5-36.2.39",
      gradleVersion: "7.3.3",
      notes: ["Forge 1.16.5 : bon palier intermédiaire pour migrer depuis 1.12.2."]
    };
  }

  return {
    pluginVersion: "[3.0,3.1)",
    mappingsChannel: "snapshot",
    mappingsVersion: "20210309-1.16.5",
    dependencyNotation: `net.minecraftforge:forge:${gameVersion}-legacy`,
    gradleVersion: "6.9.4",
    notes: ["Branche Forge legacy : prévoir beaucoup d'adaptations manuelles."]
  };
}

function selectFabricProfile(gameVersion) {
  if (compareVersions(gameVersion, "1.21.1") >= 0) {
    return {
      loomVersion: "1.7-SNAPSHOT",
      yarnBuild: "1",
      loaderVersion: "0.16.9",
      gradleVersion: "8.7",
      notes: ["Fabric récent : vérifier Loom et Yarn à chaque palier."]
    };
  }

  if (compareVersions(gameVersion, "1.20.1") >= 0) {
    return {
      loomVersion: "1.7-SNAPSHOT",
      yarnBuild: "1",
      loaderVersion: "0.15.11",
      gradleVersion: "8.5",
      notes: ["Fabric 1.20.1 : palier stable pour beaucoup de ports modernes."]
    };
  }

  return {
    loomVersion: "1.3-SNAPSHOT",
    yarnBuild: "1",
    loaderVersion: "0.14.22",
    gradleVersion: "7.6.4",
    notes: ["Fabric plus ancien : vérifier les plugins Loom et les dépendances API."]
  };
}

function selectQuiltProfile(gameVersion) {
  return {
    loomVersion: compareVersions(gameVersion, "1.20.1") >= 0 ? "1.7.1" : "1.4.0",
    loaderVersion: compareVersions(gameVersion, "1.20.1") >= 0 ? "0.26.4" : "0.21.0",
    mappingsBuild: "1",
    gradleVersion: compareVersions(gameVersion, "1.20.1") >= 0 ? "8.5" : "7.6.4",
    notes: ["Quilt : surveiller QSL et la compatibilité avec les libs Fabric."]
  };
}

function selectBukkitProfile(gameVersion) {
  return {
    gradleVersion: compareVersions(gameVersion, "1.20.1") >= 0 ? "8.5" : "7.6.4",
    apiVersion: gameVersion,
    notes: ["Bukkit/Paper : vérifier les dépendances serveur et les hooks NMS si présents."]
  };
}

function resolveToolchainProfile(loader, gameVersion, javaVersion) {
  const normalizedLoader = normalizeLoader(loader);
  const java = String(javaVersion || "").replace("Java ", "");

  const common = {
    loader: normalizedLoader,
    gameVersion,
    javaVersion: java,
    repositories: ["mavenCentral()"]
  };

  if (normalizedLoader === "forge") {
    return {
      ...common,
      type: "forge",
      ...selectForgeProfile(gameVersion),
      repositories: [...common.repositories, "maven { url = 'https://maven.minecraftforge.net/' }"]
    };
  }

  if (normalizedLoader === "fabric") {
    return {
      ...common,
      type: "fabric",
      ...selectFabricProfile(gameVersion),
      repositories: [...common.repositories, "maven { url = 'https://maven.fabricmc.net/' }"]
    };
  }

  if (normalizedLoader === "quilt") {
    return {
      ...common,
      type: "quilt",
      ...selectQuiltProfile(gameVersion),
      repositories: [...common.repositories, "maven { url = 'https://maven.quiltmc.org/repository/release/' }"]
    };
  }

  if (normalizedLoader === "bukkit") {
    return {
      ...common,
      type: "bukkit",
      ...selectBukkitProfile(gameVersion)
    };
  }

  return {
    ...common,
    type: "generic",
    gradleVersion: "8.5",
    notes: ["Profil générique : dépendances et plugins à compléter manuellement."]
  };
}

module.exports = {
  resolveToolchainProfile
};
