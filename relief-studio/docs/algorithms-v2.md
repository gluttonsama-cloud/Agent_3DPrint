# v2 高度与识别候选算法

`engine/height_ops.py` 与 `engine/recognition_ops.py` 接收经过 v2 解码的快照，返回 Base64 小端编码 EditPatch。所有数组在候选阶段保持输入不变，版本取输入 sessionId/revision；取消抛出 InterruptedError，其他错误由 IPC 统一转成带 base 的 OperationResult。候选必须由调用方通过唯一历史入口校验和应用。

## 高度操作

`run_height(snapshot, operation, selection=None, cancelled=lambda: False)` 支持契约内 set/add/uniform/scale/suggest/bevel/smooth。选区是一维 uint8 的 0/1，省略表示全图，全零为空操作；非打印像素始终不改高。set/add 是明确手动操作，可修改已有高度保护目标，同时为目标加保护位 4；其他操作跳过保护位 4。统一四舍五入到整数层并裁剪 0..256，标定曲线不够则整体拒绝，禁止外推。

结构建议只在轮廓闭合包含其他非零色区、外部连通部件面积至少16像素且线宽足够时提出底面3层、内含装饰6层、内含细线10层，并受 maxLayers 限制。被包围空白孔洞不作为底面证据；未知部件及同色不连通部件保持现高，diagnostics 解释分类与未知像素数量。建议是保守设计层数，二维包含关系不等于实际物理前后关系，不使用 RGB 亮度冒充高度。调用方须允许预览和人工修正。

倒角采用向内距离衰减，不扩大范围，不填孔洞，原来正高度的单像素线至少保留一层。平滑采用 radiusPx 次四邻域扩散，只能沿同区域、选区内、未保护像素传播，隔背景、孔洞或断开的同色组件不直接互相平均，彩图不受影响。

## 自动识别

`recognize(snapshot, selection=None, *, keep_background=False, protection_policy='preserve', cancelled=lambda: False, predictor=None)` 优先使用原图透明范围；全不透明图需要真实 BiRefNet_HR。模型目录由环境变量 `RELIEF_BIREFNET_DIRECTORY` 指定，默认工作目录 `model-runtime/birefnet-hr`，缺少权重明确报错。原工作区可只读使用 `D:/AAAwork/Agent_3DPrint/relief-studio/artifacts/birefnet-hr`，模型运行需要 GPU 依赖环境。

局部预测裁剪到选区包围框，结果映射回工作图，仅写选区内像素。分色复用现有 `relief.segment` 的 Lab 分色与颜色边缘修正。透明孔洞始终排除；保留背景时背景可打印且为零层。优先按区域像素重叠复用已有 ID，不删除未修改区域，新增 ID 从未占用编号分配。已有前景高度保留，新主体区域默认10层，背景默认0层。

`import_snapshot(image_data_url, size_mm, name='未命名工程', *, keep_background=False, protection_policy='preserve', cancelled=lambda:False, predictor=None, session_id=None)` 返回 decoded v2 工作图，由 IPC 再调用 encode_project。导入从独立空标签快照生成识别候选并在新快照应用，原始 RGBA 及设计高度映射保留；失败或取消不影响调用者当前工程。

preserve 分别保持范围位 1、颜色位 2、高度位 4；若删除标签与锁定非零高度冲突，保持原有标签和高度并报告 uncertain。overwrite 是调用者显式请求，仍不能恢复原图透明像素。diagnostics 的 added/removed/uncertain 都是一维全工作图 uint8 EncodedRaster，不是裁剪坐标。

`predictor(rgb_crop)` 是测试/已有模型注入接口，返回同尺寸 0..1 概率；测试注入会标记 `injected-test-predictor`，不能宣称完成真实模型验证。单次 CUDA 推理中无法立即中断，取消在预测前后检查并丢弃整个结果；不会提交部分候选。

识别接口新增可选 `prompt=None` 与 `sam_predictor=None`，旧调用保持兼容。有 prompt 时统一调用既有 `SubjectWorker(checkpoint).run(action='predict')` 真实 SAM2.1 链，再走相同的分色、选区、保护与候选合并；透明优先只用于没有提示的自动路径，SAM 结果仍不能恢复透明像素。prompt 为 `{points:[{x,y,label}], box:[x0,y0,x1,y1]}`，points 可省略，box 可省略；至少提供一点或一框，坐标均为工作图坐标，右下不包含，框宽高至少8像素。单一正点采用已有 clicked_mask，仅保留点所在连通部分。`RELIEF_SAM_CHECKPOINT` 指定真实权重，默认 `model-runtime/sam2.1_hiera_tiny.pt`，缺失明确报错。测试注入 `sam_predictor(rgba_work_image, validated_prompt)` 返回全图0..1掩膜，标记 `injected-test-sam`；它不改变原有 BiRefNet predictor 调用方式。import_snapshot 同样接受这两个可选参数。真实 SAM 效果需单独验证。

## 软件验证

运行 `node scripts/python.cjs -m unittest discover -s engine/tests -p "test_*ops.py"`。覆盖手动保护、自动保护、零层语义、孔洞细字、同色不连通几何、局部坐标、全图诊断、坏参数、失败、取消、标定越界和 2048×2048 合成边界。软件测试不表示真实外部 API、RIP 或打印设备验证；B 的编辑历史与应用链仍需独立联调。

2026-10-02 使用原工作区 .gpu-venv 与 artifacts/birefnet-hr 做了真实 CUDA 32×32 白图预测（概率范围约0.000424..0.001249）及 recognize 整链验证：source=BiRefNet_HR，生成2个字段块，结果打印像素为0，输入标签未改变。这仅证明真实本地模型与候选链可执行，不是照片质量或设备验收。
