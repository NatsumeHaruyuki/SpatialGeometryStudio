# SGS 精简工作上下文

## 约束

- 实际项目：D:/OpenAi/Project/SpatialGeometryStudio/SpatialGeometryStudio（外层还有原需求reamde.md及样题材料）。
- 所有开发留在SpatialGeometryStudio内。任何新软件装在D:/DevDep下的camelCase独立目录；本轮没有新安装。
- 当前只提供Windows v0.2 sample。用户明确要求试用确认后再打包；不得自行运行package:win/release.mjs。旧EXE/ZIP和用户数据保留。
- 用户授权修改导入协议、内置Prompt与绘图实现，实现“题图→外部多模态LLM→JSON→SGS”。

## 已完成

1. 顶点拖动、Alt截面平移、高中模型库（三/四棱柱、三/四棱锥、圆柱、单/双圆锥）、四类圆锥曲线、JSON一键复制Prompt。
2. 用户确认球工具用4个不共面点构成四面体；外接球/内切球、球心/半径、可选球心、依赖退化隐藏恢复。
3. 作垂线及可选垂足、精确三角形高亮、三点角（第二点顶点）、点面距离（单位法向量n、连接向量v、射影直角三角形）。保存/撤销/级联删除/PNG正常。
4. 删除AI待接入、离线说明、试样字样，界面版本Windows v0.2。
5. 最新：题目点优先的JSON协议2。旋转体不再自动生成O/T/A/B/C占用字母，solid.points是题目明确坐标；点引用primitive定义模型。旧协议1保留原控制点语义。

## 新协议要点

- 简洁圆锥：schema_version:2，solid.points声明D/O/A/B/C/E；primitive={kind:cone,apex:D,baseCenter:O,radiusPoint:A}。实际JSON值为字符串。
- 圆柱引用baseCenter/topCenter/radiusPoint；双圆锥引用apex/baseCenter/radiusPoint。
- 规范化后保存solid.definition及计算出的数值primitive，重开不插入隐式点。
- 可省略ID/label、problem/display/view、空集合等非必要字段；补默认值并拟合完整解析体视角。
- kind:point声明其他固定点；diagram支持不闭合的点线图。闭合多面体仍检查真实拓扑。
- 支持单个JSON代码围栏、一次字符串包装、常见HTML缩进及反斜杠续行；保留合法字符串内容，不执行输入。
- 冲突/缺失/循环指出具体ID及位置。JSON窗口“一键复制修复请求”复制错误＋原JSON＋完整Prompt，供外部模型修复。SGS未调用外部AI服务。

## 用户圆锥题

- D=(0,√3,0)，O=(0,0,0)，A=(1,0,0)，B/C=(-1/2,0,±√3/2)，E=(-1,0,0)。P从O到D取t=√6/6。
- 验证AE=AD=2，AB=BC=CA=√3，PO/DO=√6/6。
- 原用户JSON的A/B/C与旧自动控制点冲突，D未定义，A↔B及E↔C循环；没有静默猜修原错误数据，已提供正确协议2示例。

## 入口与关键文件

- Windows v0.2.cmd → scripts/run-sample.ps1：使用现有Electron启动dist，无开发服务器。数据独立于旧发布包，放sample/Windows v0.2。
- 更新后用户应先保存并关闭旧窗口，再重开sample、重新复制Prompt；旧运行窗口可能仍载入旧JS。
- examples/questionConeV2.json：可粘贴的简洁输入；questionConeV2.gscene：含题干的完整圆锥模型。
- examples/studyProjection.gscene、chordRightTriangle.gscene：球心/射影与真实球弦垂径定理示例。
- prompts/multimodalToGsceneV1.txt：保留路径供IPC，内容已是协议2。
- src/schema/importInput.ts：安全解码和v2规范化；scene.ts：统一校验；importRepair.ts：复制修复请求。
- src/geometry/questionPrimitive.ts：点引用模型及保形编辑；questionExamples.ts：圆锥例。
- docs/validation-question-first-import.md：最新完整验收记录。

## 最新验证

- npm test：16文件、211项通过。
- TypeScript/Vite/Electron构建通过；npm run test:e2e：50组实际Chrome/Electron交互通过。
- 真实JSON/原生中文路径文件保存重开、Prompt/修复请求剪贴板全文、PNG、旧功能兼容通过。
- 独立复查4项Important已按RED→GREEN修复：独立点编辑循环、引用模型默认视角裁圆、小尺寸模型相机限制、续行修复误改字符串实体。
- .qa/question-import/Windows-v0.2-cone.png及题目圆锥.png为实际渲染证据。
- 开发命令先执行 . .\scripts\environment.ps1；无新依赖。Vite约1MB模块提示仍在，不影响本地sample。

## 当前待办

等待用户试用反馈；没有未完成的已授权开发项。只有用户明确确认后才打包。不要重做已通过的功能或自动更新全局记忆。
