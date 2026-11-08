"""生产任务：独立副本、毫米拼版、白墨补偿、估算与可恢复批次。"""
import copy
import json
import math
import os
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import cv2
import numpy as np
from project_v2 import decode_project, encode_project, dumps_project
from device_profile import output_settings


def number(value, name, low=0, high=10000):
  if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
    raise ValueError(f'{name} 必须在 {low}..{high} 范围内')
  return value


def white_config(value=None):
  result = {'mode': 'solid', 'threshold': 1, 'insetMm': 0, 'offsetXmm': 0, 'offsetYmm': 0}
  if value is not None:
    if not isinstance(value, dict) or set(value)-set(result):
      raise ValueError('白墨设置字段无效')
    result.update(value)
  if result['mode'] not in ('solid', 'alpha', 'threshold'):
    raise ValueError('白墨覆盖模式无效')
  number(result['threshold'], '透明度阈值', 1, 255)
  number(result['insetMm'], '边缘内缩（负值扩张）', -10, 10)
  for key in ('offsetXmm', 'offsetYmm'):
    number(result[key], '套准偏移', -10, 10)
  return result


def white_masks(snapshot, options=None):
  config = white_config(options)
  h, w = snapshot['height'], snapshot['width']
  labels = snapshot['labels'].reshape(h,w) != 0
  heights = snapshot['heights'].reshape(h,w)
  alpha = snapshot['colors'].reshape(h,w,4)[:,:,3]
  sx, sy = w/snapshot['sizeMm'][0], h/snapshot['sizeMm'][1]
  rx, ry = (int(round(abs(config['insetMm'])*v)) for v in (sx,sy))
  if max(rx,ry) > 2048:
    raise ValueError('补偿范围超过图像上限')
  kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (rx*2+1,ry*2+1))
  matrix = np.float32([[1,0,round(config['offsetXmm']*sx)], [0,1,round(config['offsetYmm']*sy)]])
  def mask(layer):
    active = labels & (heights >= layer)
    values = np.where(active, alpha if config['mode']=='alpha' else
                      np.where(alpha >= config['threshold'],255,0) if config['mode']=='threshold' else 255, 0).astype('uint8')
    if rx or ry:
      operation = cv2.erode if config['insetMm'] > 0 else cv2.dilate
      values = operation(values, kernel, borderType=cv2.BORDER_CONSTANT, borderValue=0)
    return cv2.warpAffine(values, matrix, (w,h), flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT)
  return mask


def estimate(snapshot, settings=None, options=None, rates=None):
  config = output_settings(settings)
  masks = white_masks(snapshot, options)
  area = snapshot['sizeMm'][0]*snapshot['sizeMm'][1]/(snapshot['width']*snapshot['height'])
  white = sum(float(masks(layer).sum())/255*area for layer in range(1,int(snapshot['heights'].max())+1))*config['whiteRepeats']
  color = float(np.where(snapshot['labels'] != 0,snapshot['colors'][3::4],0).sum())/255*area*config['colorRepeats']
  result = {'whiteAreaMm2Passes':white, 'colorAreaMm2Passes':color,
            'passes':int(snapshot['heights'].max())*config['whiteRepeats']+config['colorRepeats'],
            'inkMl':None,'seconds':None,'cost':None,'status':'缺少设备实测系数，仅计算覆盖面积与遍数'}
  if rates is not None:
    for key in ('whiteMlPerMm2','colorMlPerMm2','secondsPerPass','setupSeconds','costPerMl'):
      number(rates[key],key,0,1e9)
    result['inkMl'] = white*rates['whiteMlPerMm2']+color*rates['colorMlPerMm2']
    result['seconds'] = result['passes']*rates['secondsPerPass']+rates['setupSeconds']
    result['cost'] = result['inkMl']*rates['costPerMl']
    result['status'] = '按录入系数估算；不代表设备实测结果'
  return result


def compose(items, size, pixels_per_mm, gap=0, marks=False):
  """显式重采样到统一网格；不静默缩小或混用不同标定。"""
  if not isinstance(items,list) or not 1 <= len(items) <= 100:
    raise ValueError('拼版需要 1..100 个作品')
  if not isinstance(size,list) or len(size)!=2:
    raise ValueError('工作台尺寸需要宽高')
  for v in size:
    number(v,'工作台毫米尺寸',0.01,10000)
  number(pixels_per_mm,'每毫米像素',0.01,2048)
  number(gap,'间距',0,1000)
  w,h = (int(round(v*pixels_per_mm)) for v in size)
  if not 1 <= min(w,h) <= max(w,h) <= 2048:
    raise ValueError('拼版栅格每边必须在 1..2048 像素；请明确调整采样密度或版面尺寸')
  sources = [decode_project(item['snapshot']) for item in items]
  if any(p['heightMapping'] != sources[0]['heightMapping'] for p in sources):
    raise ValueError('拼版作品的高度映射必须一致；请先确认标定')
  result = copy.deepcopy(sources[0])
  result.update(name='生产拼版',width=w,height=h,sizeMm=size,sessionId=str(uuid4()),revision=0,
                regions=[{'id':1,'name':'拼版','color':'#808080','defaultLayers':0}])
  result['colors'] = np.zeros((h,w,4),dtype='uint8')
  result['original'] = np.zeros((h,w,4),dtype='uint8')
  result['labels'] = np.zeros((h,w),dtype='uint16')
  result['heights'] = np.zeros((h,w),dtype='uint16')
  result['protection'] = np.zeros((h,w),dtype='uint8')
  placements=[]
  for item, source in zip(items,sources):
    rotation=item.get('rotation',0)
    if type(rotation) is not int or rotation not in (0,90,180,270):
      raise ValueError('作品旋转只支持 0/90/180/270 度')
    sw,sh=source['sizeMm'][::-1] if rotation in (90,270) else source['sizeMm']
    x,y=item['xMm'],item['yMm']
    number(x,'X位置'); number(y,'Y位置')
    if x+sw>size[0]+1e-9 or y+sh>size[1]+1e-9:
      raise ValueError('作品超出工作台')
    if any(not (x+sw+gap<=p['xMm'] or p['xMm']+p['widthMm']+gap<=x or
                y+sh+gap<=p['yMm'] or p['yMm']+p['heightMm']+gap<=y) for p in placements):
      raise ValueError('作品相交或间距不足')
    x0,y0,x1,y1 = round(x/size[0]*w),round(y/size[1]*h),round((x+sw)/size[0]*w),round((y+sh)/size[1]*h)
    if x0==x1 or y0==y1:
      raise ValueError('作品小于一个采样像素')
    for field in ('colors','original','labels','heights','protection'):
      shape=(source['height'],source['width'],4) if field in ('colors','original') else (source['height'],source['width'])
      data=np.rot90(source[field].reshape(shape),-rotation//90)
      data=cv2.resize(data,(x1-x0,y1-y0),interpolation=cv2.INTER_NEAREST)
      result[field][y0:y1,x0:x1] = (data!=0).astype('uint16') if field=='labels' else data
    placements.append({'name':source['name'],'xMm':x,'yMm':y,'widthMm':sw,'heightMm':sh,'rotation':rotation})
  if marks:
    # 定位标记占用边角；拒绝覆盖作品，防止无提示改变设计。
    radius=max(1,round(pixels_per_mm))
    for x,y in ((radius,radius),(w-radius-1,radius),(radius,h-radius-1),(w-radius-1,h-radius-1)):
      if x-radius<0 or y-radius<0:
        raise ValueError('工作台不足以放置定位标记')
      view=(slice(y-radius,y+radius+1),slice(x-radius,x+radius+1))
      if np.any(result['labels'][view]):
        raise ValueError('定位标记与作品重叠，请预留边距')
      result['colors'][view]=[0,0,0,255]; result['original'][view]=[0,0,0,255]
      result['labels'][view]=1
  for field in ('colors','original','labels','heights','protection'):
    result[field]=result[field].ravel()
  dumps_project(result)
  return result,placements


def fresh_directory(parent,name):
  name=re.sub(r'[^\w\-\u4e00-\u9fff]+','_',name)[:60] or 'production'
  return Path(parent).absolute()/f'{name}_{datetime.now().strftime("%Y%m%d_%H%M%S")}_{uuid4().hex[:8]}'


def atomic_json(path,value):
  temporary=path.with_suffix('.tmp')
  serialized=json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)
  if len(serialized.encode('utf-8')) > 128*1024**2:
    raise ValueError('生产记录超过 128 MiB，请分批输出')
  temporary.write_text(serialized,encoding='utf-8')
  os.replace(temporary,path)


def batch(payload,cancelled,progress):
  """每项独立提交。交付记录始终保存工程快照，可跨进程重印。"""
  from export_layers import export_bundle
  entries=payload['entries']
  if not isinstance(entries,list) or not 1 <= len(entries) <= 100:
    raise ValueError('批次需要 1..100 项')
  config=output_settings(payload.get('settings'))
  white_config(payload.get('whiteOptions'))
  directory=fresh_directory(payload['parentDirectory'],'生产批次')
  directory.mkdir(parents=True)
  record={'version':1,'settings':config,'device':payload.get('device'),'formats':payload.get('formats',['png']),
          'printFormat':payload.get('printFormat','png'),'whiteOptions':payload.get('whiteOptions'),
          'entries':[],'deviceHandoff':'generic-unverified'}
  for i,entry in enumerate(entries):
    record['entries'].append({'id':i,'status':'pending','snapshot':entry['snapshot'],'name':entry.get('name',f'作品{i+1}')})
  atomic_json(directory/'batch.json',record)
  for i,entry in enumerate(record['entries']):
    if cancelled():
      break
    try:
      snapshot=decode_project(entry['snapshot'])
      target=directory/f'{i+1:03d}'
      export_bundle(snapshot,target,formats=record['formats'],device=record['device'],settings=config,
                    print_format=record['printFormat'],white_options=record['whiteOptions'],cancelled=cancelled,
                    progress=lambda done,total,message:progress(i+done/max(total,1),len(entries),message))
      entry.update(status='success',outputDirectory=str(target))
    except InterruptedError:
      entry['status']='cancelled'
    except Exception as error:
      entry.update(status='failed',error=str(error))
    atomic_json(directory/'batch.json',record)
    progress(i+1,len(entries),entry['name']+'：'+entry['status'])
  return {'outputDirectory':str(directory),'entries':[{k:v for k,v in e.items() if k!='snapshot'} for e in record['entries']],
          'cancelled':cancelled()}


def execute(payload,cancelled,progress):
  mode=payload['mode']
  if mode=='batch':
    return batch(payload,cancelled,progress)
  if mode=='reprint':
    from v2_io import read_json
    record=read_json(payload['recordPath'])
    ids=payload['ids']
    if not isinstance(ids,list) or not ids or any(type(i) is not int or i<0 or i>=len(record['entries']) for i in ids):
      raise ValueError('请选择有效的补打作品编号')
    return batch({**record,'entries':[record['entries'][i] for i in ids],
                  'parentDirectory':payload['parentDirectory']},cancelled,progress)
  if mode=='layout':
    result,placements=compose(payload['items'],payload['sizeMm'],payload['pixelsPerMm'],payload.get('gapMm',0),payload.get('marks',False))
    return {'snapshot':encode_project(result),'placements':placements}
  if mode=='record-trial':
    from v2_io import read_json
    record_path=Path(payload['recordPath'])
    if record_path.name != 'trial.json':
      raise ValueError('请选择 trial.json 试印记录')
    record=read_json(record_path)
    if 'variant' not in record or 'source' not in record:
      raise ValueError('试印记录无效')
    photos=payload.get('photoPaths',[])
    if not isinstance(photos,list) or any(not isinstance(p,str) or not Path(p).is_file() for p in photos):
      raise ValueError('照片路径不存在')
    measurements=payload.get('measurements',[])
    if not isinstance(measurements,list):
      raise ValueError('测量值必须为数组')
    for measurement in measurements:
      number(measurement,'试印厚度',0,10000)
    record.update(photoPaths=photos,measurements=measurements,selected=bool(payload.get('selected',False)))
    atomic_json(record_path,record)
    return {'variant':record['variant'],'recordPath':str(record_path)}
  snapshot=decode_project(payload['snapshot'])
  if mode=='preview':
    from PIL import Image
    import base64,io
    from device_profile import orient
    config=output_settings(payload.get('settings'))
    layer=payload.get('layer',1)
    if type(layer) is not int or not 1<=layer<=256:
      raise ValueError('预览层号需要 1..256')
    pixels=white_masks(snapshot,payload.get('whiteOptions'))(layer)
    if payload.get('polarity')=='black-is-ink': pixels=255-pixels
    stream=io.BytesIO(); Image.fromarray(orient(pixels,config)).save(stream,format='PNG')
    return {'image':'data:image/png;base64,'+base64.b64encode(stream.getvalue()).decode()}
  if mode=='model':
    from export_obj import export_obj
    import shutil
    destination=fresh_directory(payload['parentDirectory'],snapshot['name']+'-模型')
    stage=destination.with_name('.'+destination.name)
    try:
      result=export_obj(snapshot,stage,options=payload.get('objOptions'),cancelled=cancelled,progress=progress)
      stage.rename(destination)
      return {**result,'outputDirectory':str(destination)}
    except BaseException:
      shutil.rmtree(stage,ignore_errors=True)
      raise
  if mode=='inspect':
    return inspect(snapshot,payload.get('objOptions',{}),payload.get('minimumMm',0.3))
  if mode=='estimate':
    return estimate(snapshot,payload.get('settings'),payload.get('whiteOptions'),payload.get('rates'))
  if mode=='trial':
    variants=payload['variants']
    if not isinstance(variants,list) or not 1<=len(variants)<=16:
      raise ValueError('试印方案数量必须在 1..16')
    outcomes=[]
    for variant in variants:
      if cancelled(): break
      try:
        candidate=copy.deepcopy(snapshot)
        factor=number(variant.get('heightFactor',1),'高度比例',0,4)
        heights=np.rint(candidate['heights'].astype(float)*factor)
        if heights.max()>256:
          raise ValueError('试印高度超出 256 层')
        candidate['heights']=heights.astype('uint16')
        candidate['name']=variant['name']
        outcome=batch({**payload,'entries':[{'snapshot':encode_project(candidate),'name':variant['name']}],
                       'whiteOptions':variant.get('whiteOptions')},cancelled,progress)
        atomic_json(Path(outcome['outputDirectory'])/'trial.json',{'variant':variant,'photoPaths':[],
                    'measurements':[],'selected':False,'source':encode_project(snapshot)})
        outcomes.append(outcome)
      except Exception as error:
        outcomes.append({'name':variant.get('name','未命名'),'status':'failed','error':str(error)})
    return {'trials':outcomes}
  if mode=='calibration':
    from device_profile import record_calibration_points
    record=record_calibration_points(payload['profileId'],payload['points'],device_id=snapshot['device']['id'],
           ink=payload['ink'],material=payload['material'],settings=payload['settings'])
    snapshot['heightMapping']=record['mapping']
    return {'snapshot':encode_project(snapshot),'calibration':record}
  if mode=='chart':
    from device_profile import calibration_project
    value=calibration_project(snapshot)
    return {**value,'snapshot':encode_project(value['snapshot'])}
  raise ValueError('未知生产操作')


def inspect(snapshot, options, minimum):
  """报告修复像素与平面细节；侧视厚度由共享网格映射计算。"""
  from height_mesh import prepare_heights
  import base64
  import io
  from PIL import Image
  number(minimum,'最小细节尺寸',0.001,100)
  heights,info=prepare_heights(snapshot,options)
  levels=snapshot['heights'].reshape(heights.shape)
  mapping=info['heightMapping']
  before=(np.asarray(mapping['mmByLayer'])[levels] if mapping['kind']=='calibrated' else levels*mapping['mmPerLayer'])+info['baseThicknessMm']
  repaired=np.abs(heights.astype(float)-before)>np.maximum(1e-6,np.abs(before)*1e-6)
  mask=(levels>0).astype('uint8')
  distance=cv2.distanceTransform(np.pad(mask,1),cv2.DIST_L2,5)[1:-1,1:-1]
  pixel_mm=min(snapshot['sizeMm'][0]/snapshot['width'],snapshot['sizeMm'][1]/snapshot['height'])
  thin=(mask!=0)&(2*distance*pixel_mm<minimum)
  def holes(active):
    count,_=cv2.connectedComponents(np.pad(~active,1,constant_values=True).astype('uint8'),connectivity=4)
    return count-2
  rgba=snapshot['colors'].reshape(*heights.shape,4).copy()
  rgba[thin]=[255,180,0,255]; rgba[repaired]=[255,0,80,255]
  image=io.BytesIO(); Image.fromarray(rgba).save(image,format='PNG')
  return {**info,'thinPixels':int(thin.sum()),'holesBefore':holes(before>0),'holesAfter':holes(heights>0),
          'maxThicknessMm':float(heights.max()),'overlay':'data:image/png;base64,'+base64.b64encode(image.getvalue()).decode(),
          'sideProfileMm':heights.max(axis=0).tolist(),
          'note':'红色为修复，黄色为平面细节风险。不是工艺合格判定；带底板的孔洞按实体贯通孔计算。'}
