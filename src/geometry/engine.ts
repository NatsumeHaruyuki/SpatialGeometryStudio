import type { Construction, Scene, Solid, Vec3, SectionConstruction, SphereConstruction } from '../schema/scene';
import { sectionRound } from './roundSolids';
import { tetrahedronSphere } from './spheres';
import { producedPoints, referencedPoints } from './constructionGraph';
import { perpendicularFoot, pointPlaneProjection } from './studyGeometry';

export const EPSILON = 1e-8;
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3) => Math.sqrt(dot(a, a));
export const lerp = (a: Vec3, b: Vec3, t: number) => add(a, scale(sub(b, a), t));
export function unit(a: Vec3): Vec3 {
  const size = length(a);
  if (size < EPSILON) throw new Error('几何对象退化：方向向量不能为零');
  return scale(a, 1 / size);
}
export function centroid(points: Vec3[]): Vec3 {
  return scale(points.reduce(add, [0, 0, 0] as Vec3), 1 / Math.max(points.length, 1));
}

/** Reuses unaffected point positions; a moving point invalidates only its descendants. */
export class GeometryCompiler {
  private cache = new Map<string, { key: string; value: Vec3 }>();

  resolve(scene: Scene): Map<string, Vec3> {
    const points = new Map<string, Vec3>();
    const pending = new Map<string, Construction>();
    const nextCache = new Map<string, { key: string; value: Vec3 }>();
    const reuse = (id: string, key: string, compute: () => Vec3) => {
      const old = this.cache.get(id);
      const value = old?.key === key ? old.value : compute();
      nextCache.set(id, { key, value });
      return value;
    };
    scene.solid.points.forEach(p => points.set(p.id, reuse(p.id, `fixed:${p.position.join(',')}`, () => [...p.position])));
    scene.constructions.forEach(c => {
      producedPoints(c).forEach(p => pending.set(p.id, c));
    });
    const visiting = new Set<string>();
    const path: string[] = [];
    const resolved = new Set<string>();
    const evaluate = (id: string): Vec3 | undefined => {
      if (points.has(id)) return points.get(id)!;
      if (resolved.has(id)) return undefined;
      if (visiting.has(id)) throw new Error(`构造存在循环依赖：${[...path.slice(path.indexOf(id)), id].join(' → ')}`);
      const c = pending.get(id);
      if (!c) throw new Error(`依赖的点 ${id} 不存在`);
      visiting.add(id);
      path.push(id);
      try {
        const dependencies = referencedPoints(c).map(evaluate);
        resolved.add(id);
        if (dependencies.some(p => !p)) return undefined;
        const vectors = dependencies as Vec3[];
        const key = `${c.kind}:${vectors.map(p => p.join(',')).join(':')}:${c.kind === 'movingPoint' ? c.t : c.kind === 'point' ? c.position.join(',') : ''}`;
        let value: Vec3;
        try {
          value = reuse(id, key, () => {
            if (c.kind === 'point') return [...c.position];
            if (c.kind === 'midpoint' || c.kind === 'movingPoint') return lerp(vectors[0], vectors[1], c.kind === 'midpoint' ? 0.5 : c.t);
            if (c.kind === 'circumsphere' || c.kind === 'insphere') return tetrahedronSphere(vectors, c.kind).center;
            if (c.kind === 'perpendicular') return perpendicularFoot(vectors[0], vectors[1], vectors[2]).foot;
            if (c.kind === 'pointPlaneDistance') return pointPlaneProjection(vectors[0], vectors.slice(1) as [Vec3, Vec3, Vec3]).foot;
            throw new Error('不支持的派生点');
          });
        } catch { return undefined; }
        points.set(id, value);
        return value;
      } finally { visiting.delete(id); path.pop(); }
    };
    pending.forEach((_, id) => evaluate(id));
    this.cache = nextCache;
    return points;
  }
}

export function resolvePoints(scene: Scene): Map<string, Vec3> {
  return new GeometryCompiler().resolve(scene);
}

export function getSphere(points: Map<string, Vec3>, construction: SphereConstruction) {
  try {
    const vertices = construction.points.map(id => { const p = points.get(id); if (!p) throw new Error(`引用的点 ${id} 不存在`); return p; });
    return { status: 'defined' as const, ...tetrahedronSphere(vertices, construction.kind) };
  } catch (error) {
    return { status: 'undefined' as const, reason: `球暂不可定义：${error instanceof Error ? error.message : '四点构型退化'}` };
  }
}

export function planeFromPoints(a: Vec3, b: Vec3, c: Vec3) {
  const normal = cross(sub(b, a), sub(c, a));
  if (length(normal) < EPSILON) throw new Error('截面的三个点共线，无法确定平面');
  return { origin: a, normal: unit(normal) };
}

export function sectionPolygon(solid: Solid, points: Map<string, Vec3>, origin: Vec3, normal: Vec3): Vec3[] {
  const n = unit(normal);
  const extent = Math.max(1, ...solid.points.map(p => length(sub(p.position, origin))));
  const epsilon = EPSILON * extent;
  const intersections: Vec3[] = [];
  const append = (point: Vec3) => {
    if (!intersections.some(p => length(sub(p, point)) < epsilon * 10)) intersections.push(point);
  };
  for (const edge of solid.edges) {
    const a = points.get(edge.start)!;
    const b = points.get(edge.end)!;
    const da = dot(n, sub(a, origin));
    const db = dot(n, sub(b, origin));
    if (Math.abs(da) <= epsilon) append(a);
    if (Math.abs(db) <= epsilon) append(b);
    if ((da < -epsilon && db > epsilon) || (da > epsilon && db < -epsilon)) append(lerp(a, b, da / (da - db)));
  }
  if (intersections.length < 3) return intersections;
  const center = centroid(intersections);
  const u = unit(sub(intersections[0], center));
  const v = cross(n, u);
  return intersections.sort((a, b) => {
    const pa = sub(a, center), pb = sub(b, center);
    return Math.atan2(dot(pa, v), dot(pa, u)) - Math.atan2(dot(pb, v), dot(pb, u));
  });
}

export function polygonArea(points: Vec3[]): number {
  if (points.length < 3) return 0;
  let area: Vec3 = [0, 0, 0];
  for (let i = 1; i < points.length - 1; i++) area = add(area, cross(sub(points[i], points[0]), sub(points[i + 1], points[0])));
  return length(area) / 2;
}

export function getSection(scene: Scene, points: Map<string, Vec3>, c: SectionConstruction) {
  let plane: ReturnType<typeof planeFromPoints>;
  try {
    plane = c.kind === 'planeSection' ? { origin: c.origin, normal: unit(c.normal) } : planeFromPoints(...c.points.map(id => points.get(id)!) as [Vec3, Vec3, Vec3]);
  } catch { return { status: 'undefined' as const, polygon: [] as Vec3[], curves: [] as Vec3[][], closed: [] as boolean[], kind: '暂时退化', area: null, reason: '暂时退化：三点共线或重合，移动动点后可恢复' }; }
  plane.origin = add(plane.origin, scale(plane.normal, c.offset ?? 0));
  if (scene.solid.primitive) {
    const result = sectionRound(scene.solid.primitive, plane.origin, plane.normal);
    return { status: 'defined' as const, ...plane, ...result, polygon: result.closed[0] ? result.curves[0] ?? [] : [] };
  }
  const polygon = sectionPolygon(scene.solid, points, plane.origin, plane.normal);
  return { status: 'defined' as const, ...plane, polygon, curves: polygon.length ? [polygon] : [], closed: [polygon.length >= 3], kind: polygon.length >= 3 ? `${polygon.length} 边形` : polygon.length === 2 ? '线段' : polygon.length === 1 ? '一点' : '无交线', area: polygonArea(polygon) };
}

/** A witness at another path parameter distinguishes a temporary singularity
 * from a construction that can never determine a plane, such as A-B-P on AB. */
export function sectionMotionIds(scene: Scene, pointIds: string[]) {
  const producers = new Map(scene.constructions.flatMap(c => producedPoints(c).map(p => [p.id, c] as const)));
  const motions = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const c = producers.get(id);
    if (c?.kind === 'movingPoint') { motions.add(c.id); visit(c.start); visit(c.end); }
    else if (c) referencedPoints(c).forEach(visit);
  };
  pointIds.forEach(visit);
  return motions;
}

export function canRecoverSection(scene: Scene, construction: Extract<Construction, { kind: 'section' }>) {
  const motions = sectionMotionIds(scene, construction.points);
  const hasPlane = (probe: Scene) => {
    const points = resolvePoints(probe);
    try { planeFromPoints(...construction.points.map(p => points.get(p)!) as [Vec3, Vec3, Vec3]); return true; } catch { return false; }
  };
  // Constructions created by the editor preserve an actual nondegenerate
  // parameter witness. Recovery does not depend on guessing combinations.
  if (construction.referenceMotion && hasPlane({ ...scene, constructions: scene.constructions.map(c => c.kind === 'movingPoint' && Object.hasOwn(construction.referenceMotion!, c.id) ? { ...c, t: construction.referenceMotion![c.id] } : c) })) return true;
  // Compatibility for hand-authored v1 scenes without a stored witness.
  const ordered = [...motions];
  for (const reverse of [false, true]) {
    const parameters = new Map(ordered.map((id, index) => [id, (reverse ? ordered.length - index : index + 1) / (ordered.length + 1)]));
    if (hasPlane({ ...scene, constructions: scene.constructions.map(c => c.kind === 'movingPoint' && parameters.has(c.id) ? { ...c, t: parameters.get(c.id)! } : c) })) return true;
  }
  for (const t of [0.25, 0.5, 0.75, 0, 1]) {
    if (hasPlane({ ...scene, constructions: scene.constructions.map(c => c.kind === 'movingPoint' && motions.has(c.id) ? { ...c, t } : c) })) return true;
    for (const id of motions) if (hasPlane({ ...scene, constructions: scene.constructions.map(c => c.kind === 'movingPoint' && c.id === id ? { ...c, t } : c) })) return true;
  }
  return false;
}

export function dihedralAngle(solid: Solid, points: Map<string, Vec3>, faceA: string, faceB: string) {
  const a = solid.faces.find(f => f.id === faceA);
  const b = solid.faces.find(f => f.id === faceB);
  if (!a || !b) throw new Error('所选面不存在');
  const edge = a.vertices.filter(id => b.vertices.includes(id));
  if (edge.length !== 2 || !solid.edges.some(e => edge.includes(e.start) && edge.includes(e.end))) throw new Error('请选择具有公共棱的两个不同的面');
  const start = points.get(edge[0])!, end = points.get(edge[1])!;
  const origin = lerp(start, end, 0.5);
  const axis = unit(sub(end, start));
  // The centroid lies inside a convex face. Project its ray perpendicular to
  // the common edge, preserving the actual half-plane (including obtuse angles).
  const ray = (vertices: string[]) => {
    const delta = sub(centroid(vertices.map(id => points.get(id)!)), origin);
    return unit(sub(delta, scale(axis, dot(delta, axis))));
  };
  const rayA = ray(a.vertices), rayB = ray(b.vertices);
  const degrees = Math.acos(Math.max(-1, Math.min(1, dot(rayA, rayB)))) * 180 / Math.PI;
  const normal = scale(axis, dot(cross(rayA, rayB), axis) < 0 ? -1 : 1);
  return { degrees, exterior: 180 - degrees, edge, origin, rayA, rayB, normal };
}
