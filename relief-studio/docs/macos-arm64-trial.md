# M5 Mac 试用包构建准备

状态：已准备源码和云端工作流，**尚未生成 DMG，尚未在 macOS 运行**。
分支：`cys/selection-repair`，保留此前 `0506bb11e191277f52c0c19d434a507cc39dd3b2` 的选区优化。
目标：Apple Silicon arm64，适用于 M5；不是 Intel 或 universal 包。

## 已准备内容

- `electron/engine-command.cjs`：Windows 使用原 `.exe` 后端，macOS/Linux 使用无扩展名后端；开发环境使用 `.venv/bin/python`。仅 Windows 才尝试原 NVIDIA GPU 包。
- 许可收集支持 Unix 虚拟环境及 macOS Python Framework 的许可位置。
- `installer/electron-builder.mac.cjs`：独立 Mac 试用配置，不替换现有 Windows 配置。包含前端、Electron 主进程、冻结 CPU 引擎、示例及许可。
- `npm run dist:mac:arm64`：拒绝 Linux、Intel 或错误架构 Python，原生构建 PyInstaller sidecar 后生成 DMG。
- `scripts/verify-macos.cjs`：计划在 Mac 检查全部 Mach-O 的 arm64 支持、签名完整性、包内 CPU 引擎执行、DMG 完整性；只读挂载镜像，对照镜像内 app 与构建 app 的可执行文件、app.asar 和引擎哈希。
- `.github/workflows/relief-macos-trial.yml`：`macos-15` arm64 runner，Node 24、Python 3.12，运行源码测试和打包后 Electron 测试。只有检查全部通过才上传 DMG 和 SHA256 为 Actions artifact，不发布 Release。

## 本地已验证

- IPC / 平台路径单元测试：14 项通过，包括 Windows 路径回归和 darwin/Linux 路径覆盖。
- Linux Electron：tool-groups、handable、workbench 共 11 项通过，实际保存／重开链路继续正常。
- electron-builder 26 配置 schema 校验通过，脚本语法、YAML 解析和 `git diff --check` 通过。
- 在 Linux 调用构建入口，按预期立即拒绝，未产出冒充 Mac 的文件。
- 查询 PyPI 对应版本：NumPy 2.5.2、OpenCV headless 5.0.0.93、Pillow 12.3.0、psutil 7.2.2 有兼容 Python 3.12 的 macOS arm64 wheel；PyInstaller 6.22.2 有 universal2 wheel。此检查仅证明依赖发行文件存在，不证明冻结产物已可运行。

## 唯一启动阻塞与下一步授权

当前选定执行环境为 Linux x86_64，没有 macOS 系统、hdiutil 或 macOS runner 会话。
PyInstaller 要求分别在目标系统打包；不能将 Linux 冻结引擎放入 Mac app。

工作流尚在本地，没有 push 或触发 Actions。它定义了对 `cys/selection-repair` 分支的 push 触发器，因此**推送此分支会启动 Mac 构建**。如获授权，下一步为：

1. 推送当前独立分支及此工作流到 GitHub（不合并 main）。
2. 等待一次 macOS arm64 job，定位并修复实际构建／打包后回归失败。
3. 取得通过检查的 DMG、SHA256 和运行记录，保存 DMG 到 Library，给出实际签名与公证状态。

需要仓库允许 Actions、对应 runner 可用及有构建额度；目前未调用远程构建，未验证这些仓库侧条件。首次工作流只有 workflow_dispatch 时须先进入默认分支才能手动触发，因此这里使用受限分支 push，无需为试用合并 main。

## 试用边界

- 本配置计划使用 **ad-hoc 开发签名**，未使用 Developer ID、未公证，开发试用不启用 Hardened Runtime；不等同于正式受信任发行。Mac 的 Gatekeeper 仍可能阻止下载后的应用。本流程不会修改系统 Gatekeeper、移除隔离标记或跳过签名验证。
- 如果需要默认安全策略下顺畅分发的正式安装体验，应另外提供组织授权的 Developer ID 签名与公证条件，通过安全凭据配置完成，不能在对话中粘贴私钥。
- 试用包含手动选择、清除、增补、CPU 分色、保存和导出；不含现有 Windows NVIDIA AI 模型包，也不宣称 Mac GPU AI 能用。
- 此轮没有 macOS 原生测试、DMG 挂载测试或 M5 实机测试结果；工作流里的验证步骤均待实际执行。

## 官方依据

- PyInstaller 多系统打包：https://www.pyinstaller.org/en/stable/usage.html#supporting-multiple-operating-systems
- GitHub runner 平台与架构：https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- electron-builder 跨平台限制：https://www.electron.build/multi-platform-build.html
