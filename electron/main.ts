import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, session, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron';
import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseScene } from '../src/schema/scene';
import { buildImportRepairRequest } from '../src/schema/importRepair';
import { applicationDirectory, atomicWrite, chooseDataDirectory, readProject, type DataInfo } from './data';

app.enableSandbox();
app.setName('Spatial Geometry Studio');
app.setAppUserModelId('studio.spatialgeometry.teaching');
const development = !app.isPackaged && process.env.SGS_DEV_SERVER === 'http://127.0.0.1:5173';
const indexFile = path.join(__dirname, '../dist/index.html');
const appDirectory = process.env.SGS_DATA_ROOT ?? process.env.PORTABLE_EXECUTABLE_DIR ?? (app.isPackaged ? applicationDirectory(app.getPath('exe'), process.platform) : path.resolve(__dirname, '..'));
const standardDirectory = process.env.SGS_USER_DATA_ROOT ?? app.getPath('userData');
const modeFile = path.join(standardDirectory, 'mode.json');
let window: BrowserWindow | null = null;
let dirty = false;
let currentFile: string | null = null;
let dataInfo: DataInfo;

function trusted(event: IpcMainInvokeEvent | IpcMainEvent) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('未授权的应用请求');
  const url = event.senderFrame?.url.split('#')[0];
  if (url !== pathToFileURL(indexFile).href && !(development && url === 'http://127.0.0.1:5173/')) throw new Error('请求来源不受信任');
}
function registerIPC() {
  ipcMain.handle('prompt:copy', async event => {
    trusted(event);
    const text = await readFile(path.join(__dirname, '../prompts/multimodalToGsceneV1.txt'), 'utf8');
    clipboard.writeText(text);
  });
  ipcMain.handle('prompt:copy-repair', async (event, input: unknown, error: unknown) => {
    trusted(event);
    const prompt = await readFile(path.join(__dirname, '../prompts/multimodalToGsceneV1.txt'), 'utf8');
    clipboard.writeText(buildImportRepairRequest(input, error, prompt));
  });
  ipcMain.handle('project:open', async event => {
    trusted(event);
    const result = await dialog.showOpenDialog(window!, { title: '打开几何项目', defaultPath: path.join(dataInfo.path, 'projects'), filters: [{ name: '几何项目', extensions: ['gscene', 'json'] }], properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const scene = await readProject(filePath);
    currentFile = filePath;
    return { canceled: false, name: path.basename(filePath), scene };
  });
  ipcMain.handle('project:save', async (event, input: unknown, asJson: unknown) => {
    trusted(event);
    const scene = parseScene(input);
    const json = asJson === true;
    const extension = json ? 'json' : 'gscene';
    const name = scene.title.replace(/[\\/:*?"<>|]/g, '-');
    const result = await dialog.showSaveDialog(window!, { title: json ? '导出 JSON' : '保存几何项目', defaultPath: !json && currentFile ? currentFile : path.join(dataInfo.path, 'projects', `${name}.${extension}`), filters: [{ name: json ? 'JSON 数据' : '几何项目', extensions: [extension] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    const target = path.extname(result.filePath) ? result.filePath : `${result.filePath}.${extension}`;
    await atomicWrite(target, JSON.stringify(scene, null, 2));
    if (!json) { currentFile = target; dirty = false; }
    return { canceled: false, name: path.basename(target) };
  });
  ipcMain.handle('image:export', async (event, input: unknown) => {
    trusted(event);
    if (typeof input !== 'string' || input.length > 32 * 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input)) throw new Error('不是有效的 PNG 图片');
    const png = Buffer.from(input.slice('data:image/png;base64,'.length), 'base64');
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('PNG 文件头不正确');
    const result = await dialog.showSaveDialog(window!, { title: '导出课堂图片', defaultPath: path.join(dataInfo.path, 'exports', '几何模型.png'), filters: [{ name: 'PNG 图片', extensions: ['png'] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    await atomicWrite(result.filePath, png);
    return { canceled: false, name: path.basename(result.filePath) };
  });
  ipcMain.handle('data:info', event => { trusted(event); return dataInfo; });
  ipcMain.handle('data:mode', async (event, mode: unknown) => {
    trusted(event);
    if (mode !== 'portable' && mode !== 'standard') throw new Error('不支持的数据模式');
    const next = await chooseDataDirectory(appDirectory, standardDirectory, mode);
    await mkdir(standardDirectory, { recursive: true });
    await atomicWrite(modeFile, JSON.stringify({ mode }));
    return next;
  });
  ipcMain.on('project:dirty', (event, value) => { trusted(event); dirty = value === true; if (window && !window.isDestroyed()) window.setDocumentEdited(dirty); });
}
function createWindow() {
  window = new BrowserWindow({ width: 1480, height: 960, minWidth: 1080, minHeight: 720, title: '空间几何工作室', backgroundColor: '#f5f8fb', show: false, icon: path.join(__dirname, '../build/app.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false, devTools: !app.isPackaged } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  window.on('close', event => {
    if (!dirty) return;
    const choice = dialog.showMessageBoxSync(window!, { type: 'question', title: '尚未保存的修改', message: '当前项目有未保存的修改。确定放弃修改并退出？', buttons: ['继续编辑', '放弃并退出'], defaultId: 0, cancelId: 0, noLink: true });
    if (choice !== 1) event.preventDefault();
  });
  window.on('closed', () => { window = null; });
  if (development) void window.loadURL('http://127.0.0.1:5173/'); else void window.loadFile(indexFile, !app.isPackaged && process.env.SGS_SAMPLE === '1' ? { hash: 'sample-study' } : undefined);
}

async function main() {
  let mode: 'portable' | 'standard' = 'portable';
  try { const preferences = JSON.parse(await readFile(modeFile, 'utf8')); if (preferences.mode === 'standard') mode = 'standard'; } catch { /* A new portable copy starts in portable mode. */ }
  dataInfo = await chooseDataDirectory(appDirectory, standardDirectory, mode);
  app.setPath('userData', path.join(dataInfo.path, 'settings'));
  await app.whenReady();
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  registerIPC(); createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
main().catch(error => { console.error('Application startup failed:', error.message); dialog.showErrorBox('空间几何工作室无法启动', error.message); app.exit(1); });
