import { describe, expect, it } from 'vitest';
import { parseScene } from './scene';
import { GeometryCompiler, resolvePoints } from '../geometry/engine';
import { createExample } from '../geometry/examples';
import { readFileSync } from 'node:fs';

function coneInput() {
  return {
    schema_version: 2, title: '题目点优先圆锥',
    solid: { type: 'cone', points: [
      { id: 'D', position: [0, Math.sqrt(3), 0] }, { id: 'O', position: [0, 0, 0] },
      { id: 'A', position: [1, 0, 0] }, { id: 'B', position: [-0.5, 0, Math.sqrt(3) / 2] },
      { id: 'C', position: [-0.5, 0, -Math.sqrt(3) / 2] }, { id: 'E', position: [-1, 0, 0] },
    ], primitive: { kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' } },
    constructions: [
      { kind: 'segment', a: 'P', b: 'C' },
      { kind: 'movingPoint', point: 'P', start: 'O', end: 'D', t: Math.sqrt(6) / 6 },
      { kind: 'triangle', points: ['A', 'B', 'C'] },
    ],
  };
}
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((n, i) => n - b[i]));

describe('question-first v2 scene import', () => {
  it('imports the complete JSON example copied in the current multimodal Prompt', () => {
    const prompt = readFileSync(new URL('../../prompts/multimodalToGsceneV1.txt', import.meta.url), 'utf8');
    const examples = [...prompt.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      const scene = parseScene(example[1]), points = resolvePoints(scene);
      expect(scene.schema_version).toBe(2);
      expect([...points.keys()].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'O', 'P']);
      expect(distance(points.get('A')!, points.get('D')!)).toBeCloseTo(2, 12);
      expect(distance(points.get('P')!, points.get('O')!) / distance(points.get('D')!, points.get('O')!)).toBeCloseTo(Math.sqrt(6) / 6, 12);
    }
  });

  it('uses only the explicit question IDs and derives the exact cone with no reserved letters', () => {
    const scene = parseScene(coneInput());
    expect(scene.schema_version).toBe(2);
    expect(scene.solid.points.map(p => p.id)).toEqual(['D', 'O', 'A', 'B', 'C', 'E']);
    const points = resolvePoints(scene);
    expect([...points.keys()].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'O', 'P']);
    expect(points.get('O')).toEqual([0, 0, 0]);
    expect(scene.solid.primitive?.origin).toEqual([0, Math.sqrt(3), 0]);
    expect(distance(points.get('A')!, points.get('E')!)).toBeCloseTo(2, 12);
    expect(distance(points.get('A')!, points.get('D')!)).toBeCloseTo(2, 12);
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'A']]) expect(distance(points.get(a)!, points.get(b)!)).toBeCloseTo(Math.sqrt(3), 12);
    expect(distance(points.get('P')!, points.get('O')!) / distance(points.get('D')!, points.get('O')!)).toBeCloseTo(Math.sqrt(6) / 6, 12);
    expect(scene.solid.definition).toEqual({ kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' });
  });

  it('round trips canonical v2 and accepts a single markdown JSON fence', () => {
    const first = parseScene(coneInput());
    expect(parseScene(JSON.stringify(first))).toEqual(first);
    expect(parseScene('```json\n' + JSON.stringify(coneInput()) + '\n```')).toEqual(first);
  });

  it('supports custom letters in cylinders and a numeric primitive with no named points', () => {
    const cylinder = parseScene({ schema_version: 2, solid: { points: [
      { id: 'O', position: [0, 0, 0] }, { id: 'D', position: [0, 2, 0] }, { id: 'T', position: [1, 0, 0] },
    ], primitive: { kind: 'cylinder', baseCenter: 'O', topCenter: 'D', radiusPoint: 'T' } } });
    expect([...resolvePoints(cylinder).keys()]).toEqual(['O', 'D', 'T']);
    expect(cylinder.solid.primitive?.height).toBe(2);
    const empty = parseScene({ schema_version: 2, solid: { primitive: { kind: 'cone', origin: [0, 2, 0], axis: [0, -1, 0], radius: 1, height: 2 } } });
    expect(empty.solid.points).toEqual([]); expect(resolvePoints(empty).size).toBe(0);
  });

  it('supports point and line illustrations without requiring closed polyhedron topology', () => {
    const scene = parseScene({ schema_version: 2, solid: { type: 'diagram', points: [
      { id: 'A', position: [0, 0, 0] }, { id: 'B', position: [2, 0, 0] }, { id: 'C', position: [0, 2, 0] },
    ] }, constructions: [{ kind: 'triangle', points: ['A', 'B', 'C'] }] });
    expect(scene.solid.type).toBe('diagram'); expect(resolvePoints(scene).size).toBe(3);
  });

  it('adds arbitrary explicit auxiliary points to a polyhedron and invalidates cached coordinates', () => {
    const scene = createExample('cube');
    const first = parseScene({ ...scene, schema_version: 2, constructions: [...scene.constructions,
      { kind: 'point', id: 'free-X', point: 'X', position: [3, 1, 0] },
      { kind: 'midpoint', id: 'middle', point: 'Y', a: 'A', b: 'X' },
    ] });
    const compiler = new GeometryCompiler();
    expect(compiler.resolve(first).get('Y')).toEqual([1.5, 0.5, 0]);
    const next = structuredClone(first); const point = next.constructions.find(c => c.kind === 'point')!;
    if (point.kind !== 'point') throw new Error('Expected static point'); point.position = [4, 2, 0];
    expect(compiler.resolve(next).get('Y')).toEqual([2, 1, 0]);
  });

  it('keeps valid legacy round scenes and their auto control names compatible', () => {
    const old = createExample('cone');
    expect(parseScene(JSON.stringify(old))).toEqual(old);
    expect(old.solid.points.map(p => p.id)).toEqual(['O', 'T', 'A', 'B', 'C']);
  });

  it('reports the exact duplicate ID and declaration owners rather than a generic point error', () => {
    const input = coneInput();
    input.constructions.push({ kind: 'movingPoint', point: 'A', start: 'O', end: 'D', t: 0.5 });
    expect(() => parseScene(input)).toThrow(/A.*solid\.points.*constructions/);
  });

  it('reports missing point and its construction owner, and readable cycles', () => {
    const input = coneInput(); input.constructions[0] = { kind: 'segment', a: 'MISSING', b: 'C' };
    expect(() => parseScene(input)).toThrow(/constructions\[0\].*MISSING/);
    expect(() => parseScene({ schema_version: 2, solid: { type: 'diagram', points: [{ id: 'O', position: [0, 0, 0] }] }, constructions: [
      { kind: 'movingPoint', point: 'A', start: 'O', end: 'B', t: 0.5 },
      { kind: 'movingPoint', point: 'B', start: 'O', end: 'A', t: 0.5 },
    ] })).toThrow(/循环.*A.*B.*A/);
  });

  it('preserves explicit labels and rejects unknown fields instead of silently guessing geometry', () => {
    const input = coneInput();
    Object.assign(input.solid.points[1], { label: '底面圆心 O' });
    expect(parseScene(input).solid.points[1].label).toBe('底面圆心 O');
    expect(() => parseScene({ ...input, objects: [] })).toThrow(/objects/);
  });
});
