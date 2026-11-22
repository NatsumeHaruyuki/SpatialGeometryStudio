# 空间几何工作室 · v0.2

本地立体几何教学应用，基于 React、Three.js 和 Electron。界面版本为 v0.2，包版本为 0.2.1。仓库包含完整源码、锁文件、示例、测试和跨平台打包配置；安装的依赖、用户数据及生成的发布物不进入 Git。外层原始需求、PDF、Word 和样题文本保留在本地。

## 直接试用

Windows 11 x64：使用 `release-v0.2.1/SpatialGeometryStudio-Windows-v0.2.1-x64` 文件夹，或解压同名 ZIP。双击其中的 `SpatialGeometryStudio.exe` 即可，不需要 Node.js、Python、npm、外部 Electron 或开发服务器。迁移时复制整个文件夹，保留 DLL、resources、locales 等全部运行时文件。

macOS Apple 芯片：GitHub Actions 的 `Desktop builds` 工作流生成 `SpatialGeometryStudio-macOS-arm64` 制品。下载后解压制品内的分发 ZIP，双击 `SpatialGeometryStudio.app`。应用使用 ad-hoc 签名，未经 Apple Developer ID 签名和公证；首次运行若被系统拦截，确认来源后按“系统设置 → 隐私与安全性 → 仍要打开”的提示处理。单位设备策略可能限制运行。Actions 会启动解压后的实际应用进行离线验证，最终结果以对应 run 状态为准。

Windows 的 `Windows v0.2.cmd` 是开发目录中的课堂 sample 启动器，依赖本机 D:\DevDep，不能作为独立分发版复制给同事；详细说明见 `SAMPLE.md`。独立版通过“打开项目”加载 `samples/studyProjection.gscene`，可查看同一课例。球心和垂足、过点垂线、三角形、三点角及点面距离均保留。

题图导入现已采用题目点优先的协议2：在“JSON 导入 / 导出”复制新的完整 Prompt，让外部多模态模型附图生成 JSON，粘贴返回结果即可。题目自己的 D/O/A/B/C 等点名直接建模，不再由圆锥等预占；可省略的界面字段自动补齐，支持常见代码围栏和网页转义。旧版协议1文件继续按原语义打开。

可直接试用 `examples/questionConeV2.gscene`（含题干），或粘贴 `examples/questionConeV2.json`（简洁输入）。已核对底面等边三角形、AE=AD=2 和 PO/DO=√6/6。若出现真实缺点、重定义或循环依赖，提示会给出具体点和构造位置，并提供“一键复制修复请求”。更新后请保存并关闭旧 sample 窗口，再用启动器重开、重新复制 Prompt。

首次运行在 Windows EXE 同级、macOS `.app` 同级创建 `GeometryTeachingData`，其中 `projects` 放项目、`exports` 放图片、`settings` 放本地配置；不会写入 `.app/Contents`。如果程序目录不可写，回退到用户数据目录。右侧齿轮可选择便携或标准模式，下次启动生效。切换目录不会移动或删除旧项目。

这是内部测试分发版。Windows 没有发布者签名，Mac 没有 Developer ID 签名和公证。自动化验证不替代其他个人电脑和显卡的兼容性验收。旧版 EXE/ZIP 和用户项目均保留。

## 可操作功能

- 模型库：棱柱→三棱柱、四棱柱；棱锥→三棱锥、四棱锥；圆柱；圆锥→单圆锥、双圆锥。样例文件保留旧的五棱锥动点。
- “调整顶点”后拖动原始点；棱柱上下底、棱锥底面保持对应有效结构。旋转体通过 O/T/圆周控制点调整位置、轴向/高度及半径。
- Alt+左键拖动截面沿法向平移；隐藏截平面时也可拖动可见交线和交点；一次拖动对应一次撤销。
- 外接球/内切球：依次选 4 个不同且不共面的点，显示球、球心和半径。外接球经过四顶点，内切球与四面相切，可同时创建。`samples/tetrahedronSpheres.gscene` 可直接打开演示。
- 球随依赖点更新；重合或共面时暂时隐藏并提示，恢复后自动显示。初次选点退化会被拒绝；两种球支持保存重开、删除、撤销与重做。
- 球心、垂足是真实依赖点，可在画布、按名称或构造栏选取，再用于辅助线、角度、三角形等构造。
- 先选点再点击“作垂线”，随后两点定直线；也可先启动工具后依次选过点和直线两点。得到可选垂足 H 和直角标记，直线无限延伸。
- 三角形工具仅高亮指定三点，支持正方形底面的一半；角度工具第二点为角顶点，右侧动态显示角度。
- 点面距离按待测点及平面三点构造，显示垂足、单位法向量 n、连接向量 v、d=|v·n| 和射影直角三角形；面内点距离为0。平面无限延伸。
- `examples/studyProjection.gscene` 演示球心与射影；`examples/chordRightTriangle.gscene` 演示真实球弦的垂径定理模型。
- 双圆锥提供圆、椭圆、抛物线和双曲线预设、倾角与法向位移控制。按解析曲面计算交线，开放曲线不伪造封闭面积。
- 左键旋转、右键平移、滚轮缩放、点/面的拾取；右侧支持按名称选择。
- 两点中点、辅助线、三点确定截平面及凸多面体真实截面、四点确定且带公共直线和角弧的二面角。
- 线段上的动点、往返播放、依赖更新、截面积显示、撤销及重做。
- `.gscene` 打开/保存、JSON 导入/导出、包含标签的 PNG 图片。
- JSON 窗口“一键复制 Prompt”复制完整内置规范；在外部多模态 Agent 贴图与 Prompt，再将 JSON 返回软件导入。剪贴板失败时可展开手动复制。
- 项目保留几何、构造、动点参数、当前视角及显示设置。模型数据不依赖开发机绝对路径。
- 所有输入先经过 Zod、引用、依赖、共面和凸性校验。错误输入不会替换当前场景。

使用工具后按顺序选两个点、三个点或四个点，自动完成对应构造。所有点选工具均可通过右侧“按名称选择点”完成选点。二面角先选 A、B 两点确定公共直线（蓝色），再选直线外的 P、Q 两点确定平面 ABP、ABQ（橙色）；第四点选完自动测量 P—AB—Q。公共直线可以是辅助直线，不要求为模型原有棱。再次点击已选点，从该点重选；无效点不会清空前面的有效选择。Esc 取消工具，Ctrl+S 保存，Ctrl+O 打开，Ctrl+Z 撤销，Ctrl+Y 重做。删除一个依赖点时，其后续截面、球、二面角等构造一并删除，可撤销。

新二面角保存为 `{ "kind": "dihedral", "id": "angle", "points": ["A", "B", "P", "Q"] }`。旧版 `faceA` / `faceB` 构造继续读取与显示。依赖点运动至公共直线上或公共直线端点重合时，角度暂不可定义，恢复有效构型后自动显示。

## 样题与数学边界

- 第 2 题展示 `a=1`；“显示”页可选择顶点 A，修改 y 坐标改变高度，中点自动更新。
- 第 1 题取 `a=1` 且额外取等边底面，展示一组满足原有已知条件的坐标，保留 120° 内二面角。不是原题的唯一构型或解答。
- 第 4 题问题缺失，示例额外添加平面 GEF，明确用作动态截面演示。
- 第 3 题缺少必要尺寸和完整问题，暂未据图臆造模型。
- 多面体支持闭合凸模型；旋转体使用独立解析参数，双圆锥两锥共顶点、方向相反。支持线段动点；凹多面体、任意面动点、非线性约束求解和证明系统未实现。
- 拖动模型会改变度量关系，原题文字保留为参考；等长、垂直等条件需重新核对，不自动求解维持。
- AI 图片识别尚未接入。应用不会上传题目或调用模型服务。后续需提供工作组 Agent 地址、认证及接口格式。

截面通过逐棱求交、去重和面内排序得到多边形，包括过顶点、过整棱及与面重合的边界。二面角通过 P、Q 指定的半平面内、垂直于公共直线的两条射线计算，范围为 0°–180°，保留 120° 等钝角。渲染使用 Three.js；几何数据和构造是独立真实数据源。

## 开发

Windows 新安装软件统一放在 `D:\DevDep` 下的 camelCase 软件目录。当前 Node.js：`D:\DevDep\nodeJs\node-v24.22.3-win-x64`；Electron：`D:\DevDep\electron\electron45_4_1`；npm 和打包缓存分别在 `D:\DevDep\npmCache`、`D:\DevDep\electronBuilder`。项目的 `node_modules` 为项目依赖，留在此开发目录。未改机器级 PATH。

本机双击 `Dev.cmd` 可开发预览；双击 `BuildWindows.cmd` 构建 Windows 文件夹分发版。打包脚本会拒绝覆盖同名成品目录、ZIP 或校验文件，避免覆盖旧包和可能存在的用户项目；再次打包前请先移走这三项旧成品或更新版本号。也可以在 PowerShell 执行：

```powershell
. .\scripts\environment.ps1
npm ci
node .\scripts\install-runtime.mjs
npm test
npm run dev
npm run dev:desktop
npm run build
npm run test:e2e
npm run package:win
npm run test:portable
npm run package:win:folder
npm run test:distribution -- --arch x64
```

`dev:desktop` 使用 127.0.0.1:5173，需先结束占用该端口的开发服务器。桌面主进程改动后重新启动。`npm run start` 打开已构建桌面应用。开发脚本绑定本机已有依赖位置；给同事的发布包没有这些依赖路径要求。

`test:e2e` 用本机已有 Chrome 检查前端，并用实际 Electron 检查桌面、鼠标拖动、四种截线、四点球、剪贴板全文及回归边界；不下载浏览器。文件选择对话框由测试驱动提供路径，真实 IPC、文件读写和渲染正常运行。测试输出在 `.qa`，截图在 `docs`。

`test:portable` 启动真实便携 EXE，检查中文路径、仅系统 PATH、离线截线与四点球、内置 Prompt 复制与 ZIP 文件白名单；截图在 `docs/portable-preview-v0.2.1.png`、`docs/portable-double-cone-v0.2.1.png`、`docs/portable-spheres-v0.2.1.png`。已有试用数据不会进入重新生成的 ZIP。

Electron 渲染器禁用 Node，开启 context isolation 和 sandbox；preload 仅暴露受限文件与数据设置接口。主进程校验 IPC 来源，不允许外部窗口、导航和权限请求。凭据不进入工程或发布包。

macOS Apple 芯片构建使用 Node.js 24：执行 `npm ci`、`npm test`、`npm run package:mac:arm64`，再执行 `npm run test:distribution -- --arch arm64`。不运行 Windows 的 environment.ps1 或 install-runtime.mjs。`package:mac:x64` 和 `package:mac:universal` 命令保留，尚未完成可用性验收。

`.github/workflows/desktop-builds.yml` 在 main 推送及手动运行时构建 Mac 包。ZIP 包含完整运行时、示例、说明和记录源码提交的 `version.json`，旁边提供 SHA256 文件。Actions 制品保留 30 天，可从仓库 Actions 页重新运行工作流生成。

用户已确认使用 Apple 芯片，因此默认 Actions 和本次 Mac 交付目标为 arm64。Intel runner 的虚拟图形驱动及 SwiftShader/Vulkan 未能初始化 WebGL，Rosetta 方案也未完成启动验收；Intel 和 Universal 不作为已验证成品交付。Apple 芯片版使用系统默认图形后端，不需要 Rosetta。

## 主要文件

- `src/geometry`：本地向量、截面、二面角、依赖编译与样例。
- `src/schema`：项目格式和几何有效性校验。
- `src/rendering`：Three.js、相机、拾取、标签与 PNG。
- `src/store`：几何编辑、依赖删除及撤销/重做。
- `electron`：沙箱窗口、preload、文件 IPC 和便携数据。
- `scripts`：开发、构建、交互测试、Windows 发布。
- `docs/design`：界面参考和试样设计；`docs/validation.md`：验收记录与未验项目。

官方实现资料：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[上下文隔离](https://www.electronjs.org/docs/latest/tutorial/context-isolation)、[electron-builder Windows portable](https://www.electron.build/nsis.html#portable)。
