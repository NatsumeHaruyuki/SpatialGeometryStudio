import type { Scene, Solid, Vec3 } from '../schema/scene';
import { roundControlPoints, roundFrame, type RoundPrimitive } from './roundSolids';
import { add, scale } from './engine';

export const exampleIds = ['cube', 'tetrahedron', 'prism', 'motion', 'quadPyramid', 'cylinder', 'cone', 'doubleCone'] as const;
export type ExampleId = typeof exampleIds[number];
export const exampleLabels: Record<ExampleId, string> = {
  cube: '四棱柱', tetrahedron: '三棱锥', prism: '三棱柱', motion: '动点与截面', quadPyramid: '四棱锥', cylinder: '圆柱', cone: '单圆锥', doubleCone: '双圆锥',
};
export const modelGroups: { label: string; icon: string; models: ExampleId[] }[] = [
  { label: '棱柱', icon: 'prism', models: ['prism', 'cube'] },
  { label: '棱锥', icon: 'pyramid', models: ['tetrahedron', 'quadPyramid'] },
  { label: '', icon: 'cylinder', models: ['cylinder'] },
  { label: '圆锥', icon: 'cone', models: ['cone', 'doubleCone'] },
];

function solid(id: string, type: string, positions: Record<string, Vec3>, loops: Record<string, string[]>): Solid {
  const points = Object.entries(positions).map(([name, position]) => ({ id: name, label: name.replace(/1/g, '₁'), position }));
  const edges = new Map<string, { id: string; start: string; end: string }>();
  Object.values(loops).forEach(vertices => vertices.forEach((start, i) => {
    const end = vertices[(i + 1) % vertices.length];
    const key = [start, end].sort().join('-');
    edges.set(key, { id: key, start, end });
  }));
  return { id, type, points, edges: [...edges.values()], faces: Object.entries(loops).map(([faceId, vertices]) => ({ id: faceId, label: vertices.map(p => p.replace(/1/g, '₁')).join(''), vertices })) };
}

export function createExample(id: ExampleId): Scene {
  const scene: Scene = {
    schema_version: 1, id, title: '', problem: { text: '', conditions: [], note: '' },
    solid: { id: '', type: '', points: [], edges: [], faces: [] }, constructions: [],
    display: { grid: true, labels: true, faces: true, sectionPlane: true, hiddenEdges: true },
    view: { position: [5, 4, 5], target: [1, 0.95, -1] }, uncertainties: [],
  };
  if (id === 'cube') {
    scene.title = '正方体 · 截面探究';
    scene.solid = solid('cube', '正方体', {
      A: [0, 0, 0], B: [2, 0, 0], C: [2, 0, -2], D: [0, 0, -2],
      A1: [0, 2, 0], B1: [2, 2, 0], C1: [2, 2, -2], D1: [0, 2, -2],
    }, { bottom: ['A', 'B', 'C', 'D'], top: ['A1', 'D1', 'C1', 'B1'], front: ['A', 'A1', 'B1', 'B'], right: ['B', 'B1', 'C1', 'C'], back: ['C', 'C1', 'D1', 'D'], left: ['D', 'D1', 'A1', 'A'] });
    scene.problem = { text: '在正方体 ABCD-A₁B₁C₁D₁ 中，M、N 分别为棱 A₁D₁、C₁D₁ 的中点，点 P 在线段 AB 上运动。探究平面 MNP 截正方体所得截面图形及其性质。', conditions: ['棱长为 2', 'M、N 为两条上棱的中点', 'P ∈ AB，0 ≤ t ≤ 1'], note: '拖动底部滑块，观察真实截面及面积变化。' };
    scene.constructions = [
      { id: 'mid-M', kind: 'midpoint', point: 'M', label: 'M', a: 'A1', b: 'D1' },
      { id: 'mid-N', kind: 'midpoint', point: 'N', label: 'N', a: 'C1', b: 'D1' },
      { id: 'motion-P', kind: 'movingPoint', point: 'P', label: 'P', start: 'A', end: 'B', t: 0.5 },
      { id: 'section-MNP', kind: 'section', points: ['M', 'N', 'P'] },
    ];
  } else if (id === 'tetrahedron') {
    scene.title = '三棱锥 · 垂直与二面角';
    scene.solid = solid('tetrahedron', '三棱锥', { A: [0, 1, 0], B: [-1, 0, 0], C: [0, 0, Math.sqrt(3)], D: [1, 0, 0] }, { BCD: ['B', 'C', 'D'], ABD: ['A', 'D', 'B'], ABC: ['A', 'B', 'C'], ACD: ['A', 'C', 'D'] });
    scene.problem = { text: '三棱锥 A-BCD 中，△BCD 是边长为 2 的等边三角形，平面 ABD ⊥ 平面 BCD，AB = AD。O、E 分别是 BD、AD 的中点，OA = a。', conditions: ['当前 a = 1', 'OA ⊥ OC', 'E 为 AD 的中点'], note: '来自 test.md 第 2 题。此处展示 a=1 的构型，可在显示页编辑 A 的高度。' };
    scene.constructions = [
      { id: 'mid-O', kind: 'midpoint', point: 'O', label: 'O', a: 'B', b: 'D' },
      { id: 'mid-E', kind: 'midpoint', point: 'E', label: 'E', a: 'A', b: 'D' },
      { id: 'line-AO', kind: 'segment', a: 'A', b: 'O' },
      { id: 'line-OC', kind: 'segment', a: 'O', b: 'C' },
      { id: 'line-EC', kind: 'segment', a: 'E', b: 'C' },
      { id: 'angle', kind: 'dihedral', faceA: 'BCD', faceB: 'ABD' },
    ];
    scene.view = { position: [4.8, 3.6, -5.3], target: [0, 0.5, 0.5] };
  } else if (id === 'prism') {
    const r = Math.sqrt(3) / 4;
    scene.title = '斜三棱柱 · 120° 二面角';
    scene.solid = solid('prism', '斜三棱柱', { A: [0, 0, 0.75], B: [-r, 0, 0], C: [r, 0, 0], A1: [0, 2 * r, 0.25], B1: [-r, 2 * r, -0.5], C1: [r, 2 * r, -0.5] }, { base: ['A', 'B', 'C'], top: ['A1', 'C1', 'B1'], sideAB: ['A', 'A1', 'B1', 'B'], sideBC: ['B', 'B1', 'C1', 'C'], sideCA: ['C', 'C1', 'A1', 'A'] });
    scene.problem = { text: '斜三棱柱 ABC-A₁B₁C₁，∠A₁AB = ∠A₁AC，AB = AC，A₁A = A₁B = a。侧面 B₁BCC₁ 与底面 ABC 所成的二面角为 120°，E、F 分别为 B₁C₁、A₁A 的中点。', conditions: ['二面角为 120°', 'E、F 为中点', '当前取 a = 1'], note: '来自 test.md 第 1 题。示意额外取底面等边；这是一组满足已知条件的坐标，不代表原题唯一构型。' };
    scene.uncertainties = ['底面等边是本示意的额外取值，原题仅给出 AB=AC。'];
    scene.constructions = [
      { id: 'mid-E', kind: 'midpoint', point: 'E', label: 'E', a: 'B1', b: 'C1' },
      { id: 'mid-F', kind: 'midpoint', point: 'F', label: 'F', a: 'A1', b: 'A' },
      { id: 'line-A1E', kind: 'segment', a: 'A1', b: 'E' },
      { id: 'line-FC', kind: 'segment', a: 'F', b: 'C' },
      { id: 'line-FB1', kind: 'segment', a: 'F', b: 'B1' },
      { id: 'angle', kind: 'dihedral', faceA: 'base', faceB: 'sideBC' },
    ];
    scene.view = { position: [2.7, 1.9, -3.7], target: [0, 0.35, 0.12] };
  } else if (id === 'quadPyramid') {
    scene.title = '四棱锥 · 顶点与截面';
    scene.solid = solid('quadPyramid', '四棱锥', { A: [-1, 0, 1], B: [1, 0, 1], C: [1, 0, -1], D: [-1, 0, -1], P: [0, 2.5, 0] }, { base: ['A', 'B', 'C', 'D'], PAB: ['P', 'A', 'B'], PBC: ['P', 'B', 'C'], PCD: ['P', 'C', 'D'], PDA: ['P', 'D', 'A'] });
    scene.view = { position: [5, 4, 6], target: [0, 1, 0] };
    scene.problem = { text: '四棱锥 P-ABCD，初始底面为正方形，P 在底面上方。选择“调整顶点”后拖动锥顶或底面点，观察构造随模型更新。', conditions: ['初始底面边长 2', '初始高 2.5'], note: '底面点在底平面内移动，锥顶可以自由调整。题设的额外等长或垂直关系不自动维持。' };
  } else if (id === 'cylinder' || id === 'cone' || id === 'doubleCone') {
    const primitive: RoundPrimitive = { kind: id, origin: id === 'cone' ? [0, 2.6, 0] : [0, 0, 0], axis: id === 'cone' ? [0, -1, 0] : [0, 1, 0], radius: id === 'doubleCone' ? 1.8 : 1.4, height: id === 'doubleCone' ? 3 : 2.6 };
    scene.solid = { id, type: exampleLabels[id], primitive, points: roundControlPoints(primitive), edges: [], faces: [] };
    const frame = roundFrame(primitive);
    const angle = (id === 'doubleCone' ? 75 : id === 'cone' ? 35 : 0) * Math.PI / 180;
    const normal = add(scale(frame.axis, Math.cos(angle)), scale(frame.u, Math.sin(angle)));
    scene.constructions = [{ id: 'teaching-section', kind: 'planeSection', normal, origin: id === 'doubleCone' ? add(primitive.origin, scale(normal, 0.5)) : add(primitive.origin, scale(frame.axis, primitive.height / 2)) }];
    scene.title = id === 'doubleCone' ? '双圆锥 · 圆锥曲线' : `${exampleLabels[id]} · 截面探究`;
    scene.problem = { text: id === 'doubleCone' ? '两个共顶点、方向相反的圆锥。改变截平面的倾角与位置，观察圆、椭圆、抛物线和双曲线。' : `${exampleLabels[id]}与平面相交。使用右侧截面预设或调整倾角；按住 Alt 拖动截平面，观察交线变化。`, conditions: [`初始半径 ${primitive.radius}`, `每个锥体或柱体高 ${primitive.height}`], note: 'O 为原点/锥顶控制点，T 控制轴向与高度，圆周点控制半径。模型显示为有限高度；开放曲线在模型边界截断。' };
    scene.view = { position: id === 'doubleCone' ? [11, 5, 14] : [5, 3.7, 6], target: id === 'doubleCone' ? [0, 0, 0] : [0, 1.2, 0] };
  } else {
    scene.title = '五棱锥 · 动点与截面';
    scene.solid = solid('motion', '五棱锥', { A: [0, 2, 0], B: [0, 0, 0], C: [2, 0, 0], D: [3, 0, 1], E: [2, 0, 2], F: [0, 0, 2] }, { base: ['B', 'C', 'D', 'E', 'F'], ABC: ['A', 'B', 'C'], ACD: ['A', 'C', 'D'], ADE: ['A', 'D', 'E'], AEF: ['A', 'E', 'F'], AFB: ['A', 'F', 'B'] });
    scene.problem = { text: '几何体 A-BCDEF 中，AB ⊥ 平面 BCDEF，四边形 BCEF 为边长为 2 的正方形，AB = 2，CD = DE = √2。动点 G 在线段 AC 上运动。', conditions: ['AB = 2，BC = CE = EF = FB = 2', 'CD = DE = √2', 'G ∈ AC'], note: '来自 test.md 第 4 题，原题问题未完整给出。此处额外构造平面 GEF，用于动态截面演示。' };
    scene.uncertainties = ['原题问题缺失，平面 GEF 是演示用的额外构造。'];
    scene.constructions = [
      { id: 'motion-G', kind: 'movingPoint', point: 'G', label: 'G', start: 'A', end: 'C', t: 0.5 },
      { id: 'section-GEF', kind: 'section', points: ['G', 'E', 'F'] },
    ];
    scene.view = { position: [6.5, 4.2, -6.5], target: [1, 0.8, 0.8] };
  }
  return scene;
}
