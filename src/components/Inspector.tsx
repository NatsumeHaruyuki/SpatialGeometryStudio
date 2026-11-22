import { useEffect, useMemo, useRef, useState } from 'react';
import { getSection, getSphere, resolvePoints } from '../geometry/engine';
import type { Construction, Scene, SectionConstruction, Vec3 } from '../schema/scene';
import { dihedralInstruction, studioStore, toolInstructions, useStudio } from '../store/studio';
import { Icon } from './Icon';
import { RoundSectionControls } from './RoundSectionControls';
import { authoredPoints, pointNames as scenePointNames, producedPoints } from '../geometry/constructionGraph';
import { getAngle, getPerpendicular, getPointPlaneDistance, getTriangle } from '../geometry/studyConstructions';
import { getDihedral } from '../geometry/dihedral';

const label = (id: string) => id.replaceAll('1', '₁');
const isSection = (c: Construction): c is SectionConstruction => c.kind === 'section' || c.kind === 'planeSection';
const offsetFormat = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 5, useGrouping: false });

function describeSection(c: SectionConstruction, result: ReturnType<typeof getSection>) {
  const title = c.kind === 'section' ? `截面 ${c.points.map(label).join('')}` : '自由截面';
  const detail = [result.status === 'undefined' ? result.reason : result.kind];
  if (result.status === 'defined' && result.curves.length) {
    detail.push(result.area !== null && result.closed.some(Boolean) ? `面积 ${result.area.toFixed(3)}` : '无封闭面积');
  }
  detail.push(`法向偏移 ${offsetFormat.format(c.offset ?? 0)}`);
  return { icon: 'section', title, detail: detail.join(' · ') };
}

function describeConstruction(c: Exclude<Construction, SectionConstruction>, scene: Scene, points: Map<string, Vec3>) {
  const names = scenePointNames(scene);
  const name = (id: string) => names.get(id) ?? id;
  const fmt = (n: number) => offsetFormat.format(Math.abs(n) < 1e-12 ? 0 : n);
  const vec = (p: Vec3) => `(${p.map(fmt).join(', ')})`;
  if (c.kind === 'point') return { icon: 'labels', title: `题目点 ${c.label}`, detail: `坐标 ${vec(c.position)} · 按 JSON 明确定义` };
  if (c.kind === 'midpoint') return { icon: 'midpoint', title: `中点 ${c.label}`, detail: `${label(c.a)}${label(c.b)} 的中点 · 自动更新` };
  if (c.kind === 'movingPoint') {
    const a = points.get(c.start), b = points.get(c.end);
    const state = !a || !b ? ' · 依赖点暂不可用，恢复后自动更新' : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) === 0 ? ' · 路径暂缩为一点，端点分开后恢复' : '';
    return { icon: 'movingPoint', title: `动点 ${c.label}`, detail: `沿 ${name(c.start)}${name(c.end)} 运动 · t = ${c.t.toFixed(2)}${state}` };
  }
  if (c.kind === 'segment') return { icon: 'segment', title: `辅助线 ${label(c.a)}${label(c.b)}`, detail: '连接两点的线段' };
  if (c.kind === 'circumsphere' || c.kind === 'insphere') {
    const sphere = getSphere(points, c);
    const name = c.kind === 'circumsphere' ? '外接球' : '内切球';
    return { icon: c.kind, title: `${name} ${c.points.map(label).join('')}`, detail: sphere.status === 'defined' ? `R = ${offsetFormat.format(sphere.radius)} · 球心 (${sphere.center.map(n => offsetFormat.format(Math.abs(n) < 1e-12 ? 0 : n)).join(', ')}) · 所选四面体` : sphere.reason };
  }
  if (c.kind === 'perpendicular') {
    const result = getPerpendicular(points, c);
    return { icon: c.kind, title: `垂线 ${name(c.from)}${c.label}`, detail: result.status === 'undefined' ? result.reason : `${name(c.from)} 到直线 ${c.line.map(name).join('')} · 垂足 ${c.label} · 长度 ${fmt(result.distance)}${result.direction ? '' : ' · 点在直线上，垂线方向暂不可定义'}` };
  }
  if (c.kind === 'triangle') {
    const result = getTriangle(points, c);
    return { icon: c.kind, title: `三角形 ${c.points.map(name).join('')}`, detail: result.status === 'undefined' ? result.reason : `面积 ${fmt(result.area)} · 仅高亮所选三点，独立于截面` };
  }
  if (c.kind === 'angle') {
    const result = getAngle(points, c);
    return { icon: c.kind, title: `角 ∠${c.points.map(name).join('')} ${result.status === 'defined' ? `${result.degrees.toFixed(2)}°` : ''}`, detail: result.status === 'undefined' ? result.reason : `顶点 ${name(c.points[1])} · 随依赖点动态更新` };
  }
  if (c.kind === 'pointPlaneDistance') {
    const result = getPointPlaneDistance(points, c);
    const reference = result.status === 'defined' ? name(c.plane[result.referenceIndex]) : '';
    return { icon: c.kind, title: `点面距离 ${name(c.from)} → ${c.plane.map(name).join('')}`, detail: result.status === 'undefined' ? result.reason : `距离 ${fmt(result.distance)} · 垂足 ${c.label} · 参考点 ${reference} · 方向向量 v = ${vec(result.direction)} · 单位法向量 n = ${vec(result.unitNormal)} · d = |v·n| = ${fmt(result.distance)} · ${result.distance > 0 ? `射影三角形 ${reference}${c.label}${name(c.from)}` : '点在平面内，射影三角形退化'} · 平面无限延伸` };
  }
  const angle = getDihedral(scene, points, c);
  const definition = 'points' in c ? `${name(c.points[2])}—${c.points.slice(0, 2).map(name).join('')}—${name(c.points[3])}` : '';
  return { icon: 'dihedral', title: `二面角${angle.status === 'defined' ? ` ${angle.degrees.toFixed(2)}°` : ''}`, detail: angle.status === 'undefined' ? `${definition} · ${angle.reason}` : `外角 ${angle.exterior.toFixed(2)}° · ${'points' in c ? '公共直线' : '公共棱'} ${angle.edge.map(name).join('')}${definition ? ` · ${definition}` : ''}` };
}

function Toggle({ label: text, icon, checked, onChange }: { label: string; icon: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="display-toggle"><span><Icon name={icon} size={19} />{text}</span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span className="switch" aria-hidden="true" /></label>;
}
export function DisplayControls() {
  const display = useStudio(s => s.scene.display);
  const options: { key: keyof Scene['display']; label: string; icon: string }[] = [
    { key: 'grid', label: '网格', icon: 'grid' }, { key: 'labels', label: '标签', icon: 'labels' }, { key: 'faces', label: '半透明面', icon: 'faces' }, { key: 'sectionPlane', label: '截平面延展', icon: 'section' }, { key: 'hiddenEdges', label: '遮挡棱虚线', icon: 'eye' },
  ];
  return <div className="display-controls">{options.map(o => <Toggle key={o.key} label={o.label} icon={o.icon} checked={display[o.key]} onChange={v => studioStore.getState().updateDisplay(o.key, v)} />)}</div>;
}

function PointEditor({ scene }: { scene: Scene }) {
  const editable = authoredPoints(scene);
  const [id, setId] = useState(editable[0].id);
  const point = editable.find(p => p.id === id) ?? editable[0];
  const [values, setValues] = useState(point.position.map(String));
  useEffect(() => setValues(point.position.map(String)), [point.id, point.position[0], point.position[1], point.position[2]]);
  return <form className="point-editor" onSubmit={e => { e.preventDefault(); studioStore.getState().updatePoint(point.id, values.map(Number) as Vec3); }}>
    <h3>{scene.schema_version === 2 ? '题目点坐标' : scene.solid.primitive ? '控制点坐标' : '顶点坐标'}</h3><p className="hint">{scene.schema_version === 2 ? scene.solid.definition ? '题目点名与 JSON 一致；定义旋转体的点会同步调整模型。' : '修改明确声明的题目点，依赖构造随之更新。' : scene.solid.primitive ? 'O 移动模型，T 调整轴向和高度，圆周点调整半径。' : '棱柱与棱锥保持对应结构，依赖构造随之更新。'}</p>
    <select aria-label="编辑顶点" value={point.id} onChange={e => setId(e.target.value)}>{editable.map(p => <option value={p.id} key={p.id}>点 {p.label}</option>)}</select>
    <div className="coordinate-inputs">{['x', 'y', 'z'].map((axis, i) => <label key={axis}>{axis}<input aria-label={`顶点${axis}坐标`} type="number" step="0.1" min="-10000" max="10000" required value={values[i]} onChange={e => setValues(v => v.map((s, index) => index === i ? e.target.value : s))} /></label>)}</div>
    <button className="button full-width" type="submit">应用坐标</button>
  </form>;
}

export function Inspector({ open, onSettings, onJson }: { open: boolean; onSettings: () => void; onJson: () => void }) {
  const [tab, setTab] = useState<'construct' | 'display'>('construct');
  const pointChooser = useRef<HTMLDetailsElement>(null);
  const scene = useStudio(s => s.scene);
  const selection = useStudio(s => s.selection);
  const tool = useStudio(s => s.tool);
  const motionId = useStudio(s => s.motionId);
  const points = useMemo(() => resolvePoints(scene), [scene.solid, scene.constructions]);
  const names = useMemo(() => scenePointNames(scene), [scene.solid, scene.constructions]);
  const selected = selection.find(s => s.kind === 'point');
  const selectedSection = selection.find(s => s.kind === 'section');
  const selectedConstruction = scene.constructions.find(c => c.id === selectedSection?.id);
  const freePlane = selectedConstruction?.kind === 'planeSection' ? selectedConstruction : scene.constructions.findLast(c => c.kind === 'planeSection');
  const currentSection = scene.solid.primitive && tab === 'construct' && freePlane ? getSection(scene, points, freePlane) : undefined;
  const motion = scene.constructions.find(c => c.id === motionId && c.kind === 'movingPoint');
  const currentPoint = selected?.id ?? (motion?.kind === 'movingPoint' ? motion.point : undefined);
  const position = currentPoint ? points.get(currentPoint) : undefined;
  useEffect(() => { if (tool !== 'select') setTab('construct'); }, [tool]);
  useEffect(() => { if (tool === 'dihedral' && tab === 'construct') pointChooser.current?.scrollIntoView({ block: 'nearest' }); }, [tool, tab]);
  return <aside className={`inspector ${open ? 'panel-open' : ''}`} aria-label="构造和显示设置">
    <div className="inspector-tabs" role="tablist"><button role="tab" aria-selected={tab === 'construct'} onClick={() => setTab('construct')}>构造</button><button role="tab" aria-selected={tab === 'display'} onClick={() => setTab('display')}>显示</button></div>
    <div className="inspector-content">
      {tab === 'construct' ? <>
        <h2>标准构造 <span>{scene.constructions.length + 1}</span></h2>
        <div className="construction-list">
          <div className="construction-row base-row"><span className="step-number">01</span><Icon name="cube" size={25} /><div><strong>原始模型</strong><p>{scene.solid.type} · {scene.solid.points.length} 个{scene.schema_version === 2 ? '题目点' : scene.solid.primitive ? '控制点' : '顶点'}</p></div></div>
          {scene.constructions.map((c, i) => {
            const section = isSection(c);
            const item = section
              ? describeSection(c, c.id === freePlane?.id && currentSection ? currentSection : getSection(scene, points, c))
              : describeConstruction(c, scene, points);
            const triangleSelected = c.kind === 'triangle' && selection.some(s => s.kind === 'triangle' && s.id === c.id);
            return <div key={c.id} className={`construction-row ${c.kind} ${triangleSelected ? 'selected-construction' : ''} ${c.kind === 'planeSection' ? 'section' : ''}`} data-testid={`construction-${c.kind}`}>
              <span className="step-number">{String(i + 2).padStart(2, '0')}</span><Icon name={item.icon} size={23} />
              <div>
                <strong>{item.title}</strong><p className={c.kind === 'pointPlaneDistance' ? 'projection-details' : undefined}>{c.kind === 'pointPlaneDistance' ? item.detail.split(' · ').map((part, index) => <span key={index}>{part}</span>) : item.detail}</p>
                {section ? <button type="button" className="text-button select-section" aria-label={`选择截平面 ${item.title}（第 ${i + 2} 项）`} aria-current={selectedSection?.id === c.id || undefined} onClick={() => {
                  const state = studioStore.getState();
                  if (state.tool !== 'select') state.setTool('select');
                  state.pick({ kind: 'section', id: c.id });
                }}>选择截平面</button> : null}
                {c.kind === 'triangle' ? <button type="button" className="text-button select-triangle" aria-label={`选择三角形 ${c.points.map(id => names.get(id) ?? id).join('')}`} aria-current={triangleSelected || undefined} onClick={() => { const state = studioStore.getState(); state.setTool('select'); state.pick({ kind: 'triangle', id: c.id }); }}>选择三角形</button> : null}
                {['insphere', 'circumsphere', 'perpendicular', 'pointPlaneDistance'].includes(c.kind) ? producedPoints(c).map(p => <button key={p.id} type="button" className="text-button select-derived-point" disabled={!points.has(p.id)} aria-label={`选择${c.kind === 'insphere' || c.kind === 'circumsphere' ? '球心' : '垂足'} ${p.label}`} onClick={() => { const state = studioStore.getState(); if (state.tool === 'adjust') state.setTool('select'); state.pick({ kind: 'point', id: p.id }, state.tool !== 'select'); }}>选择{c.kind === 'insphere' || c.kind === 'circumsphere' ? '球心' : '垂足'} {p.label}</button>) : null}
              </div>
              <button className="delete-construction" aria-label={`删除${item.title}`} title="删除此构造及依赖项" onClick={() => studioStore.getState().removeConstruction(c.id)}><Icon name="trash" size={14} /></button>
            </div>;
          })}
        </div>
        {scene.solid.primitive ? <RoundSectionControls key={scene.id} primitive={scene.solid.primitive} section={currentSection} /> : null}
        {position ? <section className="selection-panel"><h3><span className="selection-dot" />{selected ? '所选对象' : '当前动点'}：点 <em>{names.get(currentPoint!) ?? currentPoint}</em></h3><p className="coordinates">坐标 <span>({position.map(n => Math.abs(n) < 0.0005 ? '0.000' : n.toFixed(3)).join(', ')})</span></p>{motion?.kind === 'movingPoint' && currentPoint === motion.point ? <p>参数： <i>t</i> = {motion.t.toFixed(2)}</p> : <p className="hint">{scene.solid.points.some(p => p.id === currentPoint) ? '原始顶点 · 可在显示页修改坐标' : '依赖点 · 随原始对象自动更新'}</p>}</section> : null}
        {selected && !position ? <section className="selection-panel"><h3>点 {names.get(selected.id) ?? selected.id}</h3><p>依赖构型退化，点暂不可用；恢复后自动更新。</p></section> : null}
        <details className="point-chooser" ref={pointChooser} open={tool !== 'select' || undefined} key={tool}>
          <summary>按名称选择点</summary>
          <p className="hint">{tool === 'dihedral' ? dihedralInstruction(selection.length) : toolInstructions[tool]}</p>
          {tool === 'dihedral' ? <div className="dihedral-selection-key"><span className="dihedral-axis-key">蓝色：公共直线端点</span><span className="dihedral-plane-key">橙色：确定平面的点</span><small>再次点击已选点，从该点重新选择</small></div> : null}
          <div className="selection-chips">{[...points.keys()].map(id => {
            const index = selection.findIndex(s => s.kind === 'point' && s.id === id);
            const role = tool === 'dihedral' && index >= 0 ? index < 2 ? 'dihedral-axis-point' : 'dihedral-plane-point' : '';
            return <button key={id} className={`${index >= 0 ? 'selected' : ''} ${role}`} aria-pressed={index >= 0} onClick={() => studioStore.getState().pick({ kind: 'point', id }, true)} aria-label={`选择点 ${names.get(id) ?? id}`}>{names.get(id) ?? id}</button>;
          })}</div>
        </details>
        <div className="inspector-divider" /><h3>显示控制</h3><DisplayControls />
      </> : <>
        <h2>显示控制</h2><DisplayControls /><div className="inspector-divider" />{authoredPoints(scene).length ? <PointEditor key={scene.id} scene={scene} /> : <p className="hint">此模型尚未声明题目点，可通过 JSON 添加；模型参数已独立保存。</p>}
        <div className="inspector-divider" /><h3>模型说明</h3><p className="hint">{scene.problem.note}</p>{scene.uncertainties.map(text => <p className="uncertainty" key={text}>{text}</p>)}
      </>}
      <div className="inspector-bottom"><button className="text-button" onClick={onJson}><Icon name="download" size={16} />JSON 导入 / 导出</button><button className="icon-button" aria-label="数据目录设置" title="数据目录设置" onClick={onSettings}><Icon name="settings" size={18} /></button></div>
    </div>
  </aside>;
}
