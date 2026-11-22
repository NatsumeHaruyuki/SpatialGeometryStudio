import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const script = path.resolve('scripts/release-folder.mjs');
const base = path.resolve('.qa/release-tests');
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(base + path.sep)) throw new Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});

it.skipIf(!['win32', 'darwin'].includes(process.platform)).each(['.zip', '.zip.sha256'])('preserves an existing %s when the old distribution folder was moved away', async suffix => {
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'case-'));
  roots.push(root);
  const platform = process.platform;
  const arch = process.arch;
  const label = platform === 'win32' ? 'Windows' : 'macOS';
  const name = `SpatialGeometryStudio-${label}-v0.2.1-${arch}`;
  const release = path.join(root, 'release-v0.2.1');
  const source = path.join(release, platform === 'win32' ? (arch === 'x64' ? 'win-unpacked' : `win-${arch}-unpacked`) : (arch === 'x64' ? 'mac' : `mac-${arch}`));
  const entry = platform === 'win32' ? path.join(source, 'SpatialGeometryStudio.exe') : path.join(source, 'SpatialGeometryStudio.app', 'Contents', 'Info.plist');
  await mkdir(path.dirname(entry), { recursive: true });
  await writeFile(entry, 'fixture runtime');
  await mkdir(path.join(root, 'examples'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.2.1' }));
  const previous = path.join(release, name + suffix);
  await writeFile(previous, 'keep previous release');
  const result = spawnSync(process.execPath, [script, '--platform', platform, '--arch', arch], { cwd: root, encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Refusing to overwrite existing release');
  expect(await readFile(previous, 'utf8')).toBe('keep previous release');
  await expect(access(path.join(release, name))).rejects.toThrow();
});
