import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from device_profile import (output_settings, orient, white_values, task_order, calibration_chart,
                            record_calibration, record_calibration_points, calibration_project)


class DeviceTests(unittest.TestCase):
  def test_sparse_measurement_interpolation_and_no_extrapolation(self):
    binding={'device_id':'d','ink':'i','material':'m','settings':{}}
    points=[{'layer':0,'mm':0},{'layer':2,'mm':.12},{'layer':4,'mm':.4}]
    result=record_calibration_points('p',points,**binding)
    np.testing.assert_allclose(result['mapping']['mmByLayer'],[0,.06,.12,.26,.4])
    self.assertFalse(result['interpolation']['extrapolation'])
    self.assertEqual(len(result['mapping']['mmByLayer']),5)
    points[1]['mm']=99
    self.assertEqual(result['measuredPoints'][1]['mm'],.12)
    invalid=[[],[{'layer':0,'mm':0}],
      [{'layer':1,'mm':0},{'layer':2,'mm':1}],
      [{'layer':0,'mm':0},{'layer':257,'mm':1}],
      [{'layer':0,'mm':0},{'layer':True,'mm':1}],
      [{'layer':0,'mm':0},{'layer':2,'mm':float('inf')}],
      [{'layer':0,'mm':0},{'layer':2,'mm':None}],
      [{'layer':0,'mm':0},{'layer':2,'mm':1},{'layer':2,'mm':2}],
      [{'layer':0,'mm':0},{'layer':3,'mm':2},{'layer':4,'mm':1}],
      [{'layer':0,'mm':0},{'layer':3,'mm':2},{'layer':2,'mm':3}]]
    for values in invalid:
      with self.subTest(points=values),self.assertRaises(ValueError):
        record_calibration_points('p',values,**binding)

  def test_complete_calibration_project_export_and_template(self):
    import tempfile
    from export_layers import export_bundle
    from project_v2 import dumps_project, loads_project
    data=calibration_project(levels=[0,1,3],cell=4,cell_mm=5)
    source=data['snapshot']
    self.assertEqual(source['sizeMm'],[15,5])
    self.assertEqual(source['device']['id'],'generic-unverified')
    self.assertEqual(data['measurementTemplate']['points'],
      [{'layer':0,'mm':0},{'layer':1,'mm':None},{'layer':3,'mm':None}])
    np.testing.assert_array_equal(loads_project(dumps_project(source))['heights'],source['heights'])
    with tempfile.TemporaryDirectory() as root:
      result=export_bundle(source,Path(root)/'chart',obj=True)
      self.assertFalse(result['simulated'])
      self.assertTrue((Path(root)/'chart/white/0003.png').exists())
    mapping=record_calibration_points('p',[{'layer':0,'mm':0},{'layer':2,'mm':.2}],
      device_id='d',ink='i',material='m',settings={})['mapping']
    source['heightMapping']=mapping
    with self.assertRaises(ValueError):
      dumps_project(source)
  def test_synthetic_polarity_orientation_order(self):
    mask=np.array([[True,False],[False,True]])
    np.testing.assert_array_equal(white_values(mask,'white-is-ink') + white_values(mask,'black-is-ink'),np.full((2,2),255,dtype='uint8'))
    settings=output_settings({'mirror':True,'rotation':90,'order':'color-first','whiteRepeats':2})
    np.testing.assert_array_equal(orient(np.array([[1,2],[3,4]]),settings),[[4,2],[3,1]])
    tasks=task_order(2,settings)
    self.assertEqual([t['role'] for t in tasks],['color','white','white','white','white'])
    self.assertEqual([t['layer'] for t in tasks[1:]],[1,1,2,2])

  def test_calibration_binding_and_rejection(self):
    chart=calibration_chart([0,1,3],4)
    self.assertEqual(chart.shape,(4,12))
    result=record_calibration('p',[0,.08,.19],device_id='d',ink='i',material='m',settings={})
    self.assertEqual(result['binding']['deviceId'],'d')
    self.assertEqual(result['mapping']['mmByLayer'],[0,.08,.19])
    with self.assertRaises(ValueError):
      record_calibration('p',[0,.2,.1],device_id='d',ink='i',material='m',settings={})
