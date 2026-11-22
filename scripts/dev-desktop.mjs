import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
if (process.platform === 'win32' && !process.env.ELECTRON_OVERRIDE_DIST_PATH) process.env.ELECTRON_OVERRIDE_DIST_PATH = 'D:\\DevDep\\electron\\electron45_4_1';
if (!existsSync('dist-electron/main.cjs')) { const result = spawn(process.execPath, ['scripts/build-electron.mjs'], { stdio: 'inherit', windowsHide: true }); await new Promise((resolve, reject) => result.on('exit', code => code === 0 ? resolve() : reject(new Error('Desktop build failed')))); }
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort'], { stdio: 'inherit', windowsHide: true });
let ready = false;
for (let attempt = 0; attempt < 80; attempt++) { try { const result = await fetch('http://127.0.0.1:5173/'); if (result.ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 150)); }
if (!ready) { vite.kill(); throw new Error('Development server did not start'); }
const electron = spawn(require('electron'), ['.'], { stdio: 'inherit', env: { ...process.env, SGS_DEV_SERVER: 'http://127.0.0.1:5173' } });
electron.on('exit', code => { vite.kill(); process.exit(code ?? 0); });
process.on('SIGINT', () => { electron.kill(); vite.kill(); });
