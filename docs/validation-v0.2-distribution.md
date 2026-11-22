# v0.2 文件夹分发验收 · 2026-11-22

界面版本 v0.2，包版本 0.2.1。用户要求完整源码上传 GitHub、Windows 11 整夹复制后双击 EXE 使用，以及通过 GitHub Actions 生成 Mac 版；后续确认实际 Mac 为 Apple 芯片。

## 源码

- 仓库：https://github.com/NatsumeHaruyuki/SpatialGeometryStudio
- 完整源码提交 `155867beccee828a8c5ab74ed086e0da580bc3db`，包含 149 个受版本管理的文件；保留远程初始 README 提交历史。
- Mac 验证参数修正提交 `737873b981e3db59977bf22653f83bfb6b5aa097`。该修正仅涉及验证脚本，不改变 Windows 应用代码。
- 最终代码与工作流验收提交 `ad2e8fad16ab558cccbb67594da100bbc0fe12db`；版本标签 `v0.2.1` 包含最终验收文档。
- node_modules、构建目录、二进制、运行数据及 .qa 不提交。

## Windows 11 x64

环境：Windows 11 专业版 64 位，10.0.26300。

- `npm test`：19 个文件、234 项测试通过。
- `npm run package:win:folder`：通过。
- `npm run test:distribution -- --arch x64`：通过。
- ZIP：`release-v0.2.1/SpatialGeometryStudio-Windows-v0.2.1-x64.zip`。
- 文件夹：`release-v0.2.1/SpatialGeometryStudio-Windows-v0.2.1-x64`。
- 启动文件：文件夹内的 `SpatialGeometryStudio.exe`。
- 成品清单记录来源提交 `155867b`，`source_dirty: false`。
- ZIP SHA256：`efbd958cd637dc34421addc20d99a266ffc1119770f91feb73d72c3831d89703`。

验证实际解压后的应用，而非开发 Electron：迁移到含中文和空格的新目录，PATH 仅保留 Windows System32，删除外部 Electron/开发服务器路径，在内置运行时中启动。确认加载 app.asar、renderer 无 Node require、便携数据位于 EXE 同级。随后禁用渲染器网络并重新加载本地页面，验证 120° 二面角、四种圆锥截线、外接球/内切球、完整 Prompt 剪贴板 IPC 和协议 2 题目 JSON 导入。没有页面错误或画布错误。

这是渲染器离线重载验证，未更改系统防火墙来阻断主进程网络。源码启动逻辑加载本地文件，不依赖开发服务器。

旧有发布物和用户数据保留。首次验证产物以 `initial-validation-` 前缀留在 release-v0.2.1，正式交付使用无此前缀的文件夹和 ZIP。打包脚本现在拒绝覆盖同名目录、ZIP 和 SHA256 文件，相关两个回归测试已观察失败后修正通过。

## macOS Actions

- 工作流：`.github/workflows/desktop-builds.yml`，main 推送或手动触发。
- 最终验证 run：https://github.com/NatsumeHaruyuki/SpatialGeometryStudio/actions/runs/45027661574 ，已完成且 conclusion 为 success。
- 构建源码：`ad2e8fad16ab558cccbb67594da100bbc0fe12db`。
- Apple 芯片 arm64：macos-15 runner 构建、234 项单元测试、实际 .app 启动和同类离线功能检查均通过，分发 ZIP 和 SHA256 已上传；使用默认 ANGLE Metal / Apple Paravirtual device 图形后端。
- 制品下载：https://github.com/NatsumeHaruyuki/SpatialGeometryStudio/actions/runs/45027661574/artifacts/14756557092 。制品 ZIP 内还有分发 ZIP，后者保留 .app 的权限和符号链接。
- 验证截图制品：https://github.com/NatsumeHaruyuki/SpatialGeometryStudio/actions/runs/45027661574/artifacts/14756337695 。已查看此前同应用代码的 arm64 截图，中文界面和导入后的三维题目正常。
- 分发 ZIP 内含 `SpatialGeometryStudio.app`、samples、README.txt、version.json；另提供 ZIP SHA256 和验证截图。
- 验证会检查 Mach-O 架构、解压后的深层代码签名，并在含中文/空格的新位置启动应用。数据位于 .app 同级，禁止写入 .app 内部。
- 本地已保存并校验通过的 Mac 包：`release-v0.2.1/SpatialGeometryStudio-macOS-v0.2.1-arm64.zip`。它下载自此前同应用代码的成功 arm64 构建，清单记录干净来源 `bdfdb42bd7c14502ae2f277221555cb4102fb6a6`；此后只更新验证脚本、工作流与文档。该本地 ZIP 的 SHA256 为 `2357fcf4a45a1ab4090f2c914edacfcebe99a1114a8defade4d8a3feb4333c30`，配套校验文件在同目录。
- 用户确认 Apple 芯片后，默认 CI 和交付范围收敛为 arm64。Intel/Universal 的手动构建命令保留，未完成可用性验收，不作为已验证成品交付。

## 分发边界

Windows 没有发布者证书。Mac 使用 ad-hoc 签名，未使用 Apple Developer ID 证书和公证；首次运行可能需要系统中的“仍要打开”，单位策略也可能限制运行。验证范围是当前 Windows 11 及 Apple 芯片 Mac runner，不代表所有个人设备或 GPU 已实机验收。AI 题图服务仍未接入，核心几何和项目文件离线使用。
