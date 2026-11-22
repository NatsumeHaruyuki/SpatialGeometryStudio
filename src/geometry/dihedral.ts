import type { Construction, Scene, Vec3 } from '../schema/scene';
import { dihedralAngle } from './engine';
import { dihedralMeasurement } from './studyGeometry';

/** Legacy face pairs remain readable; point-defined angles may temporarily degenerate. */
export function getDihedral(scene: Scene, points: Map<string, Vec3>, c: Extract<Construction, { kind: 'dihedral' }>) {
  try {
    if ('points' in c) {
      const vertices = c.points.map(id => {
        const point = points.get(id);
        if (!point) throw new Error(`依赖点 ${id} 暂不可用，恢复有效构型后自动更新`);
        return point;
      }) as [Vec3, Vec3, Vec3, Vec3];
      return { status: 'defined' as const, ...dihedralMeasurement(...vertices), edge: [c.points[0], c.points[1]] };
    }
    return { status: 'defined' as const, ...dihedralAngle(scene.solid, points, c.faceA, c.faceB) };
  } catch (error) {
    return { status: 'undefined' as const, reason: `暂不可定义：${error instanceof Error ? error.message : '依赖构型退化'}` };
  }
}
