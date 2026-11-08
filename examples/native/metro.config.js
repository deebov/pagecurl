// Uses @pagecurl/react-native as built in packages/react-native (run `bun run build` at the root
// first). What the package imports (React, React Native, Skia) is resolved from this app, so
// there is only one copy of each.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const pkg = path.resolve(__dirname, '../../packages/react-native');
const app = path.join(__dirname, 'index.ts');
const config = getDefaultConfig(__dirname);

config.watchFolders = [pkg];
config.resolver.extraNodeModules = { '@pagecurl/react-native': pkg };
config.resolver.resolveRequest = (context, name, platform) => {
  const fromPackage = context.originModulePath.startsWith(pkg + path.sep) && !name.startsWith('.');
  return context.resolveRequest(
    fromPackage ? { ...context, originModulePath: app } : context,
    name,
    platform,
  );
};

module.exports = config;
