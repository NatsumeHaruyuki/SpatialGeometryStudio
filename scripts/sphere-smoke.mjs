import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('.qa/spheres', { recursive: true });
const runtime = process.env.ELECTRON_OVERRIDE_DIST_PATH ?? 'D:\\DevDep\\electron\\electron45_4_1';
const app = await electron.launch({ executablePath: path.join(runtime, 'electron.exe'), args: ['.'], env: { ...process.env, SGS_DATA_ROOT: path.resolve('.qa/spheres/app'), SGS_USER_DATA_ROOT: path.resolve('.qa/spheres/user') } });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => d.accept());
async function snapshot() {
  await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click();
  const result = JSON.parse(await page.getByRole('textbox', { name: '项目 JSON', exact: true }).inputValue());
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  return result;
}
async function importScene(scene) {
  await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click();
  await page.getByRole('textbox', { name: '项目 JSON', exact: true }).fill(JSON.stringify(scene));
  await page.getByRole('button', { name: '校验并导入', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function construct(label, points) {
  await page.getByRole('button', { name: label, exact: true }).click();
  for (const name of points) await page.getByRole('button', { name: `选择点 ${name}`, exact: true }).click();
}
const row = kind => page.getByTestId(`construction-${kind}`);
async function expectCenters(count) {
  await page.waitForFunction(n => document.querySelector('.canvas-error, .fatal-error') || document.querySelectorAll('.sphere-center-label').length === n, count);
  assert.equal(await page.locator('.canvas-error, .fatal-error').count(), 0);
  assert.equal(await page.locator('.sphere-center-label').count(), count);
}
try {
  await page.waitForSelector('canvas');
  await page.context().setOffline(true);
  const cube = await snapshot();
  await construct('内切球', ['A', 'B', 'C', 'D']);
  assert.match(await page.getByRole('alert').innerText(), /共面/);
  assert.equal(await row('insphere').count(), 0);
  assert.deepEqual((await snapshot()).constructions, cube.constructions);
  console.log('PASS coplanar four-point selection is rejected without changing the project');

  await page.getByRole('button', { name: '三棱锥', exact: true }).click();
  await construct('外接球', ['A', 'B', 'C']);
  assert.equal(await row('circumsphere').count(), 0);
  assert.match(await page.locator('.tool-instruction').innerText(), /3\s*\/\s*4/);
  const label = await page.locator('.point-label').filter({ hasText: /^D$/ }).boundingBox();
  assert.ok(label);
  await page.mouse.click(label.x - label.width * 0.15, label.y + label.height * 1.15);
  await row('circumsphere').waitFor();
  await expectCenters(1);
  assert.deepEqual((await snapshot()).constructions.at(-1).points, ['A', 'B', 'C', 'D']);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal(await row('circumsphere').count(), 0);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expectCenters(1);
  console.log('PASS three named points wait for the fourth canvas pick; sphere supports undo and redo');

  await construct('内切球', ['A', 'B', 'C', 'D']);
  assert.equal(await row('insphere').count(), 1);
  await expectCenters(2);
  assert.equal(await page.locator('.sphere-radius-label').count(), 2);
  const radiiBefore = [await row('circumsphere').innerText(), await row('insphere').innerText()];
  await page.getByRole('tab', { name: '显示', exact: true }).click();
  await page.getByRole('combobox', { name: '编辑顶点', exact: true }).selectOption('A');
  await page.getByRole('spinbutton', { name: '顶点y坐标', exact: true }).fill('1.8');
  await page.getByRole('button', { name: '应用坐标', exact: true }).click();
  await page.getByRole('tab', { name: '构造', exact: true }).click();
  assert.notEqual(await row('circumsphere').innerText(), radiiBefore[0]);
  assert.notEqual(await row('insphere').innerText(), radiiBefore[1]);
  const scene = await snapshot();
  assert.deepEqual(scene.constructions.filter(c => c.kind.endsWith('sphere')).map(c => c.points), [['A', 'B', 'C', 'D'], ['A', 'B', 'C', 'D']]);
  console.log('PASS both spheres coexist, show centers and radii, and update when a source vertex changes');

  const savePath = path.resolve('.qa/spheres/四点双球 往返.gscene');
  const pngPath = path.resolve('.qa/spheres/四点双球 标签.png');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBoxSync = () => 1;
  }, savePath);
  await page.getByRole('button', { name: '保存项目', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.status-bar').textContent.includes('已保存'));
  await page.getByRole('button', { name: '四棱柱', exact: true }).click();
  await page.getByRole('button', { name: '打开项目', exact: true }).click();
  await row('insphere').waitFor();
  const saved = JSON.parse(await readFile(savePath, 'utf8'));
  assert.deepEqual((await snapshot()).constructions, saved.constructions);
  await expectCenters(2);
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, pngPath);
  await page.getByRole('button', { name: '导出图片', exact: true }).click();
  await page.getByText('PNG 图片已导出（含点标签）', { exact: true }).waitFor();
  assert.equal((await readFile(pngPath)).subarray(1, 4).toString(), 'PNG');
  await page.getByRole('button', { name: /^删除内切球/ }).click();
  await expectCenters(1);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expectCenters(2);
  console.log('PASS sphere definitions reopen through native file IPC, export PNG, and delete with undo');

  await importScene(JSON.parse(await readFile('examples/tetrahedronSpheres.gscene', 'utf8')));
  await page.screenshot({ path: 'docs/spheres-v0.2.1.png', scale: 'css' });
  const dynamic = structuredClone(cube);
  dynamic.constructions = [
    { id: 'motion-U', kind: 'movingPoint', point: 'U', label: 'U', start: 'A', end: 'B', t: 0.5 },
    { id: 'sphere', kind: 'circumsphere', points: ['A', 'U', 'D', 'A1'] },
  ];
  await importScene(dynamic);
  const slider = page.getByRole('slider', { name: '动点参数', exact: true });
  await slider.focus(); await page.keyboard.press('Home');
  assert.match(await row('circumsphere').innerText(), /球暂不可定义/);
  await expectCenters(0);
  const degenerate = await snapshot();
  await importScene(degenerate);
  assert.match(await row('circumsphere').innerText(), /球暂不可定义/);
  await page.getByRole('slider', { name: '动点参数', exact: true }).focus();
  await page.keyboard.press('End');
  assert.doesNotMatch(await row('circumsphere').innerText(), /球暂不可定义/);
  await expectCenters(1);
  console.log('PASS dependent motion can degenerate, round trip the undefined sphere, and recover its display');

  const tiny = structuredClone(cube);
  tiny.constructions = ['B', 'D', 'A1'].map((end, i) => ({ id: `tiny-${i}`, kind: 'movingPoint', point: ['U', 'V', 'W'][i], label: ['U', 'V', 'W'][i], start: 'A', end, t: 0.00001 }));
  await importScene(tiny);
  await construct('内切球', ['A', 'U', 'V', 'W']);
  assert.equal(await page.locator('.canvas-error, .fatal-error').count(), 0, 'A small, well-conditioned sphere must render without an absolute-scale plane error');
  await expectCenters(1);
  assert.match(await row('insphere').innerText(), /0\.0000042265/);
  const tinyCreated = await snapshot();
  await importScene(tinyCreated);
  assert.equal(await page.locator('.canvas-error, .fatal-error').count(), 0);
  await expectCenters(1);
  console.log('PASS tiny nondegenerate tetrahedron insphere renders on creation and reopening');
  assert.deepEqual(errors, []);
} finally {
  await page.evaluate(() => window.studio?.setDirty(false)).catch(() => {});
  await app.close();
}
