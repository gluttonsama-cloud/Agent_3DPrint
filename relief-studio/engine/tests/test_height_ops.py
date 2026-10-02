import copy
import json
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_v2 import decode_project, decode_raster
from height_ops import run_height


def fixture(width=8, height=8):
  path = Path(__file__).resolve().parents[2]/'tests/fixtures/v2/normal-v2.json'
  value = decode_project(json.loads(path.read_text(encoding='utf-8')))
  value.update(width=width, height=height)
  size = width*height
  value['original'] = np.full(size*4, 255, dtype='uint8')
  value['colors'] = value['original'].copy()
  value['labels'] = np.ones(size, dtype='uint16')
  value['heights'] = np.full(size, 12, dtype='uint16')
  value['protection'] = np.zeros(size, dtype='uint8')
  return value


def applied(value, candidate):
  output = copy.deepcopy(value)
  for block in candidate['blocks']:
    data = block['after']
    count = len(__import__('base64').b64decode(data['data']))//(2 if data['type'] == 'uint16' else 1)
    array = decode_raster(data, data['type'], count)
    offset = block['offset']
    output[block['field']][offset:offset+count] = array
  if 'properties' in candidate:
    output.update(candidate['properties']['after'])
  return output


class HeightTests(unittest.TestCase):
  def test_manual_quantization_protection_and_zero_label(self):
    value = fixture()
    value['labels'][0] = value['heights'][0] = 0
    value['protection'][1] = 4
    result = applied(value, run_height(value, {'kind': 'add', 'delta': 256}))
    self.assertEqual(result['heights'][0], 0)
    self.assertEqual(result['heights'][1], 256)
    self.assertTrue(np.all(result['protection'][1:] == 4))
    self.assertEqual(value['heights'][1], 12)

  def test_automatic_protection_empty_selection_and_bad_parameters(self):
    value = fixture()
    value['protection'][0] = 4
    for operation in [{'kind': 'uniform', 'layers': 8}, {'kind': 'scale', 'factor': .4},
                      {'kind': 'suggest', 'maxLayers': 10}, {'kind': 'bevel', 'radiusPx': 4},
                      {'kind': 'smooth', 'radiusPx': 2}]:
      result = applied(value, run_height(value, operation))
      self.assertEqual(result['heights'][0], 12)
      self.assertEqual(run_height(value, operation, np.zeros(64, 'uint8'))['blocks'], [])
    for operation in [{'kind': 'set', 'layers': 2.5}, {'kind': 'scale', 'factor': float('nan')},
                      {'kind': 'smooth', 'radiusPx': 0}, {'kind': 'unknown'}]:
      with self.assertRaises(ValueError):
        run_height(value, operation)

  def test_holes_thin_text_and_selection_smoothing(self):
    value = fixture()
    value['labels'][:] = 0
    value['heights'][:] = 0
    value['labels'].reshape(8, 8)[2, 1:7] = 1
    value['heights'][value['labels'] > 0] = 12
    for operation in [{'kind': 'bevel', 'radiusPx': 8}, {'kind': 'suggest', 'maxLayers': 8}]:
      result = applied(value, run_height(value, operation))
      self.assertTrue(np.all(result['heights'][value['labels'] > 0] >= 1))
      np.testing.assert_array_equal(result['colors'], value['colors'])
      np.testing.assert_array_equal(result['labels'], value['labels'])
    selection = np.zeros(64, 'uint8')
    selection[17:20] = 1
    value['heights'][17:20] = [2, 4, 6]
    value['heights'][20:23] = 100
    result = applied(value, run_height(value, {'kind': 'smooth', 'radiusPx': 2}, selection))
    self.assertTrue(np.all((result['heights'][17:20] >= 2) & (result['heights'][17:20] <= 6)))
    self.assertLess(int(np.ptp(result['heights'][17:20])), 4)
    np.testing.assert_array_equal(result['heights'][20:23], [100]*3)

  def test_cancel_calibration_and_2048_disconnected_geometry(self):
    with self.assertRaises(InterruptedError):
      run_height(fixture(), {'kind': 'set', 'layers': 1}, cancelled=lambda: True)
    value = fixture()
    value['heightMapping'] = {'kind': 'calibrated', 'profileId': 'x', 'mmByLayer': list(range(13))}
    with self.assertRaises(ValueError):
      run_height(value, {'kind': 'set', 'layers': 13})
    value = fixture(2048, 2048)
    labels = value['labels'].reshape(2048, 2048)
    labels[:] = 0
    labels[4, 2:80] = 1
    labels[100:180, 100:180] = 1
    value['heights'][value['labels'] == 0] = 0
    result = applied(value, run_height(value, {'kind': 'suggest', 'maxLayers': 20}))
    self.assertEqual(result['heights'].reshape(2048, 2048)[4, 5], 12)
    self.assertEqual(result['heights'].reshape(2048, 2048)[130, 130], 12)

  def test_smoothing_cannot_jump_same_color_disconnected_pixels_or_holes(self):
    value = fixture(12, 12)
    value['labels'][:] = value['heights'][:] = 0
    value['labels'][13] = value['labels'][15] = 1
    value['heights'][13] = 2
    value['heights'][15] = 100
    result = applied(value, run_height(value, {'kind': 'smooth', 'radiusPx': 8}))
    self.assertEqual(result['heights'][13], 2)
    self.assertEqual(result['heights'][15], 100)
    labels = value['labels'].reshape(12, 12)
    labels[:] = 0
    labels[2:10, 2] = labels[2:10, 8] = labels[9, 2:9] = 1
    heights = value['heights'].reshape(12, 12)
    heights[:] = 0
    heights[labels != 0] = 2
    heights[2:9, 8] = 100
    result = applied(value, run_height(value, {'kind': 'smooth', 'radiusPx': 3}))
    self.assertEqual(result['heights'].reshape(12, 12)[2, 2], 2)

  def test_suggest_requires_explicit_containment(self):
    value = fixture(24, 24)
    labels = value['labels'].reshape(24, 24)
    labels[8:16, 8:16] = 2
    result = applied(value, run_height(value, {'kind': 'suggest', 'maxLayers': 10}))
    self.assertEqual(result['heights'].reshape(24, 24)[4, 4], 3)
    self.assertEqual(result['heights'].reshape(24, 24)[10, 10], 6)
    labels[8:16, 8:16] = 1
    labels[10, 8:16] = 2
    result = applied(value, run_height(value, {'kind': 'suggest', 'maxLayers': 10}))
    self.assertEqual(result['heights'].reshape(24, 24)[10, 10], 10)


if __name__ == '__main__':
  unittest.main()
