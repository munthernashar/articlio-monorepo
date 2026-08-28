const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

// Add workspace packages to Metro resolution
const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
]

config.watchFolders = [
  path.resolve(workspaceRoot, 'packages')
]

module.exports = config