const fs = require('node:fs');
const { version } = require('./package.json');
const runtime = process.env.ELECTRON_OVERRIDE_DIST_PATH || 'D:/DevDep/electron/electron45_4_1';
module.exports = {
  appId: 'studio.spatialgeometry.teaching',
  productName: 'Spatial Geometry Studio',
  executableName: 'SpatialGeometryStudio',
  artifactName: 'SpatialGeometryStudio-${version}-${os}-${arch}.${ext}',
  directories: { output: `release-v${version}`, buildResources: 'build' },
  files: ['dist/**', 'dist-electron/**', 'package.json', 'build/app.png', 'prompts/multimodalToGsceneV1.txt'],
  extraResources: [{ from: 'examples', to: 'samples' }],
  asar: true,
  npmRebuild: false,
  ...(process.platform === 'win32' && fs.existsSync(runtime) ? { electronDist: runtime } : {}),
  win: { target: [{ target: 'portable', arch: ['x64'] }], icon: 'build/app.ico', signExecutable: false, signAndEditExecutable: true, requestedExecutionLevel: 'asInvoker' },
  portable: { artifactName: 'SpatialGeometryStudio.exe', requestExecutionLevel: 'user' },
  mac: { target: 'zip', category: 'public.app-category.education', identity: '-', hardenedRuntime: false },
};
