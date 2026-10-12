"""v2 无损母版及打印适配输出；完整成功后发布目录。"""
import json
import os
import shutil
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms

from project_v2 import dumps_project
from device_profile import white_values, output_settings, orient, task_order


def checkpoint(cancelled):
  if cancelled():
    raise InterruptedError('输出已取消')


def jpeg_check(source, decoded):
  """记录有损灰值及阈值范围差异；孔洞由背景连通分量独立统计。"""
  import cv2
  before, after = source >= 128, decoded >= 128
  def holes(mask):
    padded = np.pad(~mask, 1, constant_values=True).astype('uint8')
    count, _ = cv2.connectedComponents(padded, connectivity=4)
    return count - 2
  delta = np.abs(source.astype('int16') - decoded.astype('int16'))
  boundary = np.zeros(before.shape, dtype=bool)
  boundary[:,1:] |= before[:,1:] != before[:,:-1]
  boundary[:,:-1] |= before[:,1:] != before[:,:-1]
  boundary[1:,:] |= before[1:,:] != before[:-1,:]
  boundary[:-1,:] |= before[1:,:] != before[:-1,:]
  edge = delta[boundary]
  return {'maxGrayError': int(delta.max()), 'meanGrayError': float(delta.mean()),
          'edgePixels': int(edge.size), 'edgeMaxGrayError': int(edge.max()) if edge.size else 0,
          'edgeMeanGrayError': float(edge.mean()) if edge.size else 0.0,
          'thresholdPixelDifference': int(np.count_nonzero(before != after)),
          'holesBefore': holes(before), 'holesAfter': holes(after)}


def export_bundle(snapshot, destination, *, formats=('png',), obj=False, device=None, settings=None,
                  cancelled=lambda: False, progress=lambda completed, total, message: None):
  serialized = dumps_project(snapshot)
  config = output_settings(settings)
  if not formats or set(formats) - {'png', 'jpg', 'jpeg'}:
    raise ValueError('输出格式只支持 png/jpg/jpeg')
  profile = snapshot['device'] if device is None else device
  # 复用工程验证，避免另建 DeviceProfile 字段规则。
  dumps_project(dict(snapshot, device=profile))
  if profile['colorSpace'] == 'CMYK' and not profile['iccPath']:
    raise ValueError('CMYK 输出需要 ICC 配置')
  destination = Path(destination).absolute()
  if destination.exists():
    raise FileExistsError('输出目录已存在，禁止覆盖')
  checkpoint(cancelled)
  destination.parent.mkdir(parents=True, exist_ok=True)
  temporary = Path(tempfile.mkdtemp(prefix='.relief-output-', dir=destination.parent))
  files, checks, reports = [], [], []
  for code, condition, message in [
      ('DEVICE_UNVERIFIED', not profile['verified'], '设备配置未经实机验证'),
      ('POLARITY_UNKNOWN', profile['whitePolarity'] == 'unknown', '白墨极性未知，适配采用白色有墨'),
      ('AUTO_WHITE_UNKNOWN', profile['automaticWhite'] == 'unknown', 'RIP 自动白底行为未知'),
      ('AUTO_WHITE_ENABLED', profile['automaticWhite'] == 'enabled', 'RIP 自动白底开启，可能改变白墨范围')]:
    if condition:
      checks.append({'code':code,'status':'warning','message':message})
  try:
    width, height = snapshot['width'], snapshot['height']
    coverage = snapshot['labels'].reshape(height, width) != 0
    heights = snapshot['heights'].reshape(height, width)
    color = snapshot['colors'].reshape(height, width, 4).copy()
    color[~coverage, 3] = 0
    maximum = int(heights.max())
    adapted = settings is not None or bool({'jpg','jpeg'} & set(formats))
    jpeg = bool({'jpg','jpeg'} & set(formats))
    total = maximum + 5 + ((maximum + 1) * (int('png' in formats)+int(jpeg)) + 1 if adapted else 0) + (4 if obj else 0) + (1 if jpeg else 0)
    def added(name, role):
      files.append({'path':str(destination / name), 'role':role})
      progress(len(files), total, name)
    def save(image, name):
      checkpoint(cancelled)
      image.save(temporary / name)
      added(name, 'white' if name.startswith('white/') else name.split('.')[0])
    (temporary / 'project.json').write_text(serialized, encoding='utf-8')
    added('project.json','project')
    save(Image.fromarray(color), 'color.png')
    save(Image.fromarray(coverage.astype('uint8') * 255), 'coverage.png')
    save(Image.fromarray(heights), 'height.png')
    (temporary / 'white').mkdir()
    for layer in range(1, maximum + 1):
      save(Image.fromarray(np.where(coverage & (heights >= layer), 255, 0).astype('uint8')),
           f'white/{layer:04d}.png')
    if adapted:
      (temporary / 'adapted').mkdir()
      rgb = np.full((height, width, 3), 255, dtype='uint8')
      alpha = color[:, :, 3:4].astype('float64') / 255
      flattened = np.rint(color[:, :, :3] * alpha + 255 * (1-alpha)).astype('uint8')
      rgb[coverage] = flattened[coverage]
      image = Image.fromarray(orient(rgb,config))
      if profile['colorSpace'] == 'CMYK':
        image = ImageCms.profileToProfile(image, ImageCms.createProfile('sRGB'),
                                          str(profile['iccPath']), outputMode='CMYK')
      if image.mode=='CMYK' and 'png' in formats:
        raise ValueError('PNG 不支持 CMYK，CMYK 适配请选择仅 JPG')
      adapted_size=list(image.size)
      def images():
        yield 'color',image,None
        for layer in range(1,maximum+1):
          checkpoint(cancelled)
          pixels=orient(white_values(coverage & (heights>=layer),profile['whitePolarity']),config)
          yield f'{layer:04d}',Image.fromarray(pixels),pixels
      for stem,adapted_image,pixels in images():
        for extension in (['png'] if 'png' in formats else []) + (['jpg'] if jpeg else []):
          checkpoint(cancelled)
          name=f'adapted/{stem}.{extension}'
          adapted_image.save(temporary/name, **({'quality':95,'subsampling':0} if extension=='jpg' else {}))
          added(name,'color' if stem=='color' else 'white')
          if pixels is not None and extension=='jpg':
            decoded=np.asarray(Image.open(temporary/name).convert('L'))
            ink_source,ink_decoded=(255-pixels,255-decoded) if profile['whitePolarity']=='black-is-ink' else (pixels,decoded)
            reports.append(dict(file=name,**jpeg_check(ink_source,ink_decoded)))
      (temporary/'adapted/orientation.json').write_text(json.dumps({'settings':config,'masterDirection':'x-right-y-down','adaptedPixels':adapted_size,'physicalSizeMm':snapshot['sizeMm'][::-1] if config['rotation'] in (90,270) else snapshot['sizeMm']}),encoding='utf-8')
      added('adapted/orientation.json','project')
    if jpeg:
      (temporary/'jpeg-report.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
      added('jpeg-report.json','project')
      changed=any(r['thresholdPixelDifference'] or r['holesBefore']!=r['holesAfter'] for r in reports)
      checks.append({'code':'JPEG_ROUNDTRIP','status':'warning' if changed else 'passed','message':'JPEG 阈值轮廓或孔洞发生变化，见 jpeg-report.json' if changed else 'JPEG 阈值轮廓及孔洞回读一致；灰值误差见 jpeg-report.json'})
    if obj:
      from export_obj import export_obj
      for name in export_obj(snapshot, temporary, cancelled=cancelled)['files']:
        added(name,'obj')
    extension='jpg' if jpeg else 'png'
    tasks=[dict(task,step=index+1,channel=task['role'],format=extension,
                file=f'adapted/{task["layer"]:04d}.{extension}' if task['role']=='white' else f'adapted/color.{extension}')
           for index,task in enumerate(task_order(maximum,config))]
    if not adapted:
      for task in tasks:
        task['file']=f'white/{task["layer"]:04d}.png' if task['role']=='white' else 'color.png'
    manifest = {'source': {'sessionId': snapshot['sessionId'], 'revision': snapshot['revision']},
                'tasks':tasks, 'totalSteps':len(tasks), 'whiteLayerCount':maximum,
                'whiteTaskCount':maximum*config['whiteRepeats'],'colorTaskCount':config['colorRepeats'],
                'geometryLayers':maximum,'repeatChangesGeometry':False,
                'pixelSize':[width,height], 'sizeMm':snapshot['sizeMm'],
                'masterDirection':'x-right-y-down', 'objDirection':'x-right-y-up-z-up',
                'heightMapping':snapshot['heightMapping'],
                'heightCalibrationStatus':'design-unverified' if snapshot['heightMapping']['kind']=='design' else 'recorded-not-device-verified',
                'device': profile, 'polarityVerified': profile['verified'] and
                profile['whitePolarity'] != 'unknown', 'checks': checks,
                'jpegDetails':reports, 'settings':config,
                'masterWhitePolarity': 'white-is-ink', 'files': files.copy(), 'simulated': False}
    (temporary / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    added('manifest.json','project')
    checkpoint(cancelled)
    # Windows rename 对已存在目录失败；不采用会替换目标的 replace。
    os.rename(temporary, destination)
    return {'outputDirectory': str(destination), 'files': files, 'checks': checks, 'simulated': False}
  except BaseException:
    shutil.rmtree(temporary, ignore_errors=True)
    raise
