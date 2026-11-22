import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const release = path.resolve(`release-v${version}`);
const prefix = `GeometryTeaching-Windows-x64-v${version}`;
const expected = ['SpatialGeometryStudio.exe', 'README.txt', 'version.json', ...['cube', 'tetrahedron', 'prism', 'motion', 'quadPyramid', 'cylinder', 'cone', 'doubleCone', 'tetrahedronSpheres'].map(id => `samples/${id}.gscene`)].map(entry => `${prefix}/${entry}`).sort();
const listing = execFileSync('tar.exe', ['-tf', path.join(release, `${prefix}.zip`)], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).sort();
assert.deepEqual(listing, expected);
console.log(`PASS ZIP contains exactly ${expected.length} public release files, excluding user data.`);
const root = path.resolve(`.qa/v${version} 中文 便携运行`);
await mkdir(root, { recursive: true });
const executable = path.join(root, 'SpatialGeometryStudio.exe');
await copyFile(path.join(release, 'SpatialGeometryStudio.exe'), executable);
const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const environment = { ...process.env, PATH: `${process.env.SystemRoot}\\System32`, SGS_USER_DATA_ROOT: path.resolve('.qa/portable-user') };
delete environment.ELECTRON_OVERRIDE_DIST_PATH;
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.SGS_DEV_SERVER;
delete environment.SGS_DATA_ROOT;
const launcher = spawn(executable, [`--remote-debugging-port=${port}`], { cwd: root, env: environment, windowsHide: true, stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 200; i++) {
    try { const response = await fetch(`http://127.0.0.1:${port}/json/version`); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Portable executable must start its own embedded runtime');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().startsWith('file:')) ?? context.pages()[0];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  await page.waitForSelector('.point-label');
  assert.ok(page.url().includes('app.asar'), 'Must load the packaged app, not project sources');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const info = await page.evaluate(() => window.studio.dataInfo());
  assert.equal(info.path, path.join(root, 'GeometryTeachingData'));
  assert.equal(info.mode, 'portable');
  await context.setOffline(true);
  await page.screenshot({ path: `docs/portable-preview-v${version}.png`, scale: 'css' });
  console.log('PASS Real portable EXE starts from a Chinese path containing spaces, with system-only PATH and no external Electron path.');
  await page.getByRole('button', { name: '三棱柱', exact: true }).click();
  assert.equal(await page.getByText('二面角 120.00°', { exact: true }).count(), 1);
  await page.getByRole('button', { name: '双圆锥', exact: true }).click();
  for (const [label, kind] of [['圆截面', '圆'], ['椭圆截面', '椭圆'], ['抛物线截面', '抛物线'], ['双曲线截面', '双曲线']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await page.locator('.round-section-result strong').innerText(), kind);
  }
  await page.screenshot({ path: `docs/portable-double-cone-v${version}.png`, scale: 'css' });
  await page.getByRole('button', { name: '三棱锥', exact: true }).click();
  for (const name of ['外接球', '内切球']) {
    await page.getByRole('button', { name, exact: true }).click();
    for (const id of ['A', 'B', 'C', 'D']) await page.getByRole('button', { name: `选择点 ${id}`, exact: true }).click();
  }
  await page.waitForFunction(() => document.querySelectorAll('.sphere-center-label').length === 2);
  for (const kind of ['circumsphere', 'insphere']) assert.match(await page.getByTestId(`construction-${kind}`).innerText(), /R = .+球心/);
  assert.equal(await page.locator('.sphere-radius-label').count(), 2);
  await page.screenshot({ path: `docs/portable-spheres-v${version}.png`, scale: 'css' });
  console.log('PASS Both four-point sphere tools render centers and radii in the actual packaged app.');
  await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click();
  await page.getByRole('button', { name: '一键复制 Prompt', exact: true }).click();
  await page.getByText('完整 Prompt 已复制到剪贴板。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  assert.equal(await page.locator('.fatal-error, .canvas-error').count(), 0);
  await page.getByRole('button', { name: '数据目录设置', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.path-output')?.textContent.includes('中文 便携运行'));
  assert.match(await page.locator('.path-output').innerText(), /中文 便携运行/);
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.studio.setDirty(false));
  console.log('PASS Packaged 120° angle, four conic presets, four-point spheres, bundled prompt clipboard and local IPC work offline.');
  const manifest = JSON.parse(await readFile(path.join(release, prefix, 'version.json'), 'utf8'));
  assert.equal(manifest.schema_version, 1);
} finally {
  if (browser) {
    for (const page of browser.contexts()[0].pages()) { await page.evaluate(() => window.studio?.setDirty(false)).catch(() => {}); await page.close().catch(() => {}); }
    await browser.close().catch(() => {});
  }
  if (launcher.exitCode === null) launcher.kill();
}
