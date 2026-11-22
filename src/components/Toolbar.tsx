import { dihedralInstruction, studioStore, toolInstructions, toolLabels, toolSelectionCount, useStudio, type Tool } from '../store/studio';
import { Icon } from './Icon';
import { useLayoutEffect, useRef } from 'react';
import './dihedral.css';

const tools: Tool[] = ['select', 'adjust', 'midpoint', 'segment', 'perpendicular', 'triangle', 'angle', 'pointPlaneDistance', 'section', 'circumsphere', 'insphere', 'dihedral', 'movingPoint'];
export function Toolbar({ onReset }: { onReset: () => void }) {
  const area = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = area.current!;
    const workspace = element.closest<HTMLElement>('.workspace')!;
    const reserveSpace = () => workspace.style.setProperty('--toolbar-space', `${element.getBoundingClientRect().bottom - workspace.getBoundingClientRect().top + 12}px`);
    const observer = new ResizeObserver(reserveSpace);
    observer.observe(element); reserveSpace();
    return () => { observer.disconnect(); workspace.style.removeProperty('--toolbar-space'); };
  }, []);
  const tool = useStudio(s => s.tool);
  const selection = useStudio(s => s.selection);
  const questionMode = useStudio(s => s.scene.schema_version === 2);
  const instruction = tool === 'dihedral' ? dihedralInstruction(selection.length) : tool === 'adjust' && questionMode ? '拖动题目中明确声明的点；模型定义点会同步调整对应旋转体' : toolInstructions[tool];
  const canUndo = useStudio(s => s.past.length > 0);
  const canRedo = useStudio(s => s.future.length > 0);
  return <div className="toolbar-area" ref={area}>
    <div className="toolbar" role="toolbar" aria-label="几何构造工具">
      <div className="tool-group">{tools.map(item => <button key={item} onClick={() => studioStore.getState().setTool(item)} className={`tool-button ${tool === item ? 'active' : ''}`} aria-pressed={tool === item} title={toolInstructions[item]}><Icon name={item} size={21} /><span>{toolLabels[item]}</span></button>)}</div>
      <div className="tool-utilities"><button className="icon-button" title="撤销（Ctrl+Z）" aria-label="撤销" disabled={!canUndo} onClick={() => studioStore.getState().undo()}><Icon name="undo" size={18} /></button><button className="icon-button" title="重做（Ctrl+Y）" aria-label="重做" disabled={!canRedo} onClick={() => studioStore.getState().redo()}><Icon name="redo" size={18} /></button><button className="icon-button reset-view" title="重置视图" aria-label="重置视图" onClick={onReset}><Icon name="reset" size={21} /></button></div>
    </div>
    {tool !== 'select' ? <div className={`tool-instruction ${tool === 'dihedral' ? 'dihedral-instruction' : ''}`} role="status"><span>{instruction}</span>{tool !== 'adjust' ? <small>已选 {selection.length} / {toolSelectionCount(tool)}</small> : null}<button onClick={() => studioStore.getState().setTool('select')}>取消</button></div> : <div className="drag-hint">Alt + 拖动截平面：平移截面</div>}
  </div>;
}
