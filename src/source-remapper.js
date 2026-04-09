const { compareVersions } = require("./version-rules");

function applyTextReplacement(content, searchValue, replaceValue) {
  if (!content.includes(searchValue)) {
    return {
      nextContent: content,
      changed: false,
      count: 0
    };
  }

  const count = content.split(searchValue).length - 1;
  return {
    nextContent: content.split(searchValue).join(replaceValue),
    changed: true,
    count
  };
}

function applyRegexReplacement(content, pattern, replaceValue) {
  const matches = [...content.matchAll(pattern)];
  const nextContent = content.replace(pattern, replaceValue);
  return {
    nextContent,
    changed: nextContent !== content,
    count: matches.length
  };
}

function isForgeModernProfile(mappingProfile) {
  if (!mappingProfile) {
    return true;
  }

  return mappingProfile.mappingSystem === "mojmap" && mappingProfile.namespace === "official";
}

function isFabricModernProfile(mappingProfile) {
  if (!mappingProfile) {
    return true;
  }

  return mappingProfile.mappingSystem === "yarn" && mappingProfile.namespace === "intermediary-v2";
}

function hasLegacyBridge(mappingProfile, bridges) {
  if (!mappingProfile) {
    return true;
  }

  if (!Array.isArray(mappingProfile.bridgeFromLegacy)) {
    return true;
  }

  return bridges.some((bridge) => mappingProfile.bridgeFromLegacy.includes(bridge));
}

function hasSourcePackage(mappingProfile, packagePrefix) {
  if (!mappingProfile) {
    return true;
  }

  if (!Array.isArray(mappingProfile.sourcePackages)) {
    return true;
  }

  return mappingProfile.sourcePackages.some((entry) => entry.startsWith(packagePrefix) || packagePrefix.startsWith(entry));
}

function familyRules(family, rules) {
  return rules.map((rule) => ({
    ...rule,
    family
  }));
}

function collectFamilyDiagnostics({ content, relativePath, loader, targetGameVersion, mappingProfile = null }) {
  const diagnostics = [];

  if (loader === "forge") {
    const allowModernForgeRemap = isForgeModernProfile(mappingProfile);
    const canBridgeForgeLegacy = hasLegacyBridge(mappingProfile, ["mcp", "srg", "forge-legacy"]);
    const hasLifecyclePackage = hasSourcePackage(mappingProfile, "net.minecraftforge.fml.event.lifecycle");
    const hasRegistryPackage = hasSourcePackage(mappingProfile, "net.minecraftforge.registries");
    const hasWorldPackage = hasSourcePackage(mappingProfile, "net.minecraft.world.level");

    if (compareVersions(targetGameVersion, "1.13.0") >= 0 && /\bFML(?:Pre|Post)?InitializationEvent\b/.test(content)) {
      if (!allowModernForgeRemap || !canBridgeForgeLegacy || !hasLifecyclePackage) {
        diagnostics.push({
          relativePath,
          family: "forge.lifecycle",
          label: "Famille de remap Forge lifecycle bloquée",
          suggestion:
            "Le stage contient encore des événements lifecycle legacy, mais le profil de mappings actuel n'autorise pas ce remap automatique."
        });
      }
    }

    if (compareVersions(targetGameVersion, "1.13.0") >= 0 && /@GameRegistry\.ObjectHolder|GameRegistry\.ObjectHolder/.test(content)) {
      if (!allowModernForgeRemap || !canBridgeForgeLegacy || !hasRegistryPackage) {
        diagnostics.push({
          relativePath,
          family: "forge.registry-helpers",
          label: "Famille de remap Forge registry helper bloquée",
          suggestion:
            "ObjectHolder legacy a été détecté, mais le profil du stage n'autorise pas encore cette famille de remap."
        });
      }
    }

    if (compareVersions(targetGameVersion, "1.13.0") >= 0 && /\bGameRegistry\.findRegistry\s*\(/.test(content)) {
      if (!allowModernForgeRemap || !canBridgeForgeLegacy || !hasRegistryPackage) {
        diagnostics.push({
          relativePath,
          family: "forge.registry-helpers",
          label: "Famille de remap Forge registry helper bloquée",
          suggestion:
            "Des appels GameRegistry.findRegistry(...) existent encore, mais le profil du stage n'autorise pas leur conversion automatique vers ForgeRegistries."
        });
      }
    }

    if (compareVersions(targetGameVersion, "1.18.0") >= 0 && /\b(?:IBlockState|TileEntity|World)\b/.test(content)) {
      if (!allowModernForgeRemap || !canBridgeForgeLegacy || !hasWorldPackage) {
        diagnostics.push({
          relativePath,
          family: "forge.world",
          label: "Famille de remap Forge world bloquée",
          suggestion:
            "Des types monde legacy sont encore présents, mais le profil du stage ne permet pas de les traduire automatiquement vers BlockState/BlockEntity/Level."
        });
      }
    }
  }

  if (loader === "fabric") {
    const allowModernFabricRemap = isFabricModernProfile(mappingProfile);
    const canBridgeOldYarn = hasLegacyBridge(mappingProfile, ["old-yarn", "legacy-fabric", "fabric-intermediary"]);
    const hasRegistryPackage = hasSourcePackage(mappingProfile, "net.minecraft.registry");
    const hasUtilPackage = hasSourcePackage(mappingProfile, "net.minecraft.util");
    const hasEntrypointPackage = hasSourcePackage(mappingProfile, "net.fabricmc.api");

    if (compareVersions(targetGameVersion, "1.19.0") >= 0 && /\bRegistry\.(?:ITEM|BLOCK|ENTITY_TYPE|SOUND_EVENT|BIOME)\b|\bRegistry\.register\s*\(/.test(content)) {
      if (!allowModernFabricRemap || !canBridgeOldYarn || !hasRegistryPackage) {
        diagnostics.push({
          relativePath,
          family: "fabric.registry",
          label: "Famille de remap Fabric registry bloquée",
          suggestion:
            "Des accès Registry legacy existent encore, mais le profil de mappings ne permet pas ce passage automatique vers Registries."
        });
      }
    }

    if (compareVersions(targetGameVersion, "1.20.1") >= 0 && /\bnew Identifier\s*\(/.test(content)) {
      if (!allowModernFabricRemap || !canBridgeOldYarn || !hasUtilPackage) {
        diagnostics.push({
          relativePath,
          family: "fabric.identifiers",
          label: "Famille de remap Fabric identifier bloquée",
          suggestion:
            "Des constructions new Identifier(...) sont présentes, mais le profil du stage n'autorise pas encore ce remap vers Identifier.of."
        });
      }
    }

    if (compareVersions(targetGameVersion, "1.14.4") >= 0 && /\bimplements\s+ModInitializer\b|\bimplements\s+ClientModInitializer\b/.test(content)) {
      if (!allowModernFabricRemap || !canBridgeOldYarn || !hasEntrypointPackage) {
        diagnostics.push({
          relativePath,
          family: "fabric.entrypoints",
          label: "Famille de remap Fabric entrypoint bloquée",
          suggestion:
            "Des entrypoints Fabric existent, mais le profil du stage n'autorise pas encore leur normalisation automatique."
        });
      }
    }
  }

  return diagnostics;
}

function buildForgeRules(targetGameVersion, mappingProfile) {
  const rules = [];
  const allowModernForgeRemap = isForgeModernProfile(mappingProfile);
  const canBridgeForgeLegacy = hasLegacyBridge(mappingProfile, ["mcp", "srg", "forge-legacy"]);

  if (
    allowModernForgeRemap &&
    canBridgeForgeLegacy &&
    hasSourcePackage(mappingProfile, "net.minecraftforge.fml.event.lifecycle") &&
    compareVersions(targetGameVersion, "1.13.0") >= 0
  ) {
    rules.push(
      ...familyRules("forge.lifecycle", [
      {
        kind: "text",
        from: "import cpw.mods.fml.common.event.FMLPreInitializationEvent;",
        to: "import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;",
        label: "Import FMLPreInitializationEvent remappé vers FMLCommonSetupEvent"
      },
      {
        kind: "text",
        from: "import cpw.mods.fml.common.event.FMLInitializationEvent;",
        to: "import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;",
        label: "Import FMLInitializationEvent remappé vers FMLCommonSetupEvent"
      },
      {
        kind: "text",
        from: "import cpw.mods.fml.common.event.FMLPostInitializationEvent;",
        to: "import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;",
        label: "Import FMLPostInitializationEvent remappé vers FMLCommonSetupEvent"
      },
      {
        kind: "text",
        from: "import net.minecraftforge.fml.common.event.FMLPreInitializationEvent;",
        to: "import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;",
        label: "Import FMLPreInitializationEvent Forge remappé vers FMLCommonSetupEvent"
      },
      {
        kind: "text",
        from: "import net.minecraftforge.fml.common.event.FMLInitializationEvent;",
        to: "import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;",
        label: "Import FMLInitializationEvent Forge remappé vers FMLCommonSetupEvent"
      },
      {
        kind: "text",
        from: "import net.minecraftforge.fml.common.event.FMLPostInitializationEvent;",
        to: "import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;",
        label: "Import FMLPostInitializationEvent Forge remappé vers FMLCommonSetupEvent"
      },
      {
        kind: "text",
        from: "import net.minecraftforge.event.RegistryEvent;",
        to: "import net.minecraftforge.registries.RegisterEvent;",
        label: "Import RegistryEvent remappé vers RegisterEvent"
      },
      {
        kind: "regex",
        from: /\bFMLPreInitializationEvent\b/g,
        to: "FMLCommonSetupEvent",
        label: "Type FMLPreInitializationEvent remappé vers FMLCommonSetupEvent"
      },
      {
        kind: "regex",
        from: /\bFMLInitializationEvent\b/g,
        to: "FMLCommonSetupEvent",
        label: "Type FMLInitializationEvent remappé vers FMLCommonSetupEvent"
      },
      {
        kind: "regex",
        from: /\bFMLPostInitializationEvent\b/g,
        to: "FMLCommonSetupEvent",
        label: "Type FMLPostInitializationEvent remappé vers FMLCommonSetupEvent"
      },
      {
        kind: "regex",
        from: /\bRegistryEvent\.Register\s*<[^>]+>/g,
        to: "RegisterEvent",
        label: "Type RegistryEvent.Register<T> remappé vers RegisterEvent"
      }
      ])
    );
  }

  if (
    allowModernForgeRemap &&
    canBridgeForgeLegacy &&
    hasSourcePackage(mappingProfile, "net.minecraftforge.event") &&
    compareVersions(targetGameVersion, "1.13.0") >= 0
  ) {
    rules.push(
      ...familyRules("forge.events", [
        {
          kind: "text",
          from: "import cpw.mods.fml.common.gameevent.TickEvent;",
          to: "import net.minecraftforge.event.TickEvent;",
          label: "Import TickEvent legacy remappé vers package Forge moderne"
        },
        {
          kind: "text",
          from: "import net.minecraftforge.fml.common.gameevent.TickEvent;",
          to: "import net.minecraftforge.event.TickEvent;",
          label: "Import TickEvent Forge remappé vers package moderne"
        },
        {
          kind: "text",
          from: "import cpw.mods.fml.common.eventhandler.EventPriority;",
          to: "import net.minecraftforge.eventbus.api.EventPriority;",
          label: "Import EventPriority legacy remappé vers eventbus moderne"
        },
        {
          kind: "text",
          from: "import net.minecraftforge.fml.common.eventhandler.EventPriority;",
          to: "import net.minecraftforge.eventbus.api.EventPriority;",
          label: "Import EventPriority Forge remappé vers eventbus moderne"
        }
      ])
    );
  }

  if (
    allowModernForgeRemap &&
    canBridgeForgeLegacy &&
    hasSourcePackage(mappingProfile, "net.minecraftforge.registries") &&
    compareVersions(targetGameVersion, "1.13.0") >= 0
  ) {
    rules.push(
      ...familyRules("forge.registry-helpers", [
        {
          kind: "text",
          from: "import cpw.mods.fml.common.registry.GameRegistry.ObjectHolder;",
          to: "import net.minecraftforge.registries.ObjectHolder;",
          label: "Import ObjectHolder legacy remappé vers net.minecraftforge.registries"
        },
        {
          kind: "text",
          from: "import net.minecraftforge.fml.common.registry.GameRegistry.ObjectHolder;",
          to: "import net.minecraftforge.registries.ObjectHolder;",
          label: "Import ObjectHolder Forge remappé vers net.minecraftforge.registries"
        },
        {
          kind: "regex",
          from: /@GameRegistry\.ObjectHolder\s*\(/g,
          to: "@ObjectHolder(",
          label: "Annotation GameRegistry.ObjectHolder remappée vers ObjectHolder"
        },
        {
          kind: "text",
          from: "import cpw.mods.fml.common.registry.GameRegistry;",
          to: "import net.minecraftforge.registries.ForgeRegistries;",
          label: "Import GameRegistry legacy remappé vers ForgeRegistries"
        },
        {
          kind: "text",
          from: "import net.minecraftforge.fml.common.registry.GameRegistry;",
          to: "import net.minecraftforge.registries.ForgeRegistries;",
          label: "Import GameRegistry Forge remappé vers ForgeRegistries"
        },
        {
          kind: "regex",
          from: /\bGameRegistry\.findRegistry\s*\(\s*Item\.class\s*\)/g,
          to: "ForgeRegistries.ITEMS",
          label: "GameRegistry.findRegistry(Item.class) remappé vers ForgeRegistries.ITEMS"
        },
        {
          kind: "regex",
          from: /\bGameRegistry\.findRegistry\s*\(\s*Block\.class\s*\)/g,
          to: "ForgeRegistries.BLOCKS",
          label: "GameRegistry.findRegistry(Block.class) remappé vers ForgeRegistries.BLOCKS"
        }
      ])
    );
  }

  if (
    allowModernForgeRemap &&
    canBridgeForgeLegacy &&
    hasSourcePackage(mappingProfile, "net.minecraft.world.level") &&
    compareVersions(targetGameVersion, "1.18.0") >= 0
  ) {
    rules.push(
      ...familyRules("forge.world", [
      {
        kind: "text",
        from: "import net.minecraft.block.state.IBlockState;",
        to: "import net.minecraft.world.level.block.state.BlockState;",
        label: "Import IBlockState remappé vers BlockState moderne"
      },
      {
        kind: "text",
        from: "import net.minecraft.tileentity.TileEntity;",
        to: "import net.minecraft.world.level.block.entity.BlockEntity;",
        label: "Import TileEntity remappé vers BlockEntity"
      },
      {
        kind: "text",
        from: "import net.minecraft.world.World;",
        to: "import net.minecraft.world.level.Level;",
        label: "Import World remappé vers Level"
      },
      {
        kind: "regex",
        from: /\bIBlockState\b/g,
        to: "BlockState",
        label: "Type IBlockState remappé vers BlockState"
      },
      {
        kind: "regex",
        from: /\bTileEntity\b/g,
        to: "BlockEntity",
        label: "Type TileEntity remappé vers BlockEntity"
      },
      {
        kind: "regex",
        from: /\bWorld\b/g,
        to: "Level",
        label: "Type World remappé vers Level"
      }
      ])
    );
  }

  return rules;
}

function buildFabricRules(targetGameVersion, mappingProfile) {
  const rules = [];
  const allowModernFabricRemap = isFabricModernProfile(mappingProfile);
  const canBridgeOldYarn = hasLegacyBridge(mappingProfile, ["old-yarn", "legacy-fabric", "fabric-intermediary"]);

  if (
    allowModernFabricRemap &&
    canBridgeOldYarn &&
    hasSourcePackage(mappingProfile, "net.minecraft.registry") &&
    compareVersions(targetGameVersion, "1.19.0") >= 0
  ) {
    rules.push(
      ...familyRules("fabric.registry", [
      {
        kind: "text",
        from: "import net.minecraft.util.registry.Registry;",
        to: "import net.minecraft.registry.Registry;\nimport net.minecraft.registry.Registries;",
        label: "Import Registry Yarn remappé vers namespace moderne"
      },
      {
        kind: "text",
        from: "import net.minecraft.util.registry.RegistryKey;",
        to: "import net.minecraft.registry.RegistryKey;",
        label: "Import RegistryKey Yarn remappé vers namespace moderne"
      },
      {
        kind: "regex",
        from: /\bRegistry\.(ITEM|BLOCK|ENTITY_TYPE|SOUND_EVENT|BIOME)\b/g,
        to: "Registries.$1",
        label: "Accès Registry.* remappé vers Registries.*"
      },
      {
        kind: "regex",
        from: /\bRegistry\.register\s*\(\s*Registry\.(ITEM|BLOCK|ENTITY_TYPE|SOUND_EVENT|BIOME)\s*,/g,
        to: "Registry.register(Registries.$1,",
        label: "Appel Registry.register remappé vers Registries.*"
      }
      ])
    );
  }

  if (
    allowModernFabricRemap &&
    canBridgeOldYarn &&
    hasSourcePackage(mappingProfile, "net.minecraft.util") &&
    compareVersions(targetGameVersion, "1.20.1") >= 0
  ) {
    rules.push(
      ...familyRules("fabric.identifiers", [
        {
          kind: "regex",
          from: /\bnew Identifier\s*\(\s*MODID\s*,/g,
          to: "Identifier.of(MODID,",
          label: "Construction new Identifier(MODID, ...) remappée vers Identifier.of"
        },
        {
          kind: "regex",
          from: /\bnew Identifier\s*\(\s*"([^"]+)"\s*,/g,
          to: 'Identifier.of("$1",',
          label: "Construction new Identifier(namespace, ...) remappée vers Identifier.of"
        }
      ])
    );
  }

  if (
    allowModernFabricRemap &&
    canBridgeOldYarn &&
    hasSourcePackage(mappingProfile, "net.fabricmc.api") &&
    compareVersions(targetGameVersion, "1.14.4") >= 0
  ) {
    rules.push(
      ...familyRules("fabric.entrypoints", [
        {
          kind: "text",
          from: "implements ModInitializer, DedicatedServerModInitializer",
          to: "implements ModInitializer, DedicatedServerModInitializer",
          label: "Entrypoints Fabric remappés et vérifiés"
        },
        {
          kind: "text",
          from: "implements DedicatedServerModInitializer, ModInitializer",
          to: "implements ModInitializer, DedicatedServerModInitializer",
          label: "Ordre des entrypoints serveur Fabric remappé"
        },
        {
          kind: "text",
          from: "implements ClientModInitializer, DedicatedServerModInitializer, ModInitializer",
          to: "implements ModInitializer, ClientModInitializer, DedicatedServerModInitializer",
          label: "Ordre des entrypoints Fabric triple remappé"
        },
        {
          kind: "text",
          from: "implements ClientModInitializer, ModInitializer",
          to: "implements ModInitializer, ClientModInitializer",
          label: "Ordre des entrypoints Fabric client remappé"
        }
      ])
    );
  }

  return rules;
}

function getRemapRules({ loader, targetGameVersion, mappingProfile = null }) {
  if (!targetGameVersion) {
    return [];
  }

  if (loader === "forge") {
    return buildForgeRules(targetGameVersion, mappingProfile);
  }

  if (loader === "fabric") {
    return buildFabricRules(targetGameVersion, mappingProfile);
  }

  return [];
}

function applySourceRemap({ loader, targetGameVersion, mappingProfile = null, filePath, content }) {
  const rules = getRemapRules({ loader, targetGameVersion, mappingProfile });
  let nextContent = content;
  const applied = [];

  rules.forEach((rule) => {
    const outcome =
      rule.kind === "text"
        ? applyTextReplacement(nextContent, rule.from, rule.to)
        : applyRegexReplacement(nextContent, rule.from, rule.to);

    if (outcome.changed) {
      nextContent = outcome.nextContent;
      applied.push({
        family: rule.family || "generic",
        label: rule.label,
        count: outcome.count
      });
    }
  });

  return {
    filePath,
    changed: nextContent !== content,
    content: nextContent,
    applied,
    mappingProfile
  };
}

module.exports = {
  applySourceRemap,
  collectFamilyDiagnostics
};
