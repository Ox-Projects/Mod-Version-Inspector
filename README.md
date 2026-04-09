# Mod Version Inspector

Petite app desktop Electron pour analyser des artefacts Java de mod.

## Fonctions

- interface moderne avec drag-and-drop
- ouverture de fichier via l'explorateur Windows
- prise en charge des `.jar`, `.zip`, `.class`, `.litemod` et `.liteloadermod`
- détection de la version Java à partir du bytecode
- détection du loader ou type de plugin quand possible
- détection heuristique des mods générés avec MCreator
- extraction de la version du jeu et de la version du mod si elles sont présentes
- génération d'un plan de migration, d'un workspace de portage et de stages de build
- génération des métadonnées de loader dans les stages (`mods.toml`, `fabric.mod.json`, `quilt.mod.json`, `plugin.yml`)
- profils de toolchain versionnés par stage (`toolchain-profile.json`)
- scripts et guides d'initialisation de stage (`init-stage.ps1`, `toolchain-guide.md`)
- scripts et guide globaux du workspace (`init-workspace.ps1`, `build-workspace.ps1`, `workspace-guide.md`)
- flux de conversion automatique via un bouton `Convertir`
- remapping source heuristique sur certains noms legacy Forge et Fabric avant build
- remapping heuristique supplémentaire sur quelques cycles de vie et registries Forge/Fabric
- profil de mappings par stage (`mapping-profile.json`) pour préparer de futurs remaps MCP/SRG/Mojmap/Yarn plus précis
- activation des familles de remap selon `bridgeFromLegacy` et `sourcePackages` du profil de mappings
- diagnostics explicites quand une famille de remap utile est bloquée par le profil du stage
- ouverture directe de la sortie principale depuis l'interface après `Convertir`
- normalisation simple de certains entrypoints Fabric et recommandation finale après conversion

## Lancer

```powershell
npm install
npm start
```

## Tests

```powershell
npm test
```

## Notes

- la detection de version du jeu depend des metadonnees presentes dans le `.jar`
- les mods tres anciens ou tres custom peuvent ne pas exposer toutes les informations
- Java n'a pas besoin d'être installé sur la machine pour l'analyse
- le remapping actuel reste heuristique : il aide sur des cas fréquents mais ne remplace pas encore un vrai remapping MCP/SRG/Mojmap/Yarn
