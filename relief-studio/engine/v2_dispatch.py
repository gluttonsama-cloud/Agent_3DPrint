"""无界面 v2 能力入口，供 Electron 与独立调用测试共同使用。"""
import json
from pathlib import Path

from project_v2 import decode_project, decode_raster, encode_project, migrate_v1
from v2_io import open_project, save_project


def execute_v2(job):
  action = job['action'].removeprefix('v2:')
  payload = job.get('payload', {})
  base = job.get('base', {'sessionId': job.get('requestId', 'standalone'), 'revision': 0})
  cancel_path = job.get('cancelPath')
  cancelled = lambda: bool(cancel_path and Path(cancel_path).exists())
  progress_path = job.get('progressPath')

  def progress(completed, total, message):
    if progress_path:
      Path(progress_path).write_text(json.dumps({'completed': completed, 'total': total,
                                               'message': message}), encoding='utf-8')

  try:
    if cancelled():
      return {'status': 'cancelled', 'base': base}
    if action == 'production':
      from production import execute
      value = execute(payload, cancelled, progress)
    elif action == 'open':
      value = open_project(payload['path'])
    elif action == 'import':
      from recognition_ops import import_snapshot
      value = encode_project(import_snapshot(payload['imageDataUrl'], payload['sizeMm'],
                                            payload.get('name', '未命名工程'),
                                            keep_background=payload.get('keepBackground', False),
                                            cancelled=cancelled))
    elif action == 'migrate':
      value = encode_project(migrate_v1(payload['project']))
    else:
      snapshot = decode_project(payload['snapshot'])
      base = {key: snapshot[key] for key in ('sessionId', 'revision')}
      selection = None
      if payload.get('selection') is not None:
        mask = payload['selection']
        if mask['width'] != snapshot['width'] or mask['height'] != snapshot['height']:
          raise ValueError('选区尺寸不一致')
        selection = decode_raster(mask['data'], 'uint8', snapshot['width'] * snapshot['height'])
        if (selection > 1).any():
          raise ValueError('选区仅允许 0/1')
      if action == 'height':
        from height_ops import run_height
        value = run_height(snapshot, payload['operation'], selection, cancelled=cancelled)
      elif action == 'recognition':
        from recognition_ops import recognize
        def recognition_mask(key):
          mask = payload.get(key)
          if mask is None:
            return None
          if mask['width'] != snapshot['width'] or mask['height'] != snapshot['height']:
            raise ValueError('识别蒙版尺寸不一致')
          value = decode_raster(mask['data'], 'uint8', snapshot['width'] * snapshot['height'])
          if (value > 1).any():
            raise ValueError('识别蒙版仅允许 0/1')
          return value
        value = recognize(snapshot, selection, keep_background=payload.get('keepBackground', False),
                          protection_policy=payload.get('protectionPolicy', 'preserve'),
                          prompt=payload.get('prompt'),
                          mode=payload.get('mode', 'subject'), color_count=payload.get('colorCount'),
                          tolerance=payload.get('tolerance', 12),
                          merge_material_shades=payload.get('mergeMaterialShades', False),
                          default_layers=payload.get('defaultLayers'),
                          subject_mask=recognition_mask('subjectMask'),
                          excluded_mask=recognition_mask('excludedMask'),
                          cancelled=cancelled)
      elif action == 'export':
        from export_layers import export_bundle
        value = export_bundle(snapshot, payload['outputDirectory'], formats=payload['formats'],
                              obj=payload.get('obj', False), device=payload.get('device'),
                              settings=payload.get('settings'), obj_options=payload.get('objOptions'),
                              print_format=payload.get('printFormat'), white_options=payload.get('whiteOptions'),
                              cancelled=cancelled, progress=progress)
      elif action == 'save':
        value = save_project(snapshot, payload['path'])
      else:
        raise ValueError('未知 v2 操作')
    # 文件提交完成后以成功为准；不把已经提交的产物谎报为取消。
    production_committed = action == 'production' and payload.get('mode') in ('batch', 'reprint', 'trial', 'model', 'record-trial')
    if cancelled() and action not in ('save', 'export') and not production_committed:
      return {'status': 'cancelled', 'base': base}
    return {'status': 'success', 'base': base, 'value': value}
  except Exception as error:
    if cancelled():
      return {'status': 'cancelled', 'base': base}
    return {'status': 'error', 'base': base, 'code': 'V2_OPERATION_FAILED', 'message': str(error)}
