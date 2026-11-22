import { describe, expect, it } from 'vitest';
import { createExample } from './examples';
import { getSection, resolvePoints } from './engine';
import { parseScene } from '../schema/scene';

describe('teaching scene integration', () => {
  it('translates a free section and preserves an empty plane outside the cube', () => {
    const scene = createExample('cube');
    const points = resolvePoints(scene);
    const cut = { id: 'cut', kind: 'planeSection' as const, origin: [0, 1, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number], offset: 0 };
    const middle = getSection(scene, points, cut);
    expect(middle.area).toBeCloseTo(4);
    expect(middle.polygon).toHaveLength(4);
    const outside = getSection(scene, points, { ...cut, offset: 2 });
    expect(outside.status).toBe('defined');
    expect(outside.polygon).toHaveLength(0);
    if (outside.status !== 'defined') throw new Error('Expected defined empty plane');
    expect(outside.origin).toEqual([0, 3, 0]);
  });

  it('stores a shifted dependent section without moving its defining points', () => {
    const scene = createExample('cube');
    const cut = scene.constructions.find(c => c.kind === 'section')!;
    if (cut.kind !== 'section') throw new Error('Expected section');
    cut.offset = 0.25;
    const valid = parseScene(JSON.stringify(scene));
    const result = getSection(valid, resolvePoints(valid), valid.constructions.find(c => c.kind === 'section')!);
    expect(result.status).toBe('defined');
    expect(resolvePoints(valid).get('P')).toEqual([1, 0, 0]);
    expect((valid.constructions.find(c => c.kind === 'section') as typeof cut).offset).toBe(0.25);
  });

  it.each(['quadPyramid', 'cylinder', 'cone', 'doubleCone'] as const)('round trips the %s teaching preset', id => {
    const scene = createExample(id);
    expect(scene.id).toBe(id);
    if (id === 'quadPyramid') { expect(scene.solid.points).toHaveLength(5); expect(scene.solid.faces).toHaveLength(5); }
    else { expect(scene.solid.primitive?.kind).toBe(id); expect(scene.solid.faces).toHaveLength(0); }
    expect(parseScene(JSON.stringify(scene))).toEqual(scene);
  });

  it('classifies the double cone initial cut as hyperbola, with separated branches', () => {
    const scene = createExample('doubleCone');
    const cut = scene.constructions.find(c => c.kind === 'planeSection')!;
    const result = getSection(scene, resolvePoints(scene), cut);
    expect(result.kind).toBe('双曲线');
    expect(result.curves.length).toBeGreaterThanOrEqual(2);
  });
});
