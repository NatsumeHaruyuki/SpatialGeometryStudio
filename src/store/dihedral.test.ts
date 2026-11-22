import { describe, expect, it } from 'vitest';
import { createStudioStore, toolSelectionCount } from './studio';
import { createExample } from '../geometry/examples';
import { getDihedral } from '../geometry/dihedral';
import { resolvePoints } from '../geometry/engine';

describe('two-stage four-point dihedral selection', () => {
  it('requires four point picks and creates once, then supports undo/redo', () => {
    const store = createStudioStore();
    const before = store.getState().scene.constructions.length;
    expect(toolSelectionCount('dihedral')).toBe(4);
    store.getState().setTool('dihedral');
    for (const id of ['A', 'B', 'C']) store.getState().pick({ kind: 'point', id });
    expect(store.getState().selection.map(s => s.id)).toEqual(['A', 'B', 'C']);
    expect(store.getState().scene.constructions).toHaveLength(before);
    store.getState().pick({ kind: 'point', id: 'A1' });
    expect(store.getState().scene.constructions.at(-1)).toMatchObject({ kind: 'dihedral', points: ['A', 'B', 'C', 'A1'] });
    expect(store.getState().tool).toBe('select');
    expect(store.getState().selection).toEqual([]);
    store.getState().undo(); expect(store.getState().scene.constructions).toHaveLength(before);
    store.getState().redo(); expect(store.getState().scene.constructions).toHaveLength(before + 1);
  });

  it('rejects on-axis side points without discarding the common line or first plane', () => {
    const store = createStudioStore();
    store.getState().setTool('dihedral');
    for (const id of ['A', 'B', 'P']) store.getState().pick({ kind: 'point', id });
    expect(store.getState().selection.map(s => s.id)).toEqual(['A', 'B']);
    expect(store.getState().notice?.text).toMatch(/公共直线.*平面/);
    store.getState().pick({ kind: 'point', id: 'C' });
    store.getState().pick({ kind: 'point', id: 'P' });
    expect(store.getState().selection.map(s => s.id)).toEqual(['A', 'B', 'C']);
    store.getState().pick({ kind: 'point', id: 'A1' });
    expect(store.getState().scene.constructions.at(-1)?.kind).toBe('dihedral');
  });

  it('rejects a distinct but coincident endpoint before advancing to plane selection', () => {
    const store = createStudioStore();
    store.getState().changeMotion('motion-P', 0);
    store.getState().setTool('dihedral');
    store.getState().pick({ kind: 'point', id: 'A' });
    store.getState().pick({ kind: 'point', id: 'P' });
    expect(store.getState().selection.map(s => s.id)).toEqual(['A']);
    expect(store.getState().notice?.text).toMatch(/公共直线.*重合/);
  });

  it('rewinds following picks when a selected endpoint is deselected and cancels cleanly', () => {
    const store = createStudioStore(); store.getState().setTool('dihedral');
    for (const id of ['A', 'B', 'C', 'B']) store.getState().pick({ kind: 'point', id });
    expect(store.getState().selection.map(s => s.id)).toEqual(['A']);
    store.getState().setTool('select'); expect(store.getState().selection).toEqual([]);
  });

  it('uses derived points and removes the angle when an upstream point is removed', () => {
    const store = createStudioStore();
    expect(store.getState().construct('dihedral', ['A', 'C', 'M', 'A1'])).toBe(true);
    const angleId = store.getState().scene.constructions.at(-1)!.id;
    store.getState().removeConstruction('mid-M');
    expect(store.getState().scene.constructions.some(c => c.id === angleId)).toBe(false);
    store.getState().undo();
    expect(store.getState().scene.constructions.some(c => c.id === angleId)).toBe(true);
  });

  it('rejects invalid direct construction but permits later temporary motion degeneracy', () => {
    const store = createStudioStore();
    expect(store.getState().construct('dihedral', ['A', 'B', 'P', 'C'])).toBe(false);
    expect(store.getState().construct('dihedral', ['A', 'A1', 'P', 'C'])).toBe(true);
    expect(store.getState().changeMotion('motion-P', 0)).toBe(true);
    const scene = store.getState().scene, c = scene.constructions.at(-1)!;
    if (c.kind !== 'dihedral') throw new Error('Expected angle');
    expect(getDihedral(scene, resolvePoints(scene), c).status).toBe('undefined');
    expect(store.getState().changeMotion('motion-P', 0.5)).toBe(true);
    expect(getDihedral(store.getState().scene, resolvePoints(store.getState().scene), c).status).toBe('defined');
  });

  it('accepts point-defined planes on a round model and ignores face picks', () => {
    const store = createStudioStore(); store.getState().loadScene(createExample('cylinder'));
    store.getState().setTool('dihedral'); expect(store.getState().tool).toBe('dihedral');
    store.getState().pick({ kind: 'face', id: 'irrelevant' });
    expect(store.getState().selection).toEqual([]);
    store.getState().pick({ kind: 'section', id: 'irrelevant' });
    expect(store.getState().selection).toEqual([]);
  });
});
