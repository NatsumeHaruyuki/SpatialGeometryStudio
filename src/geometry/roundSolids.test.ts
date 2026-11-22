import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../schema/scene';
import { moveRoundControl, roundControlPoints, roundFrame, sectionRound, type RoundPrimitive } from './roundSolids';

const cone: RoundPrimitive = { kind: 'cone', origin: [0, 0, 0], axis: [0, 2, 0], radius: 4, height: 4 };
const cylinder: RoundPrimitive = { ...cone, kind: 'cylinder', radius: 2 };
const doubleCone: RoundPrimitive = { ...cone, kind: 'doubleCone' };

function verifiedSection(p: RoundPrimitive, origin: Vec3, normal: Vec3) {
  const cut = sectionRound(p, origin, normal);
  expect(cut.closed).toHaveLength(cut.curves.length);
  for (const curve of cut.curves) for (const point of curve) {
    const delta = point.map((v, i) => v - p.origin[i]);
    const y = delta.reduce((acc, v, i) => acc + v * p.axis[i], 0) / Math.hypot(...p.axis);
    const radialSquared = delta.reduce((acc, v) => acc + v * v, 0) - y * y;
    const radius = p.kind === 'cylinder' ? p.radius : p.radius * y / p.height;
    expect(radialSquared).toBeCloseTo(radius * radius, 8);
    expect(point.reduce((acc, v, i) => acc + (v - origin[i]) * normal[i], 0)).toBeCloseTo(0, 8);
    expect(y).toBeGreaterThanOrEqual((p.kind === 'doubleCone' ? -p.height : 0) - 1e-8);
    expect(y).toBeLessThanOrEqual(p.height + 1e-8);
  }
  return cut;
}

describe('rotational-solid controls', () => {
  it('defines the default frame and the upper and lower cap handles', () => {
    expect(roundFrame(cone)).toEqual({ u: [1, 0, 0], axis: [0, 1, 0], v: [0, 0, 1] });
    const handles = (p: RoundPrimitive) => roundControlPoints(p).map(q => [q.id, q.label, q.position]);
    expect(handles(doubleCone)).toEqual([
      ['O', 'O', [0, 0, 0]], ['T', 'T', [0, 4, 0]], ['A', 'A', [4, 4, 0]],
      ['B', 'B', [0, 4, 4]], ['C', 'C', [-4, 4, 0]], ['T2', 'T₂', [0, -4, 0]],
      ['A2', 'A₂', [4, -4, 0]], ['B2', 'B₂', [0, -4, 4]],
    ]);
    expect(handles(cylinder).slice(2)).toEqual([
      ['A', 'A', [2, 0, 0]], ['B', 'B', [0, 0, 2]], ['C', 'C', [-2, 0, 0]], ['A1', 'A₁', [2, 4, 0]],
    ]);
    expect(handles(cone)).toHaveLength(5);
  });

  it('translates the origin, edits the axis from either cap and projects ring handles', () => {
    expect(moveRoundControl(cone, 'O', [1, 2, 3])).toEqual({ ...cone, origin: [1, 2, 3] });
    const tilted = moveRoundControl(doubleCone, 'T2', [-3, -4, 0]);
    expect(tilted.height).toBe(5);
    tilted.axis.forEach((v, i) => expect(v).toBeCloseTo([0.6, 0.8, 0][i]));
    expect(moveRoundControl(cone, 'T', [0, 0, 7]).height).toBe(7);
    expect(moveRoundControl(tilted, 'B2', [3, 4, 6]).radius).toBeCloseTo(6);
    expect(doubleCone.height).toBe(4);
  });

  it('rejects collapsed, out-of-range or inapplicable handles', () => {
    for (const [id, desired] of [['A', [0, 2, 0]], ['T', [0, 0, 0]], ['T2', [2, 2, 2]],
      ['A', [0.00001, 2, 0]], ['T', [NaN, 2, 0]], ['A', [10 ** 15, 2, 0]]] as [string, Vec3][]) {
      expect(() => moveRoundControl(cone, id, desired)).toThrow();
    }
    expect(() => roundFrame({ ...cone, axis: [0, 0, 0] })).toThrow();
  });

  it('keeps the A handle on the same side when tilting a vertical axis slightly', () => {
    const tilted = moveRoundControl(cone, 'T', [0.1, 4, 0]);
    expect(roundControlPoints(tilted).find(q => q.id === 'A')!.position[0]).toBeGreaterThan(4);
  });

  it('transports every ring handle across the legacy frame switch and restores it from JSON', () => {
    const tiltedAxis = (x: number): Vec3 => [x, Math.sqrt(1 - x * x), 0];
    const previous = { ...cylinder, axis: tiltedAxis(0.949999) };
    const nextAxis = tiltedAxis(0.950001);
    const next = moveRoundControl(previous, 'T', [4 * nextAxis[0], 4 * nextAxis[1], 0]);
    const before = roundControlPoints(previous);
    const restored = roundControlPoints(JSON.parse(JSON.stringify(next)));
    for (const q of restored) {
      const old = before.find(v => v.id === q.id)!.position;
      expect(Math.hypot(...q.position.map((v, i) => v - old[i]))).toBeLessThan(0.0001);
    }
    expect(Math.hypot(...next.radial!)).toBeCloseTo(1, 12);
    expect(next.radial!.reduce((sum, v, i) => sum + v * next.axis[i], 0)).toBeCloseTo(0, 12);
    expect(moveRoundControl(next, 'O', [3, 2, 1]).radial).toEqual(next.radial);
    expect(moveRoundControl(next, 'A', [0, 0, 5]).radial).toEqual(next.radial);
  });

  it('projects supplied radial orientation and rejects undefined radial directions', () => {
    const p: RoundPrimitive = { ...cone, axis: [3, 4, 0], radial: [6, 8, 5] };
    const frame = roundFrame(p);
    frame.u.forEach((v, i) => expect(v).toBeCloseTo([0, 0, 1][i], 12));
    frame.v.forEach((v, i) => expect(v).toBeCloseTo([-0.8, 0.6, 0][i], 12));
    for (const radial of [[0, 0, 0], [6, 8, 0], [-3, -4, 0], [Infinity, 0, 1]] as Vec3[]) {
      expect(() => roundFrame({ ...p, radial })).toThrow();
    }
  });

  it('uses the shortest rotation from either cap and preserves the radial on exact axis reversal', () => {
    const p: RoundPrimitive = { ...doubleCone, radial: [1, 0, 1] };
    const rotated = moveRoundControl(p, 'T2', [-4, 0, 0]);
    const expected = [0, -Math.SQRT1_2, Math.SQRT1_2];
    const reversed = moveRoundControl(rotated, 'T', [-4, 0, 0]);
    for (const shape of [rotated, reversed]) {
      roundFrame(shape).u.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 12));
    }
    expect(verifiedSection(reversed, [-2, 0, 0], [1, 0, 0]).area).toBeCloseTo(4 * Math.PI, 6);
  });
});

describe('analytic sections', () => {
  it('finds a circle and an oblique ellipse with their analytic areas', () => {
    const circle = verifiedSection(cone, [0, 2, 0], [0, 1, 0]);
    expect(circle.kind).toBe('圆');
    expect(circle.closed).toEqual([true]);
    expect(circle.area).toBeCloseTo(4 * Math.PI, 6);
    // y = 1 + x/2. The projected ellipse has semiaxes 4/3 and 2/√3.
    const ellipse = verifiedSection(cone, [0, 1, 0], [-1, 2, 0]);
    expect(ellipse.kind).toBe('椭圆');
    expect(ellipse.closed).toEqual([true]);
    expect(ellipse.area).toBeCloseTo(4 * Math.PI * Math.sqrt(5 / 3) / 3, 6);
    expect(ellipse.curves[0].length).toBeGreaterThan(32);
  });

  it('terminates a parabola or clipped ellipse on the rim', () => {
    for (const [normal, point, kind] of [[[1, 1, 0], [0, 1, 0], '抛物线'],
      [[1, 2, 0], [0, 3, 0], '椭圆']] as [Vec3, Vec3, string][]) {
      const cut = verifiedSection(cone, point, normal);
      expect(cut.kind).toBe(kind);
      expect(cut.closed).toEqual([false]);
      expect(cut.area).toBeNull();
      expect(cut.curves[0][0][1]).toBeCloseTo(4);
      expect(cut.curves[0].at(-1)![1]).toBeCloseTo(4);
    }
  });

  it('preserves opposite hyperbola branches without crossing the apex', () => {
    const cut = verifiedSection(doubleCone, [1, 0, 0], [1, 0, 0]);
    expect(cut.kind).toBe('双曲线');
    expect(cut.closed).toEqual([false, false]);
    expect(cut.area).toBeNull();
    const signs = cut.curves.map(curve => {
      const sign = Math.sign(curve[0][1]);
      expect(curve.every(p => p[1] * sign >= 1 - 1e-8)).toBe(true);
      expect(Math.min(...curve.map(p => Math.abs(p[1])))).toBeCloseTo(1);
      expect(Math.abs(curve.at(-1)![1])).toBeCloseTo(4);
      return sign;
    });
    expect(signs.sort()).toEqual([-1, 1]);
    expect(verifiedSection(cone, [1, 0, 0], [1, 0, 0]).curves).toHaveLength(1);
  });

  it('handles degenerate cone sections and isolated rim contacts', () => {
    for (const [normal, kind, count] of [[[1, 0, 0], '相交直线', 2],
      [[1, 1, 0], '一条直线', 1], [[0, 1, 0], '一点', 1]] as [Vec3, string, number][]) {
      const cut = verifiedSection(doubleCone, [0, 0, 0], normal);
      expect(cut.kind).toBe(kind);
      expect(cut.curves).toHaveLength(count);
      expect(cut.area).toBeNull();
    }
    const contact = verifiedSection(cone, [4, 0, 0], [1, 0, 0]);
    expect(contact.kind).toBe('一点');
    expect(contact.curves).toEqual([[[4, 4, 0]]]);
    expect(verifiedSection(cone, [5, 0, 0], [1, 0, 0]).kind).toBe('无交线');
    expect(verifiedSection(cone, [0, -1, 0], [0, 1, 0]).kind).toBe('无交线');
  });

  it('returns a cylinder ellipse, parallel generators and the single tangent generator', () => {
    const cut = verifiedSection(cylinder, [0, 2, 0], [1, 2, 0]);
    expect(cut.kind).toBe('椭圆');
    expect(cut.closed).toEqual([true]);
    expect(cut.area).toBeCloseTo(2 * Math.sqrt(5) * Math.PI, 6);
    for (const [x, kind, count] of [[1, '两条平行线', 2], [2, '一条直线', 1], [3, '无交线', 0]] as const) {
      const slice = verifiedSection(cylinder, [x, 0, 0], [1, 0, 0]);
      expect(slice.kind).toBe(kind);
      expect(slice.curves).toHaveLength(count);
      expect(slice.area).toBeNull();
      for (const line of slice.curves) expect(line.map(p => p[1]).sort()).toEqual([0, 4]);
    }
    const twoArcs = verifiedSection(cylinder, [0, 2, 0], [4, 1, 0]);
    expect(twoArcs.closed).toEqual([false, false]);
    expect(twoArcs.area).toBeNull();
  });

  it('cuts in world coordinates after translation and rotation', () => {
    const rotated: RoundPrimitive = { ...cone, origin: [2, -3, 5], axis: [3, 4, 0] };
    const cut = verifiedSection(rotated, [3.2, -1.4, 5], [3, 4, 0]);
    expect(cut.kind).toBe('圆');
    expect(cut.closed).toEqual([true]);
    expect(cut.area).toBeCloseTo(4 * Math.PI, 6);
    const oblique = verifiedSection({ ...rotated, kind: 'doubleCone' }, [2, -3, 6], [0, 0, 1]);
    expect(oblique.kind).toBe('双曲线');
    expect(oblique.closed).toEqual([false, false]);
  });

  it('allows a translated plane to move beyond the scene bounds', () => {
    expect(verifiedSection(cone, [0, 10002, 0], [0, 1, 0]).kind).toBe('无交线');
  });
});
