import { useRef, type PointerEvent } from 'react';
import { add, dot, length, scale, sub, type getSection } from '../geometry/engine';
import { roundFrame, type RoundPrimitive } from '../geometry/roundSolids';
import type { Vec3 } from '../schema/scene';
import { studioStore } from '../store/studio';

const radiansPerDegree = Math.PI / 180;
const displacementFormat = new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 5, useGrouping: false });
type SectionResult = ReturnType<typeof getSection>;
type SliderGesture = { id: number; recordNext: boolean };

function sectionPresets({ kind, height, radius }: RoundPrimitive) {
  const ellipseLimit = 35 * radiansPerDegree;
  if (kind === 'cylinder') {
    return [
      { label: '圆截面', radians: 0, distance: 0 },
      { label: '椭圆截面', radians: Math.min(ellipseLimit, 0.8 * Math.atan2(height, 2 * radius)), distance: 0 },
    ];
  }

  const critical = Math.atan2(height, radius);
  const ellipse = Math.min(ellipseLimit, 0.6 * critical);
  const hyperbola = Math.max(80 * radiansPerDegree, (critical + Math.PI / 2) / 2);
  const ellipseCap = height * Math.cos(ellipse) - radius * Math.sin(ellipse);
  // The opposite nappe of a double cone limits the offset for two visible branches.
  const hyperbolaCap = radius * Math.sin(hyperbola) - height * Math.cos(hyperbola);
  const minimumDistance = Math.min(radius, height) * 1e-6;
  const withinCap = (cap: number, fraction: number) => Math.min(0.5 * cap, Math.max(minimumDistance, fraction * cap));
  return [
    { label: '圆截面', radians: 0, distance: withinCap(height, 0.35) },
    { label: '椭圆截面', radians: ellipse, distance: withinCap(ellipseCap, 0.35) },
    { label: '抛物线截面', radians: critical, distance: withinCap(height * Math.cos(critical), 0.3) },
    { label: '双曲线截面', radians: hyperbola, distance: withinCap(hyperbolaCap, 0.35) },
  ];
}

export function RoundSectionControls({ primitive, section }: { primitive: RoundPrimitive; section?: SectionResult }) {
  const gesture = useRef<SliderGesture | null>(null);
  const { axis, u } = roundFrame(primitive);
  const cylinder = primitive.kind === 'cylinder';
  const center = cylinder ? add(primitive.origin, scale(axis, primitive.height / 2)) : primitive.origin;
  const presets = sectionPresets(primitive);
  const currentNormal = section?.status === 'defined' ? section.normal : axis;
  const normal = dot(currentNormal, axis) < 0 ? scale(currentNormal, -1) : currentNormal;
  const axialComponent = dot(normal, axis);
  const inclination = Math.atan2(length(sub(normal, scale(axis, axialComponent))), axialComponent) / radiansPerDegree;
  const displacement = section?.status === 'defined' ? dot(normal, sub(section.origin, center)) : presets[0].distance;
  const extent = Math.hypot(primitive.height, primitive.radius);
  const displacementStep = Number((extent / 100).toPrecision(1));
  const displacementLimit = displacementStep * Math.ceil(Math.max(1.15 * extent, Math.abs(displacement)) / displacementStep - 1e-10);

  function normalAt(theta: number) {
    const radial = sub(normal, scale(axis, dot(normal, axis)));
    const direction = length(radial) > 1e-8 ? scale(radial, 1 / length(radial)) : u;
    return add(scale(axis, Math.cos(theta)), scale(direction, Math.sin(theta)));
  }

  function setPlane(direction: Vec3, distance: number, slider = false) {
    const active = slider ? gesture.current : null;
    const changed = studioStore.getState().setTeachingPlane(add(center, scale(direction, distance)), direction, active?.recordNext ?? true);
    if (changed && active) active.recordNext = false;
  }

  function beginGesture(event: PointerEvent<HTMLInputElement>) {
    if (event.button !== 0 || gesture.current) return;
    gesture.current = { id: event.pointerId, recordNext: true };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function endGesture(event: PointerEvent<HTMLInputElement>) {
    if (gesture.current?.id === event.pointerId) gesture.current = null;
  }

  return <section className="round-section-controls" aria-label="旋转体截面">
    <h3>旋转体截面</h3>
    <div className="round-section-presets">
      {presets.map(preset => <button className="button" type="button" key={preset.label} onClick={() => setPlane(normalAt(preset.radians), preset.distance)}>{preset.label}</button>)}
    </div>
    <label className="round-section-range">
      <span>截平面倾角 <output>{inclination.toFixed(1)}°</output></span>
      <input aria-label="截平面倾角" type="range" min={0} max={90} step={0.1} value={Number(inclination.toFixed(1))}
        onPointerDown={beginGesture} onPointerUp={endGesture} onPointerCancel={endGesture} onLostPointerCapture={endGesture}
        onChange={e => setPlane(normalAt(Number(e.target.value) * radiansPerDegree), displacement, true)} />
    </label>
    <label className="round-section-range">
      <span>截平面法向位移 <output>{displacementFormat.format(Math.abs(displacement) < 1e-12 ? 0 : displacement)}</output></span>
      <input aria-label="截平面法向位移" type="range" min={-displacementLimit} max={displacementLimit} step={displacementStep} value={displacement}
        onPointerDown={beginGesture} onPointerUp={endGesture} onPointerCancel={endGesture} onLostPointerCapture={endGesture}
        onChange={e => setPlane(normal, Number(e.target.value), true)} />
    </label>
    <p className="round-section-result">当前交线 <strong>{section?.kind ?? '尚未创建截面'}</strong></p>
    <p className="hint">模型高度有限，开放曲线会在模型边界截断。</p>
  </section>;
}
