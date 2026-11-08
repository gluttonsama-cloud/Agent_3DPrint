"""生产交付回归：读取实际文件核对格式、尺寸、隔离与重印。"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from PIL import Image
from test_export_v2 import fixture
from project_v2 import encode_project
from export_layers import export_bundle
from production import compose, white_masks, estimate, execute, batch, inspect
from height_mesh import write_height_mesh
from stl_export import _Writer
import io


class ProductionTests(unittest.TestCase):
  def test_jpg_copy_and_rotated_dpi(self):
    source=fixture(); source['sizeMm']=[20,10]
    with tempfile.TemporaryDirectory() as root:
      dest=Path(root)/'out'
      export_bundle(source,dest,formats=['png','jpg'],settings={'rotation':90})
      manifest=json.loads((dest/'manifest.json').read_text())
      self.assertTrue(all(t['file'].endswith('.png') for t in manifest['tasks']))
      master=Image.open(dest/'color.png'); adapted=Image.open(dest/'adapted/color.png')
      self.assertAlmostEqual(master.info['dpi'][0],source['width']/20*25.4,delta=.02)
      self.assertAlmostEqual(adapted.info['dpi'][0],source['height']/10*25.4,delta=.02)
      master.close(); adapted.close()
      self.assertTrue((dest/'PRINT-ORDER.txt').exists())

  def test_model_failure_preserves_print_files(self):
    with tempfile.TemporaryDirectory() as root, patch('export_obj.export_obj',side_effect=ValueError('bad geometry')):
      dest=Path(root)/'out'; result=export_bundle(fixture(),dest,obj=True)
      self.assertTrue((dest/'color.png').exists()); self.assertFalse((dest/'model').exists())
      self.assertTrue(any(c['code']=='OBJ_FAILED' for c in result['checks']))

  def test_alpha_preserves_master_and_project(self):
    source=fixture(); source['colors'][3::4][source['labels']!=0]=64
    original=source['heights'].copy()
    self.assertIn(64,np.unique(white_masks(source,{'mode':'alpha'})(1)))
    with tempfile.TemporaryDirectory() as root:
      dest=Path(root)/'out'; export_bundle(source,dest,white_options={'mode':'alpha'})
      self.assertIn(64,np.unique(np.asarray(Image.open(dest/'adapted/0001.png'))))
      self.assertTrue(set(np.unique(np.asarray(Image.open(dest/'white/0001.png'))))<={0,255})
    np.testing.assert_array_equal(source['heights'],original)

  def test_estimates_require_rates(self):
    self.assertIsNone(estimate(fixture())['inkMl'])
    result=estimate(fixture(),rates=dict(whiteMlPerMm2=.001,colorMlPerMm2=.002,secondsPerPass=2,setupSeconds=4,costPerMl=3))
    self.assertEqual(result['seconds'],result['passes']*2+4)
    self.assertAlmostEqual(result['cost'],result['inkMl']*3)

  def test_layout_rotation_and_invalid_layouts(self):
    source=fixture(); source['sizeMm']=[4,2]; entry={'snapshot':encode_project(source),'xMm':1,'yMm':1,'rotation':90}
    result,placed=compose([entry],[10,10],2)
    self.assertEqual(result['sizeMm'],[10,10]); self.assertEqual(placed[0]['widthMm'],2)
    self.assertEqual(int(result['heights'].max()),10)
    with self.assertRaises(ValueError): compose([entry,entry],[10,10],2)
    with self.assertRaises(ValueError): compose([{**entry,'xMm':9}],[10,10],2)
    with self.assertRaises(ValueError): compose([entry],[10000,10000],2)
    other=fixture(); other['heightMapping']={'kind':'calibrated','profileId':'x','mmByLayer':list(range(11))}
    with self.assertRaises(ValueError): compose([entry,{'snapshot':encode_project(other),'xMm':5,'yMm':5}],[100,100],2)

  def test_failed_item_and_reprint(self):
    source=encode_project(fixture())
    with tempfile.TemporaryDirectory() as root:
      result=batch({'entries':[{'snapshot':source},{'snapshot':{}}],'parentDirectory':root},lambda:False,lambda *a:None)
      self.assertEqual([e['status'] for e in result['entries']],['success','failed'])
      record=Path(result['outputDirectory'])/'batch.json'
      repeated=execute({'mode':'reprint','recordPath':str(record),'ids':[0],'parentDirectory':root},lambda:False,lambda *a:None)
      self.assertEqual(repeated['entries'][0]['status'],'success')
      self.assertNotEqual(repeated['outputDirectory'],result['outputDirectory'])

  def test_cancel_preserves_record(self):
    with tempfile.TemporaryDirectory() as root:
      result=batch({'entries':[{'snapshot':encode_project(fixture())}],'parentDirectory':root},lambda:True,lambda *a:None)
      self.assertTrue(result['cancelled']); self.assertTrue((Path(result['outputDirectory'])/'batch.json').exists())

  def test_compression_keeps_dimensions(self):
    values=np.repeat(np.repeat(np.array([[1,2],[1,2]],dtype='float32'),20,axis=0),20,axis=1)
    stream=io.BytesIO(); writer=_Writer(stream); write_height_mesh(writer,values,[80,40]); writer.finish()
    self.assertLess(writer.count,40)
    triangles=np.frombuffer(stream.getvalue()[84:],dtype=np.dtype([('normal','<f4',3),('vertices','<f4',(3,3)),('attr','<u2')]))
    np.testing.assert_allclose(triangles['vertices'].reshape(-1,3).max(axis=0),[80,40,2])

  def test_inspection_and_validation(self):
    result=inspect(fixture(),{'baseThicknessMm':1,'repairDiagonalContacts':True},.3)
    self.assertTrue(result['overlay'].startswith('data:image/png;base64,'))
    self.assertAlmostEqual(result['maxThicknessMm'],2)
    for options in ({'mode':'bad'},{'offsetXmm':float('nan')},{'threshold':0},{'insetMm':11}):
      with self.assertRaises(ValueError): white_masks(fixture(),options)

  def test_trial_failures_are_independent_and_record_can_be_selected(self):
    with tempfile.TemporaryDirectory() as root:
      payload={'mode':'trial','snapshot':encode_project(fixture()),'parentDirectory':root,
               'variants':[{'name':'good','heightFactor':1},{'name':'bad','heightFactor':float('nan')}]}
      result=execute(payload,lambda:False,lambda *a:None)
      self.assertEqual(result['trials'][1]['status'],'failed')
      record=Path(result['trials'][0]['outputDirectory'])/'trial.json'
      value=execute({'mode':'record-trial','recordPath':str(record),'measurements':[1.2],'selected':True},lambda:False,lambda *a:None)
      self.assertEqual(value['variant']['name'],'good')
      self.assertEqual(json.loads(record.read_text())['measurements'],[1.2])

  def test_model_retry_uses_new_directory(self):
    with tempfile.TemporaryDirectory() as root:
      payload={'mode':'model','snapshot':encode_project(fixture()),'parentDirectory':root,
               'objOptions':{'mode':'solid','baseThicknessMm':1,'repairDiagonalContacts':True}}
      result=execute(payload,lambda:False,lambda *a:None)
      self.assertTrue((Path(result['outputDirectory'])/'relief.obj').exists())
      again=execute(payload,lambda:False,lambda *a:None)
      self.assertNotEqual(result['outputDirectory'],again['outputDirectory'])

  def test_preview_matches_export_white_after_orientation(self):
    import base64
    payload={'mode':'preview','snapshot':encode_project(fixture()),'layer':3,'settings':{'rotation':90,'mirror':True},
             'whiteOptions':{'offsetXmm':1},'polarity':'black-is-ink'}
    result=execute(payload,lambda:False,lambda *a:None)
    preview=np.asarray(Image.open(io.BytesIO(base64.b64decode(result['image'].split(',')[1]))))
    expected=np.rot90(np.fliplr(255-white_masks(fixture(),payload['whiteOptions'])(3)),-1)
    np.testing.assert_array_equal(preview,expected)

  def test_production_dispatch_round_trip(self):
    from v2_dispatch import execute_v2
    result=execute_v2({'action':'v2:production','payload':{'mode':'estimate','snapshot':encode_project(fixture())}})
    self.assertEqual(result['status'],'success')
    self.assertGreater(result['value']['passes'],0)
