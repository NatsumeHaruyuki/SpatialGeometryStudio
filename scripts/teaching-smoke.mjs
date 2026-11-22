import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('.qa/teaching', { recursive: true });
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const runtime = process.env.ELECTRON_OVERRIDE_DIST_PATH ?? 'D:\\DevDep\\electron\\electron45_4_1';
const app = await electron.launch({ executablePath: path.join(runtime, 'electron.exe'), args: ['.'], env: { ...process.env, SGS_DATA_ROOT: path.resolve('.qa/teaching/app'), SGS_USER_DATA_ROOT: path.resolve('.qa/teaching/user') } });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', d => d.accept());
async function snapshot() {
  await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="项目 JSON"]')?.value.trim().startsWith('{'));
  const result = JSON.parse(await page.getByRole('textbox', { name: '项目 JSON', exact: true }).inputValue());
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  return result;
}
async function pointLocation(label) {
  await page.waitForTimeout(80);
  const box = await page.locator('.point-label').filter({ hasText: new RegExp(`^${label}$`) }).boundingBox();
  assert.ok(box, `Point label ${label} must be rendered`);
  return { x: box.x - 0.15 * box.width, y: box.y + 1.15 * box.height };
}
try {
  await page.waitForSelector('canvas');
  await page.context().setOffline(true);
  for (const label of ['三棱柱', '四棱柱', '三棱锥', '四棱锥', '圆柱', '单圆锥', '双圆锥']) assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 1);
  console.log('PASS structured library has all seven requested teaching models');
  const original = await snapshot();
  await page.getByRole('button', { name: '调整顶点', exact: true }).click();
  const start = await pointLocation('A₁');
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 35, start.y - 42, { steps: 9 }); await page.mouse.up();
  const edited = await snapshot();
  const positions = scene => scene.solid.points.map(p => p.position);
  assert.notDeepEqual(positions(edited), positions(original));
  const delta = edited.solid.points.find(p => p.id === 'A1').position.map((n, i) => n - original.solid.points.find(p => p.id === 'A1').position[i]);
  for (const id of ['A1', 'B1', 'C1', 'D1']) {
    const a = edited.solid.points.find(p => p.id === id).position, b = original.solid.points.find(p => p.id === id).position;
    a.forEach((n, i) => assert.ok(Math.abs(n - b[i] - delta[i]) < 1e-7));
  }
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.deepEqual(positions(await snapshot()), positions(original));
  await page.getByRole('button', { name: '重做', exact: true }).click();
  assert.deepEqual(positions(await snapshot()), positions(edited));
  console.log('PASS actual pointer drag adjusts prism vertices with one undo/redo transaction');
  await page.getByRole('button', { name: '选择', exact: true }).click();
  const canvas = await page.locator('canvas').boundingBox();
  const x = canvas.x + canvas.width * 0.51, y = canvas.y + canvas.height * 0.53;
  const beforeCut = await snapshot();
  await page.keyboard.down('Alt'); await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 55, y + 24, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Alt');
  const shifted = await snapshot();
  const cut = shifted.constructions.find(c => c.kind === 'section');
  assert.ok(Math.abs(cut.offset ?? 0) > 1e-5);
  assert.deepEqual(positions(shifted), positions(beforeCut));
  assert.equal(await page.locator('canvas[data-dragging]').count(), 0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.equal((await snapshot()).constructions.find(c => c.kind === 'section').offset, undefined);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  console.log('PASS Alt pointer drag translates a cut without moving its defining vertices; one undo restores it');
  await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click();
  const jsonBefore = await page.getByRole('textbox', { name: '项目 JSON', exact: true }).inputValue();
  await page.getByRole('button', { name: '一键复制 Prompt', exact: true }).click();
  await page.getByText('完整 Prompt 已复制到剪贴板。', { exact: true }).waitFor();
  const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert.equal(clipboard, await readFile('prompts/multimodalToGsceneV1.txt', 'utf8'));
  assert.equal(await page.getByRole('textbox', { name: '项目 JSON', exact: true }).inputValue(), jsonBefore);
  await page.screenshot({ path: `docs/prompt-copy-v${version}.png`, scale: 'css' });
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  console.log('PASS sandboxed Electron clipboard contains the complete exact prompt; JSON is unchanged');

  for (const label of ['三棱柱', '四棱柱', '三棱锥', '四棱锥', '圆柱', '单圆锥', '双圆锥']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await page.locator('.canvas-error, .fatal-error').count(), 0);
    assert.ok((await snapshot()).solid.points.length >= 4);
  }
  for (const [label, kind] of [['圆截面', '圆'], ['椭圆截面', '椭圆'], ['抛物线截面', '抛物线'], ['双曲线截面', '双曲线']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await page.locator('.round-section-result strong').innerText(), kind);
  }
  await page.screenshot({ path: `docs/double-cone-v${version}.png`, scale: 'css' });
  console.log('PASS every model renders offline and double-cone presets produce all four conic types');
  const doubleBefore = await snapshot();
  await page.getByRole('button', { name: '调整顶点', exact: true }).click();
  const cap = await pointLocation('T');
  await page.mouse.move(cap.x, cap.y); await page.mouse.down(); await page.mouse.move(cap.x + 12, cap.y - 25, { steps: 6 }); await page.mouse.up();
  const doubleAfter = await snapshot();
  assert.notDeepEqual(doubleAfter.solid.primitive, doubleBefore.solid.primitive);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  assert.deepEqual((await snapshot()).solid.primitive, doubleBefore.solid.primitive);
  console.log('PASS round-solid control drag changes analytic parameters and is undoable');

  const savePath = path.resolve('.qa/teaching/新功能 往返.gscene');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBoxSync = () => 1;
  }, savePath);
  await page.getByRole('button', { name: '保存项目', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.status-bar').textContent.includes('已保存'));
  const saved = JSON.parse(await readFile(savePath, 'utf8'));
  await page.getByRole('button', { name: '四棱锥', exact: true }).click();
  await page.getByRole('button', { name: '打开项目', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('h1').textContent.includes('双圆锥'));
  const reopened = await snapshot();
  assert.deepEqual(reopened.solid, saved.solid);
  assert.deepEqual(reopened.constructions, saved.constructions);
  assert.deepEqual(errors, []);
  console.log('PASS analytic shape and free cut save/reopen through real IPC with no renderer errors');
} finally {
  await page.evaluate(() => window.studio?.setDirty(false)).catch(() => {});
  await app.close();
}
