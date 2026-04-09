const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const JAVA_VERSION_BY_MAJOR = {
  45: "Java 1.1",
  46: "Java 1.2",
  47: "Java 1.3",
  48: "Java 1.4",
  49: "Java 5",
  50: "Java 6",
  51: "Java 7",
  52: "Java 8",
  53: "Java 9",
  54: "Java 10",
  55: "Java 11",
  56: "Java 12",
  57: "Java 13",
  58: "Java 14",
  59: "Java 15",
  60: "Java 16",
  61: "Java 17",
  62: "Java 18",
  63: "Java 19",
  64: "Java 20",
  65: "Java 21",
  66: "Java 22",
  67: "Java 23",
  68: "Java 24",
  69: "Java 25"
};

const ARCHIVE_EXTENSIONS = new Set([".jar", ".zip", ".litemod", ".liteloadermod"]);
const RECOGNIZED_LOADERS = new Set([
  "LiteLoader",
  "Fabric",
  "Forge",
  "Forge (legacy MCP)",
  "Quilt",
  "Bukkit / Spigot / Paper"
]);

function mapJavaVersion(major) {
  return JAVA_VERSION_BY_MAJOR[major] || `Classe Java inconnue (${major})`;
}

function normalizeArchivePath(entryName) {
  return entryName.replace(/\\/g, "/");
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function parseJsonEntry(zip, entryName) {
  const text = readEntryText(zip, entryName);
  return text ? parseJsonText(text) : null;
}

function parseTomlValue(text, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*["']([^"']+)["']`, "m"));
  return match ? match[1] : null;
}

function collectTomlBlocks(text, pattern) {
  return text.match(pattern) || [];
}

function parseManifest(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce((acc, line) => {
      const index = line.indexOf(":");
      if (index === -1) {
        return acc;
      }

      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

function readEntryText(zip, entryName) {
  const normalized = normalizeArchivePath(entryName);
  const entry = zip.getEntry(normalized);
  if (!entry) {
    return null;
  }

  try {
    return zip.readAsText(entry);
  } catch (_error) {
    return null;
  }
}

function findEntryByName(zip, fileName) {
  const lowerTarget = fileName.toLowerCase();
  return zip.getEntries().find((entry) => normalizeArchivePath(entry.entryName).toLowerCase().endsWith(lowerTarget)) || null;
}

function readPossibleEntryText(zip, fileNames) {
  for (const fileName of fileNames) {
    const direct = readEntryText(zip, fileName);
    if (direct) {
      return direct;
    }

    const fallbackEntry = findEntryByName(zip, fileName);
    if (fallbackEntry) {
      try {
        return zip.readAsText(fallbackEntry);
      } catch (_error) {
        return null;
      }
    }
  }

  return null;
}

function parseLiteLoaderMetadata(zip) {
  const text = readPossibleEntryText(zip, ["litemod.json"]);
  if (!text) {
    return null;
  }

  const parsed = parseJsonText(text);
  if (!parsed) {
    return null;
  }

  return Array.isArray(parsed) ? parsed[0] || null : parsed;
}

function isZipLike(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return true;
  }

  const fd = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    return header[0] === 0x50 && header[1] === 0x4b;
  } finally {
    fs.closeSync(fd);
  }
}

function detectLoader(zip, extension) {
  const liteLoader = parseLiteLoaderMetadata(zip);
  if (liteLoader || extension === ".litemod" || extension === ".liteloadermod") {
    return "LiteLoader";
  }

  if (zip.getEntry("fabric.mod.json")) {
    return "Fabric";
  }

  if (zip.getEntry("META-INF/mods.toml")) {
    return "Forge";
  }

  if (zip.getEntry("mcmod.info")) {
    return "Forge (legacy MCP)";
  }

  if (zip.getEntry("quilt.mod.json")) {
    return "Quilt";
  }

  if (zip.getEntry("plugin.yml") || zip.getEntry("paper-plugin.yml")) {
    return "Bukkit / Spigot / Paper";
  }

  return extension === ".zip" ? "Archive Java / Zip" : "Jar Java générique";
}

function detectModLoaderInfo(zip, detectedLoader) {
  if (detectedLoader === "LiteLoader") {
    const liteLoader = parseLiteLoaderMetadata(zip);
    return {
      name: "LiteLoader",
      version: liteLoader?.revision || liteLoader?.version || null,
      build: liteLoader?.mcversion || liteLoader?.minecraft || null
    };
  }

  if (detectedLoader === "Fabric") {
    const fabric = parseJsonEntry(zip, "fabric.mod.json");
    const depends = fabric?.depends || {};
    const loaderVersion = depends.fabricloader || depends["fabric-loader"] || null;
    return {
      name: "Fabric Loader",
      version: Array.isArray(loaderVersion) ? loaderVersion.join(", ") : loaderVersion,
      build: depends.fabric_api || depends["fabric-api"] || null
    };
  }

  if (detectedLoader === "Quilt") {
    const quilt = parseJsonEntry(zip, "quilt.mod.json");
    const depends = quilt?.quilt_loader?.depends || [];
    const quiltLoader = depends.find((entry) => entry.id === "quilt_loader");
    const qsl = depends.find((entry) => entry.id === "quilted_fabric_api" || entry.id === "qsl");
    return {
      name: "Quilt Loader",
      version: Array.isArray(quiltLoader?.versions) ? quiltLoader.versions.join(", ") : quiltLoader?.versions || null,
      build: Array.isArray(qsl?.versions) ? qsl.versions.join(", ") : qsl?.versions || null
    };
  }

  if (detectedLoader === "Forge") {
    const modsToml = readEntryText(zip, "META-INF/mods.toml");
    const manifestText = readEntryText(zip, "META-INF/MANIFEST.MF");
    const manifest = manifestText ? parseManifest(manifestText) : {};
    return {
      name: parseTomlValue(modsToml || "", "modLoader") || "Forge / FML",
      version: parseTomlValue(modsToml || "", "loaderVersion"),
      build: manifest["Implementation-Version"] || manifest["Forge-Version"] || null
    };
  }

  if (detectedLoader === "Forge (legacy MCP)") {
    const manifestText = readEntryText(zip, "META-INF/MANIFEST.MF");
    const manifest = manifestText ? parseManifest(manifestText) : {};
    return {
      name: "Minecraft Forge",
      version: manifest["FMLCorePluginContainsFMLMod"] ? "FML mod détecté" : null,
      build: manifest["Implementation-Version"] || null
    };
  }

  if (detectedLoader === "Bukkit / Spigot / Paper") {
    const pluginYml = readEntryText(zip, "paper-plugin.yml") || readEntryText(zip, "plugin.yml") || "";
    const apiVersion = pluginYml.match(/^\s*api-version:\s*["']?([^"'\r\n]+)["']?/m);
    const foliaSupported = /^\s*folia-supported:\s*true/m.test(pluginYml);
    return {
      name: readEntryText(zip, "paper-plugin.yml") ? "Paper" : "Bukkit / Spigot",
      version: apiVersion ? apiVersion[1].trim() : null,
      build: foliaSupported ? "Folia supporté" : null
    };
  }

  return {
    name: detectedLoader,
    version: null,
    build: null
  };
}

function detectGameVersion(zip, loader) {
  if (loader === "LiteLoader") {
    const liteLoader = parseLiteLoaderMetadata(zip);
    return liteLoader?.mcversion || liteLoader?.minecraft || null;
  }

  const fabric = parseJsonEntry(zip, "fabric.mod.json");
  if (fabric) {
    const depends = fabric.depends || {};
    const minecraft = depends.minecraft;
    return Array.isArray(minecraft) ? minecraft.join(", ") : minecraft || null;
  }

  const quilt = parseJsonEntry(zip, "quilt.mod.json");
  if (quilt?.quilt_loader?.depends) {
    const dependency = quilt.quilt_loader.depends.find((entry) => entry.id === "minecraft");
    if (dependency?.versions) {
      return Array.isArray(dependency.versions) ? dependency.versions.join(", ") : dependency.versions;
    }
  }

  const modsToml = readEntryText(zip, "META-INF/mods.toml");
  if (modsToml) {
    const minecraftBlocks = collectTomlBlocks(modsToml, /\[\[dependencies\.[^\]]+\]\]([\s\S]*?)(?=\n\[\[|\s*$)/g);
    for (const block of minecraftBlocks) {
      const modId = parseTomlValue(block, "modId");
      if (modId === "minecraft") {
        return parseTomlValue(block, "versionRange");
      }
    }

    return parseTomlValue(modsToml, "loaderVersion");
  }

  const mcmod = readEntryText(zip, "mcmod.info");
  if (mcmod) {
    const parsed = parseJsonText(mcmod);
    const entries = Array.isArray(parsed) ? parsed : parsed?.modList || [];
    const versionEntry = entries.find((entry) => entry.mcversion);
    return versionEntry?.mcversion || null;
  }

  const pluginYml = readEntryText(zip, "plugin.yml") || readEntryText(zip, "paper-plugin.yml");
  if (pluginYml) {
    const apiVersion = pluginYml.match(/^\s*api-version:\s*["']?([^"'\r\n]+)["']?/m);
    return apiVersion ? apiVersion[1].trim() : null;
  }

  return null;
}

function extractDeclaredVersion(zip, loader) {
  if (loader === "LiteLoader") {
    const liteLoader = parseLiteLoaderMetadata(zip);
    return liteLoader?.version || liteLoader?.revision || null;
  }

  if (loader === "Fabric") {
    return parseJsonEntry(zip, "fabric.mod.json")?.version || null;
  }

  if (loader === "Quilt") {
    return parseJsonEntry(zip, "quilt.mod.json")?.quilt_loader?.version || null;
  }

  const modsToml = readEntryText(zip, "META-INF/mods.toml");
  if (modsToml) {
    return parseTomlValue(modsToml, "version");
  }

  const mcmod = readEntryText(zip, "mcmod.info");
  if (mcmod) {
    const parsed = parseJsonText(mcmod);
    const entries = Array.isArray(parsed) ? parsed : parsed?.modList || [];
    return entries[0]?.version || null;
  }

  const pluginYml = readEntryText(zip, "plugin.yml") || readEntryText(zip, "paper-plugin.yml");
  if (pluginYml) {
    const version = pluginYml.match(/^\s*version:\s*["']?([^"'\r\n]+)["']?/m);
    return version ? version[1].trim() : null;
  }

  return null;
}

function detectModName(zip, filePath, loader) {
  if (loader === "LiteLoader") {
    const liteLoader = parseLiteLoaderMetadata(zip);
    if (liteLoader?.name) {
      return liteLoader.name;
    }
  }

  if (loader === "Fabric") {
    const fabric = parseJsonEntry(zip, "fabric.mod.json");
    if (fabric?.name) {
      return fabric.name;
    }
  }

  if (loader === "Quilt") {
    const quilt = parseJsonEntry(zip, "quilt.mod.json");
    if (quilt?.quilt_loader?.metadata?.name) {
      return quilt.quilt_loader.metadata.name;
    }
  }

  const modsToml = readEntryText(zip, "META-INF/mods.toml");
  if (modsToml) {
    return parseTomlValue(modsToml, "displayName") || parseTomlValue(modsToml, "modId");
  }

  const mcmod = readEntryText(zip, "mcmod.info");
  if (mcmod) {
    const parsed = parseJsonText(mcmod);
    const entries = Array.isArray(parsed) ? parsed : parsed?.modList || [];
    return entries[0]?.name || entries[0]?.modid || path.parse(filePath).name;
  }

  const pluginYml = readEntryText(zip, "plugin.yml") || readEntryText(zip, "paper-plugin.yml");
  if (pluginYml) {
    const name = pluginYml.match(/^\s*name:\s*["']?([^"'\r\n]+)["']?/m);
    if (name) {
      return name[1].trim();
    }
  }

  return path.parse(filePath).name;
}

function detectDependencies(zip, loader) {
  if (loader === "LiteLoader") {
    const liteLoader = parseLiteLoaderMetadata(zip);
    const dependencies = liteLoader?.dependsOn || liteLoader?.dependencies || [];
    return Array.isArray(dependencies) ? dependencies.slice(0, 8) : [String(dependencies)];
  }

  const fabric = parseJsonEntry(zip, "fabric.mod.json");
  if (fabric?.depends) {
    return Object.entries(fabric.depends)
      .map(([name, version]) => `${name}: ${Array.isArray(version) ? version.join(", ") : version}`)
      .slice(0, 8);
  }

  return [];
}

function parseManifestValuePairs(manifest) {
  return Object.entries(manifest || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function detectMcreatorInfo(zip, entries, manifest, loader) {
  const normalizedEntries = entries.map((entry) => normalizeArchivePath(entry.entryName));
  const lowerEntries = normalizedEntries.map((entry) => entry.toLowerCase());
  const metadataTexts = [
    readEntryText(zip, "fabric.mod.json"),
    readEntryText(zip, "quilt.mod.json"),
    readEntryText(zip, "META-INF/mods.toml"),
    readEntryText(zip, "mcmod.info"),
    readEntryText(zip, "plugin.yml"),
    readEntryText(zip, "paper-plugin.yml"),
    parseManifestValuePairs(manifest)
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const reasons = [];

  if (lowerEntries.some((entry) => entry.includes("/mcreator/") || entry.startsWith("net/mcreator/"))) {
    reasons.push("Packages ou classes MCreator détectés");
  }

  if (lowerEntries.some((entry) => entry.endsWith("modelements.class") || entry.endsWith("modelements.java"))) {
    reasons.push("Structure ModElements typique de MCreator détectée");
  }

  if (lowerEntries.some((entry) => entry.includes("/procedures/") || entry.includes("/elements/"))) {
    reasons.push("Dossiers procedures/elements typiques d'un projet MCreator détectés");
  }

  if (metadataTexts.includes("mcreator")) {
    reasons.push("Référence textuelle à MCreator trouvée dans les métadonnées");
  }

  if (!reasons.length) {
    return {
      isMcreator: false,
      confidence: "none",
      version: null,
      generator: null,
      reasons: []
    };
  }

  const versionMatch = metadataTexts.match(/mcreator[^0-9]{0,12}(\d{4}(?:\.\d+)?)/i);
  const legacyVersionMatch = metadataTexts.match(/mcreator[^0-9]{0,12}(\d+\.\d+(?:\.\d+)?)/i);
  const version = versionMatch?.[1] || legacyVersionMatch?.[1] || null;

  return {
    isMcreator: true,
    confidence: reasons.length >= 2 || (reasons.length === 1 && metadataTexts.includes("mcreator")) ? "high" : "medium",
    version,
    generator: loader === "Fabric" || loader === "Quilt" ? "MCreator (Fabric/Quilt generator)" : "MCreator",
    reasons
  };
}

function readClassVersion(buffer) {
  if (!buffer || buffer.length < 8) {
    return null;
  }

  if (buffer.readUInt32BE(0) !== 0xcafebabe) {
    return null;
  }

  return buffer.readUInt16BE(6);
}

function detectJavaFromArchive(entries, zip) {
  let highestMajor = null;
  let inspectedClasses = 0;

  for (const entry of entries) {
    if (!entry.entryName.endsWith(".class")) {
      continue;
    }

    const major = readClassVersion(entry.getData());
    if (!major) {
      continue;
    }

    highestMajor = highestMajor === null ? major : Math.max(highestMajor, major);
    inspectedClasses += 1;

    if (inspectedClasses >= 250) {
      break;
    }
  }

  const manifestText = readEntryText(zip, "META-INF/MANIFEST.MF");
  const manifest = manifestText ? parseManifest(manifestText) : {};
  const buildJdk = manifest["Build-Jdk-Spec"] || manifest["Build-Jdk"];

  return {
    classMajor: highestMajor,
    javaVersion: highestMajor ? mapJavaVersion(highestMajor) : "Introuvable",
    buildJdk: buildJdk || null
  };
}

function createBaseResult(filePath, stats, extra = {}) {
  return {
    file: {
      path: filePath,
      name: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase() || "(none)",
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString()
    },
    detection: {
      java: extra.java || "-",
      classMajor: extra.classMajor || null,
      buildJdk: extra.buildJdk || null,
      loader: extra.loader || "-",
      modLoader: extra.modLoader || extra.loader || "-",
      modLoaderVersion: extra.modLoaderVersion || null,
      modLoaderBuild: extra.modLoaderBuild || null,
      gameVersion: extra.gameVersion || null,
      modVersion: extra.modVersion || null,
      modName: extra.modName || path.parse(filePath).name,
      artifactType: extra.artifactType || "Fichier Java",
      isMcreator: Boolean(extra.isMcreator),
      generator: extra.generator || null,
      generatorVersion: extra.generatorVersion || null,
      generatorConfidence: extra.generatorConfidence || null,
      generatorReasons: extra.generatorReasons || []
    },
    manifest: {
      implementationTitle: extra.implementationTitle || null,
      implementationVersion: extra.implementationVersion || null,
      mainClass: extra.mainClass || null
    },
    stats: {
      entryCount: extra.entryCount || 0,
      classCount: extra.classCount || 0,
      dependencies: extra.dependencies || []
    }
  };
}

function inspectArchive(filePath) {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  const stats = fs.statSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const loader = detectLoader(zip, extension);
  const modLoaderInfo = detectModLoaderInfo(zip, loader);
  const javaInfo = detectJavaFromArchive(entries, zip);
  const manifestText = readEntryText(zip, "META-INF/MANIFEST.MF");
  const manifest = manifestText ? parseManifest(manifestText) : {};
  const mcreatorInfo = detectMcreatorInfo(zip, entries, manifest, loader);
  const classCount = entries.filter((entry) => entry.entryName.endsWith(".class")).length;

  if (entries.length === 0) {
    throw new Error("Ce fichier n'est pas utilisable : l'archive est vide.");
  }

  if (classCount === 0 && !RECOGNIZED_LOADERS.has(loader)) {
    throw new Error(
      "Ce fichier n'est pas utilisable : l'archive ne contient ni classes Java valides ni métadonnées de mod reconnues."
    );
  }

  if (!RECOGNIZED_LOADERS.has(loader)) {
    throw new Error(
      "Ce fichier n'est pas utilisable comme mod : aucune signature Fabric, Forge, Quilt, LiteLoader ou plugin reconnue n'a été trouvée."
    );
  }

  return createBaseResult(filePath, stats, {
    java: javaInfo.javaVersion,
    classMajor: javaInfo.classMajor,
    buildJdk: javaInfo.buildJdk,
    loader,
    modLoader: modLoaderInfo.name,
    modLoaderVersion: modLoaderInfo.version,
    modLoaderBuild: modLoaderInfo.build,
    gameVersion: detectGameVersion(zip, loader),
    modVersion: extractDeclaredVersion(zip, loader),
    modName: detectModName(zip, filePath, loader),
    artifactType: loader === "LiteLoader" ? "Archive LiteLoader" : "Archive Java",
    isMcreator: mcreatorInfo.isMcreator,
    generator: mcreatorInfo.generator,
    generatorVersion: mcreatorInfo.version,
    generatorConfidence: mcreatorInfo.confidence,
    generatorReasons: mcreatorInfo.reasons,
    implementationTitle: manifest["Implementation-Title"] || null,
    implementationVersion: manifest["Implementation-Version"] || null,
    mainClass: manifest["Main-Class"] || null,
    entryCount: entries.length,
    classCount,
    dependencies: detectDependencies(zip, loader)
  });
}

function inspectClassFile(filePath) {
  const stats = fs.statSync(filePath);
  const buffer = fs.readFileSync(filePath);
  const classMajor = readClassVersion(buffer);

  if (!classMajor) {
    throw new Error("Ce fichier .class n'a pas un en-tête Java valide.");
  }

  return createBaseResult(filePath, stats, {
    java: mapJavaVersion(classMajor),
    classMajor,
    loader: "Classe Java isolée",
    modLoader: "Aucun mod loader détecté",
    artifactType: "Fichier .class",
    modName: path.parse(filePath).name,
    entryCount: 1,
    classCount: 1
  });
}

function inspectArtifact(filePath) {
  if (!filePath) {
    throw new Error("Choisis un fichier valide.");
  }

  if (!fs.existsSync(filePath)) {
    throw new Error("Le fichier n'existe plus.");
  }

  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".class") {
    return inspectClassFile(filePath);
  }

  if (isZipLike(filePath)) {
    return inspectArchive(filePath);
  }

  throw new Error("Format non supporté. Utilise un .jar, .zip, .class, .litemod ou .liteloadermod.");
}

module.exports = {
  inspectArtifact
};
