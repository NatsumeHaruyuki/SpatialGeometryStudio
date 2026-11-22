import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import path from 'node:path';

const failures = [];
for (const name of ['standalone-point', 'small-model']) {
  const app = await electron.launch({ executablePath: path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH ?? 'D:\\DevDep\\electron\\electron45_4_1', 'electron.exe'), args: ['.'], env: { ...process.env, SGS_DATA_ROOT: path.resolve(`.qa/question-import/${name}`), SGS_USER_DATA_ROOT: path.resolve(`.qa/question-import/${name}-profile`) } });
  const page = await app.firstWindow(); const errors = new Set();
  page.on('console', m => { if (m.type() === 'error') errors.add(m.text()); });
  page.on('pageerror', e => errors.add(e.message)); page.on('dialog', d => d.accept());
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  try {
    await page.waitForSelector('canvas');
    const input = name === 'standalone-point'
      ? { schema_version: 2, solid: { type: 'diagram' }, constructions: [{ kind: 'point', point: 'Q', position: [1, 2, 3] }] }
      : { schema_version: 2, solid: { primitive: { kind: 'cone', origin: [0, 0.0001, 0], axis: [0, -1, 0], radius: 0.0001, height: 0.0001 } }, display: { faces: true, labels: false } };
    await page.getByRole('button', { name: 'JSON 导入 / 导出', exact: true }).click();
    await page.getByRole('textbox', { name: '项目 JSON', exact: true }).fill(JSON.stringify(input));
    await page.getByRole('button', { name: '校验并导入', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    if (name === 'standalone-point') {
      await page.getByRole('tab', { name: '显示', exact: true }).click(); await page.waitForTimeout(150);
      assert.equal([...errors].some(e => /Maximum update depth|Too many re-renders/i.test(e)), false, 'Standalone authored point editor must not cause a React update loop');
      await page.getByRole('spinbutton', { name: '顶点x坐标', exact: true }).fill('4');
      await page.getByRole('button', { name: '应用坐标', exact: true }).click();
      assert.equal(await page.getByRole('spinbutton', { name: '顶点x坐标', exact: true }).inputValue(), '4');
      console.log('PASS standalone explicit point opens and edits in the coordinate panel without render loops');
    } else {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const extent = await page.evaluate(() => {
        const source = document.querySelector('canvas'), target = document.createElement('canvas'); target.width = source.width; target.height = source.height;
        const context = target.getContext('2d'); context.drawImage(source, 0, 0); const data = context.getImageData(0, 0, target.width, target.height).data;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let y = 0; y < target.height; y++) for (let x = 0; x < target.width; x++) {
          const i = (y * target.width + x) * 4;
          if (Math.abs(data[i] - 245) + Math.abs(data[i + 1] - 248) + Math.abs(data[i + 2] - 251) > 18) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
        return { width: x1 - x0, height: y1 - y0 };
      });
      assert.ok(extent.width > 20 && extent.height > 20, `Accepted small cone must remain visible and zoomable, got ${JSON.stringify(extent)}`);
      assert.deepEqual([...errors], []);
      console.log('PASS small valid cone is rendered at a useful size with model-relative camera limits');
    }
  } catch (error) { failures.push(`${name}: ${error.message}`); console.log(`FAIL ${name}: ${error.message}`); }
  finally { await page.evaluate(() => window.studio?.setDirty(false)).catch(() => {}); await app.close(); }
}
assert.deepEqual(failures, []);
