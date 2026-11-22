import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { platform: { type: 'string', default: process.platform }, arch: { type: 'string', default: process.arch } } });
const { platform, arch } = values;
if (!['win32', 'darwin'].includes(platform) || !['x64', 'arm64', 'universal'].includes(arch)) throw new Error('Unsupported distribution platform or architecture');
if (platform !== process.platform) throw new Error('Build the distribution on its native operating system');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const release = path.resolve(`release-v${version}`);
const label = platform === 'win32' ? 'Windows' : 'macOS';
const name = `SpatialGeometryStudio-${label}-v${version}-${arch}`;
const folder = path.join(release, name);
const source = path.join(release, platform === 'win32' ? (arch === 'x64' ? 'win-unpacked' : `win-${arch}-unpacked`) : (arch === 'x64' ? 'mac' : `mac-${arch}`));
const bundle = 'Spatial Geometry Studio.app';
await access(path.join(source, platform === 'win32' ? 'SpatialGeometryStudio.exe' : `${bundle}/Contents/Info.plist`));
try { await access(path.join(source, 'GeometryTeachingData')); throw new Error('Build output contains user data; refusing to distribute it'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
// Refuse to merge into an existing release: it may already contain the user's projects.
await mkdir(folder);
if (platform === 'win32') await cp(source, folder, { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true, verbatimSymlinks: true });
else await cp(path.join(source, bundle), path.join(folder, bundle), { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true, verbatimSymlinks: true });
await cp('examples', path.join(folder, 'samples'), { recursive: true });

const instructions = platform === 'win32'
  ? '适用：Windows 11 x64。\n\n解压整个 ZIP，打开 SpatialGeometryStudio.exe 即可。无需安装 Node.js、Python、Electron、npm 或其他开发工具，不需要网络。\n复制到其他电脑时必须复制整个文件夹，请保留 resources、locales、DLL 和其他运行时文件，不要只复制 EXE。\n'
  : `适用：macOS ${arch === 'arm64' ? 'Apple 芯片（M 系列）' : arch === 'x64' ? 'Intel 芯片' : 'Apple / Intel 芯片'}。\n\n解压整个 ZIP，双击 Spatial Geometry Studio.app。无需安装 Node.js、Python、Electron 或 npm。\n这是未经过 Apple Developer ID 签名和公证的测试版本，使用本地 ad-hoc 签名。首次运行若被 macOS 拦截，请在确认来源后，按系统提示前往“系统设置 → 隐私与安全性 → 仍要打开”。系统或单位策略可能禁止运行此类应用。\n`;
await writeFile(path.join(folder, 'README.txt'), `空间几何工作室 · v0.2 系列（包版本 ${version}）\n\n${instructions}\n首次启动默认在应用文件夹中创建 GeometryTeachingData，包含 projects、settings、exports。macOS 数据位于 .app 同级，位于 .app 外部。目录不可写时自动回退到当前用户目录；右侧齿轮可查看实际路径。\n迁移已有项目时请一并复制 GeometryTeachingData，升级时请保留旧数据。请勿把运行后的个人数据文件夹作为公共分发包。\n\nsamples 中包含球心与射影、球弦、圆锥题目、截面和四面体双球等项目。通过工具栏“打开项目”加载 .gscene，或将 .json 内容粘贴到“JSON 导入 / 导出”。\n核心几何功能离线使用。AI 题图识别尚未接入，使用内置 Prompt 与外部多模态模型交换 JSON。\n`);
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0;
await writeFile(path.join(folder, 'version.json'), JSON.stringify({ product: 'Spatial Geometry Studio', version, platform, architecture: arch, channel: 'v0.2', source_commit: sourceCommit, source_dirty: sourceDirty, schema_version: 1 }, null, 2));
const archive = path.join(release, `${name}.zip`);
if (platform === 'win32') execFileSync('tar.exe', ['-a', '-cf', archive, '-C', release, name], { windowsHide: true, stdio: 'inherit' });
else execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', folder, archive], { stdio: 'inherit' });
const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(`${archive}.sha256`, `${digest}  ${name}.zip\n`);
console.log(`Distribution folder: ${folder}\nDistribution ZIP: ${archive}\nSHA256: ${digest}`);
