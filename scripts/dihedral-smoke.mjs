import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Browser plugin not available: exercise the real desktop build with Playwright.
const qa = process.env.SGS_QA_ROOT ?? await mkdtemp(path.join(os.tmpdir(), 'sgs-dihedral-'));
await mkdir(qa, { recursive: true });
const runtime = process.env.ELECTRON_OVERRIDE_DIST_PATH ?? 'D:\\DevDep\\electron\\electron45_4_1';
const app = await electron.launch({ executablePath: path.join(runtime, 'electron.exe'), args: ['.'], env: { ...process.env, SGS_DATA_ROOT: path.join(qa, 'data'), SGS_USER_DATA_ROOT: path.join(qa, 'profile') } });
const page = await app.firstWindow();
page.setDefaultTimeout(8000);
await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => d.accept());
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const pick = async id => { await page.getByRole('button', { name: `选择点 ${id}`, exact: true }).click(); await settle(); };
const instruction = page.locator('.tool-instruction');
const row = page.getByTestId('construction-dihedral');
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
  await settle();
}
async function canvasPick(name) {
  await settle();
  const label = await page.locator('.point-label').filter({ hasText: new RegExp(`^${name}$`) }).boundingBox();
  assert.ok(label);
  await page.mouse.click(label.x - 0.15 * label.width, label.y + 1.15 * label.height);
  await settle();
}
try {
  await page.waitForSelector('canvas');
  assert.match(page.url(), /^file:/); assert.match(await page.title(), /空间几何|Spatial/i);
  assert.equal(await page.locator('vite-error-overlay,.canvas-error').count(), 0);
  await page.context().setOffline(true);
  const cube = await snapshot(); cube.constructions = [];
  await load(cube);
  await page.getByRole('button', { name: '二面角', exact: true }).click();
  assert.match(await instruction.innerText(), /第 1 步：选择公共直线/);
  assert.equal(await page.getByRole('button', { name: /^选择面 / }).count(), 0);
  await canvasPick('A'); await canvasPick('B');
  assert.match(await instruction.innerText(), /第 2 步：选择两个点确定两个平面/);
  assert.equal(await page.locator('.point-label.dihedral-axis-point').count(), 2);
  assert.equal(await page.locator('.dihedral-line-label').count(), 1);
  await page.screenshot({ path: path.join(qa, '01-common-line.png'), scale: 'css' });
  await pick('C');
  assert.equal(await page.locator('.point-label.dihedral-plane-point').count(), 1);
  const blue = await page.locator('.point-label.dihedral-axis-point').first().evaluate(el => getComputedStyle(el).color);
  const orange = await page.locator('.point-label.dihedral-plane-point').first().evaluate(el => getComputedStyle(el).color);
  assert.notEqual(blue, orange);
  assert.equal(await page.locator('.selection-chips .dihedral-axis-point').count(), 2);
  assert.equal(await page.locator('.selection-chips .dihedral-plane-point').count(), 1);
  await page.screenshot({ path: path.join(qa, '02-first-plane.png'), scale: 'css' });
  await pick('A₁');
  assert.match(await row.innerText(), /90\.00°/);
  assert.equal(await instruction.count(), 0);
  assert.equal(await page.locator('.point-label.dihedral-axis-point').count(), 2);
  assert.equal(await page.locator('.point-label.dihedral-plane-point').count(), 2);
  assert.deepEqual((await snapshot()).constructions.at(-1).points, ['A', 'B', 'C', 'A1']);
  await page.getByRole('button', { name: '撤销', exact: true }).click(); assert.equal(await row.count(), 0);
  await page.getByRole('button', { name: '重做', exact: true }).click(); assert.match(await row.innerText(), /90\.00°/);
  await page.screenshot({ path: path.join(qa, '03-created-angle.png'), scale: 'css' });
  console.log('PASS actual canvas A/B picks, staged instructions, blue/orange points and chips, 90° creation, undo/redo');

  const saveFile = path.join(qa, '四点二面角.gscene');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBoxSync = () => 1;
  }, saveFile);
  await page.getByRole('button', { name: '保存项目', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.status-bar').textContent.includes('已保存'));
  assert.deepEqual(JSON.parse(await readFile(saveFile, 'utf8')).constructions.at(-1).points, ['A', 'B', 'C', 'A1']);
  await page.getByRole('button', { name: '三棱柱', exact: true }).click();
  assert.match(await row.innerText(), /120\.00°/); // Legacy faceA / faceB remains supported.
  await page.getByRole('button', { name: '打开项目', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="construction-dihedral"]')?.textContent.includes('90.00°'));
  console.log('PASS real file save/reopen and legacy 120° file display');

  const moving = structuredClone(cube);
  moving.constructions = [{ id: 'motion', kind: 'movingPoint', point: 'P', label: 'P', start: 'A', end: 'B', t: 0.5 }];
  await load(moving);
  await page.getByRole('button', { name: '二面角', exact: true }).click();
  await pick('A'); await pick('B'); await pick('P');
  assert.match(await page.getByRole('alert').innerText(), /公共直线.*平面/);
  assert.match(await instruction.innerText(), /已选 2 \/ 4/);
  await pick('C'); await pick('P');
  assert.match(await instruction.innerText(), /已选 3 \/ 4/);
  await pick('A₁'); assert.match(await row.innerText(), /90\.00°/);
  console.log('PASS invalid side points preserve the common line and first plane for correction');

  moving.constructions.push({ id: 'dynamic', kind: 'dihedral', points: ['A', 'A1', 'P', 'C'] });
  await load(moving);
  const slider = page.getByRole('slider', { name: /动点参数/ });
  await slider.fill('0'); assert.match(await row.innerText(), /暂不可定义/);
  await slider.fill('0.5'); assert.doesNotMatch(await row.innerText(), /暂不可定义/);
  console.log('PASS dynamic degeneracy hides the angle and recovers without blocking motion');

  const zero = structuredClone(cube);
  zero.constructions = [{ id: 'zero', kind: 'dihedral', points: ['A', 'B', 'C', 'D'] }];
  await load(zero); assert.match(await row.innerText(), /0\.00°/);
  const labelBoxes = await Promise.all([
    page.locator('.dihedral-plane-label').nth(0).boundingBox(),
    page.locator('.dihedral-plane-label').nth(1).boundingBox(),
    page.locator('.angle-label').boundingBox(),
  ]);
  for (let i = 0; i < labelBoxes.length; i++) for (let j = i + 1; j < labelBoxes.length; j++) {
    const a = labelBoxes[i], b = labelBoxes[j];
    assert.ok(a && b && (a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y), '0° plane and angle labels must not overlap');
  }
  await page.screenshot({ path: path.join(qa, '04-zero-angle.png'), scale: 'css' });
  console.log('PASS 0° angle and both plane labels remain separately readable');

  await load(cube);
  await page.getByRole('button', { name: '二面角', exact: true }).click();
  await pick('A'); await pick('C'); await pick('B'); await pick('A₁');
  assert.match(await row.innerText(), /90\.00°/);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.getByRole('button', { name: '二面角', exact: true }).click();
  await canvasPick('A'); await canvasPick('C');
  assert.match(await instruction.innerText(), /第 2 步/);
  const bounds = await instruction.boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 901);
  await page.screenshot({ path: path.join(qa, '04-small-window.png'), scale: 'css' });
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await instruction.count(), 0);
  assert.equal(await page.locator('vite-error-overlay,.canvas-error').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS non-edge common line, smaller-window staged prompt, cancellation, no blank screen/overlays/console errors');
  console.log(`Evidence: ${qa}`);
} catch (error) {
  await page.screenshot({ path: path.join(qa, 'failure.png'), scale: 'css' }).catch(() => {});
  console.log(`Failure evidence: ${qa}`);
  throw error;
} finally {
  await page.evaluate(() => window.studio?.setDirty(false)).catch(() => {});
  await app.close();
}
