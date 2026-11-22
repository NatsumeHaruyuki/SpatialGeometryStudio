import type { Point, Vec3 } from '../schema/scene';

export type RoundPrimitive = {
  kind: 'cylinder' | 'cone' | 'doubleCone';
  origin: Vec3;
  axis: Vec3;
  radial?: Vec3;
  radius: number;
  height: number;
};

type Frame = { u: Vec3; axis: Vec3; v: Vec3 };
type Section = { curves: Vec3[][]; closed: boolean[]; kind: string; area: number | null };
const limit = 10000;
const precision = 64 * Number.EPSILON;
const halfSteps = 64;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 =>
  [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

function bounded(v: Vec3) {
  if (v.some(x => !Number.isFinite(x) || Math.abs(x) > limit)) throw new Error('坐标超出有效范围');
}

function positiveDimension(x: number) {
  if (!Number.isFinite(x) || x < 0.0001 || x > limit) throw new Error('半径和高度超出有效范围');
}

function normalized(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  if (!(length > 0) || !Number.isFinite(length)) throw new Error('方向向量无效');
  return [v[0] / length, v[1] / length, v[2] / length];
}

function projectedRadial(direction: Vec3, axis: Vec3): Vec3 {
  const normal = cross(normalized(direction), axis);
  if (Math.hypot(...normal) <= precision) throw new Error('径向方向不能与旋转轴平行');
  return normalized(cross(axis, normal));
}

function transportRadial(frame: Frame, axis: Vec3): Vec3 {
  const rotation = cross(frame.axis, axis);
  const sine = Math.hypot(...rotation);
  // A half turn about u handles an exact reversal; equal axes also preserve u.
  if (sine <= precision) return projectedRadial(frame.u, axis);
  const pivot = scale(rotation, 1 / sine);
  const cosine = Math.max(-1, Math.min(1, dot(frame.axis, axis)));
  const rotated = addScaled(scale(frame.u, cosine), cross(pivot, frame.u), sine);
  return projectedRadial(addScaled(rotated, pivot, dot(pivot, frame.u) * (1 - cosine)), axis);
}

export function roundFrame(p: RoundPrimitive): Frame {
  bounded(p.origin);
  bounded(p.axis);
  positiveDimension(p.radius);
  positiveDimension(p.height);
  const axis = normalized(p.axis);
  if (p.radial !== undefined) {
    bounded(p.radial);
    const u = projectedRadial(p.radial, axis);
    return { u, axis, v: cross(u, axis) };
  }
  // Preserve the original control positions of files saved without orientation.
  const seed: Vec3 = Math.abs(axis[0]) < 0.95 ? [1, 0, 0] : [0, 0, 1];
  const u = normalized(addScaled(seed, axis, -dot(seed, axis)));
  return { u, axis, v: cross(u, axis) };
}

function world(origin: Vec3, frame: Frame, x: number, y: number, z: number): Vec3 {
  return addScaled(addScaled(addScaled(origin, frame.axis, y), frame.u, x), frame.v, z);
}

export function roundControlPoints(p: RoundPrimitive): Point[] {
  const frame = roundFrame(p);
  const at = (id: string, x: number, y: number, z: number): Point => ({
    id, label: id.replace('1', '₁').replace('2', '₂'), position: world(p.origin, frame, x, y, z),
  });
  const { height: h, radius: r } = p;
  const base = p.kind === 'cylinder' ? 0 : h;
  const handles = [at('O', 0, 0, 0), at('T', 0, h, 0), at('A', r, base, 0),
    at('B', 0, base, r), at('C', -r, base, 0)];
  if (p.kind === 'cylinder') handles.push(at('A1', r, h, 0));
  if (p.kind === 'doubleCone') handles.push(at('T2', 0, -h, 0), at('A2', r, -h, 0), at('B2', 0, -h, r));
  return handles;
}

export function moveRoundControl(p: RoundPrimitive, id: string, desired: Vec3): RoundPrimitive {
  bounded(desired);
  if (!roundControlPoints(p).some(q => q.id === id)) throw new Error('旋转体控制点不存在');
  let updated: RoundPrimitive;
  if (id === 'O') updated = { ...p, origin: [...desired] };
  else {
    const delta = sub(desired, p.origin);
    if (id === 'T' || id === 'T2') {
      const height = Math.hypot(...delta);
      positiveDimension(height);
      const axis = normalized(id === 'T' ? delta : scale(delta, -1));
      updated = { ...p, height, axis, radial: transportRadial(roundFrame(p), axis) };
    } else {
      const radius = Math.hypot(...cross(delta, normalized(p.axis)));
      positiveDimension(radius);
      updated = { ...p, radius };
    }
  }
  roundControlPoints(updated).forEach(point => bounded(point.position));
  return updated;
}

const empty = (): Section => ({ kind: '无交线', curves: [], closed: [], area: null });

// Align the horizontal x direction with the normal's radial component.
// In this frame the plane is s*x + c*y = d. For a fixed (x,y), the
// surface supplies the two possible z coordinates, ±√(radius(y)²−x²).
type MeridianPoint = { x: number; y: number; side: boolean };
type ToWorld = (x: number, y: number, z: number) => Vec3;

function meridianHits(p: RoundPrimitive, sign: number, s: number, c: number, d: number, tol: number) {
  const h = sign * p.height;
  const r = p.radius;
  // Each side flag describes the edge leading to the next corner.
  const corners: MeridianPoint[] = p.kind === 'cylinder'
    ? [{ x: -r, y: 0, side: false }, { x: r, y: 0, side: true },
       { x: r, y: h, side: false }, { x: -r, y: h, side: true }]
    : [{ x: 0, y: 0, side: true }, { x: r, y: h, side: false }, { x: -r, y: h, side: true }];
  const distances = corners.map(q => s * q.x + c * q.y - d);
  const hits: MeridianPoint[] = [];
  corners.forEach((a, i) => {
    const j = (i + 1) % corners.length;
    const b = corners[j];
    const da = distances[i], db = distances[j];
    if (Math.abs(da) <= tol) hits.push({ ...a, side: true });
    else if (Math.abs(db) > tol && (da < 0) !== (db < 0)) {
      const t = da / (da - db);
      hits.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, side: a.side });
    }
  });
  return hits;
}

function addBranches(out: Section, p: RoundPrimitive, hits: MeridianPoint[], at: ToWorld) {
  if (!hits.length) return;
  if (hits.length === 1) {
    out.curves.push([at(hits[0].x, hits[0].y, 0)]);
    out.closed.push(false);
    return;
  }
  // Starting on a side lets both mirrored halves meet at that endpoint.
  let [a, b] = hits;
  if (!a.side && b.side) [a, b] = [b, a];
  const front: Vec3[] = [], back: Vec3[] = [];
  for (let i = 0; i <= halfSteps; i++) {
    const t = (1 - Math.cos(Math.PI * i / halfSteps)) / 2;
    const y = (1 - t) * a.y + t * b.y;
    const x = (1 - t) * a.x + t * b.x;
    const radius = p.kind === 'cylinder' ? p.radius : p.radius * Math.abs(y) / p.height;
    const edge = (i === 0 && a.side) || (i === halfSteps && b.side);
    const z = edge ? 0 : Math.sqrt(Math.max(0, (radius - Math.abs(x)) * (radius + Math.abs(x))));
    front.push(at(x, y, z));
    back.push(at(x, y, -z));
  }
  if (a.side) {
    // Skip duplicate side endpoints. A closed path uses the caller's closing edge.
    out.curves.push([...front.reverse(), ...back.slice(1, b.side ? -1 : undefined)]);
    out.closed.push(b.side);
  } else {
    out.curves.push(front, back);
    out.closed.push(false, false);
  }
}

function apexSection(p: RoundPrimitive, s: number, c: number, at: ToWorld, tol: number): Section {
  const axial = c * p.height;
  const radial = s * p.radius;
  if (Math.abs(axial) > radial + tol) {
    return { kind: '一点', curves: [[at(0, 0, 0)]], closed: [false], area: null };
  }
  const tangent = Math.abs(Math.abs(axial) - radial) <= tol;
  const x = -axial / s;
  const z = tangent ? 0 : Math.sqrt(Math.max(0, (p.radius - Math.abs(x)) * (p.radius + Math.abs(x))));
  const curves = (tangent ? [0] : [z, -z]).map(offset => [
    p.kind === 'doubleCone' ? at(-x, -p.height, -offset) : at(0, 0, 0),
    at(x, p.height, offset),
  ]);
  return { kind: tangent ? '一条直线' : '相交直线', curves, closed: curves.map(() => false), area: null };
}

export function sectionRound(p: RoundPrimitive, origin: Vec3, normal: Vec3): Section {
  const base = roundFrame(p);
  if (!origin.every(Number.isFinite)) throw new Error('截面位置无效');
  const n = normalized(normal);
  const nx = dot(n, base.u), nz = dot(n, base.v);
  const s = Math.hypot(nx, nz), c = dot(n, base.axis);
  const d = dot(n, sub(origin, p.origin));
  const frame = s <= precision ? base : {
    axis: base.axis,
    u: addScaled(scale(base.u, nx / s), base.v, nz / s),
    v: addScaled(scale(base.v, nx / s), base.u, -nz / s),
  };
  const at: ToWorld = (x, y, z) => world(p.origin, frame, x, y, z);
  const extent = Math.abs(c) * p.height + s * p.radius;
  const tol = precision * Math.max(extent, Math.abs(d));
  if (p.kind !== 'cylinder' && Math.abs(d) <= tol) return apexSection(p, s, c, at, tol);
  if (p.kind === 'cylinder' && Math.abs(c) <= precision) {
    const x = d / s;
    if (Math.abs(x) > p.radius + tol) return empty();
    const tangent = Math.abs(Math.abs(x) - p.radius) <= tol;
    const z = Math.sqrt(Math.max(0, (p.radius - Math.abs(x)) * (p.radius + Math.abs(x))));
    const curves = (tangent ? [0] : [z, -z]).map(offset => [at(x, 0, offset), at(x, p.height, offset)]);
    return { kind: tangent ? '一条直线' : '两条平行线', curves, closed: curves.map(() => false), area: null };
  }
  const result = empty();
  for (const sign of p.kind === 'doubleCone' ? [1, -1] : [1]) {
    const hits = meridianHits(p, sign, s, c, d, tol);
    addBranches(result, p, hits, at);
  }
  if (!result.curves.length) return result;
  if (result.curves.every(curve => curve.length === 1)) {
    result.kind = result.curves.length === 1 ? '一点' : '两点';
    return result;
  }
  const steepness = Math.abs(c) * p.height - s * p.radius;
  if (s <= precision) result.kind = '圆';
  else if (p.kind === 'cylinder' || steepness > tol) result.kind = '椭圆';
  else result.kind = steepness < -tol ? '双曲线' : '抛物线';
  if (result.closed.some(Boolean)) {
    if (p.kind === 'cylinder') result.area = Math.PI * p.radius ** 2 / Math.abs(c);
    else {
      const k = p.radius / p.height;
      const discriminant = (Math.abs(c) - k * s) * (Math.abs(c) + k * s);
      result.area = Math.PI * (k * d) ** 2 / discriminant ** 1.5;
    }
  }
  return result;
}
