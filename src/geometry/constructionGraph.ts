import type { Construction, Point, Scene } from '../schema/scene';

export function authoredPoints(scene: Scene): Point[] {
  return [...scene.solid.points, ...scene.constructions.flatMap(c => c.kind === 'point' ? [{ id: c.point, label: c.label, position: c.position }] : [])];
}

export function producedPoints(c: Construction): { id: string; label: string }[] {
  if ('point' in c) return [{ id: c.point, label: c.label }];
  if ((c.kind === 'insphere' || c.kind === 'circumsphere') && c.centerPoint) return [{ id: c.centerPoint, label: c.centerLabel ?? c.centerPoint }];
  return [];
}

export function referencedPoints(c: Construction): string[] {
  if (c.kind === 'midpoint' || c.kind === 'segment') return [c.a, c.b];
  if (c.kind === 'movingPoint') return [c.start, c.end];
  if (c.kind === 'perpendicular') return [c.from, ...c.line];
  if (c.kind === 'pointPlaneDistance') return [c.from, ...c.plane];
  if ('points' in c) return c.points;
  return [];
}

export function pointNames(scene: Scene): Map<string, string> {
  return new Map([...scene.solid.points.map(p => [p.id, p.label] as const), ...scene.constructions.flatMap(c => producedPoints(c).map(p => [p.id, p.label] as const))]);
}

/** Assign names only once when opening pre-center scene v1 files. */
export function normalizeSphereCenters(scene: Scene) {
  const used = new Set([...scene.solid.points.map(p => p.id), ...scene.constructions.flatMap(c => producedPoints(c).map(p => p.id))]);
  let index = 1;
  for (const c of scene.constructions) {
    if (c.kind !== 'insphere' && c.kind !== 'circumsphere') continue;
    if (!c.centerPoint) {
      while (used.has(`O_s${index}`)) index++;
      c.centerPoint = `O_s${index}`;
      c.centerLabel ??= `Oₛ${String(index).replace(/\d/g, n => '₀₁₂₃₄₅₆₇₈₉'[Number(n)])}`;
      used.add(c.centerPoint);
      index++;
    }
    c.centerLabel ??= c.centerPoint;
  }
}
