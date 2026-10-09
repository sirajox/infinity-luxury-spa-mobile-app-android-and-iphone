const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 52+ configures npm/yarn/pnpm monorepos automatically (watch folders + node_modules resolution).
module.exports = getDefaultConfig(__dirname);
