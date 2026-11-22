import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('.qa/question-import', { recursive: true });
const compiled = await build({ stdin: { contents: "export {resolvePoints} from './src/geometry/engine';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', write: false });
const { resolvePoints } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const rawText = await readFile('examples/questionConeV2.json', 'utf8');
const raw = JSON.parse(rawText);
const app = await electron.launch({ executablePath: path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH ?? 'D:\\DevDep\\electron\\electron45_4_1', 'electron.exe'), args: ['.'], env: { ...process.env, SGS_DATA_ROOT: path.resolve('.qa/question-import/data'), SGS_USER_DATA_ROOT: path.resolve('.qa/question-import/profile') } });
const page = await app.firstWindow(); const errors = [];
page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
const button = name => page.getByRole('button', { name, exact: true });
async function openJson() { await button('JSON 导入 / 导出').click(); }
async function load(text) {
  await openJson();
  await page.getByRole('textbox', { name: '项目 JSON', exact: true }).fill(typeof text === 'string' ? text : JSON.stringify(text));
  await button('校验并导入').click();
  await page.waitForFunction(() => !document.querySelector('dialog').open || !!document.querySelector('.error-message'));
  const messages = await page.locator('.error-message').allTextContents();
  assert.deepEqual(messages, [], messages.join('\n'));
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
async function snapshot() {
  await openJson(); const scene = JSON.parse(await page.getByRole('textbox', { name: '项目 JSON', exact: true }).inputValue());
  await button('关闭对话框').click(); return scene;
}
function verifyCone(scene) {
  assert.equal(scene.schema_version, 2);
  const points = resolvePoints(scene);
  assert.deepEqual([...points.keys()].sort(), ['A', 'B', 'C', 'D', 'E', 'O', 'P']);
  const dist = (a, b) => Math.hypot(...points.get(a).map((n, i) => n - points.get(b)[i]));
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} must equal ${b}`);
  assert.deepEqual(points.get('O'), [0, 0, 0]);
  near(dist('A', 'E'), 2); near(dist('A', 'D'), 2);
  for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'A']]) near(dist(a, b), Math.sqrt(3));
  near(dist('P', 'O') / dist('D', 'O'), Math.sqrt(6) / 6);
}
try {
  await page.waitForSelector('canvas'); await page.context().setOffline(true);
  await load(rawText); const imported = await snapshot(); verifyCone(imported);
  await page.waitForFunction(() => document.querySelectorAll('.point-label').length === 7);
  const labels = await page.locator('.point-label').allTextContents();
  assert.deepEqual(labels.sort(), ['A', 'B', 'C', 'D', 'E', 'O', 'P']);
  assert.equal(await page.locator('.canvas-error, .fatal-error').count(), 0);
  console.log('PASS minimal image JSON imports D/O/A/B/C/E/P exactly and satisfies all original cone conditions');

  await page.getByRole('tab', { name: '显示', exact: true }).click();
  await page.getByRole('combobox', { name: '编辑顶点', exact: true }).selectOption('A');
  await page.getByRole('spinbutton', { name: '顶点x坐标', exact: true }).fill('2');
  await button('应用坐标').click();
  const edited = await snapshot();
  assert.equal(edited.solid.primitive.radius, 2);
  assert.deepEqual(edited.solid.points.map(p => p.id), imported.solid.points.map(p => p.id));
  assert.equal(edited.solid.points.find(p => p.id === 'B').position[0], -1);
  await button('撤销').click(); verifyCone(await snapshot());
  await page.getByRole('tab', { name: '构造', exact: true }).click();
  await page.getByRole('slider', { name: '动点参数', exact: true }).focus(); await page.keyboard.press('Home');
  assert.deepEqual(resolvePoints(await snapshot()).get('P'), [0, 0, 0]);
  await load(rawText);
  console.log('PASS question point editing, geometry bindings, undo and motion preserve explicit names without handles');

  const file = path.resolve('.qa/question-import/题目 圆锥.gscene');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBoxSync = () => 1;
  }, file);
  await button('保存项目').click();
  await page.waitForFunction(() => document.querySelector('.status-bar').textContent.includes('已保存'));
  const saved = JSON.parse(await readFile(file, 'utf8')); verifyCone(saved);
  await button('四棱柱').click(); await button('打开项目').click();
  await page.getByRole('heading', { name: raw.title, exact: true }).waitFor();
  const reopened = await snapshot(); verifyCone(reopened);
  assert.deepEqual(reopened.solid, saved.solid); assert.deepEqual(reopened.constructions, saved.constructions);
  console.log('PASS canonical v2 reopens through actual native file IPC with identical declared geometry');

  await load('```json\n' + rawText + '\n```'); verifyCone(await snapshot());
  const lines = rawText.split('\n');
  const escaped = lines.map((line, i) => line.replace(/^ +/, m => '&#x20;'.repeat(m.length)) + (i < lines.length - 1 ? '\\' : '')).join('\n');
  await load(escaped); verifyCone(await snapshot());
  console.log('PASS fenced and HTML/backslash-transported LLM JSON paste without manual text cleanup');

  const invalid = structuredClone(raw); invalid.constructions.push({ kind: 'point', point: 'A', position: [0, 0, 0] });
  await openJson(); await page.getByRole('textbox', { name: '项目 JSON', exact: true }).fill(JSON.stringify(invalid));
  await button('校验并导入').click();
  assert.match(await page.getByRole('alert').innerText(), /A.*solid\.points.*constructions/);
  assert.equal(await button('一键复制修复请求').count(), 1);
  await button('一键复制修复请求').click();
  await page.getByText('修复请求已复制，可粘贴给原多模态模型。', { exact: true }).waitFor();
  const repair = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert.match(repair, /点 ID 重复/); assert.ok(repair.includes(JSON.stringify(invalid)));
  await button('关闭对话框').click(); verifyCone(await snapshot());
  console.log('PASS invalid imports name the conflict owners, keep the current project and copy a complete LLM repair request');

  await load({ schema_version: 2, title: '线图', solid: { type: 'diagram', points: [
    { id: 'O', position: [0, 0, 0] }, { id: 'A', position: [2, 0, 0] }, { id: 'B', position: [0, 2, 0] },
  ] }, constructions: [{ kind: 'triangle', points: ['O', 'A', 'B'] }] });
  assert.equal(await page.getByTestId('construction-triangle').count(), 1);
  await load({ schema_version: 2, title: '无题目点圆柱', solid: { primitive: { kind: 'cylinder', origin: [0, 0, 0], axis: [0, 1, 0], radius: 1, height: 2 } } });
  await page.getByRole('tab', { name: '显示', exact: true }).click();
  await page.getByText('此模型尚未声明题目点，可通过 JSON 添加；模型参数已独立保存。', { exact: true }).waitFor();
  assert.equal(await page.locator('.canvas-error, .fatal-error').count(), 0);
  await load(JSON.parse(await readFile('examples/cone.gscene', 'utf8')));
  assert.deepEqual((await snapshot()).solid.points.map(p => p.id), ['O', 'T', 'A', 'B', 'C']);
  console.log('PASS diagrams and primitive-only v2 scenes render safely while legacy control scenes retain compatibility');

  await load(rawText); await page.getByRole('tab', { name: '构造', exact: true }).click();
  await openJson(); await button('一键复制 Prompt').click();
  await page.getByText('完整 Prompt 已复制到剪贴板。', { exact: true }).waitFor();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), await readFile('prompts/multimodalToGsceneV1.txt', 'utf8'));
  await button('关闭对话框').click();
  await page.screenshot({ path: '.qa/question-import/Windows-v0.2-cone.png', scale: 'css' });
  const png = path.resolve('.qa/question-import/题目圆锥.png');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, png);
  await button('导出图片').click(); await page.getByText('PNG 图片已导出（含点标签）', { exact: true }).waitFor();
  assert.equal((await readFile(png)).subarray(1, 4).toString(), 'PNG');
  assert.deepEqual(errors, []);
  console.log('PASS complete v2 prompt clipboard, declared-label PNG and offline rendering have no application errors');
} finally {
  await page.evaluate(() => window.studio?.setDirty(false)).catch(() => {}); await app.close();
}
