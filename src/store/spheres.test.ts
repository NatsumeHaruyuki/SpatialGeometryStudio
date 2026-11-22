import { describe, expect, it } from 'vitest';
import { createStudioStore } from './studio';
import { parseScene } from '../schema/scene';
import { getSphere, resolvePoints } from '../geometry/engine';
import type { Scene } from '../schema/scene';

const lastSphere = (scene: Scene) => scene.constructions.findLast(c => c.kind === 'circumsphere' || c.kind === 'insphere')!;

describe('four-point sphere editing', () => {
  it('waits for four points and creates a sphere with undo and redo', () => {
    const store = createStudioStore();
    store.getState().setTool('circumsphere');
    for (const id of ['A', 'B', 'D']) store.getState().pick({ kind: 'point', id });
    expect(store.getState().scene.constructions).toHaveLength(4);
    store.getState().pick({ kind: 'point', id: 'A1' });
    const sphere = store.getState().scene.constructions.at(-1)!;
    expect(sphere.kind).toBe('circumsphere');
    expect(store.getState().tool).toBe('select');
    if (sphere.kind !== 'circumsphere') throw new Error('Expected circumsphere');
    const result = getSphere(resolvePoints(store.getState().scene), sphere);
    expect(result.status).toBe('defined');
    if (result.status !== 'defined') throw new Error('Expected defined sphere');
    result.center.forEach((value, index) => expect(value).toBeCloseTo([1, 1, -1][index], 10));
    expect(result.radius).toBeCloseTo(Math.sqrt(3));
    store.getState().undo(); expect(store.getState().scene.constructions).toHaveLength(4);
    store.getState().redo(); expect(store.getState().scene.constructions).toHaveLength(5);
  });

  it('rejects an initially coplanar selection without changing the scene', () => {
    const store = createStudioStore(); const before = store.getState().scene;
    expect(store.getState().construct('insphere', ['A', 'B', 'C', 'D'])).toBe(false);
    expect(store.getState().scene).toBe(before);
    expect(store.getState().notice?.text).toMatch(/共面|四面体/);
  });

  it('updates the insphere when an original point changes and round trips its definition', () => {
    const store = createStudioStore();
    store.getState().construct('insphere', ['A', 'B', 'D', 'A1']);
    const before = getSphere(resolvePoints(store.getState().scene), lastSphere(store.getState().scene));
    expect(store.getState().updatePoint('A1', [0, 3, 0])).toBe(true);
    const scene = parseScene(JSON.stringify(store.getState().scene));
    const after = getSphere(resolvePoints(scene), lastSphere(scene));
    expect(before.status).toBe('defined'); expect(after.status).toBe('defined');
    if (before.status === 'defined' && after.status === 'defined') expect(after.radius).not.toBeCloseTo(before.radius);
  });

  it('allows motion to reach a degenerate endpoint and recovers afterwards', () => {
    const store = createStudioStore();
    expect(store.getState().construct('circumsphere', ['A', 'P', 'D', 'A1'])).toBe(true);
    expect(store.getState().changeMotion('motion-P', 0)).toBe(true);
    const scene = parseScene(JSON.stringify(store.getState().scene));
    expect(getSphere(resolvePoints(scene), lastSphere(scene)).status).toBe('undefined');
    expect(store.getState().changeMotion('motion-P', 0.5)).toBe(true);
    expect(getSphere(resolvePoints(store.getState().scene), lastSphere(store.getState().scene)).status).toBe('defined');
  });

  it('deletes a sphere when its dependent point is removed', () => {
    const store = createStudioStore();
    store.getState().construct('midpoint', ['A1', 'B1']);
    const midpoint = store.getState().scene.constructions.at(-1)!;
    if (midpoint.kind !== 'midpoint') throw new Error('Expected midpoint');
    expect(store.getState().construct('insphere', ['A', 'B', 'D', midpoint.point])).toBe(true);
    store.getState().removeConstruction(midpoint.id);
    expect(store.getState().scene.constructions.some(c => c.kind === 'insphere')).toBe(false);
  });

  it('rejects duplicated and dangling sphere point references', () => {
    const scene = createStudioStore().getState().scene;
    scene.constructions.push({ id: 'sphere', kind: 'circumsphere', points: ['A', 'B', 'D', 'missing'] });
    expect(() => parseScene(scene)).toThrow(/不存在/);
    scene.constructions[scene.constructions.length - 1] = { id: 'sphere', kind: 'insphere', points: ['A', 'B', 'D', 'A'] };
    expect(() => parseScene(scene)).toThrow(/重复|不同/);
  });
});
