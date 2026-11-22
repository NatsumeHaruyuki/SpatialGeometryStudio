import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chooseDataDirectory, atomicWrite, readProject } from './data';
import { createExample } from '../src/geometry/examples';

const roots: string[] = [];
async function fixture() {
  const base = path.resolve('.qa/data-tests');
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'case-')); roots.push(root); return root;
}
afterEach(async () => { for (const root of roots.splice(0)) { if (!root.startsWith(path.resolve('.qa/data-tests') + path.sep)) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); } });
describe('portable desktop files', () => {
  it('creates a portable data folder beside the executable', async () => {
    const root = await fixture();
    const info = await chooseDataDirectory(path.join(root, 'app'), path.join(root, 'user'), 'portable');
    expect(info.mode).toBe('portable');
    expect(info.path).toBe(path.join(root, 'app', 'GeometryTeachingData'));
  });
  it('falls back to a user directory when the application location is unwritable', async () => {
    const root = await fixture(); const blocked = path.join(root, 'blocked'); await writeFile(blocked, 'file, not directory');
    const info = await chooseDataDirectory(blocked, path.join(root, 'user'), 'portable');
    expect(info.mode).toBe('standard'); expect(info.path).toBe(path.join(root, 'user'));
    expect(info.warning).toBeTruthy();
  });
  it('preserves an existing portable project while selecting standard mode', async () => {
    const root = await fixture(); const folder = path.join(root, 'app', 'GeometryTeachingData'); await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'keep.gscene'), 'keep');
    await chooseDataDirectory(path.join(root, 'app'), path.join(root, 'user'), 'standard');
    expect(await readFile(path.join(folder, 'keep.gscene'), 'utf8')).toBe('keep');
  });
  it('atomically writes and reopens a project in a Chinese path containing spaces', async () => {
    const root = await fixture(); const target = path.join(root, '中文 项目.gscene');
    const scene = createExample('cube');
    await atomicWrite(target, JSON.stringify(scene));
    expect((await readProject(target)).title).toBe('正方体 · 截面探究');
    await atomicWrite(target, JSON.stringify(createExample('prism')));
    expect((await readProject(target)).id).toBe('prism');
  });
  it('refuses an oversized input before attempting to render it', async () => {
    const root = await fixture(); const target = path.join(root, 'large.gscene');
    await writeFile(target, ' '.repeat(2 * 1024 * 1024 + 1));
    await expect(readProject(target)).rejects.toThrow(/2 MB/);
  });
});
