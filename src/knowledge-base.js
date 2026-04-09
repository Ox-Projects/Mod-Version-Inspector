const { compareVersions, getVersionRuleNotes } = require("./version-rules");

const JAVA_RULES = [
  {
    java: "Java 8",
    notes: [
      "Base historique de nombreux mods 1.7.10 à 1.16.5.",
      "Attention aux APIs récentes si le code source vient d'une version moderne."
    ]
  },
  {
    java: "Java 16",
    notes: ["Transition intermédiaire utilisée autour de Minecraft 1.17."]
  },
  {
    java: "Java 17",
    notes: [
      "Base moderne de nombreuses toolchains Minecraft 1.18+.",
      "Vérifier les modules Java et les changements de réflexion."
    ]
  },
  {
    java: "Java 21",
    notes: [
      "Cible actuelle de versions très récentes du jeu.",
      "Peut nécessiter une mise à jour de Gradle, Loom ou ForgeGradle."
    ]
  }
];

const LOADER_RULES = {
  Fabric: [
    "Les points d'entrée passent par fabric.mod.json et des ModInitializer / ClientModInitializer.",
    "Les mappings Yarn doivent rester cohérents avec la version cible."
  ],
  Forge: [
    "Les registries, événements et metadata changent sensiblement selon les grandes branches Forge.",
    "Les gros sauts 1.12.2 -> 1.16.5 et 1.16.5 -> 1.18.2 demandent souvent des adaptations structurantes."
  ],
  Quilt: [
    "Vérifier Quilt Loader, QSL et la structure de quilt.mod.json.",
    "Certaines libs Fabric restent valables, d'autres doivent être remplacées."
  ],
  LiteLoader: [
    "Écosystème legacy : viser souvent une étape intermédiaire avant migration vers des loaders modernes."
  ],
  "Bukkit / Spigot / Paper": [
    "Contrôler plugin.yml, commandes, listeners et l'API Paper si utilisée.",
    "Les paliers de version Paper peuvent casser les hooks NMS."
  ]
};

const GENERATOR_RULES = {
  MCreator: [
    "Le code généré par MCreator est souvent très verbeux et demande un tri avant un vrai portage manuel.",
    "Les dossiers procedures, elements et la structure ModElements méritent une attention particulière.",
    "Une migration de version importante peut être plus simple en régénérant certaines briques dans MCreator puis en réintégrant le code métier."
  ]
};

const GAME_BREAKPOINTS = [
  {
    from: "1.7.10",
    to: "1.12.2",
    notes: [
      "Passage fréquent par MCP / Forge legacy.",
      "Nombreux changements de mappings et d'organisation des assets."
    ]
  },
  {
    from: "1.12.2",
    to: "1.16.5",
    notes: [
      "Grosse refonte des registries, tags, data packs et du rendu.",
      "Les métadonnées et les events changent beaucoup."
    ]
  },
  {
    from: "1.16.5",
    to: "1.18.2",
    notes: [
      "Bascule forte vers Java 17.",
      "World height, génération de monde et plusieurs APIs internes changent."
    ]
  },
  {
    from: "1.20.1",
    to: "1.21.1",
    notes: [
      "Vérifier les toolchains loader et l'évolution des mappings récents."
    ]
  }
];

function getJavaNotes(java) {
  return JAVA_RULES.find((entry) => entry.java === java)?.notes || [];
}

function getLoaderNotes(loader) {
  return LOADER_RULES[loader] || [];
}

function getBreakpointNotes(staircase) {
  const notes = [];
  for (let index = 1; index < (staircase || []).length; index += 1) {
    const from = staircase[index - 1];
    const to = staircase[index];
    const matching = GAME_BREAKPOINTS.find(
      (entry) =>
        compareVersions(from, entry.from) >= 0 &&
        compareVersions(to, entry.to) >= 0 &&
        compareVersions(to, from) >= 0
    );
    if (matching) {
      notes.push(...matching.notes);
    }
  }
  return Array.from(new Set(notes));
}

function getGeneratorNotes(generator) {
  return GENERATOR_RULES[generator] || [];
}

function buildKnowledgeContext({ targetLoader, targetJava, staircase, generator, targetGameVersion }) {
  return {
    javaNotes: getJavaNotes(targetJava),
    loaderNotes: getLoaderNotes(targetLoader),
    breakpointNotes: getBreakpointNotes(staircase),
    generatorNotes: getGeneratorNotes(generator),
    versionNotes: getVersionRuleNotes({
      loader: String(targetLoader || "").toLowerCase().includes("forge")
        ? "forge"
        : String(targetLoader || "").toLowerCase().includes("fabric")
          ? "fabric"
          : "generic",
      targetGameVersion
    })
  };
}

module.exports = {
  buildKnowledgeContext
};
