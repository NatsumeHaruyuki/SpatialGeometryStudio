import type { Vec3 } from '../schema/scene';

export type SphereKind = 'circumsphere' | 'insphere';

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Circumsphere or insphere of the tetrahedron whose vertices are given in any order. */
export function tetrahedronSphere(vertices: readonly Vec3[], kind: SphereKind): { center: Vec3; radius: number; radiusPoint: Vec3 } {
  if (!Array.isArray(vertices) || vertices.length !== 4) throw new Error('请指定四个点以确定四面体');
  for (const p of vertices) {
    if (!Array.isArray(p) || p.length !== 3 || ![p[0], p[1], p[2]].every(Number.isFinite)) {
      throw new Error('四面体顶点必须由三个有限坐标组成');
    }
  }
  // A power-of-two shift keeps opposite near-limit coordinates subtractable.
  const prescale = vertices.some(p => p.some((x: number) => Math.abs(x) > Number.MAX_VALUE / 4)) ? 0.25 : 1;
  const points: readonly Vec3[] = prescale === 1 ? vertices : vertices.map(p =>
    [p[0] * prescale, p[1] * prescale, p[2] * prescale] as Vec3);
  let longest = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < i; j++) {
    const edge = Math.hypot(...subtract(points[i], points[j]));
    if (edge === 0) throw new Error('四面体顶点重合，无法确定球');
    longest = Math.max(longest, edge);
  }
  const origin = points[0];
  const [a, b, c] = points.slice(1).map(p => subtract(p, origin).map(x => x / longest) as Vec3);
  const bc = cross(b, c), ca = cross(c, a), ab = cross(a, b);
  const determinant = dot(a, bc);
  if (Math.abs(determinant) <= 1e-10) throw new Error('四个点共面或过于接近共面，无法稳定确定四面体的球');

  const coordinates = [0, 1, 2] as const;
  let localCenter: Vec3;
  let localRadius: number;
  let localRadiusPoint: Vec3 = [0, 0, 0];
  if (kind === 'circumsphere') {
    // The perpendicular bisectors satisfy a·center = |a|²/2, etc.
    const aa = dot(a, a), bb = dot(b, b), cc = dot(c, c);
    localCenter = coordinates.map(i => (aa * bc[i] + bb * ca[i] + cc * ab[i]) / (2 * determinant)) as Vec3;
    localRadius = Math.hypot(...localCenter);
  } else if (kind === 'insphere') {
    // Each weight is twice the area of the face opposite that vertex.
    const oppositeNormal = cross(subtract(b, a), subtract(c, a));
    const wo = Math.hypot(...oppositeNormal);
    const wa = Math.hypot(...bc), wb = Math.hypot(...ca), wc = Math.hypot(...ab);
    const sum = wo + wa + wb + wc;
    localCenter = coordinates.map(i => (wa * a[i] + wb * b[i] + wc * c[i]) / sum) as Vec3;
    localRadius = Math.abs(determinant) / sum;
    // Reuse this normalized frame for the tangency radius, avoiding a second
    // plane calculation with an unrelated absolute-scale degeneracy cutoff.
    const normal = oppositeNormal.map(n => n / wo) as Vec3;
    const distance = dot(subtract(localCenter, a), normal);
    localRadiusPoint = coordinates.map(i => localCenter[i] - distance * normal[i]) as Vec3;
  } else {
    throw new Error('无法识别四面体的球类型');
  }
  const center = coordinates.map(i => (origin[i] + longest * localCenter[i]) / prescale) as Vec3;
  const radius = longest * localRadius / prescale;
  const radiusPoint = coordinates.map(i => (origin[i] + longest * localRadiusPoint[i]) / prescale) as Vec3;
  if (!center.every(Number.isFinite) || !radiusPoint.every(Number.isFinite) || !Number.isFinite(radius) || radius <= 0) {
    throw new Error('球心或半径超出数值表示范围');
  }
  return { center, radius, radiusPoint };
}
