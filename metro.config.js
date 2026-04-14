// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const rootPattern = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

config.resolver.blockList = [
  new RegExp(`${rootPattern}[\\\\/]_external_[\\\\/].*`),
  new RegExp(`${rootPattern}[\\\\/]docs[\\\\/].*`),
  new RegExp(`${rootPattern}[\\\\/]supabase[\\\\/].*`),
  new RegExp(`${rootPattern}[\\\\/]android[\\\\/].*\\.cxx[\\\\/].*`),
  /.*[\\\/]\.git[\\\/].*/,
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-maps' && platform === 'web') {
    return {
      filePath: path.resolve(__dirname, 'lib/react-native-maps.web.ts'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
