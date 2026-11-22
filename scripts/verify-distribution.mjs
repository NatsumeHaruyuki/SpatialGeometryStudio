import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values } = parseArgs({ options: { arch: { type: 'string', default: process.arch } } });
const platform = process.platform;
assert.ok(['win32', 'darwin'].includes(platform), 'Run on a native Windows or macOS host');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const label = platform === 'win32' ? 'Windows' : 'macOS';
const name = `SpatialGeometryStudio-${label}-v${version}-${values.arch}`;
const release = path.resolve(`release-v${version}`);
const archive = path.join(release, `${name}.zip`);
await access(archive);
const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
assert.equal((await readFile(`${archive}.sha256`, 'utf8')).trim(), `${digest}  ${name}.zip`);
const listing = execFileSync(platform === 'win32' ? 'tar.exe' : '/usr/bin/unzip', platform === 'win32' ? ['-tf', archive] : ['-Z1', archive], { encoding: 'utf8', windowsHide: true });
assert.doesNotMatch(listing, /(?:^|\/)(?:GeometryTeachingData|node_modules|\.qa|\.git)\//m);
assert.ok(listing.includes('samples/questionConeV2.gscene'), 'Latest v0.2 question-import sample must be included');

await mkdir('.qa', { recursive: true });
const testRoot = await mkdtemp(path.resolve('.qa/distribution-'));
const relocated = path.join(testRoot, '中文 移动应用');
await mkdir(relocated);
if (platform === 'win32') execFileSync('tar.exe', ['-xf', archive, '-C', relocated], { windowsHide: true });
else execFileSync('/usr/bin/ditto', ['-x', '-k', archive, relocated]);
const folder = path.join(relocated, name);
const manifest = JSON.parse(await readFile(path.join(folder, 'version.json'), 'utf8'));
assert.equal(manifest.version, version);
assert.equal(manifest.platform, platform);
assert.equal(manifest.architecture, values.arch);
let executable;
if (platform === 'win32') {
  executable = path.join(folder, 'SpatialGeometryStudio.exe');
  await access(path.join(folder, 'resources', 'app.asar'));
  await access(path.join(folder, 'icudtl.dat'));
} else {
  const bundle = path.join(folder, 'SpatialGeometryStudio.app');
  const binary = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', path.join(bundle, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();
  executable = path.join(bundle, 'Contents', 'MacOS', binary);
  const architectures = values.arch === 'universal' ? ['arm64', 'x86_64'] : [values.arch === 'x64' ? 'x86_64' : values.arch];
  execFileSync('/usr/bin/lipo', [executable, '-verify_arch', ...architectures]);
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
  await access(path.join(bundle, 'Contents', 'Resources', 'app.asar'));
}

const server = createServer();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const env = { ...process.env, PATH: platform === 'win32' ? `${process.env.SystemRoot}\\System32` : '/usr/bin:/bin:/usr/sbin:/sbin', SGS_USER_DATA_ROOT: path.join(testRoot, 'profile') };
for (const key of ['ELECTRON_OVERRIDE_DIST_PATH', 'ELECTRON_RUN_AS_NODE', 'SGS_DEV_SERVER', 'SGS_DATA_ROOT', 'SGS_SAMPLE', 'PORTABLE_EXECUTABLE_DIR']) delete env[key];
const launcher = spawn(executable, [`--remote-debugging-port=${port}`], { cwd: folder, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
launcher.stdout.on('data', chunk => { output = (output + chunk).slice(-16000); });
launcher.stderr.on('data', chunk => { output = (output + chunk).slice(-16000); });
let spawnError;
launcher.on('error', error => { spawnError = error; });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (spawnError) throw spawnError;
    if (launcher.exitCode !== null) throw new Error(`Packaged app exited with ${launcher.exitCode}: ${output}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, `Embedded runtime did not start: ${output}`);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages().find(page => page.url().startsWith('file:')) ?? context.pages()[0];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.waitForSelector('.point-label');
  assert.ok(page.url().includes('app.asar'), 'Must load packaged sources');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.match(await page.locator('.status-bar').innerText(), new RegExp(`${label} v0\\.2`));
  const info = await page.evaluate(() => window.studio.dataInfo());
  assert.equal(info.mode, 'portable');
  assert.equal(info.path, path.join(folder, 'GeometryTeachingData'));
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.point-label');
  assert.equal((await page.evaluate(() => window.studio.dataInfo())).path, info.path);
  await page.getByRole('button', { name: '三棱柱', exact: true }).click();
  assert.equal(await page.getByText('二面角 120.00°', { exact: true }).count(), 1);
  await page.getByRole('button', { name: '双圆锥', exact: true }).click();
  for (const [button, kind] of [['圆截面', '圆'], ['椭圆截面', '椭圆'], ['抛物线截面', '抛物线'], ['双曲线截面', '双曲线']]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    assert.equal(await page.locator('.round-section-result strong').innerText(), kind);
  }
  await page.getByRole('button', { name: '三棱锥', exact: true }).click();
  for (const button of ['外接球', '内切球']) {
    await page.getByRole('button', { name: button, exact: true }).click();
    for (const id of ['A', 'B', 'C', 'D']) await page.getByRole('button', { name: `选择点 ${id}`, exact: true }).click();
  }
  await page.waitForFunction(() => document.querySelectorAll('.sphere-center-label').length === 2);
  await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click();
  await page.getByRole('button', { name: '一键复制 Prompt', exact: true }).click();
  await page.getByText('完整 Prompt 已复制到剪贴板。', { exact: true }).waitFor();
  await page.getByLabel('项目 JSON', { exact: true }).fill(await readFile(path.join(folder, 'samples', 'questionConeV2.json'), 'utf8'));
  await page.getByRole('button', { name: '校验并导入', exact: true }).click();
  await page.getByText('JSON 校验通过，已导入项目', { exact: true }).waitFor();
  assert.equal(await page.locator('.fatal-error, .canvas-error').count(), 0);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.resolve(`.qa/distribution-${platform}-${values.arch}.png`), scale: 'css' });
  await page.evaluate(() => window.studio.setDirty(false));
  console.log(`PASS ${label} ${values.arch}: verified ZIP checksum and contents; relocated embedded runtime launches without developer tools; renderer reloads offline; geometry, spheres, v2 JSON import, bundled Prompt and portable data work.`);
  console.log(`Verified distribution: ${path.join(release, name)}`);
} finally {
  if (browser) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.evaluate(() => window.studio?.setDirty(false)).catch(() => {});
      await page.close().catch(() => {});
    }
    await browser.close().catch(() => {});
  }
  if (launcher.exitCode === null) launcher.kill();
}
