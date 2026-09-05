# Relief Studio · 浮雕工坊

用于 LOGO、文字及色块图的离线 Windows 浮雕分层演示。颜色与高度分别编辑，输出可恢复工程、
彩色图、16 位高度图、累计掩膜和未校准说明。**不直接控制打印机，不生成已适配 RIP 的任务。**

## 运行演示

可安装包：`release/Relief Studio Setup 0.1.0.exe`。
免安装目录：`release/win-unpacked/`，运行其中 `Relief Studio.exe`；分发时必须保留整个目录。

1. 点击“载入演示图案”，查看 55 mm 科尔沁徽标。
2. 点击白字、金色或黑色区域，修改层数。默认分别为 10、5、0 层。
3. “连通选区”点击局部后，选择目标区域并“划入当前区域”；“同色选区”选中整类区域。
4. 画笔向当前区域补选，擦除将像素标记为不打印。透明原图区域不可被涂成打印区域。
5. 新建区域或合并区域；合并后采用目标区域层数，原图颜色不自动改变。
6. 区域色标先独立修改，点击“将此颜色应用到图案”才替换颜色；高度保持不变。
7. 查看 3D 或逐层结果，保存工程，导出到选定父目录下的时间戳新目录。

导入支持 PNG/JPEG，最大 24 MB；超过 2048 px 的长边等比例缩小并提示。
裁剪界面可拖动矩形框并开启椭圆裁切。分区默认 3 色，可设 2–12 色；手工区域上限 32。
单区域堆叠 0–256 层。滑块提供 0–30 快调，输入框支持完整范围。
撤销按图像大小限制缓存，至少保留一步，最多 20 步。未保存退出会提示。

三维使用原分辨率标签与原图纹理，几何面片超过 300,000 时明确暂停，不静默缩小图案。
Z 比例只用于视觉辨别，0 层区域的显示基面也是示意，不对应实际基材厚度。

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
