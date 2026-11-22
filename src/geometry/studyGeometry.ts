import type { Vec3 } from '../schema/scene';

const axes = [0, 1, 2] as const;
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const multiply = (a: Vec3, factor: number): Vec3 => [a[0] * factor, a[1] * factor, a[2] * factor];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const magnitude = (v: Vec3) => Math.hypot(...v);
const roundoff = (operations: number) => {
  const error = operations * Number.EPSILON / 2;
  return error / (1 - error);
};

/** Componentwise product bounds preserve small perpendicular components that
 * do not arise from cancellation of larger terms. No world-space epsilon. */
function boundedCross(a: Vec3, b: Vec3) {
  const pairs = [[1, 2], [2, 0], [0, 1]] as const;
  const error = pairs.map(([j, k]) => roundoff(12) * (Math.abs(a[j] * b[k]) + Math.abs(a[k] * b[j]))) as Vec3;
  // The bound also allows for the preceding local-frame and unit conversions.
  return { value: cross(a, b), error };
}

function finiteVector(value: unknown): asserts value is Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error('点必须由三个有限坐标组成');
}

function normalized(v: Vec3, error: string) {
  const scale = Math.max(...v.map(Math.abs));
  if (scale === 0) throw new Error(error);
  // Division rather than multiplying by 1/scale also handles subnormal values.
  const local = v.map(n => n / scale) as Vec3;
  const length = magnitude(local);
  return { unit: multiply(local, 1 / length), length: length * scale };
}

/** A translated and scaled frame keeps cross/dot products independent of model size. */
function frame(input: readonly Vec3[]) {
  input.forEach(finiteVector);
  const prescale = input.some(p => p.some(n => Math.abs(n) > Number.MAX_VALUE / 4)) ? 0.25 : 1;
  const points = input.map(p => multiply(p, prescale));
  const origin = points[0];
  const shifts = points.map(p => subtract(p, origin));
  const scale = Math.max(...shifts.flat().map(Math.abs)) || 1;
  const local = shifts.map(p => p.map(n => n / scale) as Vec3);
  const point = (p: Vec3): Vec3 => {
    const value = axes.map(i => (origin[i] + p[i] * scale) / prescale) as Vec3;
    finiteVector(value);
    return value;
  };
  const vector = (p: Vec3): Vec3 => {
    const value = p.map(n => n * scale / prescale) as Vec3;
    finiteVector(value);
    return value;
  };
  const length = (n: number) => {
    const result = n * scale / prescale;
    if (!Number.isFinite(result)) throw new Error('几何量超出数值表示范围');
    return result;
  };
  return { local, point, vector, length };
}

function planeNormal(a: Vec3, b: Vec3) {
  const u = normalized(a, '平面的三个点不能重合').unit;
  const v = normalized(b, '平面的三个点不能重合').unit;
  const { value: n, error } = boundedCross(u, v);
  const sine = magnitude(n);
  if (sine <= 1e-12) throw new Error('三个点共线或过于接近共线，无法稳定确定平面');
  return { normal: multiply(n, 1 / sine), sine, orientation: n, error };
}

/** The selected endpoints define an infinite line; t is intentionally not clamped. */
export function perpendicularFoot(p: Vec3, a: Vec3, b: Vec3): { foot: Vec3; t: number; distance: number; direction: Vec3 | null } {
  const basis = frame([a, b, p]);
  const line = normalized(basis.local[1], '直线的两个点不能重合');
  const source = basis.local[2];
  const squaredUnit = dot(line.unit, line.unit);
  const comparison = boundedCross(line.unit, source);
  const onLine = comparison.value.every((value, i) => Math.abs(value) <= comparison.error[i]);
  // The double cross avoids subtracting two large parallel components and
  // produces exactly zero for many common on-line configurations.
  const residual: Vec3 = onLine ? [0, 0, 0] : multiply(cross(line.unit, cross(source, line.unit)), 1 / squaredUnit);
  const distance = magnitude(residual);
  const foot: Vec3 = onLine ? [...p] : basis.point(subtract(source, residual));
  const t = dot(source, line.unit) / squaredUnit / line.length;
  if (!Number.isFinite(t)) throw new Error('垂足的直线参数超出数值表示范围');
  return { foot, t, distance: basis.length(distance), direction: distance === 0 ? null : normalized(residual, '垂线方向暂不可定义').unit };
}

export function triangleMeasurement(a: Vec3, b: Vec3, c: Vec3): { area: number; normal: Vec3 } {
  const basis = frame([a, b, c]);
  const ab = basis.local[1], ac = basis.local[2];
  const { normal, sine } = planeNormal(ab, ac);
  const area = basis.length(magnitude(ab)) * (basis.length(magnitude(ac)) * sine / 2);
  if (!Number.isFinite(area) || area === 0) throw new Error('三角形面积超出数值表示范围');
  return { area, normal };
}

/** The middle point is the vertex. Nonzero collinear arms describe 0° or 180°. */
export function threePointAngle(a: Vec3, b: Vec3, c: Vec3): { degrees: number; rayA: Vec3; rayC: Vec3; normal: Vec3 | null } {
  const basis = frame([b, a, c]);
  const rayA = normalized(basis.local[1], '角的顶点与端点不能重合').unit;
  const rayC = normalized(basis.local[2], '角的顶点与端点不能重合').unit;
  const n = cross(rayA, rayC), sine = magnitude(n);
  return { degrees: Math.atan2(sine, dot(rayA, rayC)) * 180 / Math.PI, rayA, rayC, normal: sine <= Number.EPSILON * 8 ? null : multiply(n, 1 / sine) };
}

/** A, B define an infinite common line; P and Q select its two half-planes. */
export function dihedralMeasurement(a: Vec3, b: Vec3, p: Vec3, q: Vec3) {
  const basis = frame([a, b, p, q]);
  const axis = normalized(basis.local[1], '公共直线的两个端点不能重合').unit;
  const ray = (source: Vec3) => {
    const comparison = boundedCross(axis, source);
    if (comparison.value.every((value, i) => Math.abs(value) <= comparison.error[i])) {
      throw new Error('所选点在公共直线上，无法确定平面，请选择直线外的点');
    }
    return normalized(cross(comparison.value, axis), '所选点在公共直线上，无法确定平面').unit;
  };
  const rayA = ray(basis.local[2]), rayB = ray(basis.local[3]);
  const turn = cross(rayA, rayB);
  const degrees = Math.atan2(magnitude(turn), dot(rayA, rayB)) * 180 / Math.PI;
  const normal = multiply(axis, dot(turn, axis) < 0 ? -1 : 1);
  return { degrees, exterior: 180 - degrees, origin: basis.point(multiply(basis.local[1], 0.5)), rayA, rayB, normal };
}

export function pointPlaneProjection(p: Vec3, plane: readonly [Vec3, Vec3, Vec3]): {
  foot: Vec3; distance: number; signedDistance: number; unitNormal: Vec3;
  referenceIndex: number; direction: Vec3; triangle: [Vec3, Vec3, Vec3];
} {
  if (!Array.isArray(plane) || plane.length !== 3) throw new Error('请选择三个点确定平面');
  const basis = frame([plane[0], plane[1], plane[2], p]);
  const { normal: unitNormal, orientation, error } = planeNormal(basis.local[1], basis.local[2]);
  const source = basis.local[3];
  const triple = dot(source, orientation);
  const tripleError = axes.reduce<number>((sum, i) => sum + Math.abs(source[i]) * error[i] + roundoff(8) * Math.abs(source[i] * orientation[i]), 0);
  const inPlane = Math.abs(triple) <= tripleError;
  const signed = inPlane ? 0 : dot(source, unitNormal);
  const localFoot = subtract(source, multiply(unitNormal, signed));
  const foot: Vec3 = inPlane ? [...p] : basis.point(localFoot);
  let referenceIndex = 0;
  if (magnitude(localFoot) <= Number.EPSILON * 16 * Math.max(magnitude(basis.local[1]), magnitude(basis.local[2]))) {
    referenceIndex = magnitude(subtract(basis.local[1], localFoot)) >= magnitude(subtract(basis.local[2], localFoot)) ? 1 : 2;
  }
  const reference = plane[referenceIndex];
  const direction = basis.vector(subtract(source, basis.local[referenceIndex]));
  return {
    foot, distance: basis.length(Math.abs(signed)), signedDistance: basis.length(signed), unitNormal,
    referenceIndex, direction, triangle: [[reference[0], reference[1], reference[2]], foot, [...p]],
  };
}
