import type { Construction, Vec3 } from '../schema/scene';
import { perpendicularFoot, pointPlaneProjection, threePointAngle, triangleMeasurement } from './studyGeometry';

function point(points: Map<string, Vec3>, id: string) {
  const p = points.get(id);
  if (!p) throw new Error(`依赖点 ${id} 暂不可用，恢复有效构型后自动更新`);
  return p;
}
function safely<T extends object>(calculate: () => T) {
  try { return { status: 'defined' as const, ...calculate() }; }
  catch (error) { return { status: 'undefined' as const, reason: `暂不可定义：${error instanceof Error ? error.message : '依赖构型退化'}` }; }
}
export function getPerpendicular(points: Map<string, Vec3>, c: Extract<Construction, { kind: 'perpendicular' }>) {
  return safely(() => perpendicularFoot(point(points, c.from), point(points, c.line[0]), point(points, c.line[1])));
}
export function getTriangle(points: Map<string, Vec3>, c: Extract<Construction, { kind: 'triangle' }>) {
  return safely(() => triangleMeasurement(point(points, c.points[0]), point(points, c.points[1]), point(points, c.points[2])));
}
export function getAngle(points: Map<string, Vec3>, c: Extract<Construction, { kind: 'angle' }>) {
  return safely(() => threePointAngle(point(points, c.points[0]), point(points, c.points[1]), point(points, c.points[2])));
}
export function getPointPlaneDistance(points: Map<string, Vec3>, c: Extract<Construction, { kind: 'pointPlaneDistance' }>) {
  return safely(() => pointPlaneProjection(point(points, c.from), c.plane.map(id => point(points, id)) as [Vec3, Vec3, Vec3]));
}
