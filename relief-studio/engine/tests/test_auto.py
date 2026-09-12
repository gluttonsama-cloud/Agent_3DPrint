import json
import unittest
from pathlib import Path
import numpy as np
from test_engine import data_url
from relief import segment


class AutoTests(unittest.TestCase):
  def test_partial_alpha_edge_uses_adjacent_solid_color(self):
    pixels = np.zeros((20, 20, 4), dtype=np.uint8)
    pixels[2:18, 2:18] = [180, 30, 20, 255]
    pixels[1, 2:18] = [255, 0, 0, 1]
    result = segment({'image': data_url(pixels)})
    self.assertEqual(len(result['regions']), 1)
    self.assertTrue(all(result['labels'][22:38]))
    from relief import decode_image
    np.testing.assert_array_equal(decode_image(result['image']), pixels)

  def test_isolated_translucent_detail_keeps_its_color(self):
    pixels = np.zeros((20, 20, 4), dtype=np.uint8)
    pixels[4:18, 4:18] = [180, 30, 20, 255]
    pixels[2, 4] = [0, 255, 0, 120]
    result = segment({'image': data_url(pixels)})
    self.assertEqual(len(result['regions']), 2)
    self.assertNotEqual(result['labels'][44], result['labels'][84])
    pixels[:, :, 3] = 120
    result = segment({'image': data_url(pixels)})
    self.assertEqual(len(result['regions']), 3)

  def test_logo_auto_three_zero_heights(self):
    source = json.loads((Path(__file__).parents[2]/'samples/sample-project.json').read_text('utf-8'))
    result = segment({'image': source['image']})
    self.assertEqual(len(result['regions']), 3)
    self.assertTrue(all(r['layers'] == 0 for r in result['regions']))
    self.assertEqual(result['image'], source['image'])

  def test_manual_one_and_valid_range(self):
    pixels = np.tile(np.array([20, 30, 40, 255], dtype=np.uint8), (8, 8, 1))
    result = segment({'image': data_url(pixels), 'colors': 1, 'validMask': [0]+[1]*63})
    self.assertEqual(result['labels'], [0]+[1]*63)
    for change in [{'colors': 0}, {'colors': True}, {'tolerance': float('nan')}, {'validMask': []}]:
      with self.assertRaises(ValueError):
        segment({'image': data_url(pixels), **change})

  def test_similar_colors_merge_and_distinct_small_color_survives(self):
    pixels = np.zeros((20, 20, 4), dtype=np.uint8)
    pixels[:, :, :] = [150, 30, 20, 255]
    pixels[:, 10:, :3] = [154, 33, 22]
    pixels[0, 0, :3] = [0, 255, 0]
    result = segment({'image': data_url(pixels)})
    self.assertEqual(len(result['regions']), 2)
    self.assertEqual(result['labels'][20], result['labels'][-1])
    self.assertNotEqual(result['labels'][0], result['labels'][1])
