import type { Solid, Vec3 } from '../schema/scene';
import { add, centroid, cross, dot, EPSILON, length, scale, sub, unit } from './engine';

type Plane = { origin: Vec3; normal: Vec3 };
type Prism = { lower: Plane; upper: Set<string>; partners: Map<string, string> };

function isFinitePosition(position: Vec3) {
  return position.length === 3 && Number.isFinite(position[0]) && Number.isFinite(position[1]) && Number.isFinite(position[2]);
}

function basePlane([origin, second, third]: Vec3[]): Plane {
  return { origin, normal: unit(cross(sub(second, origin), sub(third, origin))) };
}

function projectOntoPlane(position: Vec3, { origin, normal }: Plane): Vec3 {
  return sub(position, scale(normal, dot(normal, sub(position, origin))));
}

function findPrism(solid: Solid, positionOf: (id: string) => Vec3, tolerance: number): Prism | undefined {
  const size = solid.points.length / 2;
  if (size < 3 || !Number.isInteger(size)) return;

  const candidates = solid.faces.filter(face => face.vertices.length === size).map(face => {
    const positions = face.vertices.map(positionOf);
    return { ids: new Set(face.vertices), plane: basePlane(positions), y: centroid(positions)[1] };
  });
  let best: Prism | undefined;
  let bestSeparation = -1;

  for (const [index, first] of candidates.entries()) {
    for (const second of candidates.slice(index + 1)) {
      if ([...first.ids].some(id => second.ids.has(id))) continue;
      if (length(cross(first.plane.normal, second.plane.normal)) > EPSILON) continue;

      const [lower, upper] = first.y <= second.y ? [first, second] : [second, first];
      const separation = upper.y - lower.y;
      if (separation <= bestSeparation) continue;

      const crossEdges = solid.edges.flatMap(({ start, end }) => {
        if (lower.ids.has(start) && upper.ids.has(end)) return [[start, end] as const];
        if (lower.ids.has(end) && upper.ids.has(start)) return [[end, start] as const];
        return [];
      });
      const partners = new Map(crossEdges);
      if (crossEdges.length !== size || partners.size !== size || new Set(partners.values()).size !== size) continue;

      const [firstLower, firstUpper] = crossEdges[0];
      const axis = sub(positionOf(firstUpper), positionOf(firstLower));
      if (crossEdges.some(([a, b]) => length(sub(sub(positionOf(b), positionOf(a)), axis)) > tolerance)) continue;
      if (Math.abs(dot(axis, lower.plane.normal)) <= tolerance) throw new Error('棱柱退化：上下底面重合');

      best = { lower: lower.plane, upper: upper.ids, partners };
      bestSeparation = separation;
    }
  }

  return best;
}

export function deformSolid(solid: Solid, pointId: string, desired: Vec3): Solid {
  if (!isFinitePosition(desired) || solid.points.some(point => !isFinitePosition(point.position))) {
    throw new Error('顶点坐标必须是有限数值');
  }

  const points = new Map(solid.points.map(point => [point.id, point.position]));
  if (points.size !== solid.points.length) throw new Error('顶点 ID 重复');
  const positionOf = (id: string) => {
    const position = points.get(id);
    if (!position) throw new Error(`顶点 ${id} 不存在`);
    return position;
  };
  const previous = positionOf(pointId);
  solid.edges.forEach(({ start, end }) => { positionOf(start); positionOf(end); });
  solid.faces.forEach(face => face.vertices.forEach(positionOf));

  const tolerance = EPSILON * Math.max(1, ...solid.points.map(point => length(sub(point.position, previous))));
  const prism = findPrism(solid, positionOf, tolerance);
  const adjusted = new Map([[pointId, desired]]);

  if (prism?.upper.has(pointId)) {
    if (Math.abs(dot(prism.lower.normal, sub(desired, prism.lower.origin))) <= tolerance) {
      throw new Error('棱柱退化：上下底面重合');
    }
    const delta = sub(desired, previous);
    for (const upper of prism.upper) {
      if (upper !== pointId) adjusted.set(upper, add(positionOf(upper), delta));
    }
  } else if (prism) {
    const projected = projectOntoPlane(desired, prism.lower);
    const partner = prism.partners.get(pointId)!;
    adjusted.set(pointId, projected);
    adjusted.set(partner, add(positionOf(partner), sub(projected, previous)));
  } else if (solid.points.length === 5) {
    const base = solid.faces.find(face => face.vertices.length === solid.points.length - 1);
    if (base?.vertices.includes(pointId)) {
      adjusted.set(pointId, projectOntoPlane(desired, basePlane(base.vertices.map(positionOf))));
    }
  }

  const result = solid.points.map(point => {
    const position = adjusted.get(point.id);
    if (!position) return point;
    if (!isFinitePosition(position)) throw new Error('顶点坐标必须是有限数值');
    return { ...point, position };
  });
  for (const point of result) {
    if (adjusted.has(point.id) && result.some(other => other.id !== point.id && length(sub(point.position, other.position)) <= tolerance)) {
      throw new Error('顶点不能重合');
    }
  }
  return { ...solid, points: result };
}
