import { roundControlPoints, type RoundPrimitive } from '../geometry/roundSolids';
import { deriveQuestionPrimitive, type QuestionSolidDefinition } from '../geometry/questionPrimitive';

const maxProjectBytes = 2 * 1024 * 1024;
type InputObject = Record<string, unknown>;
type Vector = [number, number, number];
const owns = (object: InputObject, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = (value: unknown): value is InputObject => value !== null && typeof value === 'object' && !Array.isArray(value);
const isRoundKind = (value: unknown): value is RoundPrimitive['kind'] => value === 'cone' || value === 'cylinder' || value === 'doubleCone';

function fillMissing(object: InputObject, defaults: InputObject): InputObject {
  const filled = { ...object };
  for (const [key, value] of Object.entries(defaults)) if (!owns(object, key)) filled[key] = value;
  return filled;
}

function validPosition(value: unknown): value is Vector {
  return Array.isArray(value) && value.length === 3 && value.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 10000);
}

function jsonDocument(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  return fence ? fence[1] : trimmed;
}

function htmlTransport(text: string): string {
  const named: Record<string, string> = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>' };
  return text.replace(/&(?:quot|apos|amp|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const name = entity.slice(1, -1).toLowerCase();
    if (name[0] !== '#') return named[name];
    const code = name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : entity;
  });
}

function htmlOutsideStrings(text: string): string {
  return text.replace(/"(?:\\[\s\S]|[^"\\])*"|&(?:quot|apos|amp|lt|gt|#\d+|#x[\da-f]+);/gi, token => {
    if (token[0] === '"') return token;
    const decoded = htmlTransport(token);
    // Quote delimiters require a wholly HTML-encoded document, checked below.
    return decoded === '"' ? token : decoded;
  });
}

function continuationTransport(text: string): string {
  let result = '', quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '\\' && (text[i + 1] === '\n' || text[i + 1] === '\r' && text[i + 2] === '\n')) {
      // Keep whitespace so an invalid split token cannot become valid JSON.
      result += '\n';
      i += text[i + 1] === '\r' ? 2 : 1;
    } else {
      result += char;
      if (char === '"') quoted = true;
    }
  }
  return result;
}

function parseDocument(text: string): unknown {
  if (new TextEncoder().encode(text).length > maxProjectBytes) throw new Error('项目文件不能超过 2 MB');
  const document = jsonDocument(text);
  try { return JSON.parse(document); } catch { /* Try known copy/transport artifacts once. */ }
  const continued = continuationTransport(document);
  try { return JSON.parse(continued); } catch { /* Preserve literal entities if this repair suffices. */ }
  const outsideOnly = jsonDocument(continuationTransport(htmlOutsideStrings(continued)));
  try { return JSON.parse(outsideOnly); } catch { /* Encoded indentation may accompany raw-quoted JSON. */ }
  if (!continued.includes('"') && /&(?:quot|#0*34|#x0*22);/i.test(continued)) {
    const encodedDocument = jsonDocument(continuationTransport(htmlTransport(continued)));
    try { return JSON.parse(encodedDocument); } catch { /* No other repairs are safe to infer. */ }
  }
  throw new Error('项目文件不是有效的 JSON');
}

export function decodeSceneInput(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const decoded = parseDocument(input);
  return typeof decoded === 'string' ? parseDocument(decoded) : decoded;
}

function referencePrimitive(value: unknown): value is InputObject {
  if (!isObject(value) || !isRoundKind(value.kind)) return false;
  const references = value.kind === 'cylinder' ? ['baseCenter', 'topCenter', 'radiusPoint'] : ['apex', 'baseCenter', 'radiusPoint'];
  return references.some(key => owns(value, key));
}

function declaredIds(scene: InputObject): Set<string> {
  const ids = new Set<string>();
  const add = (value: unknown) => { if (typeof value === 'string') ids.add(value); };
  add(scene.id);
  if (isObject(scene.solid)) {
    add(scene.solid.id);
    for (const key of ['points', 'edges', 'faces']) {
      const items = scene.solid[key];
      if (Array.isArray(items)) for (const item of items) if (isObject(item)) add(item.id);
    }
  }
  if (Array.isArray(scene.constructions)) for (const item of scene.constructions) if (isObject(item)) {
    add(item.id); add(item.point); add(item.centerPoint);
  }
  return ids;
}

function normalizeConstructions(items: unknown[], used: Set<string>): unknown[] {
  let next = 1;
  const pointOutputs = new Set(['point', 'midpoint', 'movingPoint', 'perpendicular', 'pointPlaneDistance']);
  return items.map(item => {
    if (!isObject(item)) return item;
    const construction = { ...item };
    if (!owns(item, 'id')) {
      while (used.has(`c${next}`)) next++;
      construction.id = `c${next++}`;
      used.add(construction.id as string);
    }
    if (typeof item.kind === 'string' && pointOutputs.has(item.kind) && typeof item.point === 'string' && !owns(item, 'label')) {
      construction.label = item.point;
    }
    if ((item.kind === 'circumsphere' || item.kind === 'insphere') && typeof item.centerPoint === 'string' && !owns(item, 'centerLabel')) {
      construction.centerLabel = item.centerPoint;
    }
    return construction;
  });
}

/** Full circular bounds; control handles alone do not cover both radial sides. */
function primitiveBounds(value: unknown): [Vector, Vector] | undefined {
  if (!isObject(value) || !isRoundKind(value.kind) || !validPosition(value.origin) || !validPosition(value.axis)
    || typeof value.radius !== 'number' || typeof value.height !== 'number') return;
  try { roundControlPoints(value as unknown as RoundPrimitive); } catch { return; }
  const magnitude = Math.hypot(...value.axis);
  const low: Vector = [0, 0, 0], high: Vector = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const axial = value.axis[i] / magnitude;
    const extent = value.radius * Math.sqrt(Math.max(0, 1 - axial * axial));
    const end = value.origin[i] + axial * value.height;
    if (value.kind === 'cylinder') {
      low[i] = Math.min(value.origin[i], end) - extent;
      high[i] = Math.max(value.origin[i], end) + extent;
    } else if (value.kind === 'cone') {
      low[i] = Math.min(value.origin[i], end - extent);
      high[i] = Math.max(value.origin[i], end + extent);
    } else {
      low[i] = value.origin[i] - Math.abs(axial * value.height) - extent;
      high[i] = value.origin[i] + Math.abs(axial * value.height) + extent;
    }
  }
  return [low, high];
}

function definitionPrimitive(solid: InputObject): RoundPrimitive | undefined {
  if (!referencePrimitive(solid.definition) || !Array.isArray(solid.points)) return;
  const points = solid.points.flatMap(point => isObject(point) && typeof point.id === 'string' && validPosition(point.position)
    ? [{ id: point.id, label: typeof point.label === 'string' ? point.label : point.id, position: point.position }] : []);
  try { return deriveQuestionPrimitive(solid.definition as unknown as QuestionSolidDefinition, points); }
  catch { return; } // The main validator reports invalid references and geometry.
}

function fittedView(scene: InputObject): { position: Vector; target: Vector } {
  const low: Vector = [Infinity, Infinity, Infinity], high: Vector = [-Infinity, -Infinity, -Infinity];
  let hasBounds = false;
  const include = (position: Vector) => {
    if (!position.every(Number.isFinite)) return;
    hasBounds = true;
    for (let i = 0; i < 3; i++) { low[i] = Math.min(low[i], position[i]); high[i] = Math.max(high[i], position[i]); }
  };
  if (isObject(scene.solid)) {
    if (Array.isArray(scene.solid.points)) for (const point of scene.solid.points) {
      if (isObject(point) && validPosition(point.position)) include(point.position);
    }
    const bounds = primitiveBounds(definitionPrimitive(scene.solid) ?? scene.solid.primitive);
    if (bounds) bounds.forEach(include);
  }
  if (Array.isArray(scene.constructions)) for (const construction of scene.constructions) {
    if (isObject(construction) && construction.kind === 'point' && validPosition(construction.position)) include(construction.position);
  }
  const target: Vector = hasBounds ? [0, 1, 2].map(i => (low[i] + high[i]) / 2) as Vector : [0, 0, 0];
  const diagonal = hasBounds ? Math.hypot(high[0] - low[0], high[1] - low[1], high[2] - low[2]) : 4;
  const radius = diagonal > 0 ? Math.max(diagonal / 2, 0.0001) : 1;
  const position = target.map((x, i) => Math.max(-1e6, Math.min(1e6, x + [2, 1.5, 2.5][i] * radius))) as Vector;
  return { position, target };
}

/** Supply authoring defaults without masking values that the strict schema must reject. */
export function normalizeSceneV2(input: unknown): unknown {
  if (!isObject(input) || input.schema_version !== 2) return input;
  const scene = fillMissing(input, { id: 'imported-scene', title: '导入模型', problem: {}, constructions: [], display: {}, view: {}, uncertainties: [] });
  if (isObject(scene.problem)) scene.problem = fillMissing(scene.problem, { text: '', conditions: [], note: '' });
  if (isObject(scene.solid)) {
    const solid = fillMissing(scene.solid, { id: 'model', points: [], edges: [], faces: [] });
    if (referencePrimitive(solid.primitive) && !owns(solid, 'definition')) {
      solid.definition = { ...solid.primitive };
      delete solid.primitive;
    }
    if (!owns(solid, 'type')) {
      const kind = isObject(solid.primitive) ? solid.primitive.kind : isObject(solid.definition) ? solid.definition.kind : undefined;
      solid.type = typeof kind === 'string' ? kind : Array.isArray(solid.faces) && solid.faces.length ? 'polyhedron' : 'diagram';
    }
    if (Array.isArray(solid.points)) solid.points = solid.points.map(point =>
      isObject(point) && typeof point.id === 'string' ? fillMissing(point, { label: point.id }) : point);
    scene.solid = solid;
  }
  if (Array.isArray(scene.constructions)) scene.constructions = normalizeConstructions(scene.constructions, declaredIds(scene));
  if (isObject(scene.display)) scene.display = fillMissing(scene.display, { grid: false, labels: true, faces: false, sectionPlane: false, hiddenEdges: true });
  if (isObject(scene.view)) scene.view = fillMissing(scene.view, fittedView(scene));
  return scene;
}
