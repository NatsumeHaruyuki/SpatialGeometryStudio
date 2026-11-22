import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('.qa/sample', { recursive: true });
const runtime = process.env.ELECTRON_OVERRIDE_DIST_PATH ?? 'D:\\DevDep\\electron\\electron45_4_1';
const app = await electron.launch({ executablePath: path.join(runtime, 'electron.exe'), args: ['.'], env: { ...process.env, SGS_SAMPLE: '1', SGS_DATA_ROOT: path.resolve('.qa/sample/data'), SGS_USER_DATA_ROOT: path.resolve('.qa/sample/profile') } });
const page = await app.firstWindow(); const errors = [];
page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
try {
  await page.waitForSelector('canvas');
  assert.equal(await page.locator('h1').innerText(), '球心、垂线与射影');
  await page.locator('.distance-measure-label').waitFor();
  assert.match(await page.getByTestId('construction-pointPlaneDistance').innerText(), /距离 1\.4/);
  assert.match(await page.locator('.status-bar').innerText(), /Windows v0\.2/);
  const info = await page.evaluate(() => window.studio.dataInfo());
  assert.equal(info.path, path.resolve('.qa/sample/data/GeometryTeachingData'));
  await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click();
  await page.getByRole('button', { name: '一键复制 Prompt', exact: true }).click();
  await page.getByText('完整 Prompt 已复制到剪贴板。', { exact: true }).waitFor();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), await readFile('prompts/multimodalToGsceneV1.txt', 'utf8'));
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click();
  const png = path.resolve('.qa/sample/球心与射影.png');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, png);
  await page.getByRole('button', { name: '导出图片', exact: true }).click();
  await page.getByText('PNG 图片已导出（含点标签）', { exact: true }).waitFor();
  assert.equal((await readFile(png)).subarray(1, 4).toString(), 'PNG');
  await page.screenshot({ path: '.qa/sample/Windows-v0.2.png', scale: 'css' });
  assert.equal(await page.locator('.canvas-error, .fatal-error').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS sample mode opens the complete lesson, isolates data, and retains trusted native clipboard and PNG IPC');
} finally {
  await page.evaluate(() => window.studio?.setDirty(false)).catch(() => {});
  await app.close();
}
