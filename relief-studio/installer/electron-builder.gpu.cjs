const base = require('../package.json').build;
module.exports = {
  ...base,
  appId: process.env.RELIEF_INSTALLER_TEST_ID || base.appId,
  directories: { output: process.env.RELIEF_GPU_OUTPUT || 'release/gpu-complete' },
  artifactName: 'Relief-Studio-Complete-Setup-${version}.${ext}',
  extraResources: [
    { from: 'engine-dist/relief-engine', to: 'engine' },
    { from: 'samples', to: 'samples' },
    { from: 'licenses', to: 'licenses' },
    { from: 'build/gpu-setup', to: 'gpu-setup' },
  ],
  nsis: { ...base.nsis, include: 'installer/gpu-installer.nsh', installerLanguages: ['zh_CN'], allowElevation: false },
};
