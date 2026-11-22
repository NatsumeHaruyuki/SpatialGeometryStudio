import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Scene, Vec3 } from '../schema/scene';
import type { Selection, Tool } from '../store/studio';
import { GeometryCompiler, add, centroid, cross, dot, getSection, getSphere, scale, sub, unit } from '../geometry/engine';
import { roundControlPoints, roundFrame, type RoundPrimitive } from '../geometry/roundSolids';
import { authoredPoints, pointNames as scenePointNames } from '../geometry/constructionGraph';
import { drawStudyOverlay } from './studyOverlays';
import { getDihedral } from '../geometry/dihedral';

export type GeometryEdits = { point: (id: string, position: Vec3, first: boolean) => boolean; section: (id: string, offset: number, first: boolean) => boolean };
type Drag = { kind: 'point' | 'section'; id: string; pointerId: number; started: boolean; startX: number; startY: number; position: THREE.Vector3; grabOffset: THREE.Vector3; plane: THREE.Plane; normal: THREE.Vector3; offset: number };

const vector = (p: Vec3) => new THREE.Vector3(...p);
const COLORS = { edge: 0x315575, point: 0x315575, derived: 0x147e83, motion: 0xf09a38, section: 0x19b99d, auxiliary: 0x9b75ba, angle: 0xce8d3d, dihedralAxis: 0x367fc2, dihedralPlane: 0xe49532 };

function disposeGroup(group: THREE.Group) {
  group.traverse(object => {
    if (object instanceof CSS2DObject) object.element.remove();
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(m => m.dispose());
    }
  });
  group.clear();
}

function polygonGeometry(points: Vec3[]) {
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  for (let i = 1; i < points.length - 1; i++) vertices.push(...points[0], ...points[i], ...points[i + 1]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class GeometryView {
  private world = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100000);
  private renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private labels = new CSS2DRenderer();
  private controls: OrbitControls;
  private base = new THREE.Group();
  private dynamic = new THREE.Group();
  private grid = new THREE.GridHelper(12, 24, 0xb7cad9, 0xd2dfe8);
  private compiler = new GeometryCompiler();
  private pointTargets: THREE.Object3D[] = [];
  private faceTargets: THREE.Object3D[] = [];
  private sectionTargets: THREE.Object3D[] = [];
  private triangleTargets: THREE.Object3D[] = [];
  private drag?: Drag;
  private pointLabels: { point: Vec3; label: string; color: string; dx?: number; dy?: number }[] = [];
  private current?: Scene;
  private solid?: Scene['solid'];
  private baseDisplay = '';
  private size = 2;
  private pointerStart = { x: 0, y: 0 };
  private frame = 0;
  private needsRender = true;
  private width = 1;
  private height = 1;
  private tool: Tool = 'select';
  private observer: ResizeObserver;

  constructor(private host: HTMLElement, private onPick: (selection: Selection, multi: boolean) => void, private axisSvg?: SVGSVGElement | null, private onViewChange?: (view: Scene['view']) => void, private edits?: GeometryEdits) {
    this.world.background = new THREE.Color(0xf5f8fb);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', '三维几何画布，可拖动旋转和滚轮缩放');
    this.renderer.domElement.setAttribute('role', 'img');
    host.appendChild(this.renderer.domElement);
    this.labels.domElement.className = 'scene-labels';
    host.appendChild(this.labels.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 50000;
    this.controls.addEventListener('end', () => this.onViewChange?.(this.getView()));
    this.world.add(this.grid, this.base, this.dynamic);
    this.grid.position.y = -0.025;
    this.grid.renderOrder = -1;
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.38;
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown, true);
    this.renderer.domElement.addEventListener('pointermove', this.pointerMove, true);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp, true);
    this.renderer.domElement.addEventListener('pointercancel', this.cancelDrag, true);
    this.renderer.domElement.addEventListener('lostpointercapture', this.cancelDrag);
    window.addEventListener('blur', this.cancelDrag);
    window.addEventListener('keydown', this.cancelOnKey);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.tick();
  }

  private contextLost = (event: Event) => {
    event.preventDefault();
    this.host.dispatchEvent(new CustomEvent('scene-error', { detail: '三维图形上下文已丢失，请保存项目后重新打开软件。' }));
  };
  private ray(event: PointerEvent) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    const ray = new THREE.Raycaster();
    this.world.updateMatrixWorld(true);
    ray.setFromCamera(pointer, this.camera);
    ray.params.Line.threshold = 16 * this.camera.position.distanceTo(this.controls.target) * Math.tan(this.camera.fov * Math.PI / 360) / (this.height * this.camera.zoom);
    return ray;
  }
  private pointerDown = (event: PointerEvent) => {
    this.pointerStart = { x: event.clientX, y: event.clientY };
    if (event.button !== 0 || !this.current || !this.edits || this.drag) return;
    const ray = this.ray(event);
    let kind: 'point' | 'section' | undefined, id = '', position: THREE.Vector3 | undefined, normal = new THREE.Vector3(), offset = 0;
    if (event.altKey) {
      const hit = ray.intersectObjects(this.sectionTargets, false)[0];
      if (hit) {
        const cut = this.current.constructions.find(c => c.id === hit.object.userData.id);
        if (cut?.kind === 'section' || cut?.kind === 'planeSection') {
          const result = getSection(this.current, this.compiler.resolve(this.current), cut);
          if (result.status === 'defined') { kind = 'section'; id = cut.id; position = hit.point.clone(); normal.copy(vector(result.normal)); offset = cut.offset ?? 0; }
        }
      }
    } else if (this.tool === 'adjust') {
      const hit = ray.intersectObjects(this.pointTargets, false)[0];
      const point = authoredPoints(this.current).find(p => p.id === hit?.object.userData.id);
      if (point) { kind = 'point'; id = point.id; position = vector(point.position); }
    }
    if (!kind || !position) return;
    this.onPick({ kind: kind === 'point' ? 'point' : 'section', id }, false);
    this.controls.enableDamping = false; this.controls.update(); this.controls.enableDamping = true;
    const screenNormal = this.camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(screenNormal, position);
    const grabOffset = kind === 'point' ? ray.ray.intersectPlane(plane, new THREE.Vector3())?.sub(position) ?? new THREE.Vector3() : new THREE.Vector3();
    this.drag = { kind, id, pointerId: event.pointerId, started: false, startX: event.clientX, startY: event.clientY, position, grabOffset, plane, normal, offset };
    this.controls.enabled = false;
    this.renderer.domElement.setAttribute('data-dragging', kind);
    this.renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault(); event.stopImmediatePropagation();
  };
  private pointerMove = (event: PointerEvent) => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId || !this.edits) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (!drag.started && Math.hypot(dx, dy) < 2) return;
    let accepted = false;
    if (drag.kind === 'point') {
      const intersection = this.ray(event).ray.intersectPlane(drag.plane, new THREE.Vector3());
      if (intersection) accepted = this.edits.point(drag.id, intersection.sub(drag.grabOffset).toArray() as Vec3, !drag.started);
    } else {
      const a = drag.position.clone().project(this.camera), b = drag.position.clone().add(drag.normal).project(this.camera);
      const sx = (b.x - a.x) * this.width / 2, sy = -(b.y - a.y) * this.height / 2;
      const screenLength = sx * sx + sy * sy;
      const delta = screenLength > 16 ? (dx * sx + dy * sy) / screenLength : -dy * 2 * this.camera.position.distanceTo(drag.position) * Math.tan(this.camera.fov * Math.PI / 360) / (this.height * this.camera.zoom);
      accepted = this.edits.section(drag.id, drag.offset + delta, !drag.started);
    }
    if (accepted) drag.started = true;
  };
  private cancelDrag = () => {
    const drag = this.drag;
    this.drag = undefined;
    this.controls.enabled = true;
    this.renderer.domElement.removeAttribute('data-dragging');
    if (drag && this.renderer.domElement.hasPointerCapture(drag.pointerId)) this.renderer.domElement.releasePointerCapture(drag.pointerId);
  };
  private cancelOnKey = (event: KeyboardEvent) => { if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()))) this.cancelDrag(); };
  private pointerUp = (event: PointerEvent) => {
    if (this.drag) { this.cancelDrag(); event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.button !== 0 || Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 5) return;
    const ray = this.ray(event);
    const hit = ray.intersectObjects(this.pointTargets, false)[0];
    if (hit) this.onPick({ kind: 'point', id: hit.object.userData.id }, event.shiftKey);
    else if (this.tool === 'select') {
      const triangle = ray.intersectObjects(this.triangleTargets, false)[0];
      if (triangle) this.onPick({ kind: 'triangle', id: triangle.object.userData.id }, false);
    }
  };

  private resize() {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = this.width / this.height;
    this.camera.zoom = Math.min(1, this.camera.aspect / 0.95);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.labels.setSize(this.width, this.height);
    this.needsRender = true;
  }

  private tick = () => {
    this.frame = requestAnimationFrame(this.tick);
    const changed = this.drag ? false : this.controls.update();
    if (changed || this.needsRender) this.draw();
  };

  private draw() {
    this.renderer.render(this.world, this.camera);
    this.labels.render(this.world, this.camera);
    this.needsRender = false;
    if (this.axisSvg) {
      const rotation = this.camera.quaternion.clone().invert();
      const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
      axes.forEach((axis, i) => {
        axis.applyQuaternion(rotation);
        const x = 40 + axis.x * 25, y = 40 - axis.y * 25;
        const line = this.axisSvg!.querySelector(`[data-axis="${i}"]`)!;
        line.setAttribute('x2', String(x)); line.setAttribute('y2', String(y));
        const text = this.axisSvg!.querySelector(`[data-axis-label="${i}"]`)!;
        text.setAttribute('x', String(x + 4)); text.setAttribute('y', String(y - 2));
      });
    }
  }

  setView(view: Scene['view']) {
    this.camera.position.copy(vector(view.position));
    this.controls.target.copy(vector(view.target));
    this.controls.update();
    this.needsRender = true;
  }

  getView(): Scene['view'] {
    return { position: this.camera.position.toArray() as Vec3, target: this.controls.target.toArray() as Vec3 };
  }

  private line(group: THREE.Group, a: Vec3, b: Vec3, color: number, radius: number, overlay = false) {
    const av = vector(a), bv = vector(b), delta = bv.clone().sub(av);
    if (delta.length() < 1e-8) return;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), new THREE.MeshBasicMaterial({ color, depthTest: !overlay }));
    mesh.position.copy(av.add(bv).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.renderOrder = overlay ? 6 : 2;
    group.add(mesh);
  }

  private meshFace(group: THREE.Group, points: Vec3[], color: number, opacity: number, depthTest = false) {
    const mesh = new THREE.Mesh(polygonGeometry(points), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, depthTest }));
    mesh.renderOrder = 3;
    group.add(mesh);
    return mesh;
  }

  private curve(group: THREE.Group, points: Vec3[], color: number, closed = false, overlay = true) {
    if (!points.length) return;
    if (points.length === 1) { const point = new THREE.Mesh(new THREE.SphereGeometry(this.size * 0.018, 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: !overlay })); point.position.copy(vector(points[0])); point.renderOrder = 6; group.add(point); return point; }
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(vector));
    const material = new THREE.LineBasicMaterial({ color, depthTest: !overlay });
    const line = closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
    line.renderOrder = overlay ? 6 : 2; group.add(line); return line;
  }

  private roundBase(primitive: RoundPrimitive, faces: boolean, hidden: boolean) {
    const { u, v, axis } = roundFrame(primitive);
    const directions = primitive.kind === 'doubleCone' ? [1, -1] : [1];
    directions.forEach(sign => {
      const direction = scale(axis, sign), midpoint = add(primitive.origin, scale(direction, primitive.height / 2));
      const geometry = new THREE.CylinderGeometry(primitive.radius, primitive.kind === 'cylinder' ? primitive.radius : 0, primitive.height, 80, 1, false);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector(direction));
      const depth = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
      depth.position.copy(vector(midpoint)); depth.quaternion.copy(quaternion); depth.renderOrder = 0; this.base.add(depth);
      if (faces) { const surface = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({ color: 0x80bee0, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide })); surface.position.copy(depth.position); surface.quaternion.copy(quaternion); surface.renderOrder = 1; this.base.add(surface); }
      const cap = add(primitive.origin, scale(direction, primitive.height));
      const ring = (center: Vec3) => Array.from({ length: 120 }, (_, i) => add(center, add(scale(u, primitive.radius * Math.cos(i * Math.PI / 60)), scale(v, primitive.radius * Math.sin(i * Math.PI / 60)))));
      this.curve(this.base, ring(cap), COLORS.edge, true, true);
      if (primitive.kind === 'cylinder') this.curve(this.base, ring(primitive.origin), COLORS.edge, true, true);
      for (let i = 0; i < 4; i++) {
        const radial = add(scale(u, primitive.radius * Math.cos(i * Math.PI / 2)), scale(v, primitive.radius * Math.sin(i * Math.PI / 2)));
        const a = primitive.kind === 'cylinder' ? add(primitive.origin, radial) : primitive.origin, b = add(cap, radial);
        if (hidden) { const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([vector(a), vector(b)]), new THREE.LineDashedMaterial({ color: 0x8aa2b3, dashSize: this.size * 0.045, gapSize: this.size * 0.03, depthTest: false, transparent: true, opacity: 0.6 })); line.computeLineDistances(); line.renderOrder = 1; this.base.add(line); }
        this.line(this.base, a, b, COLORS.edge, this.size * 0.0025);
      }
    });
  }

  private label(position: Vec3, text: string, type: string, offset = true) {
    const element = document.createElement('span');
    element.className = `point-label ${type}`;
    element.textContent = text;
    const label = new CSS2DObject(element);
    label.position.copy(vector(position));
    if (offset) label.center.set(-0.15, 1.15);
    this.dynamic.add(label);
    return label;
  }

  private dihedralPlanes(scene: Scene, points: Map<string, Vec3>, ids: string[]) {
    if (ids.length < 2) return;
    const a = points.get(ids[0]), b = points.get(ids[1]);
    if (!a || !b) return;
    const delta = vector(b).sub(vector(a)), distance = delta.length();
    if (distance === 0) return;
    const axis = delta.multiplyScalar(1 / distance).toArray() as Vec3;
    const origin = add(scale(a, 0.5), scale(b, 0.5));
    const span = Math.max(this.size * 0.65, distance * 0.6);
    const start = add(origin, scale(axis, -span)), end = add(origin, scale(axis, span));
    this.line(this.dynamic, start, end, COLORS.dihedralAxis, this.size * 0.003, true);
    this.line(this.dynamic, a, b, COLORS.dihedralAxis, this.size * 0.006, true);
    const names = scenePointNames(scene), name = (id: string) => names.get(id) ?? id;
    if (scene.display.labels) {
      const labelPosition = add(end, scale(axis, this.size * 0.06));
      const text = `公共直线 ${ids.slice(0, 2).map(name).join('')}`;
      this.label(labelPosition, text, 'dihedral-line-label', false);
      this.pointLabels.push({ point: labelPosition, label: text, color: '#286ba7' });
    }
    ids.slice(2).forEach((id, index) => {
      const angle = getDihedral(scene, points, { id: 'preview', kind: 'dihedral', points: [ids[0], ids[1], id, id] });
      if (angle.status === 'undefined') return;
      const offset = scale(angle.rayA, this.size * 0.56);
      this.meshFace(this.dynamic, [start, end, add(end, offset), add(start, offset)], COLORS.dihedralPlane, 0.11);
      if (scene.display.labels) {
        const labelPosition = add(origin, scale(offset, 0.9));
        const text = `平面 ${ids.slice(0, 2).map(name).join('')}${name(id)}`;
        const dy = index === 0 ? -32 : 32;
        this.label(labelPosition, text, 'dihedral-plane-label', false).element.style.translate = `0 ${dy}px`;
        this.pointLabels.push({ point: labelPosition, label: text, color: '#b16c20', dy });
      }
    });
  }

  update(scene: Scene, selection: Selection[], tool: Tool) {
    if (this.drag && (this.current?.id !== scene.id || (this.tool !== tool && this.drag.kind === 'point'))) this.cancelDrag();
    this.current = scene;
    this.tool = tool;
    const points = this.compiler.resolve(scene);
    const primitive = scene.solid.primitive;
    const bounds = primitive ? roundControlPoints(primitive) : authoredPoints(scene);
    const center = primitive ? primitive.kind === 'doubleCone' ? primitive.origin : add(primitive.origin, scale(roundFrame(primitive).axis, primitive.height / 2)) : centroid(bounds.map(p => p.position));
    this.size = Math.max(...bounds.map(p => vector(p.position).distanceTo(vector(center)))) || 1;
    if (!Number.isFinite(this.size)) this.size = 1;
    this.controls.minDistance = Math.min(0.15, this.size * 0.05);
    this.camera.near = Math.max(1e-10, Math.min(0.01, this.size * 0.001));
    this.camera.updateProjectionMatrix();
    const signature = `${scene.display.faces}:${scene.display.hiddenEdges}`;
    if (this.solid !== scene.solid || this.baseDisplay !== signature) {
      disposeGroup(this.base);
      this.faceTargets = [];
      this.solid = scene.solid;
      this.baseDisplay = signature;
      this.grid.position.set(center[0], (bounds.length ? Math.min(...bounds.map(p => p.position[1])) : 0) - this.size * 0.018, center[2]);
      this.grid.scale.setScalar(this.size / 1.73);
      if (primitive) this.roundBase(primitive, scene.display.faces, scene.display.hiddenEdges);
      scene.solid.faces.forEach(face => {
        const vertices = face.vertices.map(id => points.get(id)!);
        const depth = new THREE.Mesh(polygonGeometry(vertices), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
        depth.userData.id = face.id;
        depth.renderOrder = 0;
        this.base.add(depth);
        this.faceTargets.push(depth);
        if (scene.display.faces) this.meshFace(this.base, vertices, 0x80bee0, 0.14, true).renderOrder = 1;
      });
      scene.solid.edges.forEach(edge => {
        const a = points.get(edge.start)!, b = points.get(edge.end)!;
        if (scene.display.hiddenEdges) {
          const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints([vector(a), vector(b)]), new THREE.LineDashedMaterial({ color: 0x6485a1, dashSize: this.size * 0.065, gapSize: this.size * 0.045, depthTest: false, transparent: true, opacity: 0.7 }));
          dashed.computeLineDistances(); dashed.renderOrder = 1;
          this.base.add(dashed);
        }
        this.line(this.base, a, b, COLORS.edge, this.size * 0.0038);
      });
    }
    this.grid.visible = scene.display.grid;
    disposeGroup(this.dynamic);
    this.pointTargets = [];
    this.sectionTargets = [];
    this.triangleTargets = [];
    this.pointLabels = [];
    const pointNames = scenePointNames(scene);
    const fixedIds = new Set(authoredPoints(scene).map(p => p.id));
    const centers = new Map(scene.constructions.flatMap(c => (c.kind === 'insphere' || c.kind === 'circumsphere') && c.centerPoint ? [[c.centerPoint, c.kind] as const] : []));
    const moving = new Set<string>();
    scene.constructions.forEach(c => {
      if ('point' in c) pointNames.set(c.point, c.label);
      if (c.kind === 'movingPoint') moving.add(c.point);
    });
    const latestDihedral = tool === 'select' ? scene.constructions.findLast(c => c.kind === 'dihedral' && 'points' in c) : undefined;
    const dihedralIds = tool === 'dihedral' ? selection.filter(s => s.kind === 'point').map(s => s.id) : latestDihedral && 'points' in latestDihedral ? latestDihedral.points : [];
    points.forEach((position, id) => {
      const selected = selection.some(s => s.kind === 'point' && s.id === id);
      const fixed = fixedIds.has(id);
      const sphereKind = centers.get(id);
      const dihedralIndex = dihedralIds.indexOf(id);
      const role = dihedralIndex < 0 ? '' : dihedralIndex < 2 ? 'dihedral-axis-point' : 'dihedral-plane-point';
      const color = role ? dihedralIndex < 2 ? COLORS.dihedralAxis : COLORS.dihedralPlane : selected || moving.has(id) ? COLORS.motion : sphereKind === 'insphere' ? 0xd49b3b : sphereKind === 'circumsphere' ? 0x577fa8 : fixed ? COLORS.point : COLORS.derived;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(this.size * (selected || role ? 0.026 : fixed ? 0.012 : 0.023), 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
      dot.position.copy(vector(position)); dot.userData.id = id; dot.renderOrder = 7;
      this.dynamic.add(dot);
      // Larger invisible hit target keeps point selection easy on a classroom laptop.
      const target = new THREE.Mesh(new THREE.SphereGeometry(this.size * 0.047, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
      target.position.copy(vector(position)); target.userData.id = id;
      this.dynamic.add(target); this.pointTargets.push(target);
      if (scene.display.labels) {
        const label = pointNames.get(id) ?? id;
        const object = this.label(position, label, `${sphereKind ? 'sphere-center-label ' : ''}${selected ? 'selected' : fixed ? 'fixed' : 'derived'} ${role}`);
        if (sphereKind && !selected && !role) object.element.style.color = sphereKind === 'insphere' ? '#a87222' : '#466e9a';
        this.pointLabels.push({ point: position, label, color: role ? dihedralIndex < 2 ? '#286ba7' : '#b16c20' : selected ? '#b57223' : fixed ? '#203c50' : '#117e82' });
      }
    });
    selection.filter(s => s.kind === 'face').forEach(s => {
      const face = scene.solid.faces.find(f => f.id === s.id);
      if (face) this.meshFace(this.dynamic, face.vertices.map(id => points.get(id)!), 0x167d83, 0.23);
    });
    if (tool === 'dihedral') this.dihedralPlanes(scene, points, dihedralIds);
    let sphereIndex = 0;
    scene.constructions.forEach(c => {
      if (c.kind === 'segment') {
        const a = points.get(c.a), b = points.get(c.b); if (!a || !b) return;
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([vector(a), vector(b)]), new THREE.LineDashedMaterial({ color: COLORS.auxiliary, depthTest: false, dashSize: this.size * 0.05, gapSize: this.size * 0.025 }));
        line.computeLineDistances(); line.renderOrder = 6; this.dynamic.add(line);
      } else if (c.kind === 'circumsphere' || c.kind === 'insphere') {
        sphereIndex++;
        const sphere = getSphere(points, c);
        if (sphere.status === 'undefined') return;
        const color = c.kind === 'circumsphere' ? 0x577fa8 : 0xd49b3b;
        const cssColor = c.kind === 'circumsphere' ? '#466e9a' : '#a87222';
        if (scene.display.faces) {
          const body = new THREE.Mesh(new THREE.SphereGeometry(sphere.radius, 56, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
          body.position.copy(vector(sphere.center)); body.renderOrder = 2.5; this.dynamic.add(body);
        }
        for (let axis = 0; axis < 3; axis++) {
          const circle = Array.from({ length: 160 }, (_, i) => {
            const p: Vec3 = [...sphere.center];
            p[(axis + 1) % 3] += sphere.radius * Math.cos(i * Math.PI / 80);
            p[(axis + 2) % 3] += sphere.radius * Math.sin(i * Math.PI / 80);
            return p;
          });
          this.curve(this.dynamic, circle, color, true);
        }
        const vertices = c.points.map(id => points.get(id)!);
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
          const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints([vector(vertices[i]), vector(vertices[j])]), new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.55, dashSize: this.size * 0.035, gapSize: this.size * 0.02, depthTest: false }));
          edge.computeLineDistances(); edge.renderOrder = 5; this.dynamic.add(edge);
        }
        const endpoint = sphere.radiusPoint;
        this.line(this.dynamic, sphere.center, endpoint, color, Math.min(this.size * 0.0025, sphere.radius * 0.015), true);
        if (scene.display.labels) {
          const outer = c.kind === 'circumsphere';
          const radiusPosition = add(scale(sphere.center, 0.5), scale(endpoint, 0.5));
          const radiusLabel = `R = ${new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 4, useGrouping: false }).format(sphere.radius)}`;
          const radiusObject = this.label(radiusPosition, radiusLabel, 'sphere-radius-label', false);
          radiusObject.element.style.translate = outer ? '-32px -16px' : '50px -24px';
          radiusObject.element.style.color = cssColor;
          this.pointLabels.push({ point: radiusPosition, label: radiusLabel, color: cssColor, dx: outer ? -65 : 17, dy: outer ? -10 : -18 });
        }
      } else if (c.kind === 'perpendicular' || c.kind === 'triangle' || c.kind === 'angle' || c.kind === 'pointPlaneDistance') {
        drawStudyOverlay(c, points, selection.some(s => s.kind === 'triangle' && s.id === c.id), {
          group: this.dynamic, size: this.size,
          face: (vertices, color, opacity) => this.meshFace(this.dynamic, vertices, color, opacity),
          line: (a, b, color, width) => this.line(this.dynamic, a, b, color, width, true),
          curve: (vertices, color, closed) => { this.curve(this.dynamic, vertices, color, closed); },
          triangleTarget: (mesh, id) => { mesh.userData.id = id; this.triangleTargets.push(mesh); },
          label: (position, text, className, color, dx = 8, dy = -7) => {
            if (!scene.display.labels) return;
            const label = this.label(position, text, className, false);
            label.element.style.color = color; label.element.style.translate = `${dx}px ${dy}px`;
            this.pointLabels.push({ point: position, label: text, color, dx: dx - text.length * 4, dy: dy + 6 });
          },
        });
      } else if (c.kind === 'section' || c.kind === 'planeSection') {
        const section = getSection(scene, points, c);
        if (section.status === 'undefined') return;
        const selected = selection.some(s => s.kind === 'section' && s.id === c.id);
        const middle = sub(center, scale(section.normal, dot(sub(center, section.origin), section.normal)));
        if (scene.display.sectionPlane || selected || this.drag?.id === c.id) {
          const u = unit(cross(section.normal, Math.abs(section.normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(section.normal, u);
          const radius = this.size * 1.2;
          const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => add(middle, add(scale(u, x * radius), scale(v, y * radius))));
          const plane = this.meshFace(this.dynamic, corners, COLORS.section, selected ? 0.12 : 0.055); plane.renderOrder = 3; plane.userData.id = c.id; this.sectionTargets.push(plane);
        }
        section.curves.forEach((curve, index) => {
          if (section.closed[index] && curve.length >= 3) { const face = this.meshFace(this.dynamic, curve, COLORS.section, 0.22); face.renderOrder = 4; face.userData.id = c.id; this.sectionTargets.push(face); }
          if (primitive || curve.length === 1) { const target = this.curve(this.dynamic, curve, COLORS.section, section.closed[index]); if (target) { target.userData.id = c.id; this.sectionTargets.push(target); } }
          else if (curve.length >= 2) {
            curve.forEach((p, i) => { if (i < curve.length - 1 || section.closed[index]) this.line(this.dynamic, p, curve[(i + 1) % curve.length], COLORS.section, this.size * (selected ? 0.0065 : 0.005), true); });
            const proxy = new THREE.Line(new THREE.BufferGeometry().setFromPoints([...curve, ...(section.closed[index] ? [curve[0]] : [])].map(vector)), new THREE.LineBasicMaterial({ visible: false }));
            proxy.userData.id = c.id; this.dynamic.add(proxy); this.sectionTargets.push(proxy);
          }
        });
      } else if (c.kind === 'dihedral') {
        const angle = getDihedral(scene, points, c);
        if (angle.status === 'undefined') return;
        if ('points' in c) this.dihedralPlanes(scene, points, c.points);
        const radius = this.size * 0.43;
        const endA = add(angle.origin, scale(angle.rayA, radius)), endB = add(angle.origin, scale(angle.rayB, radius));
        if (!('points' in c)) this.line(this.dynamic, points.get(angle.edge[0])!, points.get(angle.edge[1])!, COLORS.angle, this.size * 0.007, true);
        this.line(this.dynamic, angle.origin, endA, COLORS.angle, this.size * 0.004, true);
        this.line(this.dynamic, angle.origin, endB, COLORS.angle, this.size * 0.004, true);
        if (angle.degrees > 0) {
          const curvePoints = Array.from({ length: 33 }, (_, i) => vector(angle.rayA).applyAxisAngle(vector(angle.normal), angle.degrees * Math.PI / 180 * i / 32).multiplyScalar(radius * 0.72).add(vector(angle.origin)));
          const arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePoints), 40, this.size * 0.0038, 6, false), new THREE.MeshBasicMaterial({ color: COLORS.angle, depthTest: false }));
          arc.renderOrder = 6; this.dynamic.add(arc);
        }
        if (scene.display.labels) {
          const labelPosition = vector(angle.rayA).applyAxisAngle(vector(angle.normal), angle.degrees * Math.PI / 360).multiplyScalar(radius * 1.18).add(vector(angle.origin));
          this.label(labelPosition.toArray() as Vec3, `${angle.degrees.toFixed(1)}°`, 'angle-label', false);
          this.pointLabels.push({ point: labelPosition.toArray() as Vec3, label: `${angle.degrees.toFixed(1)}°`, color: '#a76b22' });
        }
      }
    });
    this.needsRender = true;
  }

  capturePNG() {
    this.draw();
    const output = document.createElement('canvas');
    output.width = this.renderer.domElement.width;
    output.height = this.renderer.domElement.height;
    const context = output.getContext('2d')!;
    context.drawImage(this.renderer.domElement, 0, 0);
    const ratio = output.width / this.width;
    context.font = `italic ${22 * ratio}px Georgia, serif`;
    context.lineJoin = 'round'; context.lineWidth = 4 * ratio; context.strokeStyle = '#f5f8fb';
    this.pointLabels.forEach(({ point, label, color, dx = 8, dy = -7 }) => {
      const p = vector(point).project(this.camera);
      if (p.z < -1 || p.z > 1) return;
      const x = (p.x + 1) / 2 * output.width + dx * ratio, y = (1 - p.y) / 2 * output.height + dy * ratio;
      context.strokeText(label, x, y); context.fillStyle = color; context.fillText(label, x, y);
    });
    context.font = `${13 * ratio}px "Microsoft YaHei", sans-serif`;
    context.fillStyle = '#526b7b';
    context.fillText(this.current?.title ?? '空间几何工作室', 24 * ratio, 28 * ratio);
    return output.toDataURL('image/png');
  }

  dispose() {
    this.cancelDrag();
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown, true);
    this.renderer.domElement.removeEventListener('pointermove', this.pointerMove, true);
    this.renderer.domElement.removeEventListener('pointerup', this.pointerUp, true);
    this.renderer.domElement.removeEventListener('pointercancel', this.cancelDrag, true);
    this.renderer.domElement.removeEventListener('lostpointercapture', this.cancelDrag);
    window.removeEventListener('blur', this.cancelDrag);
    window.removeEventListener('keydown', this.cancelOnKey);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    disposeGroup(this.base); disposeGroup(this.dynamic);
    this.grid.geometry.dispose(); (this.grid.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.host.replaceChildren();
  }
}
