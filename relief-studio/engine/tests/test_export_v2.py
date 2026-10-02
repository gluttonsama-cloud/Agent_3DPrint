import json
import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_v2 import decode_project
from export_layers import export_bundle


def fixture():
  path = Path(__file__).resolve().parents[2] / 'tests/fixtures/v2/normal-v2.json'
  return decode_project(json.loads(path.read_text(encoding='utf-8')))


class ExportTests(unittest.TestCase):
  def test_lossless_reconstruction_and_zero_color(self):
    source = fixture()
    with tempfile.TemporaryDirectory() as root:
      target = Path(root) / 'output'
      result = export_bundle(source, target, formats=('png','jpg'), obj=True)
      self.assertFalse(result['simulated'])
      rebuilt = sum((np.asarray(Image.open(file)) == 255).astype('uint16')
                    for file in (target/'white').glob('*.png'))
      np.testing.assert_array_equal(rebuilt.ravel(), source['heights'])
      np.testing.assert_array_equal(np.asarray(Image.open(target/'height.png')).ravel(), source['heights'])
      rgba = np.asarray(Image.open(target/'color.png')).reshape(-1,4)
      active = source['labels'] != 0
      np.testing.assert_array_equal(rgba[active], source['colors'].reshape(-1,4)[active])
      self.assertTrue(result['checks'])
      self.assertTrue(all(set(file)=={'path','role'} for file in result['files']))
      self.assertTrue(all(set(check)=={'code','status','message'} for check in result['checks']))
      self.assertFalse(json.loads((target/'manifest.json').read_text(encoding='utf-8'))['polarityVerified'])
      with self.assertRaises(FileExistsError):
        export_bundle(source,target)

  def test_cancel_cleans_directory(self):
    with tempfile.TemporaryDirectory() as root:
      target = Path(root)/'output'
      state = {'cancel':False}
      def progress(*args):
        state['cancel'] = True
      with self.assertRaises(InterruptedError):
        export_bundle(fixture(),target,cancelled=lambda:state['cancel'],progress=progress)
      self.assertEqual(list(Path(root).iterdir()), [])

  def test_cmyk_without_icc_rejected(self):
    source = fixture()
    source['device']['colorSpace'] = 'CMYK'
    with tempfile.TemporaryDirectory() as root, self.assertRaises(ValueError):
      export_bundle(source,Path(root)/'out')

  def test_adapted_settings_tasks_and_bounded_progress(self):
    source=fixture()
    events=[]
    with tempfile.TemporaryDirectory() as root:
      target=Path(root)/'out'
      result=export_bundle(source,target,formats=('png','jpg'),obj=True,
        settings={'mirror':True,'rotation':90,'order':'color-first','whiteRepeats':2,'colorRepeats':3},
        progress=lambda done,total,message:events.append((done,total)))
      self.assertTrue(all(0<=done<=total for done,total in events))
      self.assertEqual(events[-1],(len(result['files']),len(result['files'])))
      manifest=json.loads((target/'manifest.json').read_text(encoding='utf-8'))
      self.assertEqual(manifest['totalSteps'],23)
      self.assertEqual(manifest['geometryLayers'],10)
      self.assertEqual([t['channel'] for t in manifest['tasks'][:3]],['color']*3)
      master=np.asarray(Image.open(target/'white/0003.png'))
      adapted=np.asarray(Image.open(target/'adapted/0003.png'))
      np.testing.assert_array_equal(adapted,np.rot90(np.fliplr(master),-1))
      report=json.loads((target/'jpeg-report.json').read_text())
      self.assertIn('edgeMaxGrayError',report[0])
