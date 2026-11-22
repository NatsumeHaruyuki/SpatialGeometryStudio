import { describe, expect, it } from 'vitest';
import { dihedralMeasurement } from './studyGeometry';
import { getDihedral } from './dihedral';
import { createExample } from './examples';
import { resolvePoints } from './engine';
import { parseScene, type Construction, type Vec3 } from '../schema/scene';

const a: Vec3 = [0, 0, 0], b: Vec3 = [2, 0, 0];
const construction: Extract<Construction, { kind: 'dihedral' }> = { id: 'four-angle', kind: 'dihedral', points: ['A', 'B', 'C', 'A1'] };

describe('four-point half-plane dihedral', () => {
  it('measures a right angle around the selected infinite line', () => {
    const result = dihedralMeasurement(a, b, [-8, 1, 0], [12, 0, 1]);
    expect(result.degrees).toBeCloseTo(90);
    expect(result.origin).toEqual([1, 0, 0]);
    result.rayA.forEach((n, i) => expect(n).toBeCloseTo([0, 1, 0][i]));
    result.rayB.forEach((n, i) => expect(n).toBeCloseTo([0, 0, 1][i]));
  });

  it('preserves 120 degrees and the selected supplementary half-plane', () => {
    const p: Vec3 = [0, 1, 0], q: Vec3 = [3, -0.5, Math.sqrt(3) / 2];
    expect(dihedralMeasurement(a, b, p, q).degrees).toBeCloseTo(120);
    expect(dihedralMeasurement(a, b, p, q).exterior).toBeCloseTo(60);
    expect(dihedralMeasurement(a, b, p, [3, 0.5, -Math.sqrt(3) / 2]).degrees).toBeCloseTo(60);
    expect(dihedralMeasurement(b, a, p, q).degrees).toBeCloseTo(120);
    expect(dihedralMeasurement(a, b, q, p).degrees).toBeCloseTo(120);
  });

  it.each([0, 180])('represents the limiting %s degree half-plane angle', degrees => {
    const result = dihedralMeasurement(a, b, [0, 1, 0], [2, degrees === 0 ? 2 : -2, 0]);
    expect(result.degrees).toBeCloseTo(degrees);
    expect(result.normal.every(Number.isFinite)).toBe(true);
  });

  it.each([1e-9, 1, 1e6])('is independent of model size %s', scale => {
    const v = (p: Vec3) => p.map(n => n * scale) as Vec3;
    expect(dihedralMeasurement(v(a), v(b), v([0, 1, 0]), v([2, -0.5, Math.sqrt(3) / 2])).degrees).toBeCloseTo(120);
  });

  it('rejects coincident endpoints and a side point anywhere on the axis', () => {
    expect(() => dihedralMeasurement(a, a, [0, 1, 0], [0, 0, 1])).toThrow(/公共直线.*重合/);
    expect(() => dihedralMeasurement(a, b, [12, 0, 0], [0, 0, 1])).toThrow(/公共直线.*平面/);
    expect(() => dihedralMeasurement(a, b, [0, 1, 0], [-12, 0, 0])).toThrow(/公共直线.*平面/);
  });

  it('round trips new scenes without requiring a solid edge', () => {
    const scene = createExample('cube');
    scene.constructions.push({ ...construction, points: ['A', 'C', 'B', 'A1'] });
    const roundTrip = parseScene(JSON.stringify(scene));
    const result = getDihedral(roundTrip, resolvePoints(roundTrip), roundTrip.constructions.at(-1) as typeof construction);
    expect(result.status).toBe('defined');
    if (result.status === 'defined') expect(result.degrees).toBeCloseTo(90);
  });

  it('keeps legacy face-pair files readable and measures their obtuse angle', () => {
    const scene = parseScene(JSON.stringify(createExample('prism')));
    const result = getDihedral(scene, resolvePoints(scene), scene.constructions.at(-1) as typeof construction);
    expect(result.status).toBe('defined');
    if (result.status === 'defined') expect(result.degrees).toBeCloseTo(120);
  });

  it('rejects ambiguous schemas, repeated IDs and unknown point references', () => {
    const scene = createExample('cube');
    expect(() => parseScene({ ...scene, constructions: [{ ...construction, faceA: 'bottom', faceB: 'front' }] })).toThrow();
    expect(() => parseScene({ ...scene, constructions: [{ ...construction, points: ['A', 'B', 'A', 'C'] }] })).toThrow(/重复/);
    expect(() => parseScene({ ...scene, constructions: [{ ...construction, points: ['A', 'B', 'missing', 'C'] }] })).toThrow(/不存在/);
  });

  it('can save an unavailable dependency or collinear motion state and recover', () => {
    const scene = createExample('cube');
    scene.constructions.push({ ...construction, points: ['A', 'A1', 'P', 'C'] });
    scene.constructions = scene.constructions.map(c => c.kind === 'movingPoint' ? { ...c, t: 0 } : c);
    const parsed = parseScene(JSON.stringify(scene));
    expect(getDihedral(parsed, resolvePoints(parsed), parsed.constructions.at(-1) as typeof construction).status).toBe('undefined');
    parsed.constructions = parsed.constructions.map(c => c.kind === 'movingPoint' ? { ...c, t: 0.5 } : c);
    expect(getDihedral(parsed, resolvePoints(parsed), parsed.constructions.at(-1) as typeof construction).status).toBe('defined');
    const points = resolvePoints(parsed); points.delete('P');
    expect(getDihedral(parsed, points, parsed.constructions.at(-1) as typeof construction).status).toBe('undefined');
  });
});
