# A2 独立推进：Python v2 编解码与 v1 迁移

日期：2026-10-02。分支：`cys/relief-plan-a`，在 A1 提交 `b450cd5` 上继续。
本轮完成 Python 数据模块准备，D1 和 D2 尚未通过；不等待 B 编写此模块，
也不据此声称编辑器联调、桌面保存重开或设备输出已完成。

## 已实现

新增 `engine/project_v2.py`，遵守 `src/contracts/index.ts` 的候选字段，不修改 TS 接口。
Python 运行时的五个栅格为一维 NumPy 数组，元素顺序与 TypedArray 一致，
RGBA 按字节、其余按像素；持久化为已有的 `type/encoding/data` Base64 小端结构。

| 函数 | 输入 | 输出/保证 |
|---|---|---|
| decode_raster / encode_raster | 编码对象或 NumPy 数组 | 明确小端、可写独立数组；不静默强转浮点或负数 |
| decode_project / encode_project | JSON 对象或运行时快照 | 元数据、栅格尺寸、区域引用、高度及保护位校验 |
| loads_project / dumps_project | UTF-8 文本/字节或快照 | 严格 JSON、拒绝重复键及非有限数值、128 MiB 字节上限 |
| load_project | 文件路径 | 最多读取上限加 1 字节，超限直接拒绝；仅接受 v2 |
| migrate_v1 | 已解析的 v1 对象、可选 session_id | 纯内存迁移，不修改输入、不覆盖文件 |

编解码拒绝未定义字段，防止未知语义被静默丢弃。字段扩展必须随协议版本明确处理。
大小限制在文本/文件入口及序列化出口执行；直接对象 API 校验元数据和栅格容量，
不把任意 Python 对象称作已经验证文件大小的 JSON。
高度上限 256，区域 ID 上限 65535；两者不是同一个数量。
标签 0 必须高度 0，非零标签允许零高度彩色；可打印像素必须位于原图有效范围。
标定曲线须从零开始、单调不减并覆盖实际最大高度，不外推。
读取 device.verified 只是保留工程记录，不能证明真实设备已经验证。

## v1 迁移细节

- 使用现有 v1 验证器读取，逐像素复制 image 和 labels，不重新分割、不按颜色猜高。
- 每个非零标签按原区域 layers 生成 heights，区域 ID、名称、颜色和层数全部保留。
- 默认保护为 0，创建新 sessionId、revision=0，设计映射 0.1 mm/层。
- 使用通用未验证设备配置，不推测客户白墨极性或 RIP 自动白底。
- v1 只有现存 image，无法还原编辑前已经丢失的原图，因此 original/colors 均从该图复制。
- 本模块不写文件；首次另存、原子保存及源文件保护由后续文件入口接入，尚未完成。
- 从磁盘重新打开 v2 返回文件内版本；桌面编辑器接入时应创建新会话，避免旧异步任务复用。

## 调用示例

从 relief-studio 根目录的 Python 环境运行：

```python
import json
import sys
from pathlib import Path

sys.path.insert(0, 'engine')
from project_v2 import load_project, migrate_v1, dumps_project

snapshot = load_project('tests/fixtures/v2/normal-v2.json')
legacy = json.loads(Path('tests/fixtures/v2/legacy-v1.json').read_text('utf-8'))
migrated = migrate_v1(legacy)
text = dumps_project(migrated)  # 仅在内存生成；原 v1 文件保持原样。
```

## 验证与边界

测试文件 `engine/tests/test_project_v2.py` 使用 A1 的正常/损坏公共样例和旧工程。
覆盖 TS 固定编码往返、不同宿主字节序、256 层、2048 边界、空图、零高度彩色、
迁移不修改输入、独立数组/元数据、非法区域/高度/保护位、严格 JSON、UTF-8、超限文件。
文件上限测试临时缩小常量以验证边界逻辑，不声称已执行 128 MiB 压力测试。

验收命令：`npm run test:engine`、`npm test`、`npm run build`。
本轮本地结果：66 项 Python 测试通过（含 12 项新测试）、23 项前端测试通过、构建通过。
代码审查发现的设计映射未锁定及巨整数异常已修复并纳入回归。
本轮不触发模型推理、RIP 或设备，不接入 `engine/main.py` 和 B 的编辑状态。
下一步继续准备独立的数据能力；D1 通过后再整合 TS 工程编解码、IPC、保存与预览，
由 D2 跨区域擦除/撤销及逐像素输出验证判定第一次真实闭环。
