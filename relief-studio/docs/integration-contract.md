# Relief Studio v2 对接契约（A1 候选）

2026-09-29；A 分支 `cys/relief-plan-a`；共同起点 `d55ae5df0d892a1fe392adb9b7d1ce045d8eaf1a`。
状态：类型、栅格编解码、参考应用器、模拟接口可运行；等待 B 的 D1 对接，尚未冻结。
当前产品仍使用 v1；本文件不表示 Python 持久化、真实算法、IPC 或新面板已接入。

## 唯一类型入口

使用 `src/contracts/index.ts`。旧 `src/types.ts` 保留 v1，A2 通过适配器迁移，
不在 B 工作台另建同名 v2 类型。运行时使用 TypedArray，序列化使用 `PersistedProjectV2`。
`original/colors` 为 RGBA Uint8，`labels/heights` 为 Uint16，`protection` 为 Uint8。
RGBA 的 alpha 保留；可打印的判断始终是 labels 非零，不以编辑颜色是否白色判断。

最大边 2048、最大白墨总层数 256；区域 ID 1..65535 且唯一，0 保留为不打印。
所有栅格同尺寸，original 不随笔画改变；透明原图像素不能补回成可打印像素。
非零标签必须引用区域；标签为 0 则高度必须为 0；非零标签允许高度 0。
`regions.defaultLayers` 只是新增像素默认值，局部改高后 UI 从 heights 求范围和混合高度。
区域数量与白墨层数是不同概念，256 是白墨层数上限。

## 坐标与高度

工作像素左上角为原点，x 向右、y 向下，索引 `y * width + x`。
像素中心为 `(x+0.5,y+0.5)`；矩形采用左上包含、右下不包含。
选区 data 仅 0/1，省略 selection 表示全图，全零表示空选区。
B 负责把屏幕坐标逆变换到工作像素，A 不接收屏幕或网格坐标。
OBJ XY 用 mm，左下为原点、Z 向上：像素中心为
`((x+0.5)*sizeMm[0]/width, (height-y-0.5)*sizeMm[1]/height)`。
设计映射固定 0.1 mm/层，删除最高点不能重新归一化。标定曲线按层索引，禁止外推。

## 修改语义与历史

| 操作 | 修改字段 | 保护行为 |
|---|---|---|
| 擦除 | labels=0，heights=0；protection 按位或 5 | 明确手动目标可改，colors 保留 |
| 补回 | 原始有效像素恢复 colors、选定区域 ID 和默认高度 | protection 按位或 7 |
| 手动改色 | colors（区域默认色可作为属性一起提交） | 按位或 2 |
| 手动设高/加减 | heights | 编辑器提交时按位或 4 |
| 自动均高/建议/平滑/倒角 | heights | 跳过高度保护位 4 |
| 自动识别 | labels、colors、heights、regions | preserve 分别尊重位 1/2/4；overwrite 为显式覆盖 |

范围保护引起字段耦合时必须保持不变量：例如受高度保护且高度非零的像素，
识别不能只清空标签。冲突像素保持原样并报告；不生成非法候选。
手动设高到 0 不清标签，不等同擦除。缩放、平滑不得扩展可打印范围。

EditPatch 同时描述所有变化，块偏移按类型数组元素而不是字节；颜色块按 RGBA 字节。
同字段块不得重叠，before 必须匹配当前值。属性变化带完整 ProjectProperties 前后值。
所有校验成功后一次提交；禁止先改标签再异步改高度。
`applyCandidate` 是对接参考，不代替 B 的历史、脏块优化或预算管理。
mock 高度只产生高度候选；B 按上表加入手动保护变化后统一提交。
撤销将 before/after 对换，并使用当前 sessionId/revision 重新封装。
撤销/重做同样递增 revision；换图生成新 sessionId；禁止回退 revision 复用旧结果。
历史计费为所有 before/after 栅格 byteLength 加属性 UTF-8 字节数，预算 64 MiB。
单次超预算由 B 在应用前提供取消；A1 参考应用器尚不执行历史预算。

## 异步与 IPC 约定

服务入口为 CapabilityService，收到请求立即捕获快照版本，返回候选，不修改输入。
成功、取消、错误均含 base；应用者同时比较 sessionId 和 revision，过期结果丢弃。
取消不提交部分结果；错误保留工程、选区及手动编辑入口。
HeightPanel 的 onPreview 只触发临时显示，onRequest 才请求候选；拖动结束只提交一次。
ExportPanel 从已提交快照输出；onCancel 由调用者传递到 AbortController。

待 A2/A7 实现的 IPC 通道固定命名：`v2:height`、`v2:recognition`、`v2:export`、
`v2:import`、`v2:cancel`。请求 `{requestId,payload}`，取消 `{requestId}`，
响应 `{requestId,result}`；result 使用 OperationResult，禁止并行请求串号。
后台 JSONL 与持久化使用同一 EncodedRaster 形状，字节序明确为 little endian。
payload.snapshot 的五个数组及 selection.data 均用 EncodedRaster，
补丁 blocks.before/after 同样编码；其余字段保持相同 JSON 结构。
原图方向校正和裁剪完成后才能建立新工程；导入失败/取消不替换旧工程。
导入以 requestId 关联，成功时返回新 ProjectSnapshot；base 是启动导入时当前工程版本，
没有打开工程时使用 `{sessionId:requestId,revision:0}`，调用方还须校验当前活动导入 ID。
局部识别返回裁剪区域对应的全图索引补丁，禁止把局部原点当成全图原点。

## 编解码和样例

`raster-codec.ts` 明确逐元素小端写入，不依赖宿主字节序；拒绝不规范 Base64、
类型和长度不符。完整 JSON 的 128 MiB 限制、工程语义校验、Python 对等实现、
v1 迁移及原子保存属于 A2，本轮没有实现完整工程读取器。

公共样例位于 `tests/fixtures/v2/`：

- `legacy-v1.json`：从当前受版本控制的 sample-project 原样复制，迁移时保留背景与颜色。
- `normal-v2.json`：4×3 像素，运行时等价于 makeFixture。
- `corrupt-base64-v2.json`：同一工程的 heights 编码损坏，预期明确拒绝。
- `README.md`：逐像素高度、覆盖、白墨规则和人工孔洞说明。

## B 的可运行调用

```ts
import { createMockService, makeFixture } from './contracts/mock';
import { applyCandidate } from './contracts/patch';

const snapshot = makeFixture();
const service = createMockService({ scenario: 'delayed', delayMs: 200 });
const controller = new AbortController();
const result = await service.height({ snapshot,
  operation: { kind: 'set', layers: 6 } }, controller.signal);
if (result.status === 'success') {
  // 真实编辑器应在此核对当前版本、预算，合并手动保护，再进入唯一历史入口。
  const next = applyCandidate(snapshot, result.value);
}
```

scenario 可取 success/delayed/cancelled/failure/stale。
mock 高度只支持 set/uniform，其余操作返回 INVALID_REQUEST；均高遵守高度保护，
手动 set 可以改受保护目标。识别 mock 返回空补丁；导出 mock 明确 simulated=true 且无文件。
这些 mock 不代表模型效果、真实 RIP 支持或设备验证。

运行 `npm test -- src/contracts/contracts.test.ts`，包含独立应用/撤销示例。
D1 尚需 B 在自己的状态和历史入口完成“一笔提交→候选应用→撤销→旧结果丢弃”，
记录其分支和测试结果。此关通过后再冻结版本并进入 A2 产品接入。
