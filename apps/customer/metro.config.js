// Metro — monorepo ayari (docs/03 §1.2): watchFolders = repo koku, symlink/pnpm cozumu.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Repo kokunu izle (paylasilan packages/* degisikliklerini yakala).
config.watchFolders = [workspaceRoot];

// pnpm sıkı node_modules: hem app hem kok node_modules cozulebilmeli.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
