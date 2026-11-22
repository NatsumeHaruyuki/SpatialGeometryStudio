# 教学工具进度 · 2026-11-21

2026-11-22最新：完成题目点优先的协议2导入与新版Prompt。旋转体不占题目字母，支持显式坐标/点引用几何、常见粘贴包装、具体诊断和修复请求复制；旧协议兼容。211项单元、50组交互、原题圆锥数学核对、原生文件和PNG通过。新例questionConeV2.json/.gscene；仍为Windows v0.2 sample，未打包。详见docs/validation-question-first-import.md。

最新阶段：按用户新6项要求完成Windows v0.2 sample。入口Windows v0.2.cmd，默认球心/垂线/射影教学模型，另有chordRightTriangle.gscene。127项单元与41组实际交互通过；详见docs/validation-Windows-v0.2-sample.md。本阶段未打包，须用户试用确认后再更新发布包。下文v0.2.1为此前发布历史。

用户已明确选择：4个不共面的点构成四面体，分别构造外接球和内切球。第2项已补齐，五项修改均已实现。

- 第1、3、4、5项此前完成并分发v0.2.0；新球工具单独发布v0.2.1，旧目录及用户数据保留。
- 工具栏有外接球/内切球，选满4个点才创建；重复/共面点初次创建被拒绝，四点引用和动态依赖保存于.gscene。
- 蓝色外接球过四顶点，金色内切球切四个面，显示球心与半径及所选四面体。依赖点退化时暂隐藏并提示，恢复后重新显示。
- 球支持撤销/重做、删除、依赖级联删除、顶点变化、动点、JSON和文件往返、带标签PNG。
- 内置完整Prompt、操作指南、README和样例已同步。新样例examples/tetrahedronSpheres.gscene含双球。
- 源码验证：96项Vitest，TypeScript/Vite/Electron构建，31组Chrome/Electron交互全部通过。
- 独立复查发现极小四面体渲染切点时使用了绝对尺度的平面判据，已由归一化球计算直接输出切点，专项实际创建/重开回归和限定复核通过。
- 一次顶点/截面拖动一次撤销；撤销中断手势；隐藏延展平面的开放交线和交点可拖动；方位连续且持久化。
- 模型库7个常用模型，原motion等老文件仍可打开。
- JSON复制完整内置Prompt，含v0.2新增primitive/planeSection/offset/radial规范，使用最小原生IPC。
- 当前分发：release-v0.2.1/GeometryTeaching-Windows-x64-v0.2.1.zip；实际便携EXE中文路径、系统PATH、断网双球/圆锥曲线/Prompt/IPC验证、12文件白名单与SHA256全部通过。完成记录见docs/validation-v0.2.1.md。

没有新安装软件；开发工作都在SpatialGeometryStudio内。
