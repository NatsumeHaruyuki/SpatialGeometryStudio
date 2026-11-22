import { z } from 'zod';
import { canRecoverSection, centroid, cross, dot, length, planeFromPoints, resolvePoints, sub, unit, dihedralAngle } from '../geometry/engine';
import { roundControlPoints, type RoundPrimitive } from '../geometry/roundSolids';
import { normalizeSphereCenters, producedPoints, referencedPoints } from '../geometry/constructionGraph';
import { deriveQuestionPrimitive, type QuestionSolidDefinition } from '../geometry/questionPrimitive';
import { decodeSceneInput, normalizeSceneV2 } from './importInput';

export type Vec3 = [number, number, number];
export type Point = { id: string; label: string; position: Vec3 };
export type Edge = { id: string; start: string; end: string };
export type Face = { id: string; label: string; vertices: string[] };
export type Solid = { id: string; type: string; points: Point[]; edges: Edge[]; faces: Face[]; primitive?: RoundPrimitive; definition?: QuestionSolidDefinition };
export type Construction =
  | { id: string; kind: 'point'; point: string; label: string; position: Vec3 }
  | { id: string; kind: 'midpoint'; point: string; label: string; a: string; b: string }
  | { id: string; kind: 'movingPoint'; point: string; label: string; start: string; end: string; t: number }
  | { id: string; kind: 'segment'; a: string; b: string }
  | { id: string; kind: 'section'; points: [string, string, string]; referenceMotion?: Record<string, number>; offset?: number }
  | { id: string; kind: 'planeSection'; origin: Vec3; normal: Vec3; offset?: number }
  | { id: string; kind: 'circumsphere'; points: [string, string, string, string]; centerPoint?: string; centerLabel?: string }
  | { id: string; kind: 'insphere'; points: [string, string, string, string]; centerPoint?: string; centerLabel?: string }
  | { id: string; kind: 'perpendicular'; from: string; line: [string, string]; point: string; label: string }
  | { id: string; kind: 'triangle'; points: [string, string, string] }
  | { id: string; kind: 'angle'; points: [string, string, string] }
  | { id: string; kind: 'pointPlaneDistance'; from: string; plane: [string, string, string]; point: string; label: string }
  | { id: string; kind: 'dihedral'; points: [string, string, string, string] }
  | { id: string; kind: 'dihedral'; faceA: string; faceB: string };
export type SectionConstruction = Extract<Construction, { kind: 'section' | 'planeSection' }>;
export type SphereConstruction = Extract<Construction, { kind: 'circumsphere' | 'insphere' }>;
export type Scene = {
  schema_version: 1 | 2;
  id: string;
  title: string;
  problem: { text: string; conditions: string[]; note: string };
  solid: Solid;
  constructions: Construction[];
  display: { grid: boolean; labels: boolean; faces: boolean; sectionPlane: boolean; hiddenEdges: boolean };
  view: { position: Vec3; target: Vec3 };
  uncertainties: string[];
};

const id = z.string().min(1).max(48).regex(/^[a-zA-Z0-9_\-\u4e00-\u9fff]+$/);
const label = z.string().min(1).max(40);
const coordinate = z.number().finite().min(-10000).max(10000);
const vector = z.tuple([coordinate, coordinate, coordinate]);
const construction = z.discriminatedUnion('kind', [
  z.object({ id, kind: z.literal('point'), point: id, label, position: vector }).strict(),
  z.object({ id, kind: z.literal('midpoint'), point: id, label, a: id, b: id }).strict(),
  z.object({ id, kind: z.literal('movingPoint'), point: id, label, start: id, end: id, t: z.number().min(0).max(1) }).strict(),
  z.object({ id, kind: z.literal('segment'), a: id, b: id }).strict(),
  z.object({ id, kind: z.literal('section'), points: z.tuple([id, id, id]), referenceMotion: z.record(id, z.number().finite().min(0).max(1)).optional(), offset: coordinate.optional() }).strict(),
  z.object({ id, kind: z.literal('planeSection'), origin: vector, normal: vector.refine(n => length(n) > 1e-8, '截面法向量不能为零'), offset: coordinate.optional() }).strict(),
  z.object({ id, kind: z.literal('circumsphere'), points: z.tuple([id, id, id, id]), centerPoint: id.optional(), centerLabel: label.optional() }).strict(),
  z.object({ id, kind: z.literal('insphere'), points: z.tuple([id, id, id, id]), centerPoint: id.optional(), centerLabel: label.optional() }).strict(),
  z.object({ id, kind: z.literal('perpendicular'), from: id, line: z.tuple([id, id]), point: id, label }).strict(),
  z.object({ id, kind: z.literal('triangle'), points: z.tuple([id, id, id]) }).strict(),
  z.object({ id, kind: z.literal('angle'), points: z.tuple([id, id, id]) }).strict(),
  z.object({ id, kind: z.literal('pointPlaneDistance'), from: id, plane: z.tuple([id, id, id]), point: id, label }).strict(),
  z.object({ id, kind: z.literal('dihedral'), points: z.tuple([id, id, id, id]).optional(), faceA: id.optional(), faceB: id.optional() }).strict()
    .refine(c => c.points ? c.faceA === undefined && c.faceB === undefined : c.faceA !== undefined && c.faceB !== undefined, '二面角需四个点，或旧版的两个面，不能混用'),
]);
const schema = z.object({
  schema_version: z.union([z.literal(1), z.literal(2)]), id, title: z.string().min(1).max(150),
  problem: z.object({ text: z.string().max(20000), conditions: z.array(z.string().max(1000)).max(100), note: z.string().max(3000) }).strict(),
  solid: z.object({
    id, type: z.string().max(80),
    points: z.array(z.object({ id, label, position: vector }).strict()).max(200),
    edges: z.array(z.object({ id, start: id, end: id }).strict()).max(600),
    faces: z.array(z.object({ id, label, vertices: z.array(id).min(3).max(32) }).strict()).max(200),
    primitive: z.object({ kind: z.enum(['cylinder', 'cone', 'doubleCone']), origin: vector, axis: vector.refine(n => length(n) > 1e-8, '旋转轴不能为零'), radial: vector.optional(), radius: z.number().finite().min(0.0001).max(10000), height: z.number().finite().min(0.0001).max(10000) }).strict().optional(),
    definition: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('cone'), apex: id, baseCenter: id, radiusPoint: id }).strict(),
      z.object({ kind: z.literal('doubleCone'), apex: id, baseCenter: id, radiusPoint: id }).strict(),
      z.object({ kind: z.literal('cylinder'), baseCenter: id, topCenter: id, radiusPoint: id }).strict(),
    ]).optional(),
  }).strict(),
  constructions: z.array(construction).max(200),
  display: z.object({ grid: z.boolean(), labels: z.boolean(), faces: z.boolean(), sectionPlane: z.boolean(), hiddenEdges: z.boolean() }).strict(),
  view: z.object({ position: z.tuple([z.number().finite().min(-1e6).max(1e6), z.number().finite().min(-1e6).max(1e6), z.number().finite().min(-1e6).max(1e6)]), target: vector }).strict(),
  uncertainties: z.array(z.string().max(2000)).max(100),
}).strict();

export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;

export function parseScene(input: unknown): Scene {
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).length > MAX_PROJECT_BYTES) throw new Error('项目文件不能超过 2 MB');
  }
  input = normalizeSceneV2(decodeSceneInput(input));
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`项目格式或版本不支持：${issue.path.join('.')} — ${issue.message}`);
  }
  const scene = parsed.data as Scene;
  normalizeSphereCenters(scene);
  if (scene.solid.definition) {
    if (scene.schema_version !== 2) throw new Error('题目点定义模型需使用 schema_version: 2');
    scene.solid.primitive = deriveQuestionPrimitive(scene.solid.definition, scene.solid.points);
  }
  if (scene.solid.primitive) {
    if (scene.solid.edges.length || scene.solid.faces.length) throw new Error('解析旋转体的边和面数组应为空');
    const generated = roundControlPoints(scene.solid.primitive);
    if (generated.some(p => !vector.safeParse(p.position).success)) throw new Error('旋转体超出坐标范围');
    if (scene.schema_version === 1) {
      if (scene.solid.points.length && (scene.solid.points.length !== generated.length || scene.solid.points.some(p => { const q = generated.find(q => q.id === p.id); return !q || length(sub(p.position, q.position)) > 1e-6; }))) throw new Error('旧版旋转体控制点与解析参数不一致；题目自定义点请使用 schema_version: 2');
      scene.solid.points = generated;
    }
  } else if (scene.schema_version === 2 && scene.solid.type === 'diagram') {
    if (scene.solid.faces.length) throw new Error('diagram 用于点线示意；面请用 triangle 构造或完整 polyhedron 模型');
    if (!scene.solid.points.length && !scene.constructions.some(c => c.kind === 'point')) throw new Error('示意图至少需要声明一个点');
  } else if (scene.solid.points.length < 4 || scene.solid.edges.length < 6 || scene.solid.faces.length < 4) throw new Error('凸多面体至少需要4个点、6条棱和4个面；点线示意可使用 type: diagram');
  const unique = (ids: string[], name: string) => {
    const repeated = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (repeated.length) throw new Error(`${name} ID 重复：${repeated.join('、')}`);
  };
  const requirePoint = (point: string, known: Set<string>) => {
    if (!known.has(point)) throw new Error(`引用的点 ${point} 不存在`);
  };
  const base = new Set(scene.solid.points.map(p => p.id));
  unique(scene.solid.edges.map(e => e.id), '棱');
  unique(scene.solid.faces.map(f => f.id), '面');
  unique(scene.constructions.map(c => c.id), '构造');
  const declarations = new Map<string, string>();
  const conflicts: string[] = [];
  const declare = (id: string, owner: string) => {
    const previous = declarations.get(id);
    if (previous) conflicts.push(`${id}（${previous} 与 ${owner}）`); else declarations.set(id, owner);
  };
  scene.solid.points.forEach((p, index) => declare(p.id, `solid.points[${index}].id${scene.schema_version === 1 && scene.solid.primitive ? '，旧版自动控制点' : ''}`));
  scene.constructions.forEach((c, index) => producedPoints(c).forEach(p => declare(p.id, `constructions[${index}]（${c.id}）.${'point' in c ? 'point' : 'centerPoint'}`)));
  if (conflicts.length) throw new Error(`点 ID 重复：${conflicts.join('；')}`);
  const all = [...declarations.keys()];
  const known = new Set(all);
  scene.constructions.forEach((c, index) => referencedPoints(c).forEach(p => { if (!known.has(p)) throw new Error(`constructions[${index}]（${c.id}）引用的点 ${p} 不存在`); }));
  if (!scene.solid.primitive && scene.schema_version === 2 && scene.solid.type === 'diagram') {
    scene.solid.edges.forEach(e => { requirePoint(e.start, base); requirePoint(e.end, base); if (e.start === e.end) throw new Error(`棱 ${e.id} 的两个端点不能相同`); });
  }
  if (!scene.solid.primitive && !(scene.schema_version === 2 && scene.solid.type === 'diagram')) {
  const edgeKeys = new Set<string>();
  scene.solid.edges.forEach(e => {
    requirePoint(e.start, base); requirePoint(e.end, base);
    if (e.start === e.end) throw new Error('棱的两个端点必须不同');
    const key = [e.start, e.end].sort().join('|');
    if (edgeKeys.has(key)) throw new Error('棱重复');
    edgeKeys.add(key);
  });
  const points = resolvePoints(scene);
  const center = centroid(scene.solid.points.map(p => p.position));
  const size = Math.max(...scene.solid.points.map(p => length(sub(p.position, center))));
  if (size < 1e-5) throw new Error('几何体尺寸过小');
  const epsilon = size * 1e-7;
  const incidences = new Map<string, number>();
  const faceGeometry = new Set<string>();
  const usedVertices = new Set<string>();
  for (const face of scene.solid.faces) {
    unique(face.vertices, '面的顶点');
    const key = [...face.vertices].sort().join('|');
    if (faceGeometry.has(key)) throw new Error('面的几何边界重复，不能构成闭合几何体');
    faceGeometry.add(key);
    face.vertices.forEach(p => requirePoint(p, base));
    face.vertices.forEach(p => usedVertices.add(p));
    const vertices = face.vertices.map(p => points.get(p)!);
    const n = unit(cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0])));
    if (vertices.some(p => Math.abs(dot(n, sub(p, vertices[0]))) > epsilon)) throw new Error(`面 ${face.label} 的顶点不共面`);
    const sides = scene.solid.points.map(p => dot(n, sub(p.position, vertices[0])));
    if (sides.some(d => d > epsilon) && sides.some(d => d < -epsilon)) throw new Error('首版仅支持凸多面体');
    if (Math.abs(dot(n, sub(center, vertices[0]))) < epsilon) throw new Error('几何体退化：顶点不能全部位于同一平面');
    const turns = vertices.map((p, i) => dot(n, cross(sub(vertices[(i + 1) % vertices.length], p), sub(vertices[(i + 2) % vertices.length], vertices[(i + 1) % vertices.length]))));
    if (turns.some(t => t < -epsilon) || vertices.some((p, i) => vertices.some(q => dot(n, cross(sub(vertices[(i + 1) % vertices.length], p), sub(q, p))) < -epsilon))) throw new Error('面的顶点须按凸多边形边界排序');
    face.vertices.forEach((start, i) => {
      const key = [start, face.vertices[(i + 1) % face.vertices.length]].sort().join('|');
      if (!edgeKeys.has(key)) throw new Error(`面 ${face.label} 缺少对应棱`);
      incidences.set(key, (incidences.get(key) ?? 0) + 1);
    });
  }
  if ([...edgeKeys].some(k => incidences.get(k) !== 2)) throw new Error('几何体必须闭合，每条棱应属于两个面');
  const connected = new Set([scene.solid.points[0].id]);
  for (let pass = 0; pass < scene.solid.points.length; pass++) scene.solid.edges.forEach(e => { if (connected.has(e.start) || connected.has(e.end)) { connected.add(e.start); connected.add(e.end); } });
  if (connected.size !== base.size || usedVertices.size !== base.size || base.size - scene.solid.edges.length + scene.solid.faces.length !== 2) throw new Error('几何体必须是单一连通的闭合凸多面体');
  }
  const points = resolvePoints(scene);
  const epsilon = 1e-7;
  for (const c of scene.constructions) {
    if (c.kind === 'midpoint' || c.kind === 'segment') {
      requirePoint(c.a, known); requirePoint(c.b, known);
      if (c.a === c.b) throw new Error('请选择两个不同的点');
    } else if (c.kind === 'movingPoint') {
      requirePoint(c.start, known); requirePoint(c.end, known);
      const start = points.get(c.start), end = points.get(c.end);
      if (c.start === c.end || (base.has(c.start) && base.has(c.end) && start && end && length(sub(start, end)) < epsilon)) throw new Error('动点路径的两个端点不能重合');
      // Derived endpoints may temporarily coalesce. Interpolation then produces
      // that single point, and upstream motion remains free to separate them.
    } else if (c.kind === 'section') {
      c.points.forEach(p => requirePoint(p, known));
      if (c.referenceMotion && Object.keys(c.referenceMotion).some(id => !scene.constructions.some(item => item.kind === 'movingPoint' && item.id === id))) throw new Error('截面的参考动点不存在');
      if (c.points.some(p => !points.has(p))) continue;
      try { planeFromPoints(...c.points.map(p => points.get(p)!) as [Vec3, Vec3, Vec3]); }
      catch (error) { if (!canRecoverSection(scene, c)) throw error; }
    } else if (c.kind === 'circumsphere' || c.kind === 'insphere') {
      unique(c.points, '球的四个点');
      c.points.forEach(p => requirePoint(p, known));
      // A saved, previously defined sphere can be temporarily undefined while
      // its dependencies move through a coplanar configuration. The renderer
      // reports that state instead of blocking otherwise valid point motion.
    } else if (c.kind === 'perpendicular') unique(c.line, '垂线的直线端点');
    else if (c.kind === 'pointPlaneDistance') unique(c.plane, '平面的三个点');
    else if (c.kind === 'triangle' || c.kind === 'angle') unique(c.points, '所选的三个点');
    else if (c.kind === 'dihedral') {
      if ('points' in c) unique(c.points, '二面角的四个点');
      else dihedralAngle(scene.solid, points, c.faceA, c.faceB);
    }
  }
  if (length(sub(scene.view.position, scene.view.target)) < epsilon) throw new Error('视角位置不能与观察目标重合');
  return scene;
}
