# 公开图片识别评估 · 2026-09-07

结论：当前平面 LOGO 应优先走自动分色、确认背景和人工修正。BiRefNet_HR 不宜统一替代分色路径：
它在两张白底标志中误填内部留白，在一张夜间霓虹照片中漏掉大部分文字。
本轮为 3 张独立公开素材、7 个输入版本的小样本检查，不是生产精度验收。

## 样本与来源

| 素材 | 检查点 | 来源与署名 | 许可 |
| --- | --- | --- | --- |
| Wikimedia 标志 | 三色、内部留白、分离部件 | [源页面](https://commons.wikimedia.org/wiki/File:Wikimedia-logo.svg)，Neolux / Zscout370 / Dbenbenn | 页面标记 Public domain；保留 Wikimedia 商标说明 |
| Commons 英文标志 | 色块、分散文字、孔洞 | [源页面](https://commons.wikimedia.org/wiki/File:Commons-logo-en.svg)，Wikimedia Foundation / Reidab / Pumbaa | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Magnolia Cafe 夜间招牌 | 复杂背景、灯管、文字、发光边缘 | [源页面](https://commons.wikimedia.org/wiki/File:Magnolia_Cafe_neon_sign_at_night.jpg)，Nhfruchter | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

原始文件下载到 `artifacts/web-eval-20260907/`。两个标志使用源站提供的 PNG 栅格图，分别生成透明底、
白底 PNG、白底 JPEG quality=55；霓虹照片从 1984×1488 等比例缩至 960×720。
变换、来源与 SHA256 保存在 `results/report.json`。派生图是测试可视化，沿用对应素材许可及署名，
不代表原作者认可软件。没有上传到外部模型服务。

## 方法

- 运行当前本地 0.4.0 代码：自动分色 colors=auto、tolerance=12；主体模型 BiRefNet_HR。
- GPU 为 RTX 5070 Laptop；模型内存峰值由 PyTorch 统计，不是整机或整个桌面内存。
- 对白底与 JPEG 标志，以原始透明 PNG 的 alpha≥128 作为独立来源轮廓参考。
  IoU 表示预测和参考交集/并集，不是识别文字内容的准确率，也不是人工确认的生产真值。
- 透明输入的有效范围本来就约束输出，其高召回不能证明 AI 能自行去背景。
- 分色对照明确已知输入是白底，排除颜色中心最接近白色的区域；不使用参考掩膜来决定排除哪个区域。
  若主体本身含白字，该规则可能误删，不能自动推广到任意图片。
- 照片目标按“文字和灯管图案、排除天空和底板”做视觉检查；未完整标注，不计算照片 IoU。

## 测量结果

| 输入 | 自动分区数 | 分色耗时 | AI 主体耗时 | AI 轮廓 IoU | 已知白底分色去背景 IoU |
| --- | ---: | ---: | ---: | ---: | ---: |
| Wikimedia 透明 | 7 | 0.44 s | 39.85 s（本次首次模型调用） | 不作为去背景能力评分 | — |
| Wikimedia 白底 | 4 | 0.38 s | 9.23 s | 80.73% | 99.99% |
| Wikimedia JPEG Q55 | 4 | 0.48 s | 9.19 s | 88.71% | 99.91% |
| Commons 透明 | 8 | 0.15 s | 11.27 s | 不作为去背景能力评分 | — |
| Commons 白底 | 4 | 0.14 s | 10.78 s | 90.96% | 99.83% |
| Commons JPEG Q55 | 4 | 0.18 s | 7.53 s | 99.19% | 99.55% |
| 夜间招牌 | 8 | 0.63 s | 36.27 s | 未标注 | 不适用 |

每个输入只测一次；先后顺序固定，没有重复采样或控制其他 GPU 负载，因此只是本轮实际耗时，
不能推导输入复杂度与速度的因果关系。模型显存峰值约 5125 MiB。未测人工修正时间、打包冷启动。
JPEG 版本偶然比白底 PNG 表现好，反映结果对输入变化敏感，不能得出“压缩提高精度”的结论。

## 具体发现

1. **内部留白被误填。** Wikimedia 白底图几乎保留全部主体，但预测精确率仅 80.73%，
   多选集中在环形间隙和中央竖缝。Commons 白底图也误填了下方箭头之间的孔洞。
   这些误选若赋予高度，会实际打印成相连凸块。
2. **透明边缘被多分区。** 两张透明标志分别得到 7/8 区，而白底版均为 4 区（含背景）。
   当前分色纳入 alpha>0 的边缘 RGB；需要检查半透明抗锯齿像素对颜色中心的影响。
   本轮没有修改分色算法，也未验证解决方案。
3. **夜间灯牌主体提取严重漏选。** 自动掩膜仅占画面 0.759%，只保留部分高亮线段，
   MAGNOLIA、CAFE 和 OPEN 大部分未进入主体。这个占比是输出面积，不是召回率。
4. **分层数据链路通过。** 七个结果均验证累计掩膜重建高度、上下层包含关系、导出颜色与工作图一致。
   另用主体掩膜独立生成预期 0/10 层，逐一核对高度图、文件数量和每一层；记录见 `results/export-validation.json`。
   这说明文件生成正确，不能证明被选中的内容正确。

## 对照文件

- [误差对照图](../artifacts/web-eval-20260907/results/errors-comparison.png)：左原图，中 AI，右白底分色对照；绿=正确、红=多选、蓝=漏选。
- [完整七例对照](../artifacts/web-eval-20260907/results/comparison.jpg)：每行原图 / 自动分色 / AI 主体聚焦。
- [霓虹主体结果](../artifacts/web-eval-20260907/results/neon-photo/subject-preview.png)。
- [原始指标](../artifacts/web-eval-20260907/results/report.json) 与 [白底对照指标](../artifacts/web-eval-20260907/results/white-background-comparison.json)。
- 每个结果目录包含 input.png、partition.png、subject-mask.png、subject-preview.png 和 export/ 工程与分层文件。

## 下一步行动

### 2026-09-07 后续修正

已完成透明边缘分色修正与分色预览中的背景确认：

| 样本 | 修正前区域数 | 修正后区域数 |
| --- | ---: | ---: |
| Wikimedia 透明 LOGO | 7 | 3 |
| Commons 透明文字标志 | 8 | 3 |
| 两张白底版本 | 各 4 | 各 4 |
| 两张 JPEG Q55 版本 | 各 4 | 各 4 |
| 霓虹照片 | 8 | 8 |

分色计算将同一可见连通域中、距离不透明像素不超过 3 px 的半透明边缘归入近邻颜色。
原 RGBA 不变，不删除可见像素；孤立半透明细节和没有不透明像素的图像保留自身颜色。
这是一项面向图案抗锯齿边缘的局部规则，不代表任意半透明渐变均能自动识别正确。
七例均逐像素验证原 RGBA 与可打印范围不变，原始评估目录未覆盖。
记录见 [前后对照 JSON](../artifacts/web-eval-20260907/alpha-fix/comparison.json)。

分色生成预览后点击“标记背景”，再点击要排除的相邻同色块。
再次点击该块恢复，也可“恢复全部背景”。与外部白底断开的白字不会被连带排除。
应用前仅编辑预览，应用时背景标签置为 0；重新分色会清空背景标记。
此处的相邻块使用四连通规则，不会自动排除所有同色像素或所有孔洞。

验证：21 项 Python 测试、13 项前端单元测试通过，生产构建通过。
新增桌面测试通过：外部背景排除、单块恢复、全部恢复、内部同色主体保留和保存标签一致。
背景界面截图见 [桌面验证截图](../artifacts/background-confirmation.png)。
新版桌面包位于 `release/0.4.0-background/win-unpacked/Relief Studio.exe`，
同一背景操作测试在打包版通过（测试进程 PATH 仅保留 Windows System32）。
本机的 `model-runtime` 是指向原 0.4.0 模型目录的目录联接，避免重复存储模型；
迁移到其他电脑时需随包提供真实模型目录，不能仅复制此联接。未据此认定干净机器验收完成。
本轮未重新运行 GPU 主体推理，霓虹照片的主体漏选仍属后续工作。

### 后续待办

1. 已完成本批透明图抗锯齿边缘修正及透明/白底成对验证；继续扩大细字样本。
2. 已完成背景逐块确认、排除和恢复；后续按使用反馈评估多块批量处理。
3. 对复杂图先框定需要的文字或图案，再评估局部 SAM 修正是否减少人工操作；不要默认把整体抠图模型的结果直接当浮雕高度范围。
4. 增加中文细字、金色反光、浅字浅背景和至少两张其他复杂图，本轮英文标志不能覆盖这些情况。

复现（下载输入后，选择新的输出目录，脚本拒绝覆盖已有结果）：

```powershell
.gpu-venv/Scripts/python scripts/evaluate_web_samples.py --inputs artifacts/web-eval-20260907 --out artifacts/web-eval-20260907/rerun
.venv/Scripts/python scripts/analyze_web_results.py --results artifacts/web-eval-20260907/rerun
```

评估脚本经只读审查补充了完整样本检查和独立预期高度校验；后处理已在这批实际产物上通过。
首轮原始 report.json 未包含 completed 字段，后处理已确认 7 个预期样本全部存在；
后续采集会显式记录 completed 状态。首轮 reference 文本统一提及透明输入约束，实际仅 transparent 版本受此约束。
