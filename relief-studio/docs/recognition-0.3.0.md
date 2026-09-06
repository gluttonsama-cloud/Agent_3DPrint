# 自动分区与主体提取 0.3.0

## 实现

自动分色采用全图频次加权 Lab 聚类，自动最多 12 个候选中心、默认 ΔE76 容差 12；
手动允许 1–12 区。结合局部平坦支撑判断 JPEG 混合边缘色，不按面积删除细字。
新分区高度全为 0；现有工程与示例高度保持不变。

裁剪后进入识别对话框；自动分色和主体提取独立入口。参数调整只更新候选，应用才写入工程，
重新识别可整步撤销。有效范围继承当前工程的非零标签，原色图不改写。

SAM 2.1 Hiera tiny 使用原生 Windows CUDA、常驻 JSONL 子进程及图片编码缓存。
候选来自网格、裁剪和局部对比提示，按稳定性、重复掩膜、边缘接触及局部对比建议初选；
不确定候选仍可勾选。点击候选预览，“查看合并主体”恢复整体视图；保留/排除点作用于当前部件，“添加独立部件”保留其他部件。
画笔修边针对最终合并掩膜；可放弃修边返回部件编辑。应用输出背景 0 层、主体默认 10 层。

取消会中断对应子进程；过期请求不会应用。没有模型包时保留自动分色，不上传图片。
模型包目录名 `model-runtime`，放在桌面 EXE 同目录，包含运行时、权重及第三方许可。

## 复现与接口

- `segment` 保持返回工程 v1；`colors` 接受 `'auto'` 或整数，新增 `tolerance`、`validMask`。
- 主体进程 `subject-engine --checkpoint sam2.1_hiera_tiny.pt`；stdin 每行一个 JSON 请求。
- `action=propose` 返回 PNG 候选及建议勾选状态；`action=predict` 接受局部正负点并返回 PNG 掩膜。
- 请求与返回都有 `id`。仅允许随包可信模型，不接收前端传入的命令或模型路径。
- 复现脚本 `scripts/benchmark_subject.py`、`scripts/correct_subject_sample.py`；运行时构建见 `scripts/build_subject.ps1`。

## 验证口径

已验证原生 RTX 5070 Laptop GPU，torch 2.7.1+cu128 / torchvision 0.22.1+cu128。
SAM 来源 commit `2b90b9f5ceec907a1c18123530e92e794ad901a4`，tiny 权重 SHA256
`7402e0d864fa82708a20fbd15bc84245c2f26dff0eb43a4b5b93452deb34be69`。
未编译自定义 CUDA 扩展，使用官方允许的无扩展路径。

GPU 初选与热态点选分别计时，最终报告见 `artifacts/subject-gpu-final/benchmark.json`。
点选计时不包括人工点击、IPC 和画布解码；桌面端另有真实工作流测试。
独立 PyInstaller EXE 已实际完成 GPU 点预测，退出码 0。

最终本机基准：模型加载 3.60 秒；自动候选 23.26 秒；热态点选 0.047–0.056 秒；
峰值显存 988.04 MiB。最终生成 96 个候选、初选 50 个，此数量是候选部件数，不是打印层数。
10 项 TypeScript 测试、15 项 Python 引擎测试通过；打包版 5 条 E2E 通过，包含实际 GPU 调用。
打包测试 PATH 仅保留 System32，清空 PYTHONHOME/PYTHONPATH，未依赖开发 Python。
最终界面修正后再测 5 条全部通过（约 74 秒），证据保存在 `docs/evidence/recognition-030/`。

## 交付

- `release/0.3.0/Relief Studio Setup 0.3.0.exe`：基础安装包。
- `release/0.3.0/win-unpacked/Relief Studio.exe`：本机已配置 GPU 模型的免安装版本。
- `release/0.3.0/model-runtime.zip`：独立 GPU 运行时，3,513,692,379 字节；解压目录放在 EXE 同目录。
- `release/0.3.0/recognition-samples.zip`：平面徽标、复杂图自动结果与固定提示修正结果，5,232,387 字节。

复杂图的自动结果有误选炫光、漏选细笔画；固定提示修正样例也不是最终生产稿。
`subject-corrected-v1` 来自根代理视觉选定的提示点，**不是人工真值**。
尚缺操作员标注、争议边缘确认、人工修正耗时及人工参考 IoU≥0.95 验收；这些项目不得标记通过。
保留自动结果与修正结果两个输出目录，供后续标注对照，禁止用它们互相冒充精度真值。
