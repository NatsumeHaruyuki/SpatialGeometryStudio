import { describe, expect, it } from 'vitest';
import { sectionPolygon, polygonArea, dihedralAngle, resolvePoints } from './engine';
import { createExample } from './examples';

describe('convex solid plane sections', () => {
  it('cuts a side-two cube halfway into a square of area four', () => {
    const scene = createExample('cube');
    const polygon = sectionPolygon(scene.solid, resolvePoints(scene), [0, 1, 0], [0, 1, 0]);
    expect(polygon).toHaveLength(4);
    expect(polygon.every(p => Math.abs(p[1] - 1) < 1e-8)).toBe(true);
    expect(polygonArea(polygon)).toBeCloseTo(4);
  });

  it('deduplicates edges lying in a cube face', () => {
    const scene = createExample('cube');
    const polygon = sectionPolygon(scene.solid, resolvePoints(scene), [0, 0, 0], [0, 1, 0]);
    expect(polygon).toHaveLength(4);
    expect(polygonArea(polygon)).toBeCloseTo(4);
  });

  it('finds the triangular section x+y-z=1', () => {
    const scene = createExample('cube');
    const polygon = sectionPolygon(scene.solid, resolvePoints(scene), [1, 0, 0], [1, 1, -1]);
    expect(polygon).toHaveLength(3);
    expect(polygonArea(polygon)).toBeCloseTo(Math.sqrt(3) / 2);
  });

  it('finds a six-sided middle section', () => {
    const scene = createExample('cube');
    const polygon = sectionPolygon(scene.solid, resolvePoints(scene), [1, 1, -1], [1, 1, -1]);
    expect(polygon).toHaveLength(6);
    expect(polygonArea(polygon)).toBeCloseTo(3 * Math.sqrt(3));
  });

  it('returns no polygon for a plane outside the solid', () => {
    const scene = createExample('cube');
    expect(sectionPolygon(scene.solid, resolvePoints(scene), [0, 4, 0], [0, 1, 0])).toEqual([]);
  });

  it('returns a single tangent vertex without inventing a face', () => {
    const scene = createExample('cube');
    expect(sectionPolygon(scene.solid, resolvePoints(scene), [0, 0, 0], [1, 1, -1])).toHaveLength(1);
  });

  it('rejects a zero normal instead of displaying a fake section', () => {
    const scene = createExample('cube');
    expect(() => sectionPolygon(scene.solid, resolvePoints(scene), [0, 0, 0], [0, 0, 0])).toThrow();
  });
});

describe('dependent constructions', () => {
  it('updates a midpoint depending on a moving point', () => {
    const scene = createExample('cube');
    scene.constructions = [
      { id: 'motion', kind: 'movingPoint', point: 'P', label: 'P', start: 'A', end: 'B', t: 0.25 },
      { id: 'mid', kind: 'midpoint', point: 'M', label: 'M', a: 'A', b: 'P' },
    ];
    expect(resolvePoints(scene).get('M')).toEqual([0.25, 0, 0]);
    const motion = scene.constructions[0];
    if (motion.kind !== 'movingPoint') throw new Error('Expected motion');
    motion.t = 1;
    expect(resolvePoints(scene).get('M')).toEqual([1, 0, 0]);
  });

  it('supports forward references in a dependency graph', () => {
    const scene = createExample('cube');
    scene.constructions = [
      { id: 'm', kind: 'midpoint', point: 'M', label: 'M', a: 'A', b: 'N' },
      { id: 'n', kind: 'midpoint', point: 'N', label: 'N', a: 'A', b: 'B' },
    ];
    expect(resolvePoints(scene).get('M')).toEqual([0.5, 0, 0]);
  });

  it('rejects cyclic dependencies', () => {
    const scene = createExample('cube');
    scene.constructions = [
      { id: 'm', kind: 'midpoint', point: 'M', label: 'M', a: 'A', b: 'N' },
      { id: 'n', kind: 'midpoint', point: 'N', label: 'N', a: 'A', b: 'M' },
    ];
    expect(() => resolvePoints(scene)).toThrow(/依赖|循环/);
  });
});

describe('dihedral angle with half-plane rays', () => {
  it('measures adjacent cube faces as 90 degrees', () => {
    const scene = createExample('cube');
    const result = dihedralAngle(scene.solid, resolvePoints(scene), 'bottom', 'front');
    expect(result.degrees).toBeCloseTo(90);
    expect(result.exterior).toBeCloseTo(90);
    expect(result.edge).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('measures the regular tetrahedron internal angle, not the normal angle', () => {
    const scene = createExample('tetrahedron');
    scene.solid.points = [
      { id: 'A', label: 'A', position: [1, 1, 1] },
      { id: 'B', label: 'B', position: [1, -1, -1] },
      { id: 'C', label: 'C', position: [-1, 1, -1] },
      { id: 'D', label: 'D', position: [-1, -1, 1] },
    ];
    const result = dihedralAngle(scene.solid, resolvePoints({ ...scene, constructions: [] }), 'BCD', 'ABD');
    expect(result.degrees).toBeCloseTo(70.528779, 5);
    expect(result.exterior).toBeCloseTo(109.471221, 5);
  });

  it('rejects faces without a shared edge', () => {
    const scene = createExample('cube');
    expect(() => dihedralAngle(scene.solid, resolvePoints(scene), 'bottom', 'top')).toThrow(/公共棱/);
  });

  it('uses inward half-plane rays to preserve an obtuse 120 degree angle', () => {
    const scene = createExample('prism');
    const result = dihedralAngle(scene.solid, resolvePoints({ ...scene, constructions: [] }), 'base', 'sideBC');
    expect(result.degrees).toBeCloseTo(120);
    expect(result.exterior).toBeCloseTo(60);
  });
});
