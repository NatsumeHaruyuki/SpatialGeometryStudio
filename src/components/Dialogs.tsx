import { useLayoutEffect, useRef, useState } from 'react';
import rawPrompt from '../../prompts/multimodalToGsceneV1.txt?raw';
import { parseScene } from '../schema/scene';
import type { DataInfo } from '../desktop';
import { studioStore } from '../store/studio';
import { confirmDiscard } from './Sidebar';
import { Icon } from './Icon';
import { HelpContent } from './HelpContent';
import { buildImportRepairRequest } from '../schema/importRepair';
import './PromptCopy.css';

const copyMessages = {
  idle: '',
  copying: '正在复制…',
  success: '完整 Prompt 已复制到剪贴板。',
  error: '复制失败。请展开「手动复制 Prompt」，选中全文后复制。',
};

function PromptCopy() {
  const [status, setStatus] = useState<keyof typeof copyMessages>('idle');

  async function copyPrompt() {
    setStatus('copying');
    try {
      if (window.studio) await window.studio.copyPrompt();
      else await navigator.clipboard.writeText(rawPrompt);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  return <div className="prompt-copy">
    <div className="prompt-copy-row">
      <button type="button" className="button primary" onClick={copyPrompt} disabled={status === 'copying'}>一键复制 Prompt</button>
      <span className={status === 'error' ? 'prompt-copy-error' : 'success-message'} role="status">{copyMessages[status]}</span>
    </div>
    {status === 'error' ? <details className="prompt-copy-fallback">
      <summary>手动复制 Prompt</summary>
      <textarea className="json-input" aria-label="完整 Prompt" spellCheck={false} value={rawPrompt} readOnly />
    </details> : null}
  </div>;
}

export type DialogKind = 'help' | 'agent' | 'settings' | 'json' | null;
export function Dialogs({ kind, onClose, onExportJson }: { kind: DialogKind; onClose: () => void; onExportJson: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<DataInfo | null>(null);
  const [mode, setMode] = useState<'portable' | 'standard'>('portable');
  const [json, setJson] = useState('');
  const [error, setError] = useState('');
  const [repairStatus, setRepairStatus] = useState('');
  const [nextPath, setNextPath] = useState('');
  useLayoutEffect(() => {
    setError(''); setRepairStatus(''); setNextPath('');
    if (kind) dialog.current?.showModal(); else dialog.current?.close();
    if (kind === 'json') setJson(JSON.stringify(studioStore.getState().scene, null, 2));
    if (kind === 'settings') window.studio?.dataInfo().then(info => { setData(info); setMode(info.mode); }).catch(e => setError(String(e)));
  }, [kind]);
  function importJson() {
    setRepairStatus('');
    try {
      const scene = parseScene(json);
      if (!confirmDiscard()) return;
      studioStore.getState().loadScene(scene, undefined, true);
      studioStore.getState().notify('JSON 校验通过，已导入项目', 'success');
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'JSON 无法读取'); }
  }
  async function copyRepair() {
    try {
      if (window.studio) await window.studio.copyImportRepair(json, error);
      else await navigator.clipboard.writeText(buildImportRepairRequest(json, error, rawPrompt));
      setRepairStatus('修复请求已复制，可粘贴给原多模态模型。');
    } catch { setRepairStatus('复制失败，请手动复制错误信息和原 JSON。'); }
  }
  return <dialog ref={dialog} className={`app-dialog ${kind === 'json' ? 'json-dialog' : ''}`} onCancel={onClose} onClick={event => { if (event.target === dialog.current) { const bounds = dialog.current!.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
    <div className="dialog-header">
      <h2>{kind === 'help' ? '操作指南' : kind === 'agent' ? 'AI 识图' : kind === 'settings' ? '数据目录设置' : 'GeometrySceneSpec JSON'}</h2>
      <button className="icon-button" aria-label="关闭对话框" onClick={onClose}><Icon name="close" /></button>
      {kind === 'json' ? <PromptCopy /> : null}
    </div>
    <div className="dialog-body">
      {kind === 'help' ? <HelpContent /> : null}
      {kind === 'agent' ? <><div className="dialog-illustration"><Icon name="image" size={36} /></div><h3>工作组 Agent 尚未接入</h3><p>当前试样可离线完成几何构造和项目保存。尚未配置图片识别服务，不会上传图片或发送网络请求。</p><p>后续接入需要工作组的服务地址、认证方式和接口格式。识别结果须先经校验与教师确认，再进入三维场景。</p><p className="hint">已有结构化模型可通过 JSON 导入，无需 Agent。</p></> : null}
      {kind === 'settings' ? <><p>便携模式将项目和设置放在程序旁的独立数据文件夹，便于复制和迁移。</p><label className="field-label">运行模式<select value={mode} onChange={e => setMode(e.target.value as 'portable' | 'standard')}><option value="portable">便携模式 · 程序旁的数据文件夹</option><option value="standard">标准模式 · 当前用户的数据目录</option></select></label><label className="field-label">当前数据目录<output className="path-output">{data?.path ?? '网页预览使用浏览器下载和文件选择器'}</output></label>{data?.warning ? <p className="uncertainty">{data.warning}</p> : null}{nextPath ? <p className="success-message">下次启动生效：{nextPath}</p> : null}<p className="hint">程序目录不可写时会自动回退到当前用户目录。切换模式不会移动或删除已有项目；可用“打开项目”读取原目录中的文件。</p><button className="button primary" disabled={!window.studio} onClick={async () => { try { const result = await window.studio!.setDataMode(mode); setNextPath(result.path); } catch (e) { setError(String(e)); } }}>保存目录设置</button></> : null}
      {kind === 'json' ? <>
        <ol className="prompt-copy-steps">
          <li>点击「一键复制 Prompt」。</li>
          <li>在外部 Agent 中选择多模态模型，粘贴题图和 Prompt，发送后等待结果。</li>
          <li>将返回的 JSON 粘贴到下方，点击「校验并导入」。</li>
        </ol>
        <p>题目点优先：新版 JSON 中的字母和坐标直接用于作图，圆锥等模型不会占用 A、B、C、O。兼容旧版项目和模型返回的代码围栏文本。</p>
        <textarea className="json-input" aria-label="项目 JSON" spellCheck={false} value={json} onChange={e => { setJson(e.target.value); setError(''); setRepairStatus(''); }} />
        <div className="dialog-actions"><button className="button" onClick={onExportJson}><Icon name="download" size={17} />导出 JSON 文件</button><button className="button primary" onClick={importJson}>校验并导入</button></div>
      </> : null}
      {error ? <div className="import-error"><p className="error-message" role="alert">{error}</p>{kind === 'json' ? <><button type="button" className="button" onClick={copyRepair}>一键复制修复请求</button><p className="hint">复制具体错误、当前 JSON 和完整规范，交给原多模态模型修复。</p>{repairStatus ? <p role="status" className="success-message">{repairStatus}</p> : null}</> : null}</div> : null}
    </div>
  </dialog>;
}
