import unittest

import numpy as np

from relief import encode_image
from repair import repair_project


def job_for(labels, **options):
  h, w = labels.shape
  rgba = np.full((h, w, 4), 255, dtype=np.uint8)
  project = {'version': 1, 'name': 'repair', 'width': w, 'height': h, 'sizeMm': [55, 55],
             'image': encode_image(rgba), 'labels': labels.ravel().tolist(),
             'regions': [{'id': i, 'name': str(i), 'color': '#ffffff', 'layers': i*5}
                         for i in (1, 2, 3)]}
  return {'project': project, 'target': 2, 'background': 1, **options}


class RepairTests(unittest.TestCase):
  def test_bridge_gap_keep_hole_and_lock_other_regions(self):
    labels = np.ones((32, 32), dtype=np.uint16)
    labels[5:26, 5:26] = 2
    labels[10:18, 10:18] = 1
    labels[5:9, 20] = 1
    labels[20, 5] = 0
    labels[22, 5] = 3
    job = job_for(labels)
    result = repair_project(job)
    actual = np.array(result['project']['labels']).reshape(labels.shape)
    self.assertEqual(actual[7, 20], 2)
    self.assertTrue(np.all(actual[10:18, 10:18] == 1))
    self.assertEqual(actual[20, 5], 0)
    self.assertEqual(actual[22, 5], 3)
    self.assertEqual(result['project']['image'], job['project']['image'])
    self.assertEqual(result['project']['regions'], job['project']['regions'])
    self.assertEqual(job['project']['labels'], labels.ravel().tolist())

  def test_keep_thin_bridge_and_punctuation_unless_explicit_specks(self):
    labels = np.ones((30, 40), dtype=np.uint16)
    labels[10:20, 5:15] = 2
    labels[10:20, 25:35] = 2
    labels[14, 15:25] = 2
    labels[3, 3] = 2
    result = repair_project(job_for(labels))
    actual = np.array(result['project']['labels']).reshape(labels.shape)
    self.assertEqual(actual[3, 3], 2)
    self.assertTrue(np.all(actual[14, 5:35] == 2))
    cleaned = repair_project(job_for(labels, specks=2))
    self.assertEqual(cleaned['project']['labels'][3*40+3], 1)

  def test_symmetry_skips_asymmetric_shape(self):
    labels = np.ones((30, 40), dtype=np.uint16)
    labels[4:26, 4:10] = 2
    labels[20:26, 10:30] = 2
    result = repair_project(job_for(labels, symmetry=True))
    self.assertFalse(result['symmetryApplied'])
    self.assertLess(result['symmetryScore'], .9)

  def test_optional_symmetry_repairs_only_nearby_boundary(self):
    labels = np.ones((40, 40), dtype=np.uint16)
    labels[5:35, 5:35] = 2
    labels[14:20, 5:7] = 1
    baseline = repair_project(job_for(labels))
    result = repair_project(job_for(labels, symmetry=True))
    self.assertTrue(result['symmetryApplied'])
    self.assertGreater(result['added'], baseline['added'])
    self.assertEqual(result['project']['labels'][16*40+6], 2)
    self.assertEqual(result['project']['labels'][16*40+5], 1)

  def test_repaired_export_has_cumulative_layers_matching_new_geometry(self):
    import tempfile
    from pathlib import Path
    from PIL import Image
    from relief import export_project
    labels = np.ones((24, 24), dtype=np.uint16)
    labels[4:20, 4:20] = 2
    labels[4:8, 12] = 1
    repaired = repair_project(job_for(labels))['project']
    with tempfile.TemporaryDirectory() as directory:
      output = Path(directory)/'export'
      export_project(repaired, output)
      height = np.array(Image.open(output/'height.png'))
      expected = np.array(repaired['labels']).reshape(labels.shape)*5
      np.testing.assert_array_equal(height, expected)
      stacked = sum((np.array(Image.open(p)) > 0).astype(np.uint16)
                    for p in sorted((output/'layers').glob('*.png')))
      np.testing.assert_array_equal(stacked, expected)

  def test_invalid_parameters(self):
    labels = np.full((12, 12), 2, dtype=np.uint16)
    for options in [{'radius': 0}, {'specks': 26}, {'symmetry': 1}, {'background': 0}, {'target': 1}]:
      with self.assertRaises(ValueError):
        repair_project(job_for(labels, **options))
