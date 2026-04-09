# Mod Version Inspector


A small Electron desktop app for analyzing Java build artifacts.


## Features


- modern interface with drag-and-drop
- Opening a file using Windows Explorer
- Support for `.jar`, `.zip`, `.class`, `.litemod` and `.liteloadermod`
- Detecting the Java version from the bytecode
- Detect the loader or plugin type when possible
- heuristic detection of mods created with MCreator
- Retrieve the game version and mod version, if available
- generating a migration plan, a porting workspace, and build stages
- generating loader metadata in stages (`mods.toml`, `fabric.mod.json`, `quilt.mod.json`, `plugin.yml`)
- toolchain profiles versioned by stage (`toolchain-profile.json`)
- scripts and guides for setting up the development environment (`init-stage.ps1`, `toolchain-guide.md`)
- scripts et guide globaux du workspace (`init-workspace.ps1`, `build-workspace.ps1`, `workspace-guide.md`)
- automatic conversion via the `Convert` button
- Heuristic source remapping for certain legacy Forge and Fabric names before the build
- Additional heuristic remapping across several Forge/Fabric lifecycles and registries
- stage-specific mapping profiles (`mapping-profile.json`) to prepare more accurate future MCP/SRG/Mojmap/Yarn remaps
- Enabling remap families based on `bridgeFromLegacy` and `sourcePackages` in the mappings profile
- Explicit diagnostics when a useful remap family is blocked by the stage profile
- Open the main output directly from the interface after clicking `Convert`
- Simple standardization of certain Fabric entry points and final recommendation following conversion


## Start


```powershell
npm install
npm start
```


## Tests


```powershell
npm test
```


## Notes


- Game version detection depends on the metadata contained in the `.jar`
- Very old or highly customized mods may not display all the information
- Java does not need to be installed on the machine for analysis
- The current remapping is still heuristic: it helps with common cases but does not yet replace a true MCP/SRG/Mojmap/Yarn remapping
