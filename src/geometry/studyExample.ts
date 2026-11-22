import { parseScene, type Scene } from '../schema/scene';
import { createExample } from './examples';

/** A small lesson whose sphere center and feet can be reused by later tools. */
export function createStudyExample(): Scene {
  const scene = createExample('tetrahedron');
  scene.solid.points.find(p => p.id === 'A')!.position = [0.35, 1.4, 0.55];
  scene.id = 'studyProjection';
  scene.title = '球心、垂线与射影';
  scene.problem = {
    text: '四面体 A-BCD 的内切球球心为 Oₛ₁。过 Oₛ₁ 作直线 BD 的垂线，垂足为 H；高亮三角形 Oₛ₁HD 并观察直角。再从 A 向平面 BCD 作垂线，垂足为 K，用向量射影求点面距离。',
    conditions: ['初始底面 BCD 为边长 2 的等边三角形，A 到底面的距离为 1.4', '初始 A 坐标为 (0.35, 1.4, 0.55)', 'Oₛ₁ 为四面体的内切球球心', 'Oₛ₁H ⊥ 直线 BD，AK ⊥ 平面 BCD'],
    note: '球心 Oₛ₁、垂足 H、K 都可选中并继续构造；修改原始顶点时自动更新。角 Oₛ₁HD 以 H 为顶点；三角形高亮独立于截面。直线 BD 仅用于演示垂线，并非内切球的弦；垂径定理可打开独立的弦与直角三角形示例。',
  };
  scene.constructions = [
    { id: 'study-insphere', kind: 'insphere', points: ['A', 'B', 'C', 'D'], centerPoint: 'O_s1', centerLabel: 'Oₛ₁' },
    { id: 'study-perpendicular', kind: 'perpendicular', from: 'O_s1', line: ['B', 'D'], point: 'H', label: 'H' },
    { id: 'study-triangle', kind: 'triangle', points: ['O_s1', 'H', 'D'] },
    { id: 'study-angle', kind: 'angle', points: ['O_s1', 'H', 'D'] },
    { id: 'study-distance', kind: 'pointPlaneDistance', from: 'A', plane: ['B', 'C', 'D'], point: 'K', label: 'K' },
  ];
  scene.view = { position: [3.456, 2.718, -3.676], target: [0, 0.45, 0.5] };
  return parseScene(scene);
}

/** A genuine sphere chord supplies the classical radius/chord right triangle. */
export function createChordExample(): Scene {
  const scene = createExample('tetrahedron');
  scene.id = 'chordRightTriangle';
  scene.title = '垂径定理 · 弦与直角三角形';
  scene.problem = {
    text: '四面体 A-BCD 的外接球球心为 Oₛ₁，B、D 都在球面上，因此 BD 是球的弦。过 Oₛ₁ 作 BD 的垂线，垂足 H 为弦的中点；观察高亮直角三角形 Oₛ₁HD 中半径、半弦长和弦心距的关系。',
    conditions: ['初始底面 BCD 为边长 2 的等边三角形，A = (0, 1, 0)', 'B、D 在外接球面上，Oₛ₁B = Oₛ₁D = R', 'Oₛ₁H ⊥ BD，BH = HD = 1', 'R² = Oₛ₁H² + HD²'],
    note: '这里的 BD 是外接球的真实弦。球心、弦和垂线处于同一平面，构成球的圆截面；该圆内的垂径定理说明 H 平分弦 BD。修改顶点后球心、垂足和角度自动更新；不得将相同结论套用于不与球相交的直线。',
  };
  scene.constructions = [
    { id: 'chord-sphere', kind: 'circumsphere', points: ['A', 'B', 'C', 'D'], centerPoint: 'O_s1', centerLabel: 'Oₛ₁' },
    { id: 'chord-perpendicular', kind: 'perpendicular', from: 'O_s1', line: ['B', 'D'], point: 'H', label: 'H' },
    { id: 'chord-triangle', kind: 'triangle', points: ['O_s1', 'H', 'D'] },
    { id: 'chord-angle', kind: 'angle', points: ['O_s1', 'H', 'D'] },
  ];
  scene.view = { position: [3.456, 2.648, -3.676], target: [0, 0.2, 0.5] };
  return parseScene(scene);
}
