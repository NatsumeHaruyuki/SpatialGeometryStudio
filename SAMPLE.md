# Windows v0.2

双击本目录的 **Windows v0.2.cmd** 启动本次 sample，会直接打开“球心、垂线与射影”示例。它使用本机已有的 Electron 运行已构建界面，不需要启动开发服务器；本次没有生成新安装包、EXE 或 ZIP。

通过软件中的“打开项目”选择 `examples/chordRightTriangle.gscene`，可查看垂径定理相关的经典直角三角形示例；也可打开其他 `.gscene` 文件，或使用右侧“JSON 导入 / 导出”。项目和设置保存在 `sample/Windows v0.2` 内，和旧版发布包的数据分开。保留整个开发目录及 `D:\DevDep` 中已有运行环境，启动器依赖这些文件。

这次先提供 sample 试用，收到确认后再打包。`Dev.cmd` 继续用于实时开发；自行修改源代码后，先执行 `npm run build` 更新 sample。

题图转 JSON：打开“JSON 导入 / 导出”，点击“一键复制 Prompt”，在外部多模态模型中附题图并粘贴；把返回 JSON 直接贴回 SGS。新 Prompt 使用题目点优先的协议2，不再占用 A、B、C、O 等字母；旧项目仍兼容。

`examples/questionConeV2.json` 是可直接粘贴的简洁输入；`examples/questionConeV2.gscene` 是含题干的完整圆锥示例，可用“打开项目”载入。已核对 AE=AD、ABC 等边及 PO/DO=√6/6。若模型输出有真实缺失引用等问题，错误处可“一键复制修复请求”，包含具体错误、原 JSON 和完整规范。
