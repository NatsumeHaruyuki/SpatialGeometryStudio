import { createRequire } from 'node:module';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { downloadArtifact } = require('@electron/get');
const { version } = require('electron/package.json');
const root = process.platform === 'win32' ? 'D:\\DevDep\\electron' : process.env.ELECTRON_CACHE;
if (!root) throw new Error('Set ELECTRON_CACHE to your chosen dependency directory.');
const destination = path.join(root, `electron${version.replaceAll('.', '_')}`);
const executable = process.platform === 'win32' ? 'electron.exe' : 'Electron.app/Contents/MacOS/Electron';
try { await access(path.join(destination, executable)); }
catch {
  const archive = await downloadArtifact({ version, artifactName: 'electron', platform: process.platform, arch: process.arch, cacheRoot: path.join(root, 'cache'), checksums: require('electron/checksums.json') });
  await mkdir(destination, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync('tar.exe', ['-xf', archive, '-C', destination], { stdio: 'inherit', windowsHide: true });
  } else throw new Error('On macOS use the standard Electron installation on the native build runner.');
}
await writeFile(path.join(path.dirname(require.resolve('electron/package.json')), 'path.txt'), executable);
console.log(`Electron runtime: ${destination}`);
