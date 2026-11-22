import { describe, expect, it } from 'vitest';
import type { Point, Solid, Vec3 } from '../schema/scene';
import { deriveQuestionPrimitive, moveQuestionPrimitive, type QuestionSolidDefinition } from './questionPrimitive';
import { roundControlPoints, roundFrame } from './roundSolids';

const root3 = Math.sqrt(3);
const coneDefinition: QuestionSolidDefinition = { kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' };
const conePoints: Point[] = [
  { id: 'D', label: '顶点 D', position: [0, root3, 0] },
  { id: 'O', label: '圆心 O', position: [0, 0, 0] },
  { id: 'A', label: '题目 A', position: [1, 0, 0] },
  { id: 'B', label: '题目 B', position: [-0.5, 0, root3 / 2] },
  { id: 'C', label: '题目 C', position: [-0.5, 0, -root3 / 2] },
  { id: 'E', label: '题目 E', position: [-1, 0, 0] },
];
const cylinderDefinition: QuestionSolidDefinition = { kind: 'cylinder', baseCenter: 'T', topCenter: 'A', radiusPoint: 'O' };
const cylinderPoints: Point[] = [
  { id: 'T', label: '下圆心 T', position: [2, 3, 4] },
  { id: 'A', label: '上圆心 A', position: [5, 7, 4] },
  { id: 'O', label: '圆周点 O', position: [2, 3, 6] },
  { id: 'Q', label: '圆周点 Q', position: [3.6, 1.8, 4] },
  { id: 'R', label: '上圆周点 R', position: [5, 7, 6] },
];

function solid(definition: QuestionSolidDefinition = coneDefinition, points = conePoints): Solid & { definition: QuestionSolidDefinition } {
  return {
    id: 'question', type: definition.kind, points: structuredClone(points), edges: [], faces: [],
    definition, primitive: deriveQuestionPrimitive(definition, points),
  };
}

function positionOf(model: Pick<Solid, 'points'>, id: string): Vec3 {
  return model.points.find(point => point.id === id)!.position;
}

function expectPosition(actual: Vec3, expected: Vec3) {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 10));
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function changedPosition(id: string, position: Vec3): Point[] {
  return conePoints.map(point => point.id === id ? { ...point, position } : point);
}

describe('question-point primitive derivation', () => {
  it('reconstructs the cone with AD = AE = 2 and an equilateral ABC from explicit points', () => {
    const points = structuredClone(conePoints);
    const primitive = deriveQuestionPrimitive(coneDefinition, points);
    expect(primitive).toEqual({
      kind: 'cone', origin: [0, root3, 0], axis: [0, -root3, 0], radial: [1, 0, 0], radius: 1, height: root3,
    });
    const controls = roundControlPoints(primitive);
    expectPosition(controls.find(point => point.id === 'O')!.position, [0, root3, 0]);
    expectPosition(controls.find(point => point.id === 'T')!.position, [0, 0, 0]);
    expectPosition(controls.find(point => point.id === 'A')!.position, [1, 0, 0]);
    expect(distance(points[0].position, points[2].position)).toBeCloseTo(2, 12);
    expect(distance(points[2].position, points[5].position)).toBeCloseTo(2, 12);
    for (const [a, b] of [[2, 3], [3, 4], [4, 2]]) {
      expect(distance(points[a].position, points[b].position)).toBeCloseTo(root3, 12);
    }
    expect(points).toEqual(conePoints);
    expect(points.map(point => point.id)).toEqual(['D', 'O', 'A', 'B', 'C', 'E']);
  });

  it('derives the same named apex frame for a double cone', () => {
    const primitive = deriveQuestionPrimitive({ ...coneDefinition, kind: 'doubleCone' }, conePoints);
    expect(primitive.kind).toBe('doubleCone');
    expectPosition(primitive.origin, [0, root3, 0]);
    expectPosition(primitive.axis, [0, -root3, 0]);
    expectPosition(roundControlPoints(primitive).find(point => point.id === 'T2')!.position, [0, 2 * root3, 0]);
  });

  it('accepts an oblique cylinder whose O, T and A names have arbitrary question roles', () => {
    const primitive = deriveQuestionPrimitive(cylinderDefinition, cylinderPoints);
    expect(primitive).toEqual({ kind: 'cylinder', origin: [2, 3, 4], axis: [3, 4, 0], radial: [0, 0, 2], radius: 2, height: 5 });
    expectPosition(roundFrame(primitive).axis, [0.6, 0.8, 0]);
    expectPosition(roundControlPoints(primitive).find(point => point.id === 'T')!.position, [5, 7, 4]);
  });

  it('requires every binding to reference one explicitly declared point', () => {
    expect(() => deriveQuestionPrimitive({ ...coneDefinition, apex: 'missingD' }, conePoints)).toThrow(/missingD.*solid\.points/);
    expect(() => deriveQuestionPrimitive({ ...coneDefinition, radiusPoint: 'T' }, conePoints)).toThrow(/T.*solid\.points/);
    expect(() => deriveQuestionPrimitive(coneDefinition, [...conePoints, conePoints[0]])).toThrow(/D.*重复/);
  });

  it.each([
    ['D', [NaN, 1, 0]], ['O', [0, Infinity, 0]], ['A', [10001, 0, 0]],
  ] as [string, Vec3][])('names an invalid binding coordinate %s', (id, position) => {
    expect(() => deriveQuestionPrimitive(coneDefinition, changedPosition(id, position))).toThrow(new RegExp(id));
  });

  it('rejects a radius point outside the plane perpendicular to the axis', () => {
    expect(() => deriveQuestionPrimitive(coneDefinition, changedPosition('A', [1, 0.1, 0]))).toThrow(/A.*底面/);
    const points = cylinderPoints.map(point => point.id === 'O' ? { ...point, position: [2, 4, 6] as Vec3 } : point);
    expect(() => deriveQuestionPrimitive(cylinderDefinition, points)).toThrow(/O.*底面/);
  });

  it('names collapsed or out-of-range axis and radius dimensions', () => {
    for (const position of [[0, 0, 0], [0, 0.00001, 0], [0, 10000, 0]] as Vec3[]) {
      const points = position[1] === 10000
        ? changedPosition('D', position).map(point => point.id === 'O' ? { ...point, position: [0, -1, 0] as Vec3 } : point)
        : changedPosition('D', position);
      expect(() => deriveQuestionPrimitive(coneDefinition, points)).toThrow(/D.*O.*高度/);
    }
    for (const position of [[0, 0, 0], [0.00001, 0, 0]] as Vec3[]) {
      expect(() => deriveQuestionPrimitive(coneDefinition, changedPosition('A', position))).toThrow(/A.*O.*半径/);
    }
  });

  it('rejects a whole primitive extending outside the existing coordinate limits', () => {
    const points: Point[] = [
      { id: 'D', label: 'D', position: [10000, 1, 0] },
      { id: 'O', label: 'O', position: [10000, 0, 0] },
      { id: 'A', label: 'A', position: [9999, 0, 0] },
    ];
    expect(() => deriveQuestionPrimitive(coneDefinition, points)).toThrow(/坐标.*范围/);
  });
});

describe('question-point primitive editing', () => {
  it('translates all question points when the bound cone apex D moves', () => {
    const original = solid();
    const before = structuredClone(original);
    const moved = moveQuestionPrimitive(original, 'D', [2, 4, 6]);
    expectPosition(positionOf(moved, 'D'), [2, 4, 6]);
    expectPosition(positionOf(moved, 'O'), [2, 4 - root3, 6]);
    expectPosition(positionOf(moved, 'A'), [3, 4 - root3, 6]);
    expectPosition(positionOf(moved, 'B'), [1.5, 4 - root3, 6 + root3 / 2]);
    expectPosition(positionOf(moved, 'C'), [1.5, 4 - root3, 6 - root3 / 2]);
    expectPosition(positionOf(moved, 'E'), [1, 4 - root3, 6]);
    expect(moved.points.map(point => [point.id, point.label])).toEqual(original.points.map(point => [point.id, point.label]));
    expect(moved.definition).toEqual(coneDefinition);
    expectPosition(moved.primitive!.origin, [2, 4, 6]);
    expect(original).toEqual(before);
  });

  it('rotates and changes cone height from its base center O while preserving circle geometry', () => {
    const original = solid();
    original.points.push({ id: 'P', label: '内部点 P', position: [0, root3 / 2, 0] });
    const moved = moveQuestionPrimitive(original, 'O', [0, root3, 4]);
    expectPosition(positionOf(moved, 'D'), [0, root3, 0]);
    expectPosition(positionOf(moved, 'O'), [0, root3, 4]);
    expectPosition(positionOf(moved, 'A'), [1, root3, 4]);
    expectPosition(positionOf(moved, 'B'), [-0.5, 1.5 * root3, 4]);
    expectPosition(positionOf(moved, 'C'), [-0.5, root3 / 2, 4]);
    expectPosition(positionOf(moved, 'P'), [0, root3, 2]);
    expect(moved.primitive!.height).toBeCloseTo(4, 12);
    expect(distance(positionOf(moved, 'A'), positionOf(moved, 'B'))).toBeCloseTo(root3, 12);
    expect(() => deriveQuestionPrimitive(coneDefinition, moved.points)).not.toThrow();
  });

  it('scales and rotates all circle points when A moves to a projected radial direction', () => {
    const moved = moveQuestionPrimitive(solid(), 'A', [0, 7, 2]);
    expectPosition(positionOf(moved, 'D'), [0, root3, 0]);
    expectPosition(positionOf(moved, 'O'), [0, 0, 0]);
    expectPosition(positionOf(moved, 'A'), [0, 0, 2]);
    expectPosition(positionOf(moved, 'B'), [-root3, 0, -1]);
    expectPosition(positionOf(moved, 'C'), [root3, 0, -1]);
    expectPosition(positionOf(moved, 'E'), [0, 0, -2]);
    expect(moved.primitive!.radius).toBeCloseTo(2, 12);
    for (const id of ['A', 'B', 'C', 'E']) {
      expect(distance(positionOf(moved, id), positionOf(moved, 'O'))).toBeCloseTo(2, 12);
    }
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'A']]) {
      expect(distance(positionOf(moved, a), positionOf(moved, b))).toBeCloseTo(2 * root3, 12);
    }
  });

  it('moves an unbound question point independently and keeps its primitive', () => {
    const original = solid();
    const moved = moveQuestionPrimitive(original, 'B', [8, 9, 10]);
    expectPosition(positionOf(moved, 'B'), [8, 9, 10]);
    expect(moved.points.filter(point => point.id !== 'B')).toEqual(original.points.filter(point => point.id !== 'B'));
    expect(moved.primitive).toBe(original.primitive);
    expect(moved.definition).toBe(original.definition);
  });

  it('treats every explicit point independently when a numeric primitive has no bindings', () => {
    const withDefinition = solid();
    const { definition: _definition, ...original } = withDefinition;
    const moved = moveQuestionPrimitive(original, 'O', [8, 9, 10]);
    expectPosition(positionOf(moved, 'O'), [8, 9, 10]);
    expectPosition(positionOf(moved, 'D'), [0, root3, 0]);
    expect(moved.primitive).toBe(original.primitive);
  });

  it('translates the oblique cylinder from its bound base named T', () => {
    const moved = moveQuestionPrimitive(solid(cylinderDefinition, cylinderPoints), 'T', [3, 1, 2]);
    expectPosition(positionOf(moved, 'T'), [3, 1, 2]);
    expectPosition(positionOf(moved, 'A'), [6, 5, 2]);
    expectPosition(positionOf(moved, 'O'), [3, 1, 4]);
    expectPosition(positionOf(moved, 'Q'), [4.6, -0.2, 2]);
    expectPosition(positionOf(moved, 'R'), [6, 5, 4]);
    expect(moved.primitive!.height).toBeCloseTo(5, 12);
  });

  it('transports the oblique cylinder frame when its bound top named A moves', () => {
    const moved = moveQuestionPrimitive(solid(cylinderDefinition, cylinderPoints), 'A', [2, 3, 14]);
    expectPosition(positionOf(moved, 'T'), [2, 3, 4]);
    expectPosition(positionOf(moved, 'A'), [2, 3, 14]);
    expectPosition(positionOf(moved, 'O'), [0.8, 1.4, 4]);
    expectPosition(positionOf(moved, 'Q'), [3.6, 1.8, 4]);
    expectPosition(positionOf(moved, 'R'), [0.8, 1.4, 14]);
    expect(moved.primitive!.height).toBeCloseTo(10, 12);
    expect(moved.primitive!.radius).toBeCloseTo(2, 12);
  });

  it('rotates the oblique cylinder radius from its bound point named O', () => {
    const moved = moveQuestionPrimitive(solid(cylinderDefinition, cylinderPoints), 'O', [3, 11, 4]);
    expectPosition(positionOf(moved, 'T'), [2, 3, 4]);
    expectPosition(positionOf(moved, 'A'), [5, 7, 4]);
    expectPosition(positionOf(moved, 'O'), [-1.2, 5.4, 4]);
    expectPosition(positionOf(moved, 'Q'), [2, 3, 8]);
    expectPosition(positionOf(moved, 'R'), [1.8, 9.4, 4]);
    expect(moved.primitive!.radius).toBeCloseTo(4, 12);
    expect(moved.primitive!.height).toBeCloseTo(5, 12);
  });

  it('rejects invalid, undeclared, collapsed or out-of-range edits without changing the source', () => {
    const original = solid();
    const before = structuredClone(original);
    for (const [id, desired] of [
      ['D', [NaN, 0, 0]], ['B', [0, Infinity, 0]], ['B', [10001, 0, 0]],
      ['missing', [0, 1, 0]], ['O', [0, root3, 0]], ['A', [0, 3, 0]], ['D', [10000, 4, 0]],
    ] as [string, Vec3][]) {
      expect(() => moveQuestionPrimitive(original, id, desired)).toThrow();
    }
    expect(original).toEqual(before);
  });
});
