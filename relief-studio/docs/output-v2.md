# v2 独立输出模块

`engine/export_layers.py` 提供 `export_bundle(snapshot, destination, *, formats=('png',), obj=False, device=None, settings=None, obj_options=None, cancelled=lambda:False, progress=lambda completed,total,message:None)`。
snapshot 必须是 `project_v2.decode_project` 返回的 NumPy 运行时工程；返回 `outputDirectory/files/checks/simulated=False`，files 为 `{path,role}` 数组（path 为绝对文件路径），checks 为 `{code,status,message}` 数组，与 TS ExportResult 一致。目标目录不能已存在，失败及取消删除临时目录，成功后同卷重命名发布。桌面导出面板通过 v2 IPC 传入完整工程及选项。

母版始终输出 project.json、RGBA color.png、8 位 coverage.png、16 位 height.png 和 white/0001.png 起的累计白墨蒙版。标签非零而高度零仍保留彩图；白墨第 k 层以 heights >= k 生成，无最大值归一化。母版白色表示有墨，设备极性只应用到 adapted 适配文件。零白墨工程没有 white 文件。母版坐标保持工程左上原点。

formats 含 jpg 或 jpeg 时增加 adapted/color.jpg 和灰度白墨 JPG，质量 95，RGB 禁用色度抽样（4:4:4）。回读白墨 JPG 记录全图及边缘最大/平均灰值差、128 阈值像素差和背景连通孔洞数，详细报告写入 jpeg-report.json 和 manifest/jpegDetails；checks 返回标准检查摘要。黑色有墨时先反转为墨区再统计孔洞。CMYK 必须提供有效 ICC 才转换；不提供 ICC 明确拒绝。PNG 不支持 CMYK，CMYK 适配请选择仅 JPG。JPEG 不能表达透明背景，彩图按 alpha 合成到白背景。

manifest 记录源 sessionId/revision、像素尺寸、毫米尺寸、母版/OBJ 方向、高度映射及标定状态、设备、规范极性和检查结果；tasks 包含逐任务文件、通道、格式、顺序、层号和重复号，totalSteps、whiteTaskCount、colorTaskCount 为实际任务数。geometryLayers 是几何白墨层数；重复打印不会隐式修改 heights 或 OBJ 几何，但重复印刷实际厚度必须重新标定。generic-unverified、未知极性及未知/开启自动白底生成标准 warning 检查。软件合成测试不能证明 RIP 自动白墨开关、设备极性或真实墨层厚度；这些需要客户 RIP 和实机印刷验证。

## OBJ

`export_obj(snapshot, directory, cancelled=..., progress=..., options=None)` 写 relief.obj、relief.mtl、texture.png 和 obj-meta.json。桌面选中“附加 OBJ 查看模型”后默认封闭实体；“模型类型”也可选择旧的表面查看模式。独立 API 未传 options 仍保持旧的 surface 行为。

封闭实体选项为 `options={'mode':'solid', 'baseThicknessMm':1, 'repairDiagonalContacts':False}`，通过 export_bundle 时对应 `obj_options`，IPC/TS 请求对应 `objOptions`。底板默认 1 mm、可设为 0..100 mm，覆盖整个矩形画幅，最终顶高为底板加逐像素高度。零底板时零高度像素不形成实体；全零且无底板明确拒绝。设计高度沿用工程 0.1 mm/层，标定工程使用自身 mmByLayer 曲线，允许实测平台值。PNG 母版与工程不受模型底板影响。

封闭 OBJ 和 STL 共用像素网格三角化，补齐底面、外壁及高度差侧壁，并沿角点高度断点拆分侧壁，避免 T 接点。不降采样。两种格式 XY 为毫米、左下原点、Z 向上。OBJ 的 UV 对应原图；实体贴图为合成白背景的 RGB，底板透明区仍可见，原始 RGBA color.png 保持不变。封闭 OBJ 保持相邻网格行的顶点和 UV 缓存，按实际索引预计算文本预算，最多 2500 万三角面及 1 GiB（含贴图和元数据）。浮点精度会合并不同高度或产生非有限坐标时明确拒绝。

仅在对角接触的高度会形成非流形连接，默认拒绝。明确启用修复后，以实际毫米高度排序补连接，不截断小于 1 mm 的标定台阶；obj-meta.json 记录 repairedPixels 与 addedVolumeMm3。manifest 返回 OBJ_GEOMETRY_REPAIRED 警告，桌面状态栏提示只修改了模型；原工程、彩图及逐层打印图不变。

`mode='surface'` 保留原行合并表面：非零标签零高度仍输出 Z=0 彩图面，无封闭底面，可能存在 T 接点，仅用于查看交换。该模式保留 200 万三角面及 512 MiB 上限。两个模式均拒绝已有同名目标，取消或失败清理本次生成文件；export_bundle 整体仍通过暂存目录原子发布。

## STL

`export_stl(project, destination, options)` 接收完整编码的 v2 工程或旧 v1 工程，输出新目录中的 model.stl 与 mesh-info.json。桌面使用完整 v2 快照，不再将倒角、平滑或局部调高退回区域默认高度。设计工程可在导出对话框指定 layerHeightMm（0.001..10 mm），仅影响本次模型；标定工程只读显示自身曲线，不传且不允许覆盖统一层高。旧 v1 API 仍要求显式 layerHeightMm。

底板与角点修复规则同封闭 OBJ；最高处根据实际像素高度或标定曲线显示，不受三维预览夸张比例影响。二进制 STL 最多 2500 万三角面，逐行写入；输出目录必须不存在。mesh-info.json 记录实际转换参数 heightMapping、sourceHeightMapping、底板、三角面数、尺寸和修复体积。STL 不包含颜色或标准单位声明，导入切片器时选毫米。

封闭、无退化面和体积检查只是文件几何验证；最小细节、材料、切片参数、RIP 与设备实际打印仍需验证。封闭实体也不代表已完成全部自交或制造工艺认证。

## 设备设置和标定

工程 DeviceProfile 核心字段不扩展。高级设置通过 export_bundle 的独立 settings 参数传入，支持 mirror、rotation（顺时针 0/90/180/270）、order、whiteRepeats、colorRepeats；适配器使用 `orient` 先水平镜像再旋转，`white_values` 合成极性图，`task_order` 给出白墨层和彩图重复顺序。传 settings 或选择 JPG 均生成独立 adapted 目录，orientation.json 记录设置及旋转后的像素/毫米尺寸，母版始终保留工程朝向和每层一份。重复任务复用文件而不复制或增加母版几何。未知极性使用规范母版值并保留未验证状态。

`calibration_chart(levels,cell)` 生成 uint16 阶梯层数栅格，可作为测试工程高度字段；`record_calibration(profile_id, measurements, device_id=..., ink=..., material=..., settings=...)` 录入逐层毫米测量，返回 mapping 和 binding。测量必须从零开始且单调不减，必须给出每层值，禁止稀疏值隐式插值。binding 绑定设备、墨水、材料和打印设置，调用方需保存此记录并在更换任一条件时重新标定。合成数据测试不视为真实标定。

稀疏阶梯实测使用 `record_calibration_points(profile_id, points, device_id=..., ink=..., material=..., settings=...)`；points 形如 `[{"layer":0,"mm":0},{"layer":实测层号,"mm":实测毫米值},...]`。至少两个点，必须从零层零毫米开始，层号在 0..256 严格递增，毫米值有限、非负、单调不减。函数仅在已测范围内分段线性插值得到逐层 mapping，并返回 binding、原 measuredPoints 和 interpolation 标记；最高实测层以外没有曲线项，工程使用更高层时由标准验证明确拒绝，禁止外推。插值是近似，不等于每层独立测量；测量不足时继续保留设计高度。

## 从阶梯图生成可打印工程

公开函数 `calibration_project(base_snapshot=None, levels=..., cell=32, cell_mm=5.0)` 返回 snapshot 和 measurementTemplate；默认包含 0/1/2/4/8/16/32/64/128/256 层，每格 5 mm，零层格仍保留彩色内容。无 base 使用 generic-unverified，有 base 时只复制其设备配置，工程使用新 sessionId 和设计映射。模板中的非零层 mm 均为 null，必须由真实测量填写，不预填设计高度。chartCells 给出从左到右各格层号及毫米位置，避免测量错格。

在 relief-studio 目录用项目 Python（`node scripts/python.cjs 脚本路径.py`）运行以下脚本，即可生成完整工程及真实输出文件。输出目录必须不存在；模板单独保存，避免改写已发布包。

```python
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / 'engine'))
from device_profile import calibration_project, record_calibration_points
from export_layers import export_bundle

data = calibration_project()  # 或 calibration_project(base_snapshot)
result = export_bundle(data['snapshot'], 'calibration-output', formats=('png','jpg'))
Path('calibration-measurements.json').write_text(
    json.dumps(data['measurementTemplate'], ensure_ascii=False, indent=2), encoding='utf-8')
print(result['outputDirectory'])

# 客户填写模板并实际测量后才执行下面录入；未填写值会明确报错。
# measured = json.loads(Path('calibration-measurements.json').read_text(encoding='utf-8'))
# record = record_calibration_points(measured['profileId'], measured['points'],
#     device_id=measured['deviceId'], ink=measured['ink'], material=measured['material'],
#     settings=measured['settings'])
# Path('calibration-record.json').write_text(
#     json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
# 应用工程时设置 snapshot['heightMapping'] = record['mapping']，并单独保存绑定记录。
```

验证：`node scripts/python.cjs -m unittest discover -s engine/tests`。输出测试逐像素累计重建高度、检查零层颜色、取消清理及拒绝覆盖；独立 OBJ 解析检查毫米尺寸、UV 与孔洞；设备测试覆盖极性、镜像旋转、层序和标定绑定。
