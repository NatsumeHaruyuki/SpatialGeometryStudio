import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MAX_PROJECT_BYTES, parseScene, type Scene } from '../src/schema/scene';

export type DataInfo = { mode: 'portable' | 'standard'; path: string; warning: string | null };
async function prepareDirectory(directory: string) {
  await mkdir(directory, { recursive: true });
  const probe = path.join(directory, `.write-test-${randomUUID()}`);
  const handle = await open(probe, 'wx');
  await handle.close();
  await unlink(probe);
  await Promise.all(['projects', 'settings', 'exports'].map(folder => mkdir(path.join(directory, folder), { recursive: true })));
}
export async function chooseDataDirectory(applicationDirectory: string, userDirectory: string, mode: 'portable' | 'standard'): Promise<DataInfo> {
  if (mode === 'portable') {
    const directory = path.join(applicationDirectory, 'GeometryTeachingData');
    try { await prepareDirectory(directory); return { mode, path: directory, warning: null }; }
    catch { await prepareDirectory(userDirectory); return { mode: 'standard', path: userDirectory, warning: '程序目录不可写，已回退到当前用户的数据目录。原有项目不会移动或删除。' }; }
  }
  await prepareDirectory(userDirectory);
  return { mode, path: userDirectory, warning: null };
}
export async function atomicWrite(target: string, data: string | Uint8Array): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, data, { flag: 'wx' }); await rename(temporary, target); }
  finally { await unlink(temporary).catch(() => {}); }
}
export async function readProject(target: string): Promise<Scene> {
  const info = await stat(target);
  if (!info.isFile() || info.size > MAX_PROJECT_BYTES) throw new Error('项目文件不能超过 2 MB');
  return parseScene(await readFile(target, 'utf8'));
}
