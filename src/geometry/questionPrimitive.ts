import type { Point, Solid, Vec3 } from '../schema/scene';
import { moveRoundControl, roundControlPoints, roundFrame, type RoundPrimitive } from './roundSolids';

export type QuestionSolidDefinition =
  | { kind: 'cone'; apex: string; baseCenter: string; radiusPoint: string }
  | { kind: 'doubleCone'; apex: string; baseCenter: string; radiusPoint: string }
  | { kind: 'cylinder'; baseCenter: string; topCenter: string; radiusPoint: string };

const coordinateLimit = 10000;
const minimumDimension = 0.0001;
const planeTolerance = 1e-8;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const addScaled = (a: Vec3, b: Vec3, scale: number): Vec3 =>
  [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];

function requirePosition(position: Vec3, owner: string) {
  if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
    throw new Error(`${owner} 的坐标必须是三个有限数值`);
  }
  if (position.some(value => Math.abs(value) > coordinateLimit)) {
    throw new Error(`${owner} 的坐标超出有效范围（-10000 到 10000）`);
  }
}

function declaredPoints(points: readonly Point[]): Map<string, Point> {
  const declared = new Map<string, Point>();
  for (const point of points) {
    if (declared.has(point.id)) throw new Error(`题目点 ${point.id} 的 ID 重复`);
    declared.set(point.id, point);
  }
  return declared;
}

function requireDeclaredPoint(points: Map<string, Point>, id: string, role: string): Vec3 {
  const point = points.get(id);
  if (!point) throw new Error(`${role} ${id} 必须在 solid.points 中显式声明`);
  requirePosition(point.position, `${role} ${id}`);
  return point.position;
}

function requireDimension(value: number, owner: string) {
  if (!Number.isFinite(value) || value < minimumDimension || value > coordinateLimit) {
    throw new Error(`${owner} 必须在 0.0001 到 10000 之间，不能重合或退化`);
  }
}

function requirePrimitiveBounds(primitive: RoundPrimitive) {
  roundFrame(primitive);
  for (const point of roundControlPoints(primitive)) requirePosition(point.position, '旋转体');
}

/** Derive the body from question points without introducing any control-point names. */
export function deriveQuestionPrimitive(definition: QuestionSolidDefinition, points: readonly Point[]): RoundPrimitive {
  const declared = declaredPoints(points);
  const base = requireDeclaredPoint(declared, definition.baseCenter, '底面圆心');
  const radiusPoint = requireDeclaredPoint(declared, definition.radiusPoint, '半径点');
  const originId = definition.kind === 'cylinder' ? definition.baseCenter : definition.apex;
  const endId = definition.kind === 'cylinder' ? definition.topCenter : definition.baseCenter;
  const origin = definition.kind === 'cylinder' ? base : requireDeclaredPoint(declared, definition.apex, '顶点');
  const end = definition.kind === 'cylinder' ? requireDeclaredPoint(declared, definition.topCenter, '顶面圆心') : base;
  const axis = sub(end, origin);
  const radial = sub(radiusPoint, base);
  const height = Math.hypot(...axis);
  const radius = Math.hypot(...radial);
  requireDimension(height, `轴线 ${originId}→${endId} 的高度`);
  requireDimension(radius, `半径点 ${definition.radiusPoint} 与底面圆心 ${definition.baseCenter} 的半径`);
  if (Math.abs(dot(axis, radial) / height / radius) > planeTolerance) {
    throw new Error(`半径点 ${definition.radiusPoint} 必须位于以 ${definition.baseCenter} 为圆心且垂直于轴线 ${originId}→${endId} 的底面内`);
  }
  const primitive: RoundPrimitive = { kind: definition.kind, origin: [...origin], axis, radial, radius, height };
  try { requirePrimitiveBounds(primitive); }
  catch (error) {
    throw new Error(`旋转体定义（${originId}、${endId}、${definition.radiusPoint}）无效：${error instanceof Error ? error.message : String(error)}`);
  }
  return primitive;
}

/** Move explicit question points; binding edits carry the other points with the body. */
export function moveQuestionPrimitive(solid: Solid, id: string, desired: Vec3): Solid {
  requirePosition(desired, `题目点 ${id}`);
  const declared = declaredPoints(solid.points);
  if (!declared.has(id)) throw new Error(`题目点 ${id} 未在 solid.points 中显式声明`);
  const definition = solid.definition;
  const originId = definition?.kind === 'cylinder' ? definition.baseCenter : definition?.apex;
  const endId = definition?.kind === 'cylinder' ? definition.topCenter : definition?.baseCenter;
  if (!definition || (id !== originId && id !== endId && id !== definition.radiusPoint)) {
    return { ...solid, points: solid.points.map(point => point.id === id ? { ...point, position: [...desired] } : point) };
  }

  try {
    const previous = deriveQuestionPrimitive(definition, solid.points);
    const before = roundFrame(previous);
    const controlId = id === originId ? 'O' : id === endId ? 'T' : 'A';
    let source = previous;
    if (controlId === 'A') {
      const delta = sub(desired, declared.get(definition.baseCenter)!.position);
      // The requested point is projected onto its base plane. Orient the control
      // before checking its bounds, so bounds reflect the requested circle frame.
      source = { ...previous, radial: addScaled(delta, before.axis, -dot(delta, before.axis)) };
    }
    const next = moveRoundControl(source, controlId, desired);
    const after = roundFrame(next);
    const radialScale = next.radius / previous.radius;
    const axialScale = next.height / previous.height;
    const points = solid.points.map(point => {
      requirePosition(point.position, `题目点 ${point.id}`);
      const local = sub(point.position, previous.origin);
      const position = addScaled(addScaled(addScaled(next.origin,
        after.u, dot(local, before.u) * radialScale),
      after.axis, dot(local, before.axis) * axialScale),
      after.v, dot(local, before.v) * radialScale);
      requirePosition(position, `题目点 ${point.id}`);
      return { ...point, position };
    });
    return { ...solid, points, primitive: deriveQuestionPrimitive(definition, points) };
  } catch (error) {
    throw new Error(`题目点 ${id} 无法移动：${error instanceof Error ? error.message : String(error)}`);
  }
}
