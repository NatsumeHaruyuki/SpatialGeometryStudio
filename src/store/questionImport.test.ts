import { describe, expect, it } from 'vitest';
import { createStudioStore } from './studio';
import { parseScene } from '../schema/scene';
import { createQuestionConeInput } from '../geometry/questionExamples';
import { resolvePoints } from '../geometry/engine';

describe('editing explicit question imports', () => {
  it('preserves question IDs, reference bindings and equilateral geometry through a radius edit and undo', () => {
    const store = createStudioStore(); store.getState().loadScene(parseScene(createQuestionConeInput()));
    const before = store.getState().scene;
    expect(store.getState().updatePoint('A', [2, 0, 0])).toBe(true);
    const after = store.getState().scene;
    expect(after.schema_version).toBe(2);
    expect(after.solid.points.map(p => p.id)).toEqual(before.solid.points.map(p => p.id));
    expect(after.solid.primitive?.radius).toBeCloseTo(2, 12);
    expect(after.solid.definition).toEqual(before.solid.definition);
    const points = resolvePoints(after);
    expect(points.get('O')).toEqual([0, 0, 0]);
    expect(points.get('B')![0]).toBeCloseTo(-1, 12);
    expect(Math.abs(points.get('B')![2])).toBeCloseTo(Math.sqrt(3), 12);
    expect(parseScene(JSON.stringify(after))).toEqual(after);
    store.getState().undo(); expect(store.getState().scene.solid).toEqual(before.solid);
    store.getState().redo(); expect(store.getState().scene.solid.primitive?.radius).toBeCloseTo(2, 12);
  });

  it('keeps the exact cone definition and question points through a moving point update', () => {
    const store = createStudioStore(); store.getState().loadScene(parseScene(createQuestionConeInput()));
    const before = store.getState().scene;
    const motion = before.constructions.find(c => c.kind === 'movingPoint')!;
    expect(store.getState().changeMotion(motion.id, 0.25)).toBe(true);
    const after = store.getState().scene;
    expect(after.solid.points).toEqual(before.solid.points);
    expect(after.solid.primitive).toEqual(before.solid.primitive);
    expect(resolvePoints(after).get('P')![1]).toBeCloseTo(Math.sqrt(3) / 4, 12);
  });

  it('edits a standalone declared point without treating it as a generated handle', () => {
    const store = createStudioStore();
    store.getState().loadScene(parseScene({ schema_version: 2, solid: { type: 'diagram', points: [{ id: 'O', position: [0, 0, 0] }] }, constructions: [
      { kind: 'point', point: 'A', position: [2, 0, 0] }, { kind: 'midpoint', point: 'M', a: 'O', b: 'A' },
    ] }));
    expect(store.getState().updatePoint('A', [4, 2, 0])).toBe(true);
    expect(resolvePoints(store.getState().scene).get('M')).toEqual([2, 1, 0]);
    expect(store.getState().updatePoint('O', [0, 1, 0])).toBe(true);
    expect(resolvePoints(store.getState().scene).get('M')).toEqual([2, 1.5, 0]);
  });
});
