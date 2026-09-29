import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from relief import decode_image, export_project, segment
from test_engine import data_url


class SubjectColorTests(unittest.TestCase):
  def test_black_white_gold_and_small_red_keep_separate_with_exact_geometry(self):
    rgba = np.full((32, 40, 4), [40, 45, 50, 255], dtype=np.uint8)
    rgba[4:28, 4:12, :3] = [8, 8, 8]
    rgba[4:28, 12:20, :3] = [248, 248, 248]
    rgba[4:28, 20:28, :3] = [210, 160, 70]
    rgba[4:28, 28:36, :3] = [120, 90, 38]
    rgba[8, 8, :3] = [240, 20, 30]
    mask = np.zeros((32, 40), dtype=np.uint8)
    mask[4:28, 4:36] = 1
    mask[14:18, 16:18] = 0  # 真实孔洞必须保持背景。
    valid = np.ones_like(mask)
    valid[:, 0] = 0
    rgba[5, 5, 3] = 0
    result = segment({'image': data_url(rgba), 'subjectMask': mask.ravel().tolist(),
                      'validMask': valid.ravel().tolist(), 'subjectLayers': 7})
    labels = np.array(result['labels']).reshape(mask.shape)
    self.assertEqual(len(result['regions']), 5)
    self.assertEqual(len({labels[10, x] for x in (8, 16, 24)} | {labels[8, 8]}), 4)
    self.assertEqual(labels[10, 24], labels[10, 32])
    expected = (mask > 0) & (valid > 0) & (rgba[:, :, 3] > 0)
    np.testing.assert_array_equal(labels > 1, expected)
    np.testing.assert_array_equal(decode_image(result['image']), rgba)
    self.assertTrue(all(r['layers'] == (0 if r['id'] == 1 else 7) for r in result['regions']))
    with tempfile.TemporaryDirectory() as folder:
      output = Path(folder)/'export'
      export_project(result, output)
      layers = sum(np.array(Image.open(p)) > 0 for p in (output/'layers').glob('*.png'))
      np.testing.assert_array_equal(layers, expected.astype(int)*7)

  def test_achromatic_black_gray_white_are_not_merged(self):
    rgba = np.full((12, 30, 4), 255, dtype=np.uint8)
    for start, value in ((0, 10), (10, 120), (20, 245)):
      rgba[:, start:start+10, :3] = value
    result = segment({'image': data_url(rgba), 'subjectMask': [1]*360})
    self.assertEqual(len(result['regions']), 3)
    self.assertNotIn(1, result['labels'])

  def test_invalid_and_empty_subject_rejected(self):
    image = data_url(np.full((8, 8, 4), 255, dtype=np.uint8))
    for changes in ({'subjectMask': []}, {'subjectMask': [0]*64},
                    {'subjectMask': [True]*64},
                    {'subjectMask': [1]*64, 'subjectLayers': -1}):
      with self.assertRaises(ValueError):
        segment({'image': image, **changes})

  def test_warm_white_does_not_merge_into_gold(self):
    rgba = np.full((16, 32, 4), 255, dtype=np.uint8)
    rgba[:, :16, :3] = [245, 234, 210]
    rgba[:, 16:, :3] = [210, 160, 70]
    result = segment({'image': data_url(rgba), 'subjectMask': [1]*512})
    self.assertEqual(len(result['regions']), 2)
    self.assertNotEqual(result['labels'][0], result['labels'][31])
