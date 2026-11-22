import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import * as THREE from 'three';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

await mkdir('.qa/drag-regressions', { recursive: true });
const compiled = await build({ stdin: { contents: "export {getSection,resolvePoints} from './src/geometry/engine';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
const { getSection, resolvePoints } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const app = await electron.launch({ executablePath: path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH ?? 'D:\\DevDep\\electron\\electron45_4_1', 'electron.exe'), args: ['.'], env: { ...process.env, SGS_DATA_ROOT: path.resolve('.qa/drag-regressions/app'), SGS_USER_DATA_ROOT: path.resolve('.qa/drag-regressions/user') } });
const page = await app.firstWindow();
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
async function snapshot() { await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click(); const value = JSON.parse(await page.getByRole('textbox', { name: '项目 JSON', exact: true }).inputValue()); await page.getByRole('button', { name: '关闭对话框', exact: true }).click(); return value; }
async function load(scene) { await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click(); await page.getByRole('textbox', { name: '项目 JSON', exact: true }).fill(JSON.stringify(scene)); await page.getByRole('button', { name: '校验并导入', exact: true }).click(); await page.waitForTimeout(100); }
async function pixel(scene, point) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas'), area = document.querySelector('.toolbar-area'), workspace = document.querySelector('.workspace');
    const desired = area.getBoundingClientRect().bottom - workspace.getBoundingClientRect().top + 12;
    return Math.abs(parseFloat(workspace.style.getPropertyValue('--toolbar-space')) - desired) < 1 && canvas && canvas.clientWidth === canvas.parentElement.clientWidth && canvas.clientHeight === canvas.parentElement.clientHeight;
  });
  const bounds = await page.locator('canvas').boundingBox(); const camera = new THREE.PerspectiveCamera(34, bounds.width / bounds.height, 0.01, 100000); camera.zoom = Math.min(1, camera.aspect / 0.95); camera.position.fromArray(scene.view.position); camera.lookAt(new THREE.Vector3(...scene.view.target)); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); const v = new THREE.Vector3(...point).project(camera); return { x: bounds.x + (v.x + 1) * bounds.width / 2, y: bounds.y + (1 - v.y) * bounds.height / 2 };
}
async function altDrag(point) { await page.keyboard.down('Alt'); await page.mouse.move(point.x, point.y); await page.mouse.down(); assert.ok(await page.locator('canvas').getAttribute('data-dragging'), 'Visible section must be pickable'); await page.mouse.move(point.x + 12, point.y - 30, { steps: 7 }); await page.mouse.up(); await page.keyboard.up('Alt'); }
try {
  await page.waitForSelector('canvas');
  const cube = JSON.parse(await readFile('examples/cube.gscene', 'utf8'));
  await load(cube); await page.getByRole('button', { name: '调整顶点', exact: true }).click();
  const start = await pixel(cube, [0, 2, 0]);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  assert.equal(await page.locator('canvas').getAttribute('data-dragging'), 'point', `Pointer ${JSON.stringify(start)} should hit A1 at ${JSON.stringify(await page.locator('.point-label').filter({ hasText: /^A₁$/ }).boundingBox())}`);
  await page.mouse.move(start.x + 30, start.y - 25, { steps: 5 });
  await page.keyboard.press('Control+z'); await page.mouse.move(start.x + 60, start.y - 40, { steps: 5 }); await page.mouse.up();
  assert.deepEqual((await snapshot()).solid, cube.solid);
  assert.equal(await page.getByRole('button', { name: '重做', exact: true }).isEnabled(), true);
  console.log('PASS undo during a held pointer cancels the gesture and preserves redo');

  for (const id of ['A', 'B']) { const p = cube.solid.points.find(p => p.id === id); const q = await pixel(cube, p.position); await page.mouse.click(q.x, q.y); }
  assert.match(await page.locator('.selection-panel').innerText(), /所选对象：点\s*B/);
  console.log('PASS adjust mode selects only the most recently grabbed point');

  const cylinder = JSON.parse(await readFile('examples/cylinder.gscene', 'utf8'));
  cylinder.constructions = [{ id: 'cut', kind: 'planeSection', origin: [0, 1.3, 0], normal: [0, 0.8, 0.6] }];
  await load(cylinder); const angle = page.getByRole('slider', { name: '截平面倾角', exact: true }); await angle.focus(); await angle.press('ArrowRight');
  const n = (await snapshot()).constructions[0].normal;
  assert.ok(Math.abs(n[0]) < 1e-7 && n[2] > 0.5);
  console.log('PASS inclination changes preserve an imported plane azimuth');

  const offsets = [];
  for (const x of [0, 1000]) { const scene = structuredClone(cylinder); scene.constructions = [{ id: 'cut', kind: 'planeSection', origin: [x, 1.3, 0], normal: [0, 1, 0] }]; await load(scene); await altDrag(await pixel(scene, [0.3, 1.3, 0.2])); offsets.push((await snapshot()).constructions[0].offset); }
  assert.ok(Math.abs(offsets[0] - offsets[1]) < 1e-5);
  console.log('PASS equivalent plane origins produce the same drag distance');

  const double = JSON.parse(await readFile('examples/doubleCone.gscene', 'utf8')); double.display.sectionPlane = false;
  await load(double); const cut = double.constructions[0]; const section = getSection(double, resolvePoints(double), cut);
  const branch = section.curves[0], sample = branch[Math.floor(branch.length / 2)];
  await altDrag(await pixel(double, sample)); assert.ok(Math.abs((await snapshot()).constructions[0].offset ?? 0) > 1e-6);
  console.log('PASS a visible open conic remains Alt-draggable with its extended plane hidden');

  const tangent = structuredClone(cube); tangent.display.sectionPlane = false; tangent.constructions = [{ id: 'point-cut', kind: 'planeSection', origin: [0, 0, 0], normal: [1, 1, -1] }];
  await load(tangent); await altDrag(await pixel(tangent, [0, 0, 0])); assert.ok(Math.abs((await snapshot()).constructions[0].offset ?? 0) > 1e-6);
  assert.deepEqual(errors, []);
  console.log('PASS a point-contact section is visible and Alt-draggable; no runtime errors');
} finally { await page.keyboard.up('Alt'); await page.mouse.up(); await page.evaluate(() => window.studio?.setDirty(false)).catch(() => {}); await app.close(); }
