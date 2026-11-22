import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../schema/scene';
import { tetrahedronSphere, type SphereKind } from './spheres';

const right: Vec3[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];
const regular: Vec3[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
const kinds: SphereKind[] = ['circumsphere', 'insphere'];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function checkSphere(vertices: Vec3[], kind: SphereKind) {
  const sphere = tetrahedronSphere(vertices, kind);
  for (const vertex of vertices) {
    if (kind === 'circumsphere') {
      expect(Math.hypot(...subtract(sphere.center, vertex))).toBeCloseTo(sphere.radius, 10);
    } else {
      const [a, b, c] = vertices.filter(v => v !== vertex);
      const n = cross(subtract(b, a), subtract(c, a));
      const side = dot(subtract(sphere.center, a), n);
      expect(side * dot(subtract(vertex, a), n)).toBeGreaterThan(0);
      expect(Math.abs(side) / Math.hypot(...n)).toBeCloseTo(sphere.radius, 10);
    }
  }
  return sphere;
}

describe.each(kinds)('tetrahedron %s', kind => {
  it('returns a scale-independent radius endpoint for drawing, including tiny tetrahedra', () => {
    for (const factor of [2e-5, 1, 1e-150, 1e150]) {
      const vertices = right.map(p => p.map(n => n * factor) as Vec3);
      const sphere = tetrahedronSphere(vertices, kind);
      const endpoint = sphere.radiusPoint;
      expect(endpoint).toHaveLength(3);
      endpoint.forEach(n => expect(n / factor).toBeCloseTo(kind === 'circumsphere' ? 0 : 1 / 3, 12));
      expect(Math.hypot(...subtract(endpoint, sphere.center)) / factor).toBeCloseTo(sphere.radius / factor, 12);
    }
  });

  it('matches the independently known centers and radii of the unit right and regular tetrahedra', () => {
    const r = (3 - Math.sqrt(3)) / 6;
    const first = checkSphere(right, kind);
    first.center.forEach(value => expect(value).toBeCloseTo(kind === 'circumsphere' ? 0.5 : r, 12));
    expect(first.radius).toBeCloseTo(kind === 'circumsphere' ? Math.sqrt(3) / 2 : r, 12);
    const second = checkSphere(regular, kind);
    second.center.forEach(value => expect(value).toBeCloseTo(0, 12));
    expect(second.radius).toBeCloseTo(kind === 'circumsphere' ? Math.sqrt(3) : Math.sqrt(3) / 3, 12);
  });

  it('gives the same sphere for all 24 vertex orders of an irregular tetrahedron', () => {
    const vertices: Vec3[] = [[2, -1, 5], [3, 4, -1], [-2, 2, 3], [0, -4, 1]];
    const first = checkSphere(vertices, kind);
    for (const a of vertices) for (const b of vertices.filter(v => v !== a)) {
      for (const c of vertices.filter(v => v !== a && v !== b)) {
        const d = vertices.find(v => v !== a && v !== b && v !== c)!;
        const other = checkSphere([a, b, c, d], kind);
        other.center.forEach((v, i) => expect(v).toBeCloseTo(first.center[i], 12));
        expect(other.radius).toBeCloseTo(first.radius, 12);
      }
    }
  });

  it('retains relative accuracy after extreme changes of scale and after large translations', () => {
    const expectedCoordinate = kind === 'circumsphere' ? 0.5 : (3 - Math.sqrt(3)) / 6;
    const expectedRadius = kind === 'circumsphere' ? Math.sqrt(3) / 2 : expectedCoordinate;
    for (const factor of [2 ** -560, 2 ** 540]) {
      const scaled = right.map(v => v.map(x => x * factor) as Vec3);
      const sphere = tetrahedronSphere(scaled, kind);
      sphere.center.forEach(x => expect(x / factor).toBeCloseTo(expectedCoordinate, 12));
      expect(sphere.radius / factor).toBeCloseTo(expectedRadius, 12);
    }
    const huge = regular.map(v => v.map(x => x * 1e308) as Vec3);
    const hugeSphere = tetrahedronSphere(huge, kind);
    expect(hugeSphere.radius / 1e308).toBeCloseTo(kind === 'circumsphere' ? Math.sqrt(3) : Math.sqrt(3) / 3, 12);
    hugeSphere.center.forEach(x => expect(x / 1e308).toBeCloseTo(0, 12));
    const shift: Vec3 = [2 ** 40, -(2 ** 41), 2 ** 39];
    const side = 0.125;
    const shifted = right.map(v => v.map((x, i) => shift[i] + x * side) as Vec3);
    const sphere = tetrahedronSphere(shifted, kind);
    sphere.center.forEach((x, i) => expect(x).toBe(shift[i] + expectedCoordinate * side));
    expect(sphere.radius / side).toBeCloseTo(expectedRadius, 12);
  });

  it('rejects coplanar, repeated and relatively near-coplanar input across scales', () => {
    for (const scale of [1, 1e-100, 1e100]) {
      for (const fourth of [[0, 0, 0], [1, 1, 0], [0.5, 0.5, 1e-12]]) {
        const points = [...right.slice(0, 3), fourth].map(v => v.map(x => x * scale) as Vec3);
        expect(() => tetrahedronSphere(points, kind)).toThrow(/[\u4e00-\u9fff]/);
      }
    }
  });

  it('requires exactly four finite three-dimensional points', () => {
    for (const points of [right.slice(1), [...right, right[0]], [...right.slice(0, 3), [0, 0]],
      [...right.slice(0, 3), [0, 0, 1, 2]], [...right.slice(0, 3), [0, 0, NaN]],
      [...right.slice(0, 3), [0, Infinity, 1]]]) {
      expect(() => tetrahedronSphere(points as Vec3[], kind)).toThrow(/[\u4e00-\u9fff]/);
    }
  });
});
