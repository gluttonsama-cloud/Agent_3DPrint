import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from export_obj import export_obj
from test_export_v2 import fixture


class ObjTests(unittest.TestCase):
  def test_independent_parse_dimensions_uv_and_hole(self):
    source = fixture()
    source['width']=source['height']=3
    source['sizeMm']=[30,15]
    source['original']=np.tile(np.array([10,20,30,255],dtype='uint8'),9)
    source['colors']=source['original'].copy()
    source['labels']=np.ones(9,dtype='uint16'); source['labels'][4]=0
    source['heights']=np.full(9,3,dtype='uint16'); source['heights'][4]=0
    source['protection']=np.zeros(9,dtype='uint8')
    with tempfile.TemporaryDirectory() as root:
      export_obj(source,root)
      lines=(Path(root)/'relief.obj').read_text().splitlines()
      vertices=np.array([[float(v) for v in line.split()[1:]] for line in lines if line.startswith('v ')])
      uv=np.array([[float(v) for v in line.split()[1:]] for line in lines if line.startswith('vt ')])
      np.testing.assert_allclose(vertices.max(axis=0),[30,15,.3])
      np.testing.assert_allclose(vertices.min(axis=0),[0,0,0])
      self.assertTrue(np.all((uv>=0)&(uv<=1)))
      for line in lines:
        if not line.startswith('f '): continue
        ids=[int(token.split('/')[0])-1 for token in line.split()[1:]]
        triangle=vertices[ids]
        if np.allclose(triangle[:,2],.3):
          center=triangle[:,:2].mean(axis=0)
          self.assertFalse(10<center[0]<20 and 5<center[1]<10)

  def test_resource_limit_and_cancel(self):
    with tempfile.TemporaryDirectory() as root:
      with patch('export_obj.MAX_TRIANGLES',0), self.assertRaises(ValueError):
        export_obj(fixture(),root)
      with patch('export_obj.MAX_BYTES',0), self.assertRaises(ValueError):
        export_obj(fixture(),root)
      self.assertEqual(list(Path(root).iterdir()),[])
      with self.assertRaises(InterruptedError):
        export_obj(fixture(),root,cancelled=lambda:True)

  def test_rectangular_fixture_fixed_mapping_after_max_removed(self):
    source=fixture()
    def vertices(directory):
      return np.array([[float(v) for v in line.split()[1:]]
        for line in (Path(directory)/'relief.obj').read_text().splitlines() if line.startswith('v ')])
    with tempfile.TemporaryDirectory() as root:
      first=Path(root)/'first'; second=Path(root)/'second'
      export_obj(source,first)
      initial=vertices(first)
      self.assertEqual(float(initial[:,2].max()),1.0)
      # 删除最高层像素，但其他六层顶面必须继续为 0.6 mm。
      removed=source['heights']==10
      source['heights'][removed]=0; source['labels'][removed]=0
      export_obj(source,second)
      updated=vertices(second)
      self.assertEqual(float(updated[:,2].max()),.6)
      active=source['labels'].reshape(source['height'],source['width'])!=0
      ys,xs=np.where(active)
      expected=[(xs.max()+1)*source['sizeMm'][0]/source['width'],
        (source['height']-ys.min())*source['sizeMm'][1]/source['height']]
      np.testing.assert_allclose(updated[:,:2].max(axis=0),expected)
