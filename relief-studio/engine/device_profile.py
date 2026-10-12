"""独立输出设置与阶梯标定；工程内 DeviceProfile 字段保持 v2 契约。"""
import math
import copy
from uuid import uuid4

import numpy as np


GENERIC_DEVICE = {'id': 'generic-unverified', 'name': '通用未验证配置',
                  'verified': False, 'whitePolarity': 'unknown',
                  'automaticWhite': 'unknown', 'colorSpace': 'RGB', 'iccPath': None}


def output_settings(value=None):
  """校验打印设置；未知设备语义保持未验证。"""
  result = {'mirror': False, 'rotation': 0, 'order': 'white-first',
            'whiteRepeats': 1, 'colorRepeats': 1}
  if value is not None:
    if not isinstance(value, dict) or set(value) - set(result):
      raise ValueError('打印设置字段无效')
    result.update(value)
  if (type(result['mirror']) is not bool or type(result['rotation']) is not int
      or result['rotation'] not in (0, 90, 180, 270)
      or result['order'] not in ('white-first', 'color-first')
      or any(type(result[k]) is not int or not 1 <= result[k] <= 256
             for k in ('whiteRepeats', 'colorRepeats'))):
    raise ValueError('打印设置取值无效')
  return result


def orient(array, settings):
  """先水平镜像，再顺时针旋转；返回独立数组。"""
  config = output_settings(settings)
  result = np.fliplr(array) if config['mirror'] else array
  return np.rot90(result, -(config['rotation'] // 90)).copy()


def white_values(mask, polarity):
  if polarity not in ('white-is-ink', 'black-is-ink', 'unknown'):
    raise ValueError('白墨极性无效')
  # unknown 使用规范母版编码，不声明设备支持该编码。
  return np.where(mask, 0 if polarity == 'black-is-ink' else 255,
                  255 if polarity == 'black-is-ink' else 0).astype(np.uint8)


def task_order(layer_count, settings):
  if type(layer_count) is not int or not 0 <= layer_count <= 256:
    raise ValueError('白墨层数无效')
  config = output_settings(settings)
  white = [{'role': 'white', 'layer': i, 'repeat': repeat}
           for i in range(1, layer_count + 1)
           for repeat in range(1, config['whiteRepeats'] + 1)]
  color = [{'role': 'color', 'repeat': repeat}
           for repeat in range(1, config['colorRepeats'] + 1)]
  return white + color if config['order'] == 'white-first' else color + white


def calibration_chart(levels=(0, 1, 2, 4, 8, 16, 32, 64, 128, 256), cell=32):
  if (not isinstance(levels, (list, tuple)) or not levels or
      any(type(v) is not int or not 0 <= v <= 256 for v in levels) or
      type(cell) is not int or not 4 <= cell <= 1024 or len(levels) * cell > 2048):
    raise ValueError('标定阶梯参数无效')
  chart = np.repeat(np.asarray(levels, dtype=np.uint16), cell)
  return np.repeat(chart[None, :], cell, axis=0)


def record_calibration(profile_id, measurements, *, device_id, ink, material, settings):
  if any(not isinstance(v, str) or not v for v in (profile_id, device_id, ink, material)):
    raise ValueError('标定绑定信息不完整')
  if (not isinstance(measurements, (list, tuple)) or not 1 <= len(measurements) <= 257
      or any(type(v) not in (int, float) or not math.isfinite(v) or v < 0
             for v in measurements)
      or measurements[0] != 0 or any(a > b for a, b in zip(measurements, measurements[1:]))):
    raise ValueError('标定曲线必须从零开始且单调不减')
  return {'mapping': {'kind': 'calibrated', 'profileId': profile_id,
                      'mmByLayer': list(measurements)},
          'binding': {'deviceId': device_id, 'ink': ink, 'material': material,
                      'settings': output_settings(settings)}}


def record_calibration_points(profile_id, points, *, device_id, ink, material, settings):
  """仅在实测层数闭区间内逐层线性插值，禁止外推及虚造测量。"""
  if not isinstance(points, (list, tuple)) or not 2 <= len(points) <= 257:
    raise ValueError('至少需要零层与一个非零层实测点')
  measured=[]
  for point in points:
    if (not isinstance(point,dict) or set(point)!={'layer','mm'}
        or type(point['layer']) is not int or not 0 <= point['layer'] <= 256
        or type(point['mm']) not in (int,float) or not math.isfinite(point['mm'])
        or point['mm'] < 0):
      raise ValueError('实测点必须包含 0..256 整数 layer 与有限非负 mm')
    measured.append(dict(point))
  if measured[0]!={'layer':0,'mm':0}:
    raise ValueError('实测点必须从 layer=0, mm=0 开始')
  if any(a['layer']>=b['layer'] or a['mm']>b['mm'] for a,b in zip(measured,measured[1:])):
    raise ValueError('实测层号必须严格递增，毫米厚度必须单调不减')
  curve=[0.0]
  for start,end in zip(measured,measured[1:]):
    for layer in range(start['layer']+1,end['layer']+1):
      fraction=(layer-start['layer'])/(end['layer']-start['layer'])
      # 凸组合避免两个合法有限值相减/相加造成浮点溢出。
      curve.append((1-fraction)*start['mm']+fraction*end['mm'])
  result=record_calibration(profile_id,curve,device_id=device_id,ink=ink,
                            material=material,settings=settings)
  result['measuredPoints']=measured
  result['interpolation']={'method':'piecewise-linear','measuredRange':[0,measured[-1]['layer']],
                           'extrapolation':False}
  return result


def calibration_project(base_snapshot=None, *, levels=(0,1,2,4,8,16,32,64,128,256),
                        cell=32, cell_mm=5.0):
  """生成可保存/导出的完整 v2 阶梯工程及留空测量模板。"""
  from project_v2 import dumps_project
  if base_snapshot is not None:
    dumps_project(base_snapshot)
  if type(cell_mm) not in (int,float) or not math.isfinite(cell_mm) or cell_mm<=0:
    raise ValueError('标定单元毫米尺寸必须为有限正数')
  chart=calibration_chart(levels,cell)
  height,width=chart.shape
  rgba=np.tile(np.array([128,128,128,255],dtype='uint8'),width*height)
  snapshot={'version':2,'name':'白墨阶梯标定','width':width,'height':height,
    'sizeMm':[len(levels)*cell_mm,cell_mm],'sessionId':str(uuid4()),'revision':0,
    'original':rgba.copy(),'colors':rgba.copy(),'labels':np.ones(width*height,dtype='uint16'),
    'heights':chart.ravel().copy(),'protection':np.zeros(width*height,dtype='uint8'),
    'regions':[{'id':1,'name':'标定阶梯','color':'#808080','defaultLayers':0}],
    'heightMapping':{'kind':'design','mmPerLayer':0.1},
    'device':copy.deepcopy(GENERIC_DEVICE if base_snapshot is None else base_snapshot['device'])}
  dumps_project(snapshot)
  template={'profileId':'','deviceId':snapshot['device']['id'],'ink':'','material':'',
            'settings':output_settings(),
            'points':[{'layer':layer,'mm':0 if layer==0 else None} for layer in sorted(set(levels))],
            'chartCells':[{'index':index,'layer':layer,'xRangeMm':[index*cell_mm,(index+1)*cell_mm]}
                          for index,layer in enumerate(levels)]}
  return {'snapshot':snapshot,'measurementTemplate':template}
