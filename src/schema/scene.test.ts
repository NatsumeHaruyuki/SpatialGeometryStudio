import { describe, expect, it } from 'vitest';
import { parseScene } from './scene';
import { createExample, exampleIds } from '../geometry/examples';

describe('portable scene validation', () => {
  it.each(exampleIds)('round trips the %s example without absolute paths', id => {
    const scene = createExample(id);
    expect(parseScene(JSON.stringify(scene))).toEqual(scene);
  });

  it('rejects unsupported schema versions', () => {
    expect(() => parseScene({ ...createExample('cube'), schema_version: 999 })).toThrow(/版本|schema_version/);
  });

  it('rejects duplicate point IDs', () => {
    const scene = createExample('cube');
    scene.solid.points[1].id = 'A';
    expect(() => parseScene(scene)).toThrow(/重复/);
  });

  it('rejects dangling edge references', () => {
    const scene = createExample('cube');
    scene.solid.edges[0].start = 'missing';
    expect(() => parseScene(scene)).toThrow(/不存在/);
  });

  it('rejects cyclic imported constructions before rendering', () => {
    const scene = createExample('cube');
    scene.constructions = [
      { id: 'm', kind: 'midpoint', point: 'M', label: 'M', a: 'A', b: 'N' },
      { id: 'n', kind: 'midpoint', point: 'N', label: 'N', a: 'B', b: 'M' },
    ];
    expect(() => parseScene(scene)).toThrow(/依赖|循环/);
  });

  it('rejects nonfinite positions and out-of-range motion', () => {
    const scene = createExample('cube');
    scene.solid.points[0].position[0] = Infinity;
    expect(() => parseScene(scene)).toThrow();
    const other = createExample('cube');
    other.constructions.push({ id: 'bad', kind: 'movingPoint', point: 'X', label: 'X', start: 'A', end: 'B', t: 3 });
    expect(() => parseScene(other)).toThrow();
  });

  it('rejects collinear section points', () => {
    const scene = createExample('cube');
    scene.constructions.push({ id: 'badPlane', kind: 'section', points: ['A', 'B', 'P'] });
    expect(() => parseScene(scene)).toThrow(/共线/);
  });

  it('rejects non-planar solid faces', () => {
    const scene = createExample('cube');
    scene.solid.points[0].position[1] = 0.1;
    expect(() => parseScene(scene)).toThrow(/共面|平面/);
  });

  it('rejects degenerate camera coordinates', () => {
    const scene = createExample('cube');
    scene.view.position = scene.view.target;
    expect(() => parseScene(scene)).toThrow(/视角/);
  });

  it('rejects disconnected double-sided plates masquerading as a solid', () => {
    const scene = createExample('cube');
    scene.constructions = [];
    scene.solid.points = [
      { id: 'A', label: 'A', position: [0, 0, 0] }, { id: 'B', label: 'B', position: [2, 0, 0] }, { id: 'C', label: 'C', position: [0, 2, 0] },
      { id: 'D', label: 'D', position: [0, 0, 1] }, { id: 'E', label: 'E', position: [2, 0, 1] }, { id: 'F', label: 'F', position: [0, 2, 1] },
    ];
    scene.solid.edges = [['A', 'B'], ['B', 'C'], ['C', 'A'], ['D', 'E'], ['E', 'F'], ['F', 'D']].map(([start, end]) => ({ id: `${start}${end}`, start, end }));
    scene.solid.faces = [
      { id: 'front', label: 'ABC', vertices: ['A', 'B', 'C'] }, { id: 'frontCopy', label: 'ACB', vertices: ['A', 'C', 'B'] },
      { id: 'back', label: 'DEF', vertices: ['D', 'E', 'F'] }, { id: 'backCopy', label: 'DFE', vertices: ['D', 'F', 'E'] },
    ];
    expect(() => parseScene(scene)).toThrow(/重复|连通|闭合/);
  });

  it('can reopen a dynamic section at a temporarily coincident endpoint', () => {
    const scene = createExample('cube');
    scene.constructions.push({ id: 'dynamic', kind: 'section', points: ['A', 'P', 'C1'] });
    const motion = scene.constructions.find(c => c.kind === 'movingPoint')!;
    if (motion.kind === 'movingPoint') motion.t = 0;
    expect(parseScene(JSON.stringify(scene)).constructions).toHaveLength(5);
  });
});
