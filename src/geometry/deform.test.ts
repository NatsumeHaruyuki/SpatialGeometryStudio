import { describe, expect, it } from 'vitest';
import { parseScene, type Scene, type Solid, type Vec3 } from '../schema/scene';
import { deformSolid } from './deform';
import { createExample } from './examples';

function positions(solid: Solid) {
  return Object.fromEntries(solid.points.map(point => [point.id, point.position]));
}

function squarePyramid(): Scene {
  const scene = createExample('cube');
  const points: Record<string, Vec3> = { A: [0, 0, 0], B: [2, 0, 0], C: [2, 2, 2], D: [0, 2, 2], T: [1, 3, -1] };
  const loops = [['A', 'B', 'C', 'D'], ['A', 'T', 'B'], ['B', 'T', 'C'], ['C', 'T', 'D'], ['D', 'T', 'A']];
  return {
    ...scene,
    constructions: [],
    solid: {
      id: 'pyramid', type: '四棱锥',
      points: Object.entries(points).map(([id, position]) => ({ id, label: id, position })),
      edges: ['AB', 'BC', 'CD', 'DA', 'AT', 'BT', 'CT', 'DT'].map(id => ({ id, start: id[0], end: id[1] })),
      faces: loops.map(vertices => ({ id: vertices.join(''), label: vertices.join(''), vertices })),
    },
  };
}

describe('deformSolid', () => {
  it('translates the whole upper face of a cube and preserves its topology and constructions', () => {
    const scene = createExample('cube');
    // List the vertical pairs first to verify that the bases are chosen by their Y separation.
    const [bottom, top, ...sides] = scene.solid.faces;
    scene.solid.faces = [...sides, bottom, top];
    const original = structuredClone(positions(scene.solid));
    const solid = deformSolid(scene.solid, 'A1', [0.5, 3, -0.25]);

    expect(solid).not.toBe(scene.solid);
    expect(positions(solid)).toEqual({
      ...original, A1: [0.5, 3, -0.25], B1: [2.5, 3, -0.25], C1: [2.5, 3, -2.25], D1: [0.5, 3, -2.25],
    });
    expect(solid).toMatchObject({ id: scene.solid.id, type: scene.solid.type, edges: scene.solid.edges, faces: scene.solid.faces });
    expect(solid.points.map(({ id, label }) => [id, label])).toEqual(scene.solid.points.map(({ id, label }) => [id, label]));
    expect(positions(scene.solid)).toEqual(original);
    expect(parseScene({ ...scene, solid }).constructions).toEqual(scene.constructions);
  });

  it('projects a cube base drag onto the lower plane and moves its upper partner only', () => {
    const scene = createExample('cube');
    const solid = deformSolid(scene.solid, 'A', [-0.25, 5, 0.5]);

    expect(positions(solid)).toEqual({ ...positions(scene.solid), A: [-0.25, 0, 0.5], A1: [-0.25, 2, 0.5] });
    expect(() => parseScene({ ...scene, solid })).not.toThrow();
  });

  it('uses the cross edge of an oblique triangular prism and keeps the side faces planar', () => {
    const scene = createExample('prism');
    const r = Math.sqrt(3) / 4;
    const solid = deformSolid(scene.solid, 'B', [-0.5, 3, -0.125]);

    expect(positions(solid)).toEqual({ ...positions(scene.solid), B: [-0.5, 0, -0.125], B1: [-0.5, 2 * r, -0.625] });
    expect(() => parseScene({ ...scene, solid })).not.toThrow();
  });

  it('projects a quadrangular pyramid base drag onto its tilted base plane', () => {
    const scene = squarePyramid();
    const solid = deformSolid(scene.solid, 'A', [-0.25, 0.75, -1.25]);
    const actual = positions(solid);

    expect(actual.A).toHaveLength(3);
    expect(actual.A[0]).toBeCloseTo(-0.25);
    expect(actual.A[1]).toBeCloseTo(-0.25);
    expect(actual.A[2]).toBeCloseTo(-0.25);
    expect({ ...actual, A: [0, 0, 0] }).toEqual(positions(scene.solid));
    expect(() => parseScene({ ...scene, solid })).not.toThrow();
  });

  it('moves a quadrangular pyramid apex freely', () => {
    const scene = squarePyramid();
    const solid = deformSolid(scene.solid, 'T', [1.5, 3.5, -0.5]);

    expect(positions(solid)).toEqual({ ...positions(scene.solid), T: [1.5, 3.5, -0.5] });
    expect(() => parseScene({ ...scene, solid })).not.toThrow();
  });

  it('moves any tetrahedron vertex freely', () => {
    const scene = createExample('tetrahedron');
    const solid = deformSolid(scene.solid, 'B', [-1.25, 0.25, -0.25]);

    expect(positions(solid)).toEqual({ ...positions(scene.solid), B: [-1.25, 0.25, -0.25] });
    expect(() => parseScene({ ...scene, solid })).not.toThrow();
  });

  it('moves only the requested point on other polyhedra and leaves geometric validation to parseScene', () => {
    const scene = createExample('motion');
    const solid = deformSolid(scene.solid, 'C', [2, 0.25, 0]);

    expect(positions(solid)).toEqual({ ...positions(scene.solid), C: [2, 0.25, 0] });
    expect(() => parseScene({ ...scene, solid })).toThrow(/共面/);
  });

  it('rejects unknown vertices and construction points', () => {
    const { solid } = createExample('cube');

    expect(() => deformSolid(solid, 'missing', [0, 0, 0])).toThrow(/missing.*不存在/);
    expect(() => deformSolid(solid, 'M', [0, 0, 0])).toThrow(/M.*不存在/);
  });

  it('rejects nonfinite coordinates', () => {
    const { solid } = createExample('cube');

    expect(() => deformSolid(solid, 'A', [0, Number.NaN, 0])).toThrow(/有限/);
    expect(() => deformSolid(solid, 'A1', [0, 2, Number.POSITIVE_INFINITY])).toThrow(/有限/);
  });

  it('rejects a prism axis collapsed into its base plane', () => {
    const { solid } = createExample('cube');

    expect(() => deformSolid(solid, 'A1', [0.25, 0, -0.25])).toThrow(/退化/);
  });

  it('rejects coincident vertices after projection', () => {
    const { solid } = createExample('cube');

    expect(() => deformSolid(solid, 'A', [2, 5, 0])).toThrow(/重合/);
  });
});
