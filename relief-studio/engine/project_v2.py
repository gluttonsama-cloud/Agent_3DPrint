"""v2 候选协议的独立编解码与迁移；不接入现有桌面保存入口。"""
import base64
import binascii
import copy
import json
import math
import re
from pathlib import Path
from uuid import uuid4

import numpy as np

from relief import validate_project

MAX_FILE_BYTES = 128 * 1024**2
MAX_EDGE = 2048
MAX_LAYERS = 256
RASTERS = {'original': ('uint8', 4), 'colors': ('uint8', 4),
           'labels': ('uint16', 1), 'heights': ('uint16', 1), 'protection': ('uint8', 1)}
FIELDS = set(RASTERS) | {'version', 'name', 'width', 'height', 'sizeMm', 'sessionId',
                        'revision', 'regions', 'heightMapping', 'device'}


def _integer(value, minimum, maximum, field):
  if type(value) is not int or not minimum <= value <= maximum:
    raise ValueError(f'{field}: 必须是 {minimum}..{maximum} 的整数')
  return value


def _number(value, field, positive=False):
  try:
    valid = (type(value) in (int, float) and math.isfinite(value)
             and value >= 0 and (not positive or value > 0))
  except OverflowError:
    valid = False
  if not valid:
    raise ValueError(f'{field}: 必须是有限的{"正数" if positive else "非负数"}')


def _text(value, field, nonempty=False):
  if not isinstance(value, str) or (nonempty and not value):
    raise ValueError(f'{field}: 字符串无效')


def _keys(value, expected, field):
  if not isinstance(value, dict) or set(value) != set(expected):
    raise ValueError(f'{field}: 字段缺失或包含未定义字段')


def encode_raster(array):
  """显式写小端；先验证类型，禁止负数或浮点被强转后静默截断。"""
  if (not isinstance(array, np.ndarray) or array.ndim != 1 or array.dtype.kind != 'u'
      or array.dtype.itemsize not in (1, 2) or array.size > MAX_EDGE**2 * 4):
    raise ValueError('raster: 必须是一维 uint8/uint16 数组，且不超过栅格上限')
  kind = 'uint8' if array.dtype.itemsize == 1 else 'uint16'
  dtype = np.dtype('u1' if kind == 'uint8' else '<u2')
  return {'type': kind, 'encoding': 'base64-le',
          'data': base64.b64encode(array.astype(dtype, copy=False).tobytes()).decode('ascii')}


def decode_raster(value, kind, count):
  _integer(count, 0, MAX_EDGE**2 * 4, 'raster.count')
  _keys(value, ('type', 'encoding', 'data'), 'raster')
  if kind not in ('uint8', 'uint16') or value['type'] != kind:
    raise ValueError('raster.type: 栅格类型不匹配')
  if value['encoding'] != 'base64-le' or not isinstance(value['data'], str):
    raise ValueError('raster.encoding: 需要 base64-le')
  expected = count * (1 if kind == 'uint8' else 2)
  if len(value['data']) != ((expected + 2) // 3) * 4:
    raise ValueError('raster.data: 编码长度与尺寸不一致')
  try:
    blob = base64.b64decode(value['data'], validate=True)
  except (ValueError, binascii.Error) as error:
    raise ValueError('raster.data: Base64 损坏') from error
  if len(blob) != expected or base64.b64encode(blob).decode('ascii') != value['data']:
    raise ValueError('raster.data: 非规范 Base64 或字节数不匹配')
  # copy 解除对解码字节的引用，保证返回可写且相互独立的数组。
  return np.frombuffer(blob, dtype='u1' if kind == 'uint8' else '<u2').astype(kind, copy=True)


def _metadata(project):
  _keys(project, FIELDS, 'project')
  _integer(project['version'], 2, 2, 'version')
  width = _integer(project['width'], 1, MAX_EDGE, 'width')
  height = _integer(project['height'], 1, MAX_EDGE, 'height')
  _integer(project['revision'], 0, 2**53 - 1, 'revision')
  _text(project['sessionId'], 'sessionId', nonempty=True)
  _text(project['name'], 'name')
  if not isinstance(project['sizeMm'], list) or len(project['sizeMm']) != 2:
    raise ValueError('sizeMm: 需要宽、高两个数值')
  for value in project['sizeMm']:
    _number(value, 'sizeMm', positive=True)
  regions = project['regions']
  if not isinstance(regions, list) or len(regions) > 65535:
    raise ValueError('regions: 区域数组无效')
  ids = set()
  for region in regions:
    _keys(region, ('id', 'name', 'color', 'defaultLayers'), 'region')
    region_id = _integer(region['id'], 1, 65535, 'region.id')
    if region_id in ids:
      raise ValueError('region.id: 区域编号重复')
    ids.add(region_id)
    _integer(region['defaultLayers'], 0, MAX_LAYERS, 'region.defaultLayers')
    _text(region['name'], 'region.name')
    if not isinstance(region['color'], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', region['color']):
      raise ValueError('region.color: 必须为十六进制 RGB')
  device = project['device']
  _keys(device, ('id', 'name', 'verified', 'whitePolarity', 'automaticWhite',
                 'colorSpace', 'iccPath'), 'device')
  _text(device['id'], 'device.id', nonempty=True)
  _text(device['name'], 'device.name')
  if (type(device['verified']) is not bool or
      device['whitePolarity'] not in ('white-is-ink', 'black-is-ink', 'unknown') or
      device['automaticWhite'] not in ('enabled', 'disabled', 'unknown') or
      device['colorSpace'] not in ('RGB', 'CMYK')):
    raise ValueError('device: 字段值无效')
  if device['iccPath'] is not None:
    _text(device['iccPath'], 'device.iccPath', nonempty=True)
  mapping = project['heightMapping']
  if not isinstance(mapping, dict):
    raise ValueError('heightMapping: 配置无效')
  if mapping.get('kind') == 'design':
    _keys(mapping, ('kind', 'mmPerLayer'), 'heightMapping')
    _number(mapping['mmPerLayer'], 'heightMapping.mmPerLayer', positive=True)
    if mapping['mmPerLayer'] != 0.1:
      raise ValueError('heightMapping.mmPerLayer: 未标定设计高度固定为 0.1 mm/层')
  elif mapping.get('kind') == 'calibrated':
    _keys(mapping, ('kind', 'profileId', 'mmByLayer'), 'heightMapping')
    _text(mapping['profileId'], 'heightMapping.profileId', nonempty=True)
    curve = mapping['mmByLayer']
    if not isinstance(curve, list) or not 1 <= len(curve) <= MAX_LAYERS + 1:
      raise ValueError('heightMapping.mmByLayer: 标定曲线长度无效')
    for value in curve:
      _number(value, 'heightMapping.mmByLayer')
    if curve[0] != 0 or any(a > b for a, b in zip(curve, curve[1:])):
      raise ValueError('heightMapping.mmByLayer: 必须从零开始且单调不减')
  else:
    raise ValueError('heightMapping.kind: 未知映射')
  return width * height, ids


def _pixels(project, count, ids):
  for field, (kind, channels) in RASTERS.items():
    array = project[field]
    if (not isinstance(array, np.ndarray) or array.ndim != 1 or array.size != count * channels
        or array.dtype.kind != 'u' or array.dtype.itemsize != (1 if kind == 'uint8' else 2)):
      raise ValueError(f'{field}: 栅格类型、形状或尺寸不匹配')
  labels, heights = project['labels'], project['heights']
  if not set(np.unique(labels).tolist()) <= ids | {0}:
    raise ValueError('labels: 引用未知区域')
  if np.any(heights > MAX_LAYERS):
    raise ValueError('heights: 超过 256 层')
  if np.any((labels == 0) & (heights != 0)):
    raise ValueError('heights: 非打印像素必须为零层')
  if np.any((project['original'][3::4] == 0) & (labels != 0)):
    raise ValueError('labels: 原图透明像素不能打印')
  if np.any(project['protection'] > 7):
    raise ValueError('protection: 未定义保护位')
  mapping = project['heightMapping']
  if mapping['kind'] == 'calibrated' and int(heights.max()) >= len(mapping['mmByLayer']):
    raise ValueError('heightMapping.mmByLayer: 高度超出标定范围，禁止外推')


def decode_project(value):
  count, ids = _metadata(value)
  result = {key: copy.deepcopy(item) for key, item in value.items() if key not in RASTERS}
  for field, (kind, channels) in RASTERS.items():
    try:
      result[field] = decode_raster(value[field], kind, count * channels)
    except ValueError as error:
      raise ValueError(f'{field}: {error}') from error
  _pixels(result, count, ids)
  return result


def encode_project(value):
  count, ids = _metadata(value)
  _pixels(value, count, ids)
  return {key: encode_raster(item) if key in RASTERS else copy.deepcopy(item)
          for key, item in value.items()}


def _unique_object(pairs):
  result = {}
  for key, value in pairs:
    if key in result:
      raise ValueError(f'JSON 字段重复: {key}')
    result[key] = value
  return result


def _invalid_constant(value):
  raise ValueError(f'JSON 不支持非有限数值: {value}')


def loads_project(data):
  """只读取 v2；v1 必须显式迁移，避免隐式覆盖旧工程。"""
  if not isinstance(data, (str, bytes)):
    raise ValueError('工程输入必须为 UTF-8 文本或字节')
  if len(data) > MAX_FILE_BYTES:
    raise ValueError('工程超过 128 MiB 上限')
  try:
    blob = data.encode('utf-8') if isinstance(data, str) else data
    if len(blob) > MAX_FILE_BYTES:
      raise ValueError('工程超过 128 MiB 上限')
    value = json.loads(blob.decode('utf-8'), object_pairs_hook=_unique_object,
                       parse_constant=_invalid_constant)
  except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
    raise ValueError(f'工程 JSON/UTF-8 损坏: {error}') from error
  return decode_project(value)


def dumps_project(project):
  try:
    result = json.dumps(encode_project(project), ensure_ascii=False, allow_nan=False,
                        separators=(',', ':'))
    if len(result.encode('utf-8')) > MAX_FILE_BYTES:
      raise ValueError('工程超过 128 MiB 上限')
  except (TypeError, UnicodeError, OverflowError) as error:
    raise ValueError(f'工程无法序列化: {error}') from error
  return result


def load_project(path):
  with Path(path).open('rb') as stream:
    return loads_project(stream.read(MAX_FILE_BYTES + 1))


def migrate_v1(project, *, session_id=None):
  """纯内存迁移。v1 不含独立原图，只能将其现存 image 作为恢复基准。"""
  rgba, labels = validate_project(project)
  heights = np.zeros(labels.shape, dtype=np.uint16)
  for region in project['regions']:
    heights[labels == region['id']] = region['layers']
  result = {
    'version': 2, 'name': project['name'], 'width': project['width'], 'height': project['height'],
    'sizeMm': copy.deepcopy(project['sizeMm']), 'sessionId': str(uuid4()) if session_id is None
    else session_id, 'revision': 0, 'original': rgba.ravel().copy(), 'colors': rgba.ravel().copy(),
    'labels': labels.ravel().copy(), 'heights': heights.ravel(),
    'protection': np.zeros(labels.size, dtype=np.uint8),
    'regions': [{'id': r['id'], 'name': r['name'], 'color': r['color'],
                 'defaultLayers': r['layers']} for r in project['regions']],
    'heightMapping': {'kind': 'design', 'mmPerLayer': 0.1},
    'device': {'id': 'generic-unverified', 'name': '通用未验证配置', 'verified': False,
               'whitePolarity': 'unknown', 'automaticWhite': 'unknown', 'colorSpace': 'RGB',
               'iccPath': None},
  }
  count, ids = _metadata(result)
  _pixels(result, count, ids)
  return result
