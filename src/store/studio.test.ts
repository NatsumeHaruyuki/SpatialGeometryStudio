import { describe, expect, it } from 'vitest';
import { createStudioStore } from './studio';
import { resolvePoints } from '../geometry/engine';

describe('geometry editing history', () => {
  it('constructs a real midpoint and restores it through undo / redo', () => {
    const store = createStudioStore();
    store.getState().construct('midpoint', ['A', 'B']);
    const scene = store.getState().scene;
    const midpoint = scene.constructions.at(-1)!;
    expect(midpoint.kind).toBe('midpoint');
    if (midpoint.kind !== 'midpoint') throw new Error('Expected midpoint');
    expect(resolvePoints(scene).get(midpoint.point)).toEqual([1, 0, 0]);
    store.getState().undo();
    expect(store.getState().scene.constructions).toHaveLength(4);
    store.getState().redo();
    expect(store.getState().scene.constructions).toHaveLength(5);
  });

  it('rejects invalid sections without corrupting the working scene', () => {
    const store = createStudioStore();
    const old = store.getState().scene;
    expect(store.getState().construct('section', ['A', 'B', 'P'])).toBe(false);
    expect(store.getState().scene).toBe(old);
    expect(store.getState().notice?.text).toMatch(/共线/);
  });

  it('removes dependent sections when a parent midpoint is deleted', () => {
    const store = createStudioStore();
    store.getState().removeConstruction('mid-M');
    const scene = store.getState().scene;
    expect(scene.constructions.map(c => c.id)).not.toContain('section-MNP');
    expect(resolvePoints(scene).has('M')).toBe(false);
    expect(resolvePoints(scene).has('N')).toBe(true);
  });

  it('clears redo history after a new branch of editing', () => {
    const store = createStudioStore();
    store.getState().construct('segment', ['A', 'C']);
    store.getState().undo();
    store.getState().construct('segment', ['B', 'D']);
    expect(store.getState().future).toHaveLength(0);
  });

  it('keeps static geometry stable while advancing motion', () => {
    const store = createStudioStore();
    const solid = store.getState().scene.solid;
    store.getState().changeMotion('motion-P', 0.8, false);
    expect(store.getState().scene.solid).toBe(solid);
    expect(resolvePoints(store.getState().scene).get('P')).toEqual([1.6, 0, 0]);
  });

  it('allows a moving endpoint to make a dependent plane temporarily undefined', () => {
    const store = createStudioStore();
    expect(store.getState().construct('section', ['A', 'P', 'C1'])).toBe(true);
    expect(store.getState().changeMotion('motion-P', 0)).toBe(true);
    expect(resolvePoints(store.getState().scene).get('P')).toEqual([0, 0, 0]);
    expect(store.getState().changeMotion('motion-P', 0.5)).toBe(true);
  });

  it('marks pasted JSON as unsaved until it is written to a file', () => {
    const store = createStudioStore();
    store.getState().loadScene(store.getState().scene, undefined, true);
    expect(store.getState().dirty).toBe(true);
  });

  it('protects a camera-only edit with unsaved state', () => {
    const store = createStudioStore();
    store.getState().changeView({ position: [6, 5, 6], target: [1, 0.95, -1] });
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().scene.view.position).toEqual([6, 5, 6]);
  });

  it('allows three independently moving section points to coincide and recover', () => {
    const store = createStudioStore();
    store.getState().construct('movingPoint', ['A', 'B']);
    store.getState().construct('movingPoint', ['A', 'A1']);
    store.getState().construct('movingPoint', ['A', 'B']);
    const ids = new Map(store.getState().scene.constructions.flatMap(c => c.kind === 'movingPoint' ? [[c.point, c.id] as const] : []));
    store.getState().changeMotion(ids.get('Q')!, 0.25);
    store.getState().changeMotion(ids.get('S')!, 0.75);
    expect(store.getState().construct('section', ['Q', 'R', 'S'])).toBe(true);
    expect(store.getState().changeMotion(ids.get('Q')!, 0)).toBe(true);
    expect(store.getState().changeMotion(ids.get('S')!, 0)).toBe(true);
    expect(store.getState().changeMotion(ids.get('R')!, 0)).toBe(true);
    expect(store.getState().changeMotion(ids.get('Q')!, 0.25)).toBe(true);
    expect(store.getState().changeMotion(ids.get('R')!, 0.5)).toBe(true);
    expect(store.getState().changeMotion(ids.get('S')!, 0.75)).toBe(true);
  });
});
