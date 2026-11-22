import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../schema/scene';
import { perpendicularFoot, triangleMeasurement, threePointAngle, pointPlaneProjection } from './studyGeometry';

const closeVector = (actual: Vec3, expected: Vec3, digits = 12) => actual.forEach((n, i) => expect(n).toBeCloseTo(expected[i], digits));
const scaled = (v: Vec3, factor: number): Vec3 => v.map(n => n * factor) as Vec3;

describe('point perpendicular to an infinite line', () => {
  it('allows the foot beyond the selected segment and returns its parameter and outward unit direction', () => {
    const result = perpendicularFoot([3, 4, 2], [0, 0, 2], [1, 0, 2]);
    closeVector(result.foot, [3, 0, 2]);
    expect(result.t).toBeCloseTo(3, 12);
    expect(result.distance).toBeCloseTo(4, 12);
    closeVector(result.direction!, [0, 1, 0]);
    const reversed = perpendicularFoot([3, 4, 2], [1, 0, 2], [0, 0, 2]);
    closeVector(reversed.foot, [3, 0, 2]);
    expect(reversed.t).toBeCloseTo(-2, 12);
  });

  it('reports a zero distance and no unique perpendicular direction for an on-line point', () => {
    const result = perpendicularFoot([2, 2, 2], [0, 0, 0], [1, 1, 1]);
    closeVector(result.foot, [2, 2, 2]);
    expect(result.distance).toBeCloseTo(0, 12);
    expect(result.direction).toBeNull();
  });

  it('does not invent a perpendicular from the rounding residual of a fractional point on a diagonal', () => {
    for (const factor of [1, 1e-150, 1e150]) {
      const p = scaled([1.4, 0, -0.6], factor);
      const result = perpendicularFoot(p, scaled([2, 0, 0], factor), scaled([0, 0, -2], factor));
      expect(result.distance).toBe(0);
      expect(result.direction).toBeNull();
      expect(result.foot).toEqual(p);
    }
    const separated = perpendicularFoot([1.4, 1e-10, -0.6], [2, 0, 0], [0, 0, -2]);
    expect(separated.distance / 1e-10).toBeCloseTo(1, 5);
    expect(separated.direction).not.toBeNull();
  });

  it('retains tiny perpendicular distances and handles uniform small and large scales', () => {
    for (const factor of [1e-150, 2e-5, 1e150]) {
      const result = perpendicularFoot(scaled([3, 4, 2], factor), scaled([0, 0, 2], factor), scaled([1, 0, 2], factor));
      closeVector(scaled(result.foot, 1 / factor), [3, 0, 2]);
      expect(result.distance / factor).toBeCloseTo(4, 12);
      expect(result.t).toBeCloseTo(3, 12);
      closeVector(result.direction!, [0, 1, 0]);
    }
    const closeToLine = perpendicularFoot([0.5, 1e-15, 0], [0, 0, 0], [1, 0, 0]);
    expect(closeToLine.distance / 1e-15).toBeCloseTo(1, 12);
  });

  it('rejects coincident line points and malformed or nonfinite coordinates', () => {
    expect(() => perpendicularFoot([1, 1, 1], [0, 0, 0], [0, 0, 0])).toThrow(/[\u4e00-\u9fff]/);
    expect(() => perpendicularFoot([NaN, 1, 1], [0, 0, 0], [0, 1, 0])).toThrow(/[\u4e00-\u9fff]/);
    expect(() => perpendicularFoot([1, 1] as unknown as Vec3, [0, 0, 0], [0, 1, 0])).toThrow(/[\u4e00-\u9fff]/);
  });
});

describe('triangle measurement independent of a solid section', () => {
  it('measures the half-square triangle and preserves vertex-order orientation', () => {
    const first = triangleMeasurement([0, 0, 0], [2, 0, 0], [2, 0, 2]);
    expect(first.area).toBeCloseTo(2, 12);
    closeVector(first.normal, [0, -1, 0]);
    closeVector(triangleMeasurement([0, 0, 0], [2, 0, 2], [2, 0, 0]).normal, [0, 1, 0]);
  });

  it('uses relative geometry for tiny and large triangles and rejects collinear input', () => {
    for (const factor of [1e-150, 2e-5, 1e150]) {
      const result = triangleMeasurement([0, 0, 0], [factor, 0, 0], [0, factor, 0]);
      expect(result.area / factor / factor).toBeCloseTo(0.5, 12);
      closeVector(result.normal, [0, 0, 1]);
      expect(() => triangleMeasurement([0, 0, 0], [factor, 0, 0], [2 * factor, 0, 0])).toThrow(/[\u4e00-\u9fff]/);
    }
  });
});

describe('three-point angle with the middle point as vertex', () => {
  it.each([
    { a: [1, 0, 0], c: [0.5, Math.sqrt(3) / 2, 0], degrees: 60 },
    { a: [1, 0, 0], c: [0, 1, 0], degrees: 90 },
    { a: [1, 0, 0], c: [-0.5, Math.sqrt(3) / 2, 0], degrees: 120 },
    { a: [1, 0, 0], c: [-2, 0, 0], degrees: 180 },
    { a: [1, 0, 0], c: [2, 0, 0], degrees: 0 },
  ])('returns $degrees degrees from independent known rays', ({ a, c, degrees }) => {
    const result = threePointAngle(a as Vec3, [0, 0, 0], c as Vec3);
    expect(result.degrees).toBeCloseTo(degrees, 12);
    closeVector(result.rayA, [1, 0, 0]);
    if (degrees === 0 || degrees === 180) expect(result.normal).toBeNull();
    else closeVector(result.normal!, [0, 0, 1]);
  });

  it('ignores arm lengths and translation, and rejects a zero-length arm', () => {
    for (const factor of [1e-150, 1e150]) {
      expect(threePointAngle([4 * factor, factor, factor], [factor, factor, factor], [factor, 8 * factor, factor]).degrees).toBeCloseTo(90, 12);
    }
    expect(() => threePointAngle([1, 2, 3], [1, 2, 3], [4, 5, 6])).toThrow(/[\u4e00-\u9fff]/);
  });
});

describe('point-to-plane projection and the projection triangle', () => {
  const plane: [Vec3, Vec3, Vec3] = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];

  it('projects outside the defining triangle and preserves signed distance and direction', () => {
    const result = pointPlaneProjection([3, 4, -2], plane);
    closeVector(result.foot, [3, 4, 0]);
    closeVector(result.unitNormal, [0, 0, 1]);
    closeVector(result.direction, [3, 4, -2]);
    expect(result.distance).toBeCloseTo(2, 12);
    expect(result.signedDistance).toBeCloseTo(-2, 12);
    expect(result.referenceIndex).toBe(0);
    expect(result.triangle).toEqual([[0, 0, 0], [3, 4, 0], [3, 4, -2]]);
    const reversed = pointPlaneProjection([3, 4, -2], [plane[0], plane[2], plane[1]]);
    closeVector(reversed.foot, [3, 4, 0]);
    expect(reversed.signedDistance).toBeCloseTo(2, 12);
    expect(reversed.distance).toBeCloseTo(2, 12);
  });

  it('chooses another plane vertex if the first is the foot and still yields a right triangle', () => {
    const result = pointPlaneProjection([0, 0, 2], [[0, 0, 0], [3, 0, 0], [0, 1, 0]]);
    expect(result.referenceIndex).toBe(1);
    closeVector(result.direction, [-3, 0, 2]);
    expect(result.triangle).toEqual([[3, 0, 0], [0, 0, 0], [0, 0, 2]]);
  });

  it('allows a point in the plane, including a point at its first vertex', () => {
    for (const p of [[0.25, 0.25, 0], [0, 0, 0]] as Vec3[]) {
      const result = pointPlaneProjection(p, plane);
      expect(result.distance).toBe(0);
      closeVector(result.foot, p);
      closeVector(result.triangle[2], p);
    }
  });

  it('snaps only the rounding-scale residual of a fractional point in an oblique plane', () => {
    for (const factor of [1, 1e-150, 1e150]) {
      const p = scaled([1.4, 0, -0.6], factor);
      const plane = [[2, 0, 0], [0, 0, -2], [0, 2, 0]].map(v => scaled(v as Vec3, factor)) as [Vec3, Vec3, Vec3];
      const result = pointPlaneProjection(p, plane);
      expect(result.distance).toBe(0);
      expect(result.signedDistance).toBe(0);
      expect(result.foot).toEqual(p);
      expect(result.triangle[1]).toEqual(result.triangle[2]);
    }
    const separated = pointPlaneProjection([1.4, 1e-10, -0.6], [[2, 0, 0], [0, 0, -2], [0, 2, 0]]);
    expect(separated.distance / (1e-10 / Math.sqrt(3))).toBeCloseTo(1, 5);
    expect(separated.distance).toBeGreaterThan(0);
    const axisAligned = pointPlaneProjection([0.5, 0.5, 1e-15], [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
    expect(axisAligned.distance / 1e-15).toBeCloseTo(1, 12);
  });

  it('handles an oblique translated plane with an independently known foot', () => {
    const result = pointPlaneProjection([4, 4, 4], [[3, 0, 0], [0, 3, 0], [0, 0, 3]]);
    closeVector(result.foot, [1, 1, 1]);
    closeVector(result.unitNormal, [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]);
    expect(result.distance).toBeCloseTo(3 * Math.sqrt(3), 12);
    expect(result.signedDistance).toBeCloseTo(3 * Math.sqrt(3), 12);
    closeVector(result.direction, [1, 4, 4]);
  });

  it('retains plane orientation and scaled distances for tiny and large models', () => {
    for (const factor of [1e-150, 2e-5, 1e150]) {
      const result = pointPlaneProjection(scaled([3, 4, -2], factor), plane.map(p => scaled(p, factor)) as [Vec3, Vec3, Vec3]);
      closeVector(scaled(result.foot, 1 / factor), [3, 4, 0]);
      expect(result.distance / factor).toBeCloseTo(2, 12);
      closeVector(result.unitNormal, [0, 0, 1]);
    }
  });

  it('rejects repeated or collinear plane points and nonfinite points', () => {
    expect(() => pointPlaneProjection([1, 1, 2], [[0, 0, 0], [1, 1, 1], [2, 2, 2]])).toThrow(/[\u4e00-\u9fff]/);
    expect(() => pointPlaneProjection([1, 1, 2], [[0, 0, 0], [0, 0, 0], [0, 1, 0]])).toThrow(/[\u4e00-\u9fff]/);
    expect(() => pointPlaneProjection([1, Infinity, 2], plane)).toThrow(/[\u4e00-\u9fff]/);
  });
});
