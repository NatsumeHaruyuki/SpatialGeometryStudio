import { describe, expect, it } from 'vitest';
import { createStudioStore } from './studio';
import { parseScene, type Scene } from '../schema/scene';
import { resolvePoints } from '../geometry/engine';

function insphere(scene: Scene) {
  const c = scene.constructions.find(c => c.kind === 'insphere');
  if (!c || c.kind !== 'insphere' || !c.centerPoint) throw new Error('Expected named insphere center');
  return c;
}

describe('study tools with derived point dependencies', () => {
  it('rejects an on-line fractional source while retaining its valid zero point-plane distance', () => {
    const store = createStudioStore();
    store.getState().construct('movingPoint', ['B', 'D']);
    const moving = store.getState().scene.constructions.at(-1)!;
    if (moving.kind !== 'movingPoint') throw new Error('Expected motion');
    store.getState().changeMotion(moving.id, 0.3);
    expect(store.getState().construct('perpendicular', [moving.point, 'B', 'D'])).toBe(false);
    expect(store.getState().construct('pointPlaneDistance', [moving.point, 'B', 'D', 'A1'])).toBe(true);
    const foot = store.getState().scene.constructions.at(-1)!;
    if (foot.kind !== 'pointPlaneDistance') throw new Error('Expected distance');
    expect(resolvePoints(store.getState().scene).get(foot.point)).toEqual(resolvePoints(store.getState().scene).get(moving.point));
  });

  it('permits a source point to be reused once in the plane definition through staged selection', () => {
    const store = createStudioStore();
    store.getState().setTool('pointPlaneDistance');
    for (const id of ['A', 'A', 'B', 'D']) store.getState().pick({ kind: 'point', id });
    const c = store.getState().scene.constructions.at(-1)!;
    expect(c.kind).toBe('pointPlaneDistance');
    if (c.kind !== 'pointPlaneDistance') throw new Error('Expected zero distance');
    expect(c.from).toBe('A'); expect(c.plane).toEqual(['A', 'B', 'D']);
    expect(resolvePoints(store.getState().scene).get(c.point)).toEqual([0, 0, 0]);
    expect(store.getState().tool).toBe('select');
  });

  it('allows a derived moving path to coalesce and reopen without blocking its source motion', () => {
    const store = createStudioStore();
    expect(store.getState().construct('perpendicular', ['P', 'D', 'C'])).toBe(true);
    const foot = store.getState().scene.constructions.at(-1)!;
    if (foot.kind !== 'perpendicular') throw new Error('Expected perpendicular');
    expect(store.getState().construct('movingPoint', [foot.point, 'D'])).toBe(true);
    const moving = store.getState().scene.constructions.at(-1)!;
    if (moving.kind !== 'movingPoint') throw new Error('Expected moving point');
    expect(store.getState().changeMotion('motion-P', 0)).toBe(true);
    const collapsed = parseScene(JSON.stringify(store.getState().scene));
    expect(resolvePoints(collapsed).get(moving.point)).toEqual([0, 0, -2]);
    expect(store.getState().changeMotion('motion-P', 0.5)).toBe(true);
    expect(resolvePoints(store.getState().scene).get(moving.point)).toEqual([0.5, 0, -2]);
    store.getState().changeMotion('motion-P', 0);
    expect(store.getState().construct('movingPoint', [foot.point, 'D'])).toBe(false);
  });

  it('exposes a stable selectable sphere center and uses it to construct a perpendicular foot', () => {
    const store = createStudioStore();
    expect(store.getState().construct('insphere', ['A', 'B', 'D', 'A1'])).toBe(true);
    const c = insphere(store.getState().scene);
    const center = resolvePoints(store.getState().scene).get(c.centerPoint!);
    expect(center).toBeDefined();
    store.getState().pick({ kind: 'point', id: c.centerPoint! });
    store.getState().setTool('perpendicular');
    expect(store.getState().selection.map(s => s.id)).toEqual([c.centerPoint]);
    store.getState().pick({ kind: 'point', id: 'A' });
    expect(store.getState().tool).toBe('perpendicular');
    store.getState().pick({ kind: 'point', id: 'B' });
    const foot = store.getState().scene.constructions.at(-1)!;
    expect(foot.kind).toBe('perpendicular');
    if (foot.kind !== 'perpendicular') throw new Error('Expected perpendicular');
    const p = resolvePoints(store.getState().scene).get(foot.point)!;
    expect(p[0]).toBeCloseTo(center![0], 12);
    expect(p[1]).toBeCloseTo(0, 12); expect(p[2]).toBeCloseTo(0, 12);
    expect(store.getState().tool).toBe('select');
    expect(parseScene(JSON.stringify(store.getState().scene)).constructions).toEqual(store.getState().scene.constructions);
  });

  it('persists the exact half-square triangle independently of sections', () => {
    const store = createStudioStore(); const before = store.getState().scene.constructions.length;
    expect(store.getState().construct('triangle', ['A', 'B', 'D'])).toBe(true);
    expect(store.getState().scene.constructions.at(-1)).toMatchObject({ kind: 'triangle', points: ['A', 'B', 'D'] });
    store.getState().undo(); expect(store.getState().scene.constructions).toHaveLength(before);
    store.getState().redo(); expect(store.getState().scene.constructions).toHaveLength(before + 1);
  });

  it('constructs a vertex-second angle and a point-to-plane distance with a reusable foot', () => {
    const store = createStudioStore();
    expect(store.getState().construct('angle', ['B', 'A', 'A1'])).toBe(true);
    expect(store.getState().construct('pointPlaneDistance', ['A1', 'A', 'B', 'D'])).toBe(true);
    const distance = store.getState().scene.constructions.at(-1)!;
    expect(distance.kind).toBe('pointPlaneDistance');
    if (distance.kind !== 'pointPlaneDistance') throw new Error('Expected distance');
    expect(resolvePoints(store.getState().scene).get(distance.point)).toEqual([0, 0, 0]);
    expect(store.getState().construct('segment', [distance.point, 'B'])).toBe(true);
  });

  it('rejects initial undefined angles, triangles and perpendiculars without mutating the scene', () => {
    const store = createStudioStore(); const before = store.getState().scene;
    expect(store.getState().construct('triangle', ['A', 'B', 'P'])).toBe(false);
    expect(store.getState().construct('perpendicular', ['P', 'A', 'B'])).toBe(false);
    expect(store.getState().construct('pointPlaneDistance', ['A1', 'A', 'B', 'P'])).toBe(false);
    expect(store.getState().scene).toBe(before);
  });

  it('deletes the center and all downstream feet/angles when removing a sphere, with undo', () => {
    const store = createStudioStore();
    store.getState().construct('insphere', ['A', 'B', 'D', 'A1']);
    const sphere = insphere(store.getState().scene);
    store.getState().construct('perpendicular', [sphere.centerPoint!, 'A', 'B']);
    const foot = store.getState().scene.constructions.at(-1)!;
    if (foot.kind !== 'perpendicular') throw new Error('Expected foot');
    store.getState().construct('angle', [sphere.centerPoint!, foot.point, 'B']);
    const before = store.getState().scene.constructions.length;
    store.getState().removeConstruction(sphere.id);
    expect(store.getState().scene.constructions).toHaveLength(before - 3);
    expect(resolvePoints(store.getState().scene).has(sphere.centerPoint!)).toBe(false);
    store.getState().undo(); expect(store.getState().scene.constructions).toHaveLength(before);
  });

  it('keeps motion editable while the sphere center and its descendants are temporarily unavailable', () => {
    const store = createStudioStore();
    store.getState().construct('insphere', ['A', 'P', 'D', 'A1']);
    const sphere = insphere(store.getState().scene);
    store.getState().construct('perpendicular', [sphere.centerPoint!, 'B', 'D']);
    const foot = store.getState().scene.constructions.at(-1)!;
    if (foot.kind !== 'perpendicular') throw new Error('Expected foot');
    store.getState().construct('segment', [sphere.centerPoint!, foot.point]);
    store.getState().construct('triangle', [sphere.centerPoint!, foot.point, 'B']);
    expect(store.getState().changeMotion('motion-P', 0)).toBe(true);
    const undefinedScene = parseScene(JSON.stringify(store.getState().scene));
    expect(resolvePoints(undefinedScene).has(sphere.centerPoint!)).toBe(false);
    expect(resolvePoints(undefinedScene).has(foot.point)).toBe(false);
    expect(store.getState().changeMotion('motion-P', 0.5)).toBe(true);
    expect(resolvePoints(store.getState().scene).has(foot.point)).toBe(true);
  });

  it('normalizes old sphere files to stable names without colliding with existing points', () => {
    const scene = createStudioStore().getState().scene;
    scene.constructions.push({ id: 'sphere', kind: 'insphere', points: ['A', 'B', 'D', 'A1'] });
    const first = parseScene(scene), c = insphere(first);
    expect(resolvePoints(first).has(c.centerPoint!)).toBe(true);
    const second = parseScene(JSON.stringify(first));
    expect(insphere(second).centerPoint).toBe(c.centerPoint);
    expect(insphere(second).centerLabel).toBe(c.centerLabel);
  });

  it('rejects colliding output names, missing references and cycles in the extended graph', () => {
    const scene = createStudioStore().getState().scene;
    scene.constructions.push({ id: 'sphere', kind: 'insphere', points: ['A', 'B', 'D', 'A1'], centerPoint: 'A', centerLabel: 'O' });
    expect(() => parseScene(scene)).toThrow(/重复/);
    scene.constructions.pop();
    scene.constructions.push({ id: 'foot', kind: 'perpendicular', from: 'H', line: ['A', 'B'], point: 'H', label: 'H' });
    expect(() => parseScene(scene)).toThrow(/循环/);
    scene.constructions[scene.constructions.length - 1] = { id: 'bad', kind: 'triangle', points: ['A', 'B', 'missing'] };
    expect(() => parseScene(scene)).toThrow(/不存在/);
  });
});
