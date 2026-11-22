import { useCallback, useEffect, useRef, useState } from 'react';
import { parseScene, MAX_PROJECT_BYTES } from './schema/scene';
import { studioStore, useStudio } from './store/studio';
import { Sidebar, confirmDiscard } from './components/Sidebar';
import { Inspector } from './components/Inspector';
import { Toolbar } from './components/Toolbar';
import { Viewport, type ViewportApi } from './components/Viewport';
import { MotionBar } from './components/MotionBar';
import { Dialogs, type DialogKind } from './components/Dialogs';
import { Icon } from './components/Icon';
import './styles.css';
import './teaching.css';
import { platformVersion } from './platform';

function download(content: Blob | string, name: string) {
  const url = typeof content === 'string' ? content : URL.createObjectURL(content);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  if (typeof content !== 'string') window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Header({ onOpen, onSave, onExport, onModels, onInspector, busy }: { onOpen: () => void; onSave: () => void; onExport: () => void; onModels: () => void; onInspector: () => void; busy: boolean }) {
  const title = useStudio(s => s.scene.title);
  return <header className="app-header"><button className="icon-button mobile-button" aria-label="切换模型库" onClick={onModels}><Icon name="cube" /></button><div className="project-heading"><h1>{title}</h1><p>可旋转的立体几何课堂</p></div><div className="project-actions"><button className="button export-button" onClick={onExport} disabled={busy} title="导出当前画布为 PNG（含标签）"><Icon name="image" size={19} /><span>导出图片</span></button><button className="button" onClick={onOpen} disabled={busy} title="打开项目（Ctrl+O）"><Icon name="folder" size={19} /><span>打开项目</span></button><button className="button primary" onClick={onSave} disabled={busy} title="保存项目（Ctrl+S）"><Icon name="save" size={19} /><span>{busy ? '处理中…' : '保存项目'}</span></button><button className="icon-button mobile-button" aria-label="切换属性栏" onClick={onInspector}><Icon name="layers" /></button></div></header>;
}
function StatusBar() {
  const dirty = useStudio(s => s.dirty);
  const name = useStudio(s => s.fileName);
  return <footer className="status-bar"><div><span>{platformVersion}</span></div><span className={dirty ? 'unsaved-status' : ''}>{dirty ? '● 尚有未保存的修改' : name ? `已保存 · ${name}` : '示例项目 · 尚未另存'}</span></footer>;
}
function Notice() {
  const notice = useStudio(s => s.notice);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => studioStore.getState().clearNotice(), notice.type === 'error' ? 6500 : 3200); return () => window.clearTimeout(timer); }, [notice]);
  return notice ? <div role={notice.type === 'error' ? 'alert' : 'status'} className={`toast ${notice.type}`}><Icon name={notice.type === 'error' ? 'help' : 'check'} size={18} /><span>{notice.text}</span><button aria-label="关闭提示" onClick={() => studioStore.getState().clearNotice()}><Icon name="close" size={15} /></button></div> : null;
}

export default function App() {
  const viewport = useRef<ViewportApi>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const dirty = useStudio(s => s.dirty);
  useEffect(() => { window.studio?.setDirty(dirty); }, [dirty]);
  const reportError = (error: unknown) => studioStore.getState().notify(error instanceof Error ? error.message : String(error), 'error');
  const open = useCallback(async () => {
    if (!confirmDiscard()) return;
    if (!window.studio) { fileInput.current?.click(); return; }
    setBusy(true);
    try { const result = await window.studio.openProject(); if (!result.canceled && result.scene) { studioStore.getState().loadScene(result.scene, result.name); studioStore.getState().notify('项目已打开', 'success'); } } catch (e) { reportError(e); } finally { setBusy(false); }
  }, []);
  const save = useCallback(async (asJson = false) => {
    studioStore.getState().setPlaying(false);
    const scene = studioStore.getState().scene;
    const view = viewport.current?.getView() ?? scene.view;
    const snapshot = { ...scene, view };
    setBusy(true);
    try {
      if (window.studio) {
        const result = await window.studio.saveProject(snapshot, asJson);
        if (!result.canceled) { if (!asJson) studioStore.getState().markSaved(result.name, view); studioStore.getState().notify(asJson ? 'JSON 文件已导出' : '项目已保存', 'success'); }
      } else {
        const name = `${scene.title.replace(/[\\/:*?"<>|]/g, '-')}.${asJson ? 'json' : 'gscene'}`;
        download(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }), name);
        if (!asJson) studioStore.getState().markSaved(name, view);
        studioStore.getState().notify('已导出到浏览器下载目录', 'success');
      }
    } catch (e) { reportError(e); } finally { setBusy(false); }
  }, []);
  const exportImage = useCallback(async () => {
    studioStore.getState().setPlaying(false);
    setBusy(true);
    try {
      const data = viewport.current!.capturePNG();
      if (window.studio) { const result = await window.studio.exportPNG(data); if (!result.canceled) studioStore.getState().notify('PNG 图片已导出（含点标签）', 'success'); }
      else { download(data, `${studioStore.getState().scene.title}.png`); studioStore.getState().notify('PNG 图片已导出', 'success'); }
    } catch (e) { reportError(e); } finally { setBusy(false); }
  }, []);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (dialog) return;
      if (e.key === 'Escape') studioStore.getState().setTool('select');
      const editing = (e.target as HTMLElement)?.matches('input, textarea, select, [contenteditable="true"]');
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
        if (e.key.toLowerCase() === 'o') { e.preventDefault(); void open(); }
        if (!editing && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? studioStore.getState().redo() : studioStore.getState().undo(); }
        if (!editing && e.key.toLowerCase() === 'y') { e.preventDefault(); studioStore.getState().redo(); }
      }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [dialog, save, open]);
  return <div className="studio">
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onHelp={() => setDialog('help')} />
    <Header onOpen={() => void open()} onSave={() => void save()} onExport={() => void exportImage()} onModels={() => { setSidebarOpen(v => !v); setInspectorOpen(false); }} onInspector={() => { setInspectorOpen(v => !v); setSidebarOpen(false); }} busy={busy} />
    <main className="workspace"><Viewport ref={viewport} /><Toolbar onReset={() => viewport.current?.reset()} /><MotionBar /></main>
    <Inspector open={inspectorOpen} onSettings={() => setDialog('settings')} onJson={() => setDialog('json')} />
    <StatusBar /><Notice /><Dialogs kind={dialog} onClose={() => setDialog(null)} onExportJson={() => void save(true)} />
    <input ref={fileInput} className="visually-hidden" type="file" accept=".gscene,.json,application/json" aria-label="选择项目文件" onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return;
      try { if (file.size > MAX_PROJECT_BYTES) throw new Error('项目文件不能超过 2 MB'); const scene = parseScene(await file.text()); studioStore.getState().loadScene(scene, file.name); studioStore.getState().notify('项目已打开', 'success'); } catch (error) { reportError(error); }
      e.target.value = '';
    }} />
  </div>;
}
