import * as THREE from 'three';
import type { Construction, Vec3 } from '../schema/scene';
import { getAngle, getPerpendicular, getPointPlaneDistance, getTriangle } from '../geometry/studyConstructions';
import { add, scale, sub } from '../geometry/engine';

export type StudyConstruction = Extract<Construction, { kind: 'perpendicular' | 'triangle' | 'angle' | 'pointPlaneDistance' }>;
export type StudyOverlayContext = {
  group: THREE.Group; size: number;
  face: (vertices: Vec3[], color: number, opacity: number) => THREE.Mesh;
  line: (a: Vec3, b: Vec3, color: number, width: number) => void;
  curve: (vertices: Vec3[], color: number, closed?: boolean) => void;
  label: (position: Vec3, text: string, className: string, color: string, dx?: number, dy?: number) => void;
  triangleTarget: (mesh: THREE.Mesh, id: string) => void;
};

const fmt = (n: number) => new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 5, useGrouping: false }).format(n);
const vector = (p: Vec3) => new THREE.Vector3(...p);

function arrow(ctx: StudyOverlayContext, origin: Vec3, delta: Vec3, color: number) {
  const length = Math.hypot(...delta);
  if (!length) return;
  const arrow = new THREE.ArrowHelper(vector(delta).normalize(), vector(origin), length, color, Math.min(length * 0.16, ctx.size * 0.09), Math.min(length * 0.075, ctx.size * 0.045));
  arrow.traverse(object => {
    if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(m => { m.depthTest = false; }); object.renderOrder = 8;
    }
  });
  ctx.group.add(arrow);
}

function rightAngle(ctx: StudyOverlayContext, h: Vec3, a: Vec3, p: Vec3, color: number) {
  const ha = sub(a, h), hp = sub(p, h), la = Math.hypot(...ha), lp = Math.hypot(...hp);
  if (!la || !lp) return;
  const size = Math.min(la, lp, ctx.size * 0.4) * 0.18;
  const u = scale(ha, size / la), v = scale(hp, size / lp);
  ctx.curve([add(h, u), add(h, add(u, v)), add(h, v)], color);
}

export function drawStudyOverlay(c: StudyConstruction, points: Map<string, Vec3>, selected: boolean, ctx: StudyOverlayContext) {
  if (c.kind === 'triangle') {
    const result = getTriangle(points, c); if (result.status === 'undefined') return;
    const vertices = c.points.map(id => points.get(id)!);
    const face = ctx.face(vertices, 0x956ac3, selected ? 0.36 : 0.19); face.renderOrder = 4;
    ctx.triangleTarget(face, c.id);
    vertices.forEach((a, i) => ctx.line(a, vertices[(i + 1) % 3], 0x956ac3, ctx.size * (selected ? 0.005 : 0.003)));
  } else if (c.kind === 'perpendicular') {
    const result = getPerpendicular(points, c); if (result.status === 'undefined') return;
    const p = points.get(c.from)!, a = points.get(c.line[0])!, b = points.get(c.line[1])!;
    ctx.line(a, b, 0x389b9a, ctx.size * 0.002);
    if (result.t < 0 || result.t > 1) ctx.line(result.t < 0 ? a : b, result.foot, 0x70b3af, ctx.size * 0.0015);
    if (result.direction) {
      ctx.line(p, result.foot, 0x168e91, ctx.size * 0.004);
      rightAngle(ctx, result.foot, Math.hypot(...sub(a, result.foot)) > 0 ? a : b, p, 0x168e91);
    }
  } else if (c.kind === 'angle') {
    const result = getAngle(points, c); if (result.status === 'undefined') return;
    const [a, b, d] = c.points.map(id => points.get(id)!);
    ctx.line(b, a, 0xc58a38, ctx.size * 0.003); ctx.line(b, d, 0xc58a38, ctx.size * 0.003);
    const radius = Math.min(Math.hypot(...sub(a, b)), Math.hypot(...sub(d, b)), ctx.size * 1.2) * 0.24;
    const u = vector(result.rayA);
    const v = result.normal ? vector(result.normal).cross(u).normalize() : u.clone().cross(Math.abs(u.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const theta = result.degrees * Math.PI / 180;
    const position = (t: number, r: number): Vec3 => vector(b).addScaledVector(u, Math.cos(t) * r).addScaledVector(v, Math.sin(t) * r).toArray() as Vec3;
    ctx.curve(Array.from({ length: 49 }, (_, i) => position(theta * i / 48, radius)), 0xc58a38);
    ctx.label(position(theta / 2, radius * 1.4), `${result.degrees.toFixed(2)}°`, 'angle-measure-label', '#ac742e', 0, -10);
  } else {
    const result = getPointPlaneDistance(points, c); if (result.status === 'undefined') return;
    const [q, h, p] = result.triangle;
    if (result.distance > 0) {
      ctx.face([q, h, p], 0x4a9ac4, 0.18).renderOrder = 4;
      ctx.line(q, h, 0x639ab4, ctx.size * 0.002);
      ctx.line(p, h, 0x327eb3, ctx.size * 0.005);
      rightAngle(ctx, h, q, p, 0x327eb3);
    }
    arrow(ctx, q, result.direction, 0xc28b39);
    const normalDelta = scale(result.unitNormal, ctx.size * 0.65);
    arrow(ctx, q, normalDelta, 0x8d64b7);
    ctx.label(add(q, scale(normalDelta, 1.1)), 'n', 'vector-label normal-label', '#8455ac');
    ctx.label(add(q, scale(result.direction, 0.65)), 'v', 'vector-label direction-label', '#a57029', 14, 12);
    ctx.label(scale(add(p, h), 0.5), `d = ${fmt(result.distance)}`, 'distance-measure-label', '#2f7faa', -24, 12);
  }
}
