# 验证记录与交付边界

日期：2026-09-05。工程：Relief Studio 0.1.0。代码在 `feature/relief-studio` 分支。

## 本机环境

- Windows 11 专业版，10.0.26200。
- AMD Ryzen 9 8945HX，32 逻辑处理器，31.8 GiB 内存。
- NVIDIA RTX 5070 Laptop GPU / 8 GiB；主算法及 SAM 实验均未使用 CUDA。
- Python 3.12.10；独立算法环境 NumPy 2.5.2、OpenCV 5.0.0.93、Pillow 12.3.0。
- Electron 37.10.3；构建工具版本见 lockfile。分发构建由 Node 24.19.0 调用。
- 当前机器已有开发环境，**不是干净 Windows 验收机**。

## 测试范围

| 检查 | 结果与证据 |
| --- | --- |
| Python 引擎测试 | 12 项通过；`artifacts/engine-test.log` |
| TypeScript 模型测试 | 7 项通过；`artifacts/unit-test.log` |
| TypeScript 检查与 Vite 构建 | 通过；`artifacts/build.log` |
| 开发态 Electron E2E | 2 条工作流通过；原生 IPC 和 Python 算法实际运行 |
| Windows 分发包 | NSIS 构建成功，打包版 2 条 E2E 通过（13.6 秒） |
| 真实设备、RIP、材料与高度校准 | 未执行，等待客户条件 |
| 干净 Windows 安装 | 未执行，不能以开发机运行代替 |

Python 测试覆盖累计掩膜重建高度、嵌套层、16 位存储、透明与零高度区分、工程恢复、拒绝覆盖、
非法尺寸/编号/层数、改色不改高度、JPEG 噪声、单色图、大图单像素细色和不连通区域。
TypeScript 测试覆盖连通区域不跨孔洞、画笔透明边界与旧状态不变、合并、区域编号边界，
以及 1024 px 图中奇数列单像素高度保留和复杂预览的明确拒绝。

Electron 测试实际驱动：

1. 离线加载样例 → 修改层数并撤销 → WebGL 3D → 修改尺寸 → 保存 → 重开 → 导出。
2. 上传会议 JPEG → 拖动裁剪框 → 椭圆裁切 → Python 自动分区 → 擦除 → 撤销。

原生保存/打开对话框由测试替换为确定路径；其后的 IPC、校验、文件写入、算法子进程均真实运行。
此测试没有模拟用户操作系统文件选择器的按钮点击。

截图：`artifacts/welcome.png`、`editor.png`、`preview.png`。
最新工作流报告：`artifacts/e2e-results.json`。

## 最终交付记录

- 安装包：`release/Relief Studio Setup 0.1.0.exe`，147,058,718 字节，未签名。
- SHA256：`09163731CB932D68614C96966D3E88B3F155283ABD18AD911ADD229083563B22`。
- 免安装程序：`release/win-unpacked/Relief Studio.exe`，必须连同整个目录分发。
- 样例包：`release/55mm-logo-layers.zip`；对应 `artifacts/release-sample-export/`。
- 最终打包 E2E 使用 `RELIEF_TEST_PACKAGED=1`，子进程 PATH 仅保留 Windows System32，
  清除 PYTHONHOME/PYTHONPATH，运行分发目录中的 EXE。两条流程均通过。
- 包含真实 Python 分区与导出调用；该验证不是干净系统安装/卸载验收。
- 原始测试日志、基准 JSON 和截图复制至 `docs/evidence/` 随源码保留。
- 最终构建日志：`docs/evidence/packaging.log`，工作流日志：`docs/evidence/packaged-e2e.log`。

## 算法基准

样例 410 × 410 px，55 × 55 mm，0/5/10 层；三轮传统分区，计入子进程启动：

| 指标 | 实测 |
| --- | --- |
| 自动分区总耗时中位数 | 0.6619 秒 |
| 分区核心耗时 | 0.1369–0.1478 秒 |
| 分区进程树峰值 RSS | 56.57–59.59 MiB |
| 10 层导出总耗时 | 0.6311 秒 |
| 导出进程树峰值 RSS | 57.87 MiB |
| 累计层数等于高度图 | 通过 |
| 高层掩膜包含于低层 | 通过 |

内存由 psutil 每 20 ms 采样进程树，可能漏过极短峰值；它不是整个桌面应用的内存。
原始测量：`artifacts/benchmark.json`，复现：`.venv/Scripts/python scripts/benchmark.py`。
该单图测量不构成大图性能保证。

## SAM 2 对照实验

- 模型 SAM 2.1 Hiera tiny，官方仓库 commit `2b90b9f5ceec907a1c18123530e92e794ad901a4`。
- 权重 SHA256：`7402e0d864fa82708a20fbd15bc84245c2f26dff0eb43a4b5b93452deb34be69`。
- 原生 Windows、CPU、4 线程；torch 2.14.0+cpu，未编译 CUDA 扩展。
- 410 px 样例，24 正点＋24 负点，以一次提示选择分散的白字。
- 模型加载 1.1146 秒；三轮编码＋预测为 2.8655、2.6311、2.5225 秒。
- 进程峰值 RSS 1001.32 MiB；CUDA 显存 0。
- 与算法参考白字掩膜 IoU 0，当前提示策略效果不足，未接入产品。
- 参考掩膜不是人工真值，因此 IoU 不代表标准准确率；也未做人工修正时间实验。
- 不能据此断言全部 SAM 2 提示策略无效；下一步需要局部逐字/区域提示和操作员对照实验。

实验脚本：`scripts/benchmark_sam2.py`；结果：`artifacts/sam2-benchmark.json`、
`sam2-white-mask.png`。环境版本见 `docs/sam2-environment.txt`。
实验环境和模型保留在忽略目录，不随安装包分发。

复现步骤：建立 `.sam-venv`，从官方仓库检出上述 commit，安装记录的 CPU PyTorch 依赖，
设置 `SAM2_BUILD_CUDA=0` 后安装该仓库，下载官方 tiny 权重至 `artifacts/sam2.1_hiera_tiny.pt`。
运行 `.sam-venv/Scripts/python scripts/benchmark_sam2.py`。

## 审查与修复

主代理编写全部实现。按环境要求进行了只读独立审查，修复并测试：

- 固定步长抽样遗漏单像素颜色：改为全图色箱统计。
- 三维预览降采样漏掉细线：改为原分辨率几何及复杂度预检。
- 区域 ID 上溢：从合法空闲编号分配。
- 单色图片 OpenCV 返回中心形状异常：单色分支直接采用中心色。
- JPEG 色箱等权导致金色归入高层：按像素频次加权初始化及更新，新增样例黑金白分离回归测试。

## 尚未完成的外部验收

安装包没有商业代码签名；SmartScreen 展示行为需在客户环境验证。
未运行安装器的完整安装/卸载流程，亦未进行干净 VM、低配 PC 或禁用 WebGL 的兼容性矩阵。
未做真实 RIP 导入、白墨/光油层序、套准、金色工艺和实际高度校准。
没有人工确认的像素级真值和操作员修正耗时，不能声称达到生产精度或节省人工。

当前可交付结论：**图像处理及分层演示通过；生产打印适配与现场验收待完成。**
