# 最新主线与双平台安装包整合

本轮确认主线为 `80392e26a87860b5c96e806bb09c11fbec57a2d6`，实际合入 PR #14（提交 `94082fd127f7bdd6a3274e39ce004189e2c50ceb`）。整合基于此前手工修整及 Mac 试用分支 `37a97c425c9abbbd9988635ce11e36aacd341423`，新分支为 `cys/m5-latest-integration`。保留双方提交历史，不改 main 或旧分支。

主线新增的毫米倒角、非正方像素物理距离、独立平滑参数、人工保护的重新识别、明暗合并选项和智能点选种子行为全部保留。本轮不将这些归为新的算法成果。

冲突仅出现在引擎路由入口：整合后先严格校验显式主体蒙版，纯分色或显式蒙版走 CPU；只有 Windows 且实际需要 GPU 时才尝试既有 GPU 引擎。macOS/Linux 保持原生 CPU sidecar 路径。App 的重新识别候选提交链和手动清除／补回动作均保留，没有以整文件 ours/theirs 覆盖。

增加清除→补回→保存重开→重新识别（保留人工修改）的真实桌面回归，核对保护范围内 labels、colors、heights、protection。补充 darwin 非法蒙版路由校验，将原先写死 Windows 路径的真实 CPU IPC 测试改为按平台执行，避免在 Mac 跳过。

工作流同一 source commit 同时运行 macOS arm64 和 Windows x64 原生任务。两端运行前端、Python、IPC 和 23 项相关桌面回归；其中主体明暗用例使用测试提供的主体结果，不代表真实 GPU 模型推理验证。

Mac：沿用 ad-hoc 开发签名、未公证的 DMG。遍历原生文件，实际数量以本轮日志为准，检查 arm64、签名、后端、DMG 校验及只读挂载内容。未在用户 M5 实机测试。

Windows：沿用现有 NSIS 配置和 CPU 后端，原生生成 x64 应用、Python/DLL，遍历 PE 架构；安装包外壳允许为 NSIS 的 32 位引导程序。CI 静默安装到临时目录，再直接运行已安装应用进行桌面回归，并记录 Authenticode 状态。无签名凭据，不宣称受信任发行或真实用户交互安装向导已测；未捆绑 Windows NVIDIA AI 模型。

两份包名均包含 `integrated-80392e2`，与旧试用包区分。流程只上传 Actions artifacts，不发布 Release。SHA256 写入校验文件并打印日志。实际成功、失败和构建提交以 Actions 记录为准，不能把配置文件当作已通过证据。

提交前 Linux 验证：前端 66、Python 152、IPC 19、Electron 21 加主体明暗 2 项均通过，TypeScript/Vite 构建通过。双平台打包后验证仍以原生 CI 结果为准。
