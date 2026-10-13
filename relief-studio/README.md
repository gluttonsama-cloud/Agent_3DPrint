# Relief Studio · 浮雕制版

当前候选版本为 **0.4.2-d2.5**。从 [Release 发布页](https://github.com/gluttonsama-cloud/Agent_3DPrint/releases/tag/relief-studio-v0.4.2-d2.5) 下载 `Relief-Studio-Complete-Setup-0.4.2-d2.5.exe`，运行后选择是否启用 AI。安装程序会检查显卡驱动，并自动下载、校验模型和 GPU 运行时；无需手工安装 Python 或合并分卷。完整步骤见 [GPU完整安装指引](docs/GPU完整安装指引.md)。

## 手工修整

工具入口分为“点选”“选区”“修补”，画布上方切换具体方式：智能点选 / 连通选区、矩形 / 自由圈选、补画 / 擦除。切换入口时记住上次使用的方式。“平移”用于浏览画布，按住空格可临时平移。

左侧选区域，右侧直接改层数或执行清除 / 只留选中部分。右侧保留常用控件，操作说明在按钮悬停提示中；选区状态只在画布下方显示。分配、合并、改名和改色收在“更多区域操作”中。

点“选择整个区域”选取它的全部像素；Shift 追加、Alt 减去，快捷键 W 同样支持这两个修饰键。画布选取默认限于当前区域，跨区域选取与排除需在“更多区域操作”中明确开启；切换工具或全选不会自动开启。关闭设置后，Delete 只清除当前区域选中的像素；开启后，Delete 将整个选区排除打印。

“只留选中部分”清除当前区域未选中的部分；“清除”清除当前区域选中的部分。两者都保留其他区域，支持撤销。修补仍保留原图颜色，修改区域归属；擦除标记为不打印。范围与高度等原有能力保留，说明见 [手工修整工具简化](docs/手工修整工具简化.md)。

d2.5 安装包包含以上工具与布局优化，复用 d2.4 模型配套；已安装且校验正常的模型无需重新下载。

## 历史版本记录

0.4.1 在 0.4.0 的识别、主体提取和细化功能上新增智能手动修整与 STL 导出。
在左侧选一层，智能点选、框选或圈选，再点“清除”或“保留”。
“保留”只保留当前层圈内部分，清除当前层圈外部分；其他层保持不变。
圈选默认自动贴边，智能点选可调整宽容度；原有画笔、分区属性等收进高级入口。
操作说明与验证记录见 [手动修整与 STL](docs/handable-0.4.1.md)。
0.4.1 的历史安装包路径为 `release/Relief Studio Setup 0.4.1.exe`。

### 旧版本记录

0.3.0 增加“自动分色 / 主体提取”识别预览。导入后无需预填数量；确认结果后才应用，
新分色高度全为 0。复杂图可用本地 GPU 点选主体，背景保留原色为 0 层，主体统一设置层数。
当时交付在 `release/0.3.0/`；历史安装包仅包含基础引擎，GPU 用户另外放置 `model-runtime` 目录。
本机免安装目录已配置模型包。完整记录与精度待验收项见 `docs/recognition-0.3.0.md`。

用于 LOGO、文字及色块图的离线 Windows 浮雕分层演示。颜色与高度分别编辑，输出可恢复工程、
彩色图、16 位高度图、累计掩膜和未校准说明。**不直接控制打印机，不生成已适配 RIP 的任务。**

## 运行演示

可安装包：`release/d2-5/Relief-Studio-Complete-Setup-0.4.2-d2.5.exe`，或下载上述 Release 附件。
免安装目录：`release/d2-5/win-unpacked/`，运行其中 `Relief Studio.exe`；分发时必须保留整个目录。

1. 点击“打开示例工程”，查看 55 mm 科尔沁徽标。
2. 在左侧选区域，右侧直接修改层数；点选或圈选后，按“清除”删除圈内，或“只留选中部分”删除当前区域圈外。
3. 点选、选区、修补三个入口在画布上方切换方式；左侧“选择整个区域”选取当前区域全部像素。
   Shift 追加、Alt 减选、Ctrl+D 取消。“更多区域操作”中可分配、新建或合并区域，按需开启跨区域范围。
4. 画笔工具栏选择“绘入区域”，选区存在时只修正选区内像素；蓝色轮廓显示绘入区域边界。
   擦除将像素标记为不打印。透明原图区域不可被涂成打印区域。
5. 新建区域或合并区域；合并后采用目标区域层数，原图颜色不自动改变。
6. 选择颜色后点击“应用颜色到区域”，一次更新色标与图案颜色；高度保持不变。
7. 查看 3D 或逐层结果，保存工程，导出到选定父目录下的时间戳新目录。

导入支持 PNG/JPEG，最大 24 MB；超过 2048 px 的长边等比例缩小并提示。
裁剪界面可拖动矩形框并开启椭圆裁切。分区默认 3 色，可设 2–12 色；手工区域上限 32。
单区域堆叠 0–256 层。提供 0/5/10/20 层快捷按钮；输入框 Enter 或离开时提交，Esc 取消。
S/R/L/C/B/E/H 切换智能点选、矩形、自由圈选、连通、补画、擦除、平移；W 选择整个当前区域。
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

构建可联网安装依赖；完整安装程序启用 AI 时需联网下载模型，也支持同目录离线分卷。安装完成后的图像处理在本机运行。`.venv`、模型实验环境、构建产物和测试截图均不入 Git。
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
