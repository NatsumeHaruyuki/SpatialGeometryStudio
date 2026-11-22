import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('.qa/study', { recursive: true });
const runtime = process.env.ELECTRON_OVERRIDE_DIST_PATH ?? 'D:\\DevDep\\electron\\electron45_4_1';
const app = await electron.launch({ executablePath: path.join(runtime, 'electron.exe'), args: ['.'], env: { ...process.env, SGS_DATA_ROOT: path.resolve('.qa/study/data'), SGS_USER_DATA_ROOT: path.resolve('.qa/study/profile') } });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => d.accept());
const row = kind => page.getByTestId(`construction-${kind}`);
async function snapshot() {
  await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click();
  const scene = JSON.parse(await page.getByRole('textbox', { name: '项目 JSON', exact: true }).inputValue());
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click(); return scene;
}
async function load(scene) {
  await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click();
  await page.getByRole('textbox', { name: '项目 JSON', exact: true }).fill(JSON.stringify(scene));
  await page.getByRole('button', { name: '校验并导入', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function construct(tool, ids) {
  await page.getByRole('button', { name: tool, exact: true }).click();
  for (const id of ids) await page.getByRole('button', { name: `选择点 ${id}`, exact: true }).click();
}
async function canvasPoint(name) {
  const label = await page.locator('.point-label').filter({ hasText: new RegExp(`^${name}$`) }).boundingBox();
  assert.ok(label); return { x: label.x - 0.15 * label.width, y: label.y + 1.15 * label.height };
}
async function editHeight(value) {
  await page.getByRole('tab', { name: '显示', exact: true }).click();
  await page.getByRole('combobox', { name: '编辑顶点', exact: true }).selectOption('A');
  await page.getByRole('spinbutton', { name: '顶点y坐标', exact: true }).fill(value);
  await page.getByRole('button', { name: '应用坐标', exact: true }).click();
  await page.getByRole('tab', { name: '构造', exact: true }).click();
}
try {
  await page.waitForSelector('canvas'); await page.context().setOffline(true);
  for (const name of ['作垂线', '三角形', '角度', '点面距离']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 1, `Missing study tool ${name}`);
  assert.match(await page.locator('.status-bar').innerText(), /Windows v0\.2/);
  assert.doesNotMatch(await page.locator('body').innerText(), /AI 识图 · 待接入|离线使用，无需网络|本地运行|Windows 试样/);
  const cube = await snapshot();
  console.log('PASS study tools and Windows v0.2 sample branding render without the removed copy');

  await page.getByRole('button', { name: '三棱锥', exact: true }).click();
  await construct('内切球', ['A', 'B', 'C', 'D']);
  await page.locator('.sphere-center-label').waitFor();
  const center = (await snapshot()).constructions.find(c => c.kind === 'insphere');
  const p = await canvasPoint(center.centerLabel);
  await page.mouse.click(p.x, p.y);
  assert.match(await page.locator('.selection-panel').innerText(), new RegExp(center.centerLabel));
  await page.getByRole('button', { name: '作垂线', exact: true }).click();
  assert.match(await page.locator('.tool-instruction').innerText(), /1\s*\/\s*3/);
  for (const id of ['B', 'D']) await page.getByRole('button', { name: `选择点 ${id}`, exact: true }).click();
  await row('perpendicular').waitFor();
  const foot = (await snapshot()).constructions.at(-1);
  await construct('三角形', [center.centerLabel, foot.label, 'D']);
  await construct('角度', [center.centerLabel, foot.label, 'D']);
  assert.match(await row('angle').first().innerText(), /90\.00°/);
  await page.locator('.angle-measure-label').waitFor();
  console.log('PASS insphere center can be picked on canvas, preserved by perpendicular tool, and reused with its foot');

  await page.getByRole('button', { name: '角度', exact: true }).click();
  await page.getByRole('button', { name: '选择点 A', exact: true }).click();
  await row('insphere').getByRole('button', { name: `选择球心 ${center.centerLabel}`, exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '角度', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.tool-instruction').innerText(), /2\s*\/\s*3/);
  await page.getByRole('button', { name: '选择点 B', exact: true }).click();
  assert.deepEqual((await snapshot()).constructions.at(-1).points, ['A', center.centerPoint, 'B']);
  await page.getByRole('button', { name: '三角形', exact: true }).click();
  await row('insphere').getByRole('button', { name: `选择球心 ${center.centerLabel}`, exact: true }).click();
  await row('perpendicular').getByRole('button', { name: `选择垂足 ${foot.label}`, exact: true }).click();
  await page.getByRole('button', { name: '选择点 D', exact: true }).click();
  assert.deepEqual((await snapshot()).constructions.at(-1).points, [center.centerPoint, foot.point, 'D']);
  console.log('PASS visible sphere-center and foot row buttons continue the active angle/triangle tool');

  await construct('角度', ['A', 'B', 'D']);
  const before = await row('angle').last().innerText();
  await editHeight('1.8');
  assert.notEqual(await row('angle').last().innerText(), before);
  assert.match(await row('angle').first().innerText(), /90\.00°/);
  console.log('PASS right-angle dependency remains 90 degrees while a separate angle updates after source editing');

  const cleanCube = structuredClone(cube); cleanCube.constructions = [];
  await load(cleanCube);
  await construct('三角形', ['A', 'B', 'D']);
  assert.match(await row('triangle').innerText(), /面积 2(?:\D|$)/);
  assert.equal((await snapshot()).constructions.filter(c => c.kind === 'section').length, 0);
  await page.getByRole('button', { name: '选择', exact: true }).click();
  const vertices = await Promise.all(['A', 'B', 'D'].map(canvasPoint));
  await page.mouse.click(vertices.reduce((sum, p) => sum + p.x, 0) / 3, vertices.reduce((sum, p) => sum + p.y, 0) / 3);
  assert.equal(await page.getByRole('button', { name: /^选择三角形/ }).getAttribute('aria-current'), 'true');
  await page.getByRole('button', { name: '撤销', exact: true }).click(); assert.equal(await row('triangle').count(), 0);
  await page.getByRole('button', { name: '重做', exact: true }).click(); assert.equal(await row('triangle').count(), 1);
  console.log('PASS exact half-square triangle is separate from sections, selectable on canvas and undoable');

  await construct('点面距离', ['A₁', 'A', 'B', 'D']);
  assert.match(await row('pointPlaneDistance').innerText(), /距离 2(?:\D|$)/);
  assert.match(await row('pointPlaneDistance').innerText(), /v = .+n = .+\|v·n\|/s);
  await page.locator('.distance-measure-label').waitFor();
  assert.equal(await page.locator('.normal-label').count(), 1);
  assert.equal(await page.locator('.direction-label').count(), 1);
  await page.screenshot({ path: '.qa/study/half-square-distance.png', scale: 'css' });
  console.log('PASS point-plane distance shows distance2, vectors, selectable projection foot and highlighted projection triangle');

  await construct('点面距离', ['A', 'A', 'B', 'D']);
  assert.match(await row('pointPlaneDistance').last().innerText(), /距离 0(?:\D|$)/);
  assert.match(await row('pointPlaneDistance').last().innerText(), /点在平面内/);
  console.log('PASS a source point may also define its plane and displays a valid zero distance');

  await load(JSON.parse(await readFile('examples/studyProjection.gscene', 'utf8')));
  const saveFile = path.resolve('.qa/study/球心与射影.gscene');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBoxSync = () => 1;
  }, saveFile);
  await page.getByRole('button', { name: '保存项目', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.status-bar').textContent.includes('已保存'));
  const saved = JSON.parse(await readFile(saveFile, 'utf8'));
  await page.getByRole('button', { name: '四棱柱', exact: true }).click();
  await page.getByRole('button', { name: '打开项目', exact: true }).click();
  await row('pointPlaneDistance').waitFor();
  assert.deepEqual((await snapshot()).constructions, saved.constructions);
  await page.screenshot({ path: '.qa/study/Windows-v0.2-study.png', scale: 'css' });
  console.log('PASS complete study lesson reopens with sphere center, perpendicular, triangle, angle and projection dependencies');

  const dynamic = structuredClone(cube);
  dynamic.constructions = [
    { id: 'move', kind: 'movingPoint', point: 'U', label: 'U', start: 'A', end: 'B', t: 0.5 },
    { id: 'sphere', kind: 'insphere', points: ['A', 'U', 'D', 'A1'], centerPoint: 'O_s1', centerLabel: 'Oₛ₁' },
    { id: 'foot', kind: 'perpendicular', from: 'O_s1', line: ['B', 'D'], point: 'H', label: 'H' },
    { id: 'seg', kind: 'segment', a: 'O_s1', b: 'H' },
    { id: 'tri', kind: 'triangle', points: ['O_s1', 'H', 'B'] },
    { id: 'angle', kind: 'angle', points: ['O_s1', 'H', 'B'] },
    { id: 'distance', kind: 'pointPlaneDistance', from: 'O_s1', plane: ['A', 'B', 'D'], point: 'K', label: 'K' },
  ];
  await load(dynamic);
  await page.getByRole('slider', { name: '动点参数', exact: true }).focus(); await page.keyboard.press('Home');
  await page.waitForFunction(() => !document.querySelector('.sphere-center-label'));
  assert.match(await row('perpendicular').innerText(), /暂不可/);
  assert.equal(await page.locator('.canvas-error, .fatal-error').count(), 0);
  await load(await snapshot());
  await page.getByRole('slider', { name: '动点参数', exact: true }).focus(); await page.keyboard.press('End');
  await page.locator('.sphere-center-label').waitFor();
  await page.locator('.distance-measure-label').waitFor();
  assert.doesNotMatch(await row('perpendicular').innerText(), /暂不可/);
  await page.getByRole('button', { name: /^删除内切球/ }).click();
  assert.equal(await row('perpendicular').count(), 0); assert.equal(await row('triangle').count(), 0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await row('perpendicular').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS undefined center safely hides all dependent geometry, round trips, recovers and cascades deletion with undo');
} finally {
  await page.evaluate(() => window.studio?.setDirty(false)).catch(() => {});
  await app.close();
}
