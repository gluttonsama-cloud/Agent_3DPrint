# Relief Studio · 浮雕制版

0.4.1 在 0.4.0 的识别、主体提取和细化功能上新增智能手动修整与 STL 导出。
在左侧选一层，智能点选、框选或圈选，再点“清除”或“保留”。
“保留”只保留当前层圈内部分，清除当前层圈外部分；其他层保持不变。
圈选默认自动贴边，智能点选可调整宽容度；原有画笔、分区属性等收进高级入口。
操作说明与验证记录见 [手动修整与 STL](docs/handable-0.4.1.md)。
本版安装包为 `release/Relief Studio Setup 0.4.1.exe`。

### 旧版本记录

0.3.0 增加“自动分色 / 主体提取”识别预览。导入后无需预填数量；确认结果后才应用，
新分色高度全为 0。复杂图可用本地 GPU 点选主体，背景保留原色为 0 层，主体统一设置层数。
当前交付在 `release/0.3.0/`；安装包仅包含基础引擎，GPU 用户另外放置 `model-runtime` 目录。
本机免安装目录已配置模型包。完整记录与精度待验收项见 `docs/recognition-0.3.0.md`。

用于 LOGO、文字及色块图的离线 Windows 浮雕分层演示。颜色与高度分别编辑，输出可恢复工程、
彩色图、16 位高度图、累计掩膜和未校准说明。**不直接控制打印机，不生成已适配 RIP 的任务。**

## 运行演示

可安装包：`release/Relief Studio Setup 0.4.1.exe`。
免安装目录：`release/win-unpacked/`，运行其中 `Relief Studio.exe`；分发时必须保留整个目录。

1. 点击“打开示例工程”，查看 55 mm 科尔沁徽标。
2. 在左侧选一层，使用智能点选或圈选修整，按“清除”删除圈内，或“保留”删除圈外。
   展开右侧“层属性与更多设置”可修改层数，示例白字、金色、黑色默认分别为 10、5、0 层。
3. “更多工具”里的“同色选区”选取同一分区所有像素，“连通选区”仅选择相邻像素；轮廓不改变图案颜色。
   Shift 追加、Alt 减选、Ctrl+D 取消。右侧可分配目标区域、将选区建立新区域或排除打印。
4. 画笔工具栏选择“绘入区域”，选区存在时只修正选区内像素；蓝色轮廓显示绘入区域边界。
   擦除将像素标记为不打印。透明原图区域不可被涂成打印区域。
5. 新建区域或合并区域；合并后采用目标区域层数，原图颜色不自动改变。
6. 选择颜色后点击“应用颜色到区域”，一次更新色标与图案颜色；高度保持不变。
7. 查看 3D 或逐层结果，保存工程，导出到选定父目录下的时间戳新目录。

导入支持 PNG/JPEG，最大 24 MB；超过 2048 px 的长边等比例缩小并提示。
裁剪界面可拖动矩形框并开启椭圆裁切。分区默认 3 色，可设 2–12 色；手工区域上限 32。
单区域堆叠 0–256 层。提供 0/5/10/20 层快捷按钮；输入框 Enter 或离开时提交，Esc 取消。
S/R/L 切换智能点选、框选、圈选；W/C/B/E/H 切换同色、连通、画笔、擦除、平移。
Ctrl+Z 撤销、Ctrl+Shift+Z 重做；Esc 或 Ctrl+D 取消选区。
撤销按图像大小限制缓存，至少保留一步，最多 20 步。未保存退出会提示。

三维使用原分辨率标签与原图纹理，几何面片超过 300,000 时明确暂停，不静默缩小图案。
Z 比例只用于视觉辨别；0 层和清除区域不再增加预览厚度。
STL 使用工程毫米尺寸与导出窗口填写的实际每层厚度，可选择添加矩形底板。

## 开发与验证

Windows 11 x64；Node.js 22.12+（本机打包使用 Node.js 24）、Python 3.12。
在本目录执行 PowerShell 命令：

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r engine/requirements.txt
npm ci
npm test
npm run test:engine
npm run build
npm run test:e2e
npm run desktop
```

`npm run dev` 只启动网页预览，不启动算法或模拟原生保存功能。真实工作流使用桌面版。

```powershell
npm run dist:win
$env:RELIEF_TEST_PACKAGED='1'
npm run test:e2e
```

构建可联网安装依赖；产物运行无网络请求。`.venv`、模型实验环境、构建产物和测试截图均不入 Git。
检查来源和许可记录见 `docs/third-party.md`。

## 文件式算法接口 v1

开发环境：`node scripts/python.cjs engine/main.py --job job.json --out output`。
打包程序：`engine-dist/relief-engine/relief-engine.exe --job job.json --out output`。
EXE 同目录下的 `_internal` 依赖必须随行。

导出任务：

```json
{
  "action": "export",
  "project": {
    "version": 1,
    "name": "图案名称",
    "width": 2,
    "height": 1,
    "sizeMm": [55, 55],
    "image": "data:image/png;base64,<与宽高一致的 RGBA 工作图>",
    "labels": [1, 2],
    "regions": [
      {"id": 1, "name": "黑色", "color": "#000000", "layers": 0},
      {"id": 2, "name": "白字", "color": "#ffffff", "layers": 10}
    ]
  }
}
```

`labels` 按行从左到右排列，0 排除打印。其他值必须引用唯一有效区域 ID（1–65535）。
`image` 为裁剪后的图片，不能把示例中的占位符当成有效数据。
`sizeMm` 为正有限值且不超过 10,000 mm；仅描述平面尺寸。单边上限 2048 px。
只有 `regions[].layers` 决定高度；`regions[].color` 是色标，图案以 `image` 为准。

自动分区任务：`{"action":"segment","image":"data:image/png;base64,...","colors":3,"sizeMm":[55,55],"name":"图案"}`。
返回 `output/project.json`；支持 PNG 或 JPEG data URL。裁剪由调用方在此前完成。
校验任务：`{"action":"validate","project":...}`，不写输出。

成功 stdout 为 `{"ok":true,"path":"...","projectPath":"...","elapsedSeconds":0.2}`，退出码 0。
处理失败 stdout 为 `{"ok":false,"error":{"code":"INVALID_JOB","message":"..."}}`，退出码 1。
已有导出目录会被拒绝；请选新目录。桌面算法调用超时为 120 秒。

`height.png` 存储实际整数层数，不能把它作为自动归一化的 8 位灰度图解读。
每层掩膜满足 `mask[n] = 255 if height >= n else 0`，n 从 1 开始。
坐标原点左上，x 向右、y 向下；全部输出对齐。颜色导出未做 ICC 转换。

## 样例和实测

`samples/source-logo.jpg` 是原会议附件；`samples/provenance.json` 记录裁剪和样例修正。
修改通用算法后可重新生成样例到**新的**输出目录：

```powershell
.venv/Scripts/python scripts/prepare_sample.py --source samples/source-logo.jpg --out artifacts/new-sample-export
.venv/Scripts/python scripts/benchmark.py
```

结果路径、性能证据及尚未完成的实机/干净系统验证见 `docs/verification.md`。
生产化前必须取得客户确认的原始矢量稿或高清图片；410 px 样例不应被误解为客户最终印刷精度。
