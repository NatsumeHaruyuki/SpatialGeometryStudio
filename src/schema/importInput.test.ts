import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { decodeSceneInput, normalizeSceneV2 } from './importInput';

describe('scene input transport decoding', () => {
  it('accepts JSON with a BOM and one complete fenced JSON block', () => {
    expect(decodeSceneInput('\uFEFF {"schema_version":2,"title":"圆锥"}')).toEqual({ schema_version: 2, title: '圆锥' });
    expect(decodeSceneInput('  ```json\r\n{"schema_version":2}\r\n```  ')).toEqual({ schema_version: 2 });
  });

  it('unwraps one JSON-string-wrapped JSON document', () => {
    expect(decodeSceneInput(JSON.stringify('{"schema_version":2,"title":"圆锥"}'))).toEqual({ schema_version: 2, title: '圆锥' });
    expect(decodeSceneInput(JSON.stringify('```json\n{"schema_version":2}\n```'))).toEqual({ schema_version: 2 });
  });

  it('does not recursively unwrap multiple JSON string layers', () => {
    const twiceWrapped = JSON.stringify(JSON.stringify('{"schema_version":2}'));
    expect(decodeSceneInput(twiceWrapped)).toBe('{"schema_version":2}');
  });

  it('preserves valid JSON string contents before considering transport repairs', () => {
    const scene = { title: '&quot;A&quot; &amp; B', problem: { text: 'x \\ y\n```json\n', note: '&#x41;' } };
    expect(decodeSceneInput(JSON.stringify(scene))).toEqual(scene);
    expect(decodeSceneInput(JSON.stringify(JSON.stringify(scene)))).toEqual(scene);
  });

  it('decodes HTML entities only when ordinary JSON parsing fails', () => {
    expect(decodeSceneInput('{&quot;schema_version&quot;:2,&quot;title&quot;:&quot;A &amp; B&quot;}'))
      .toEqual({ schema_version: 2, title: 'A & B' });
    expect(decodeSceneInput('{&#34;schema_version&#34;:2,&#x22;title&#x22;:&#34;D&#34;}'))
      .toEqual({ schema_version: 2, title: 'D' });
  });

  it('removes backslash-newline transport continuations outside JSON strings', () => {
    const input = '{' + '\\' + '\r\n"schema_version":2,' + '\\' + '\n"title":"D"}';
    expect(decodeSceneInput(input)).toEqual({ schema_version: 2, title: 'D' });
  });

  it('preserves literal string entities when only a continuation needs repairing', () => {
    expect(decodeSceneInput('{"title":"Keep &amp; text",' + '\\' + '\n"schema_version":2}'))
      .toEqual({ title: 'Keep &amp; text', schema_version: 2 });
    const input = '{' + '\\' + '\n"title":"Keep &amp; text","note":"Keep &quot;A&quot; and &#x20; literal"}';
    expect(decodeSceneInput(input)).toEqual({ title: 'Keep &amp; text', note: 'Keep &quot;A&quot; and &#x20; literal' });
  });

  it('repairs encoded indentation and continuations without decoding raw-quoted content', () => {
    const input = '{' + '\\' + '\n&#x20;"schema_version":2,' + '\\' + '\n&#32;"title":"Keep &amp; &quot; &#x20; text"}';
    expect(decodeSceneInput(input)).toEqual({ schema_version: 2, title: 'Keep &amp; &quot; &#x20; text' });
    expect(decodeSceneInput('&#x20;{"title":"Keep &#32; and &amp; literal"}&#10;'))
      .toEqual({ title: 'Keep &#32; and &amp; literal' });
  });

  it('decodes an entirely HTML-encoded document once, including content entities', () => {
    const input = '{&quot;title&quot;:&quot;Keep &amp;amp; text and &amp;quot;literal&amp;quot;&quot;}';
    expect(decodeSceneInput(input)).toEqual({ title: 'Keep &amp; text and &quot;literal&quot;' });
  });

  it('does not use literal string entities to repair malformed raw-quoted JSON', () => {
    expect(() => decodeSceneInput('{"title":&quot;not a fully encoded document&quot;}')).toThrow(/JSON/);
  });

  it('combines HTML and continuation repairs in a fenced document', () => {
    const input = '```json\n{' + '\\' + '\n&quot;schema_version&quot;:2}\n```';
    expect(decodeSceneInput(input)).toEqual({ schema_version: 2 });
  });

  it.each([
    'Here is the JSON:\n{"schema_version":2}',
    '```json\n{"schema_version":2}\n```\n```json\n{}\n```',
    '{"schema_version":2,}',
    '{schema_version:2}',
    '{"schema_version":2 /* comment */}',
    '(function(){ return {"schema_version":2}; })()',
    '{"title":"broken' + '\\' + '\nstring"}',
    '{"title":"unescaped\nnewline"}',
  ])('rejects ambiguous or invalid input without guessing a repair: %s', input => {
    expect(() => decodeSceneInput(input)).toThrow(/JSON/);
  });

  it('enforces the 2 MB byte limit before parsing transport wrappers', () => {
    const oversized = JSON.stringify({ text: '汉'.repeat(700_000) });
    expect(() => decodeSceneInput(oversized)).toThrow(/2 MB/);
  });

  it('passes non-string values to the validator unchanged', () => {
    const input = Object.freeze({ schema_version: 2 });
    expect(decodeSceneInput(input)).toBe(input);
    expect(decodeSceneInput(null)).toBe(null);
    expect(decodeSceneInput(2)).toBe(2);
  });
});

describe('question-owned v2 normalization', () => {
  it('leaves all other schema versions untouched', () => {
    const legacy = { schema_version: 1, title: '旧文件' };
    expect(normalizeSceneV2(legacy)).toBe(legacy);
    expect(normalizeSceneV2({ schema_version: '2' })).toEqual({ schema_version: '2' });
    expect(normalizeSceneV2(null)).toBe(null);
  });

  it('fills omitted authoring fields without inventing question points', () => {
    expect(normalizeSceneV2({ schema_version: 2, solid: {} })).toMatchObject({
      schema_version: 2, id: 'imported-scene', title: '导入模型',
      problem: { text: '', conditions: [], note: '' },
      solid: { id: 'model', type: 'diagram', points: [], edges: [], faces: [] },
      constructions: [], uncertainties: [],
      display: { grid: false, labels: true, faces: false, sectionPlane: false, hiddenEdges: true },
    });
  });

  it.each([
    { kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' },
    { kind: 'doubleCone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' },
    { kind: 'cylinder', baseCenter: 'D', topCenter: 'O', radiusPoint: 'A' },
  ])('moves a $kind reference primitive into a persistent definition', primitive => {
    const input = { schema_version: 2, solid: { primitive, points: [
      { id: 'D', position: [0, 2, 0] }, { id: 'O', position: [0, 0, 0] }, { id: 'A', position: [1, 0, 0] },
    ] } };
    const normalized = normalizeSceneV2(input);
    expect(normalized).toMatchObject({ solid: { type: primitive.kind, definition: primitive, points: [
      { id: 'D', label: 'D', position: [0, 2, 0] }, { id: 'O', label: 'O', position: [0, 0, 0] },
      { id: 'A', label: 'A', position: [1, 0, 0] },
    ] } });
    expect(normalized).not.toHaveProperty('solid.primitive');
    expect(input.solid).toHaveProperty('primitive', primitive);
    expect(input.solid.points[0]).not.toHaveProperty('label');
  });

  it('leaves canonical definitions and numeric primitives unchanged on reopen', () => {
    const canonical = {
      schema_version: 2, id: 'cone', title: 'D-O-A', problem: { text: '', conditions: [], note: '' },
      solid: {
        id: 'model', type: 'cone', points: [
          { id: 'D', label: '顶点', position: [0, 2, 0] }, { id: 'O', label: 'O', position: [0, 0, 0] },
          { id: 'A', label: 'A', position: [1, 0, 0] },
        ], edges: [], faces: [], definition: { kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' },
        primitive: { kind: 'cone', origin: [0, 2, 0], axis: [0, -1, 0], radius: 1, height: 2, radial: [1, 0, 0] },
      },
      constructions: [], uncertainties: [],
      display: { grid: false, labels: true, faces: false, sectionPlane: false, hiddenEdges: true },
      view: { position: [4, 3, 5], target: [0, 1, 0] },
    };
    expect(normalizeSceneV2(JSON.parse(JSON.stringify(canonical)))).toEqual(canonical);
  });

  it('infers diagram, polyhedron and definition types without replacing explicit types', () => {
    expect(normalizeSceneV2({ schema_version: 2, solid: { faces: [{ id: 'base', vertices: ['A', 'B', 'C'] }] } }))
      .toMatchObject({ solid: { type: 'polyhedron' } });
    expect(normalizeSceneV2({ schema_version: 2, solid: { definition: { kind: 'cylinder' } } }))
      .toMatchObject({ solid: { type: 'cylinder' } });
    expect(normalizeSceneV2({ schema_version: 2, solid: { type: 'custom' } }))
      .toMatchObject({ solid: { type: 'custom' } });
  });

  it('assigns construction IDs after reserving all declared IDs, including later declarations', () => {
    const normalized = normalizeSceneV2({ schema_version: 2, id: 'c3', solid: {
      points: [{ id: 'c2', position: [0, 0, 0] }],
    }, constructions: [
      { kind: 'midpoint', point: 'M', a: 'A', b: 'B' },
      { id: 'c1', kind: 'segment', a: 'A', b: 'B' },
      { kind: 'point', point: 'c5', position: [1, 2, 3] },
      { kind: 'segment', a: 'A', b: 'B' },
    ] });
    expect(normalized).toMatchObject({ constructions: [
      { id: 'c4', kind: 'midpoint', point: 'M', label: 'M' },
      { id: 'c1', kind: 'segment' }, { id: 'c6', kind: 'point', point: 'c5', label: 'c5' },
      { id: 'c7', kind: 'segment' },
    ] });
  });

  it('defaults output labels for named points and sphere centers', () => {
    expect(normalizeSceneV2({ schema_version: 2, solid: {}, constructions: [
      { kind: 'movingPoint', point: 'P', start: 'O', end: 'D', t: 0.4 },
      { kind: 'perpendicular', point: 'H', from: 'P', line: ['A', 'B'] },
      { kind: 'pointPlaneDistance', point: 'K', from: 'P', plane: ['A', 'B', 'C'] },
      { kind: 'insphere', points: ['A', 'B', 'C', 'D'], centerPoint: 'I' },
    ] })).toMatchObject({ constructions: [
      { point: 'P', label: 'P' }, { point: 'H', label: 'H' }, { point: 'K', label: 'K' },
      { centerPoint: 'I', centerLabel: 'I' },
    ] });
  });

  it('fills partial display and problem objects while preserving explicit fields', () => {
    expect(normalizeSceneV2({ schema_version: 2, title: '问题', solid: {},
      problem: { text: '已知 AD=2', note: '保持原文' }, display: { labels: false, grid: true },
    })).toMatchObject({ title: '问题', problem: { text: '已知 AD=2', conditions: [], note: '保持原文' },
      display: { grid: true, labels: false, faces: false, sectionPlane: false, hiddenEdges: true },
    });
  });

  it('preserves unknown keys and invalid explicit values for strict downstream validation', () => {
    const normalized = normalizeSceneV2({ schema_version: 2, id: null, title: undefined, extra: 'typo',
      problem: { text: null, conditions: 'invalid', note: 4, typo: true },
      solid: { id: '', type: null, points: [{ id: 'A', label: '', position: [0, 0, 0], typo: 1 }], edges: null, faces: false, typo: 'solid' },
      constructions: [{ id: null, kind: 'point', point: 'P', label: null, position: null, typo: true }],
      display: { grid: null, labels: 1, typo: false }, view: { position: null, target: [0, 0, 0], typo: 2 }, uncertainties: null,
    });
    expect(normalized).toMatchObject({ id: null, title: undefined, extra: 'typo',
      problem: { text: null, conditions: 'invalid', note: 4, typo: true },
      solid: { id: '', type: null, points: [{ id: 'A', label: '', typo: 1 }], edges: null, faces: false, typo: 'solid' },
      constructions: [{ id: null, label: null, position: null, typo: true }],
      display: { grid: null, labels: 1, typo: false }, view: { position: null, target: [0, 0, 0], typo: 2 }, uncertainties: null,
    });
    expect(normalized).toHaveProperty('title', undefined);
  });

  it.each([null, [], 'invalid', 42])('does not replace a malformed solid or other container: %s', value => {
    expect(normalizeSceneV2({ schema_version: 2, solid: value, problem: value, constructions: value, display: value, view: value }))
      .toMatchObject({ solid: value, problem: value, constructions: value, display: value, view: value });
  });

  it('does not hide a missing solid or conflicting primitive definitions', () => {
    expect(normalizeSceneV2({ schema_version: 2 })).not.toHaveProperty('solid');
    const primitive = { kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' };
    expect(normalizeSceneV2({ schema_version: 2, solid: { definition: null, primitive } }))
      .toMatchObject({ solid: { definition: null, primitive } });
    expect(normalizeSceneV2({ schema_version: 2, solid: { primitive: { ...primitive, orgin: [0, 0, 0] } } }))
      .toMatchObject({ solid: { definition: { ...primitive, orgin: [0, 0, 0] } } });
  });

  it('does not mutate frozen authoring input', () => {
    const point = Object.freeze({ id: 'D', position: Object.freeze([0, 2, 0]) });
    const primitive = Object.freeze({ kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' });
    const input = Object.freeze({ schema_version: 2, solid: Object.freeze({ points: Object.freeze([point]), primitive }),
      constructions: Object.freeze([Object.freeze({ kind: 'point', point: 'P', position: Object.freeze([1, 2, 3]) })]),
    });
    expect(normalizeSceneV2(input)).toMatchObject({ solid: { definition: primitive, points: [{ id: 'D', label: 'D' }] },
      constructions: [{ id: 'c1', label: 'P' }],
    });
    expect(input).not.toHaveProperty('id');
    expect(input.solid).toHaveProperty('primitive', primitive);
    expect(point).not.toHaveProperty('label');
  });
});

describe('v2 default view fitting', () => {
  type WithView = { view: { position: number[]; target: number[] } };

  it.each([10, 1])('frames the complete radius-%s reference cone in the actual perspective camera', radius => {
    const normalized = normalizeSceneV2({ schema_version: 2, solid: {
      points: [{ id: 'D', position: [0, 1, 0] }, { id: 'O', position: [0, 0, 0] }, { id: 'A', position: [radius, 0, 0] }],
      primitive: { kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' },
    } }) as WithView;
    const camera = new PerspectiveCamera(34, 1, 1e-8, 1e6);
    camera.position.fromArray(normalized.view.position);
    camera.lookAt(new Vector3().fromArray(normalized.view.target));
    camera.updateMatrixWorld(true);
    const samples = [new Vector3(0, 1, 0), ...Array.from({ length: 128 }, (_, i) => {
      const angle = 2 * Math.PI * i / 128;
      return new Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle));
    })];
    for (const sample of samples) {
      const projected = sample.project(camera);
      expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
      expect(projected.z).toBeGreaterThanOrEqual(-1);
      expect(projected.z).toBeLessThanOrEqual(1);
    }
  });

  it('uses full reference bounds for partial views while preserving each explicit coordinate', () => {
    const solid = {
      points: [{ id: 'D', position: [0, 1, 0] }, { id: 'O', position: [0, 0, 0] }, { id: 'A', position: [10, 0, 0] }],
      definition: { kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' },
    };
    expect(normalizeSceneV2({ schema_version: 2, solid, view: { position: [40, 30, 50] } }))
      .toMatchObject({ view: { position: [40, 30, 50], target: [0, 0.5, 0] } });
    expect(normalizeSceneV2({ schema_version: 2, solid, view: { target: [20, 30, 40] } }))
      .toMatchObject({ view: { target: [20, 30, 40] } });
  });

  it('leaves invalid reference geometry for the main validator without failing view defaults', () => {
    const definition = { kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' };
    const solid = { definition, points: [{ id: 'D', position: [0, 1, 0] }, { id: 'O', position: [0, 0, 0] }] };
    const normalized = normalizeSceneV2({ schema_version: 2, solid }) as WithView;
    expect(normalized).toMatchObject({ solid: { definition } });
    expect([...normalized.view.position, ...normalized.view.target].every(Number.isFinite)).toBe(true);
  });

  it('targets the bounds of arbitrary question points and additional static points', () => {
    const normalized = normalizeSceneV2({ schema_version: 2, solid: { points: [
      { id: 'Q', position: [10, -2, 0] }, { id: 'D', position: [14, 2, 4] },
    ] }, constructions: [{ kind: 'point', point: 'P', position: [20, 0, 0] }] }) as WithView;
    expect(normalized.view.target).toEqual([15, 0, 2]);
    const offset = normalized.view.position.map((x, i) => x - normalized.view.target[i]);
    expect(Math.hypot(...offset)).toBeGreaterThan(12);
  });

  it.each([
    { kind: 'cylinder', origin: [10, 20, 30], axis: [0, 1, 0], radius: 2, height: 4, target: [10, 22, 30] },
    { kind: 'cone', origin: [0, 0, 0], axis: [0, 1, 0], radius: 2, height: 4, target: [0, 2, 0] },
    { kind: 'doubleCone', origin: [0, 0, 0], axis: [0, 1, 0], radius: 2, height: 4, target: [0, 0, 0] },
    { kind: 'cylinder', origin: [0, 0, 0], axis: [0, -1, 0], radius: 1, height: 4, target: [0, -2, 0] },
    { kind: 'cylinder', origin: [0, 0, 0], axis: [1, 1, 0], radius: 1, height: 2 * Math.SQRT2, target: [1, 1, 0] },
  ])('fits a numeric $kind without adding control handles to solid.points', ({ target, ...primitive }) => {
    const normalized = normalizeSceneV2({ schema_version: 2, solid: { primitive } });
    expect(normalized).toMatchObject({ solid: { primitive, points: [] } });
    const view = (normalized as WithView).view;
    view.target.forEach((value, index) => expect(value).toBeCloseTo(target[index], 10));
    expect(Math.hypot(...view.position.map((x, i) => x - target[i]))).toBeGreaterThan(4);
  });

  it('preserves explicit view coordinates, including partial views', () => {
    const input = { schema_version: 2, solid: { points: [{ id: 'D', position: [2, 4, 6] }] }, view: { position: [8, 9, 10] } };
    expect(normalizeSceneV2(input)).toMatchObject({ view: { position: [8, 9, 10], target: [2, 4, 6] } });
    expect(normalizeSceneV2({ ...input, view: { target: [101, 102, 103] } })).toMatchObject({ view: { target: [101, 102, 103] } });
  });

  it('keeps generated views finite and bounded even when invalid geometry must later be rejected', () => {
    const inputs = [
      { points: [] },
      { points: [{ id: 'tinyA', position: [0, 0, 0] }, { id: 'tinyB', position: [0.0001, 0.0001, 0] }] },
      { points: [{ id: 'A', position: [-10000, -10000, -10000] }, { id: 'B', position: [10000, 10000, 10000] }] },
      { points: [{ id: 'bad', position: [Infinity, 1e300, NaN] }], primitive: { kind: 'cone', origin: null, axis: [], radius: 1e300, height: 0 } },
    ];
    for (const solid of inputs) {
      const { view } = normalizeSceneV2({ schema_version: 2, solid }) as WithView;
      expect([...view.position, ...view.target].every(x => Number.isFinite(x) && Math.abs(x) <= 1e6)).toBe(true);
      expect(Math.hypot(...view.position.map((x, i) => x - view.target[i]))).toBeGreaterThan(1e-7);
    }
  });
});
