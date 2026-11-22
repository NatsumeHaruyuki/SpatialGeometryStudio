import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { parseScene, type Construction, type Scene, type Vec3 } from '../schema/scene';
import { createExample, type ExampleId } from '../geometry/examples';
import { createStudyExample } from '../geometry/studyExample';
import { planeFromPoints, resolvePoints, sectionMotionIds } from '../geometry/engine';
import { deformSolid } from '../geometry/deform';
import { moveRoundControl, roundControlPoints } from '../geometry/roundSolids';
import { tetrahedronSphere } from '../geometry/spheres';
import { producedPoints, referencedPoints } from '../geometry/constructionGraph';
import { getAngle, getPerpendicular, getPointPlaneDistance, getTriangle } from '../geometry/studyConstructions';
import { moveQuestionPrimitive } from '../geometry/questionPrimitive';
import { dihedralMeasurement } from '../geometry/studyGeometry';
import { getDihedral } from '../geometry/dihedral';

export type Tool = 'select' | 'adjust' | 'midpoint' | 'segment' | 'section' | 'dihedral' | 'movingPoint' | 'circumsphere' | 'insphere' | 'perpendicular' | 'triangle' | 'angle' | 'pointPlaneDistance';
export type Selection = { kind: 'point' | 'face' | 'section' | 'triangle'; id: string };
export const toolLabels: Record<Tool, string> = { select: '选择', adjust: '调整顶点', midpoint: '中点', segment: '辅助线', section: '截面', dihedral: '二面角', movingPoint: '动点', circumsphere: '外接球', insphere: '内切球', perpendicular: '作垂线', triangle: '三角形', angle: '角度', pointPlaneDistance: '点面距离' };
export const toolInstructions: Record<Tool, string> = {
  select: '点击点查看坐标；按住 Shift 可多选', midpoint: '依次选择两个点，创建它们的中点',
  segment: '依次选择两个点，连接一条辅助线', section: '依次选择三个不共线的点，生成真实截面',
  dihedral: '先选公共直线的两个端点，再选两个点确定两个平面', movingPoint: '依次选择路径的起点和终点，添加动点',
  adjust: '拖动原始顶点或旋转体控制点；棱柱与棱锥保留有效结构',
  circumsphere: '依次选择 4 个不共面的点，构造所选四面体的外接球',
  insphere: '依次选择 4 个不共面的点，构造所选四面体的内切球',
  perpendicular: '先选过点，再选两个点确定直线；创建垂线及可选垂足',
  triangle: '依次选择三个不共线点，精确高亮这三个点组成的三角形',
  angle: '依次选择 A、B、C 三点，测量 ∠ABC（第二点为顶点）',
  pointPlaneDistance: '先选待测点，再选三个不共线点确定平面；显示距离、向量与射影三角形',
};
export const toolSelectionCount = (tool: Tool) => ['section', 'perpendicular', 'triangle', 'angle'].includes(tool) ? 3 : ['circumsphere', 'insphere', 'pointPlaneDistance', 'dihedral'].includes(tool) ? 4 : 2;
export const dihedralInstruction = (count: number) => count < 2
  ? '第 1 步：选择公共直线，依次点击两个端点（蓝色）'
  : `第 2 步：选择两个点确定两个平面（橙色）${count === 2 ? '，请选择第一个点' : '，请选择第二个点'}`;
export type Notice = { text: string; type: 'success' | 'error' | 'info'; key: number };
export interface StudioState {
  scene: Scene;
  tool: Tool;
  selection: Selection[];
  past: Scene[];
  future: Scene[];
  dirty: boolean;
  fileName: string | null;
  playing: boolean;
  motionId: string | null;
  viewRevision: number;
  notice: Notice | null;
  notify: (text: string, type?: Notice['type']) => void;
  clearNotice: () => void;
  commit: (next: Scene, record?: boolean) => boolean;
  setTool: (tool: Tool) => void;
  pick: (selection: Selection, multi?: boolean) => void;
  construct: (kind: Exclude<Tool, 'select' | 'adjust'>, ids: string[]) => boolean;
  removeConstruction: (id: string) => void;
  changeMotion: (id: string, t: number, record?: boolean) => boolean;
  setPlaying: (playing: boolean) => void;
  setMotionId: (id: string) => void;
  updateDisplay: (key: keyof Scene['display'], value: boolean) => void;
  updatePoint: (id: string, position: Vec3, record?: boolean) => boolean;
  moveSection: (id: string, offset: number, record?: boolean) => boolean;
  setTeachingPlane: (origin: Vec3, normal: Vec3, record?: boolean) => boolean;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  loadExample: (id: ExampleId) => void;
  loadScene: (scene: Scene, fileName?: string, unsaved?: boolean) => void;
  markSaved: (fileName: string, view: Scene['view']) => void;
  changeView: (view: Scene['view']) => void;
}

let sequence = 0;
const newId = () => `c-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
function freePointName(scene: Scene, preferred?: string) {
  const used = new Set(scene.solid.points.map(p => p.id));
  scene.constructions.forEach(c => producedPoints(c).forEach(p => used.add(p.id)));
  if (preferred) {
    if (!used.has(preferred)) return preferred;
    for (let i = 1; i < 1000; i++) if (!used.has(`${preferred}${i}`)) return `${preferred}${i}`;
  }
  for (const letter of ['M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']) if (!used.has(letter)) return letter;
  for (let i = 1; i < 1000; i++) if (!used.has(`P${i}`)) return `P${i}`;
  throw new Error('点的数量已达到上限');
}

export function createStudioStore() {
  const initial = typeof window !== 'undefined' && window.location.hash === '#sample-study' ? createStudyExample() : createExample('cube');
  return createStore<StudioState>((set, get) => ({
    scene: initial, tool: 'select', selection: [], past: [], future: [], dirty: false,
    fileName: null, playing: false, motionId: 'motion-P', viewRevision: 0, notice: null,
    notify: (text, type = 'info') => set({ notice: { text, type, key: ++sequence } }),
    clearNotice: () => set({ notice: null }),
    commit(next, record = true) {
      try {
        const valid = parseScene(next);
        // Schema validation clones input. Preserve the identity of unchanged,
        // already validated geometry to avoid rebuilding the WebGL base model.
        if (!next.solid.definition && (!next.solid.primitive || next.solid.points.length || next.schema_version === 2)) valid.solid = next.solid;
        valid.display = next.display;
        valid.problem = next.problem;
        valid.view = next.view;
        valid.uncertainties = next.uncertainties;
        set(state => ({ scene: valid, dirty: true, future: [], past: record ? [...state.past, state.scene].slice(-80) : state.past }));
        return true;
      } catch (error) {
        get().notify(error instanceof Error ? error.message : '无法完成此构造', 'error');
        return false;
      }
    },
    setTool: tool => {
      const state = get();
      const source = state.tool === 'select' && (tool === 'perpendicular' || tool === 'pointPlaneDistance') && state.selection.length === 1 && state.selection[0].kind === 'point' ? state.selection : [];
      set({ tool, selection: source, playing: false });
    },
    pick(selection, multi = false) {
      const state = get();
      if (state.tool === 'dihedral') {
        if (selection.kind !== 'point') return;
        const index = state.selection.findIndex(p => p.id === selection.id);
        if (index >= 0) { set({ selection: state.selection.slice(0, index) }); return; }
        const next = [...state.selection, selection];
        try {
          const points = resolvePoints(state.scene);
          const vertices = next.map(s => {
            const point = points.get(s.id);
            if (!point) throw new Error(`依赖点 ${s.id} 暂不可用，请选择可用点`);
            return point;
          });
          if (vertices.length === 2 && Math.hypot(...vertices[1].map((v, i) => v - vertices[0][i])) === 0) throw new Error('公共直线的两个端点不能重合');
          if (vertices.length >= 3) dihedralMeasurement(vertices[0], vertices[1], vertices[2], vertices[3] ?? vertices[2]);
        } catch (error) { get().notify(error instanceof Error ? error.message : '无法确定二面角', 'error'); return; }
        if (next.length === 4) {
          if (get().construct('dihedral', next.map(p => p.id))) set({ selection: [], tool: 'select' });
        } else set({ selection: next });
        return;
      }
      if (selection.kind === 'triangle') { if (state.tool === 'select') set({ selection: [selection], playing: false }); return; }
      if (selection.kind === 'section') { set({ selection: [selection], playing: false }); return; }
      if (selection.kind !== 'point') return;
      const old = state.tool === 'adjust' || (state.tool === 'select' && !multi) ? [] : state.selection;
      const staged = (state.tool === 'perpendicular' || state.tool === 'pointPlaneDistance') && old.length > 0;
      const candidates = staged ? old.slice(1) : old;
      const toggled = candidates.some(p => p.id === selection.id) ? candidates.filter(p => p.id !== selection.id) : [...candidates, selection];
      const next = staged ? [old[0], ...toggled] : toggled;
      set({ selection: next });
      if (state.tool !== 'select' && state.tool !== 'adjust' && next.length >= toolSelectionCount(state.tool)) {
        if (get().construct(state.tool, next.map(p => p.id))) {
          const c = get().scene.constructions.at(-1)!;
          set({ selection: c.kind === 'triangle' ? [{ kind: 'triangle', id: c.id }] : [], tool: 'select' });
        }
        else set({ selection: [] });
      }
    },
    construct(kind, ids) {
      const scene = get().scene;
      const id = newId();
      let c: Construction;
      if (ids.length !== toolSelectionCount(kind)) { get().notify(`此工具需要 ${toolSelectionCount(kind)} 个对象`, 'error'); return false; }
      if (kind === 'midpoint' || kind === 'movingPoint') {
        if (kind === 'movingPoint') {
          const current = resolvePoints(scene), a = current.get(ids[0]), b = current.get(ids[1]);
          if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) === 0) { get().notify('动点路径需要两个当前可用且不重合的端点', 'error'); return false; }
        }
        const point = freePointName(scene);
        c = kind === 'midpoint' ? { id, kind, point, label: point, a: ids[0], b: ids[1] } : { id, kind, point, label: point, start: ids[0], end: ids[1], t: 0.5 };
      } else if (kind === 'segment') c = { id, kind, a: ids[0], b: ids[1] };
      else if (kind === 'circumsphere' || kind === 'insphere') {
        try {
          const points = resolvePoints(scene);
          tetrahedronSphere(ids.map(id => { const p = points.get(id); if (!p) throw new Error(`引用的点 ${id} 不存在`); return p; }), kind);
        } catch (error) { get().notify(error instanceof Error ? error.message : '四点不能确定有效四面体', 'error'); return false; }
        c = { id, kind, points: ids as [string, string, string, string] };
      }
      else if (kind === 'perpendicular' || kind === 'pointPlaneDistance') {
        const point = freePointName(scene, 'H');
        c = kind === 'perpendicular' ? { id, kind, from: ids[0], line: [ids[1], ids[2]], point, label: point } : { id, kind, from: ids[0], plane: [ids[1], ids[2], ids[3]], point, label: point };
        const current = resolvePoints(scene);
        const result = c.kind === 'perpendicular' ? getPerpendicular(current, c) : getPointPlaneDistance(current, c);
        if (result.status === 'undefined') { get().notify(result.reason, 'error'); return false; }
        if (c.kind === 'perpendicular' && 'direction' in result && result.direction === null) { get().notify('过点已在直线上，空间中无法唯一确定一条垂线', 'error'); return false; }
      }
      else if (kind === 'triangle' || kind === 'angle') {
        c = kind === 'triangle' ? { id, kind: 'triangle', points: ids as [string, string, string] } : { id, kind: 'angle', points: ids as [string, string, string] };
        const current = resolvePoints(scene);
        const result = c.kind === 'triangle' ? getTriangle(current, c) : getAngle(current, c);
        if (result.status === 'undefined') { get().notify(result.reason, 'error'); return false; }
      }
      else if (kind === 'section') {
        try {
          const current = resolvePoints(scene);
          planeFromPoints(...ids.map(point => current.get(point)!) as [Vec3, Vec3, Vec3]);
        } catch (error) { get().notify(error instanceof Error ? error.message : '当前三点无法确定平面', 'error'); return false; }
        const motions = sectionMotionIds(scene, ids);
        const referenceMotion = Object.fromEntries(scene.constructions.flatMap(item => item.kind === 'movingPoint' && motions.has(item.id) ? [[item.id, item.t]] : []));
        c = { id, kind, points: ids as [string, string, string], ...(motions.size ? { referenceMotion } : {}) };
      }
      else {
        c = { id, kind, points: ids as [string, string, string, string] };
        const result = getDihedral(scene, resolvePoints(scene), c);
        if (result.status === 'undefined') { get().notify(result.reason, 'error'); return false; }
      }
      const success = get().commit({ ...scene, constructions: [...scene.constructions, c] });
      if (success) {
        if (kind === 'movingPoint') set({ motionId: id });
        get().notify(`${toolLabels[kind]}已创建`, 'success');
      }
      return success;
    },
    removeConstruction(id) {
      const scene = get().scene;
      const removed = new Set([id]);
      const removedPoints = new Set<string>();
      let changed = true;
      while (changed) {
        changed = false;
        scene.constructions.forEach(c => {
          if (removed.has(c.id)) producedPoints(c).forEach(p => removedPoints.add(p.id));
          const refs = referencedPoints(c);
          if (!removed.has(c.id) && refs.some(p => removedPoints.has(p))) { removed.add(c.id); changed = true; }
        });
      }
      get().commit({ ...scene, constructions: scene.constructions.filter(c => !removed.has(c.id)) });
      set({ selection: [], playing: false });
      get().notify(`已移除 ${removed.size} 项构造（含依赖项）`, 'success');
    },
    changeMotion(id, t, record = true) {
      const scene = get().scene;
      return get().commit({ ...scene, constructions: scene.constructions.map(c => c.id === id && c.kind === 'movingPoint' ? { ...c, t } : c) }, record);
    },
    setPlaying: playing => set({ playing }),
    setMotionId: motionId => set({ motionId, playing: false }),
    updateDisplay(key, value) { get().commit({ ...get().scene, display: { ...get().scene.display, [key]: value } }); },
    updatePoint(id, position, record = true) {
      const scene = get().scene;
      try {
        const standalone = scene.constructions.find(c => c.kind === 'point' && c.point === id);
        if (standalone?.kind === 'point') {
          if (standalone.position.every((n, i) => n === position[i])) return false;
          return get().commit({ ...scene, constructions: scene.constructions.map(c => c === standalone ? { ...standalone, position } : c) }, record);
        }
        let solid: Scene['solid'];
        if (scene.solid.primitive && scene.schema_version === 2) solid = moveQuestionPrimitive(scene.solid, id, position);
        else if (scene.solid.primitive) {
          const primitive = moveRoundControl(scene.solid.primitive, id, position);
          solid = { ...scene.solid, primitive, points: roundControlPoints(primitive) };
        } else if (scene.schema_version === 2 && scene.solid.type === 'diagram') {
          if (!scene.solid.points.some(p => p.id === id)) return false;
          solid = { ...scene.solid, points: scene.solid.points.map(p => p.id === id ? { ...p, position } : p) };
        } else solid = deformSolid(scene.solid, id, position);
        if (solid.points.every((p, index) => p.position.every((n, axis) => Math.abs(n - scene.solid.points[index].position[axis]) < 1e-8))) return false;
        const warning = '模型已手动调整，原题的等长、垂直等度量条件需重新核对。';
        return get().commit({ ...scene, solid, uncertainties: scene.uncertainties.includes(warning) ? scene.uncertainties : [...scene.uncertainties, warning] }, record);
      } catch (error) { get().notify(error instanceof Error ? error.message : '无法调整此顶点', 'error'); return false; }
    },
    moveSection(id, offset, record = true) {
      const scene = get().scene;
      const cut = scene.constructions.find(c => c.id === id);
      if (!cut || (cut.kind !== 'section' && cut.kind !== 'planeSection') || Math.abs((cut.offset ?? 0) - offset) < 1e-8) return false;
      return get().commit({ ...scene, constructions: scene.constructions.map(c => c.id === id ? { ...cut, offset } : c) }, record);
    },
    setTeachingPlane(origin, normal, record = true) {
      const scene = get().scene;
      const selectedId = get().selection.find(s => s.kind === 'section')?.id;
      const cut = scene.constructions.find(c => c.kind === 'planeSection' && c.id === selectedId) ?? scene.constructions.findLast(c => c.kind === 'planeSection');
      const next: Construction = { id: cut?.id ?? newId(), kind: 'planeSection', origin, normal };
      const success = get().commit({ ...scene, constructions: cut ? scene.constructions.map(c => c.id === cut.id ? next : c) : [...scene.constructions, next] }, record);
      if (success) set({ selection: [{ kind: 'section', id: next.id }] });
      return success;
    },
    checkpoint: () => set(state => ({ past: [...state.past, state.scene].slice(-80), future: [] })),
    undo() {
      const state = get();
      if (!state.past.length) return;
      set({ scene: state.past.at(-1)!, past: state.past.slice(0, -1), future: [state.scene, ...state.future], dirty: true, selection: [], playing: false });
    },
    redo() {
      const state = get();
      if (!state.future.length) return;
      set({ scene: state.future[0], future: state.future.slice(1), past: [...state.past, state.scene], dirty: true, selection: [], playing: false });
    },
    loadExample(id) { get().loadScene(createExample(id)); },
    loadScene(input, fileName, unsaved = false) {
      try {
        const scene = parseScene(input);
        set(state => ({ scene, fileName: fileName ?? null, past: [], future: [], dirty: unsaved, selection: [], playing: false, tool: 'select', motionId: scene.constructions.find(c => c.kind === 'movingPoint')?.id ?? null, viewRevision: state.viewRevision + 1 }));
      } catch (error) { get().notify(error instanceof Error ? error.message : '项目无法打开', 'error'); }
    },
    markSaved(fileName, view) { set(state => ({ fileName, dirty: false, scene: { ...state.scene, view } })); },
    changeView(view) {
      const previous = get().scene.view;
      if (![...view.position, ...view.target].some((value, index) => Math.abs(value - [...previous.position, ...previous.target][index]) > 1e-5)) return;
      set(state => ({ scene: { ...state.scene, view }, dirty: true }));
    },
  }));
}

export const studioStore = createStudioStore();
export function useStudio<T>(selector: (state: StudioState) => T): T { return useStore(studioStore, selector); }
