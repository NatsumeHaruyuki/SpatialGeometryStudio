import { parseScene, type Scene } from '../schema/scene';
import { length, resolvePoints, sub } from './engine';

/**
 * A compact v2 authoring example: every fixed point belongs to the question.
 * The fixture gives radius 1 and AD = AE = 2, so DO = sqrt(2² - 1²).
 * The chosen motion parameter is PO / DO = sqrt(6) / 6, measured from O.
 */
export function createQuestionConeInput(): unknown {
  const sqrt3 = Math.sqrt(3);
  return {
    schema_version: 2,
    title: '圆锥·题目点优先导入',
    solid: {
      type: 'cone',
      points: [
        { id: 'D', position: [0, sqrt3, 0] },
        { id: 'O', position: [0, 0, 0] },
        { id: 'A', position: [1, 0, 0] },
        { id: 'B', position: [-0.5, 0, sqrt3 / 2] },
        { id: 'C', position: [-0.5, 0, -sqrt3 / 2] },
        { id: 'E', position: [-1, 0, 0] },
      ],
      primitive: { kind: 'cone', apex: 'D', baseCenter: 'O', radiusPoint: 'A' },
    },
    constructions: [
      { kind: 'movingPoint', point: 'P', start: 'O', end: 'D', t: 0.408248290463863 },
      { kind: 'segment', a: 'A', b: 'E' },
      { kind: 'segment', a: 'A', b: 'B' },
      { kind: 'segment', a: 'B', b: 'C' },
      { kind: 'segment', a: 'C', b: 'A' },
      { kind: 'segment', a: 'P', b: 'A' },
      { kind: 'segment', a: 'P', b: 'B' },
      { kind: 'segment', a: 'P', b: 'C' },
      { kind: 'segment', a: 'P', b: 'E' },
      { kind: 'segment', a: 'P', b: 'O' },
      { kind: 'triangle', points: ['A', 'B', 'C'] },
    ],
  };
}

/** Normalized lesson with the original problem alongside its explicit geometry. */
export function createQuestionConeExample(): Scene {
  const scene = parseScene(createQuestionConeInput());
  scene.problem = {
    text: 'D 为圆锥顶点，O 为底面圆心，AE 为底面直径，AE=AD。△ABC 为底面内接正三角形，P 在线段 DO 上，PO=(√6/6)DO。',
    conditions: ['AE 为底面直径', 'AE=AD', '△ABC 为底面内接正三角形', 'P 在线段 DO 上，PO/DO=√6/6'],
    note: '将整体尺度归一化为底面半径1，由 OA=1、AD=AE=2 得 DO=√3。P 从 O 向 D 取参数 √6/6，是题设确定的比例。圆周方位可整体旋转，当前坐标为一组示意构型。',
  };
  return scene;
}

/** Actual distances from resolved coordinates, useful for checking this lesson. */
export function questionConeMeasurements(scene: Scene = createQuestionConeExample()) {
  const points = resolvePoints(scene);
  const distance = (a: string, b: string) => {
    const start = points.get(a), end = points.get(b);
    if (!start || !end) throw new Error(`圆锥示例缺少可用点：${!start ? a : b}`);
    return length(sub(end, start));
  };
  const DO = distance('D', 'O'), PO = distance('P', 'O');
  return {
    DO,
    AE: distance('A', 'E'),
    AD: distance('A', 'D'),
    AB: distance('A', 'B'),
    BC: distance('B', 'C'),
    CA: distance('C', 'A'),
    PO,
    poOverDo: PO / DO,
  };
}
