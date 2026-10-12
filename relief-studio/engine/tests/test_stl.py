import base64
import collections
import io
import json
import math
import struct
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stl_export import export_stl


def project(levels, alpha=None, size=(8, 6)):
  levels = np.asarray(levels, dtype=np.uint8)
  rows, cols = levels.shape
  if alpha is None:
    alpha = np.full(levels.shape, 255, dtype=np.uint8)
  pixels = np.zeros((rows, cols, 4), dtype=np.uint8)
  pixels[:, :, 3] = alpha
  stream = io.BytesIO()
  Image.fromarray(pixels, 'RGBA').save(stream, format='PNG')
  unique = sorted(set(int(n) for n in levels.flat if n))
  return {'version': 1, 'name': 'mesh', 'width': cols, 'height': rows,
          'sizeMm': list(size),
          'image': 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode(),
          'labels': levels.ravel().astype(int).tolist(),
          'regions': [{'id': n, 'name': str(n), 'color': '#000000', 'layers': n}
                      for n in (unique or [1])]}


def mesh(path):
  raw = path.read_bytes()
  count = struct.unpack_from('<I', raw, 80)[0]
  assert len(raw) == 84 + 50 * count
  triangles = []
  for offset in range(84, len(raw), 50):
    values = struct.unpack_from('<12fH', raw, offset)
    triangles.append((values[:3], [values[3:6], values[6:9], values[9:12]]))
  return triangles


def check_closed_and_volume(test, triangles, expected_volume):
  edges = collections.Counter()
  volume = 0.0
  for normal, (a, b, c) in triangles:
    for u, v in ((a,b), (b,c), (c,a)):
      edges[(u,v)] += 1
    v1, v2, v3 = map(np.asarray, (a,b,c))
    cross = np.cross(v2-v1, v3-v1)
    test.assertGreater(np.linalg.norm(cross), 0)
    test.assertGreater(float(np.dot(normal, cross)), 0)
    volume += float(np.dot(v1, np.cross(v2,v3))) / 6
  for (u,v), count in edges.items():
    test.assertEqual(count, 1)
    test.assertEqual(edges[(v,u)], 1)
  test.assertTrue(math.isclose(volume, expected_volume, rel_tol=1e-6, abs_tol=1e-5))


class StlTests(unittest.TestCase):
  def test_single_pixel_bounds_volume_and_binary_header(self):
    p = project([[2]], size=(8, 6))
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'mesh'
      info = export_stl(p, out, {'layerHeightMm': 0.2})
      triangles = mesh(out/'model.stl')
      self.assertEqual(len(triangles), 12)
      self.assertEqual(info['triangles'], 12)
      vertices = np.asarray([v for _, tri in triangles for v in tri])
      np.testing.assert_allclose(vertices.min(axis=0), [0,0,0])
      np.testing.assert_allclose(vertices.max(axis=0), [8,6,0.4])
      check_closed_and_volume(self, triangles, 8*6*0.4)

  def test_uniform_grid_exports_as_box(self):
    p = project(np.ones((16, 16), dtype=np.uint8), size=(8, 6))
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'mesh'
      export_stl(p, out, {'layerHeightMm': 0.2})
      triangles = mesh(out/'model.stl')
      self.assertEqual(len(triangles), 12)
      check_closed_and_volume(self, triangles, 8*6*0.2)

  def test_source_top_row_maps_to_positive_y(self):
    p = project([[1,0],[0,0]], size=(2,2))
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'mesh'
      export_stl(p, out, {'layerHeightMm': 1})
      vertices = np.asarray([v for _, tri in mesh(out/'model.stl') for v in tri])
      self.assertEqual(vertices[:,1].min(), 1)
      self.assertEqual(vertices[:,1].max(), 2)

  def test_explicit_corner_repair_reports_geometry_change(self):
    p = project([[1,0],[0,1]], size=(2,2))
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'mesh'
      original = list(p['labels'])
      info = export_stl(p, out, {'layerHeightMm': 1, 'repairDiagonalContacts': True})
      self.assertEqual(p['labels'], original)
      self.assertEqual(info['repairedPixels'], 1)
      self.assertEqual(info['addedVolumeMm3'], 1)
      self.assertEqual(json.loads((out/'mesh-info.json').read_text('utf-8'))['repairedPixels'], 1)
      check_closed_and_volume(self, mesh(out/'model.stl'), 3)

  def test_bundled_sample_exports_with_explicit_repair(self):
    sample = Path(__file__).resolve().parents[2]/'samples/sample-project.json'
    p = json.loads(sample.read_text('utf-8'))
    with tempfile.TemporaryDirectory() as temp:
      for base in (0, 1):
        out = Path(temp)/f'base-{base}'
        info = export_stl(p, out, {'layerHeightMm': 0.1,
                                   'baseThicknessMm': base,
                                   'repairDiagonalContacts': True})
        self.assertGreater(info['repairedPixels'], 0)
        self.assertGreater((out/'model.stl').stat().st_size, 84)
        self.assertEqual(info['repairedPixels'],
                         json.loads((out/'mesh-info.json').read_text('utf-8'))['repairedPixels'])

  def test_staircase_walls_are_split_without_t_junctions(self):
    p = project([[1,2,3], [1,1,2], [0,1,1]], size=(9,9))
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'mesh'
      export_stl(p, out, {'layerHeightMm': 0.5})
      check_closed_and_volume(self, mesh(out/'model.stl'),
                              sum(p['labels']) * 3*3*0.5)

  def test_transparent_and_excluded_pixels_are_absent(self):
    p = project([[1,0,0]], alpha=np.array([[255,0,255]], dtype=np.uint8), size=(9,3))
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'mesh'
      export_stl(p, out, {'layerHeightMm': 1, 'baseThicknessMm': 0})
      triangles = mesh(out/'model.stl')
      vertices = np.asarray([v for _, tri in triangles for v in tri])
      self.assertEqual(vertices[:,0].max(), 3)
      check_closed_and_volume(self, triangles, 9)

  def test_base_fills_full_rectangle_including_zero_height_pixels(self):
    p = project([[1,0,0]], size=(9,3))
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'mesh'
      export_stl(p, out, {'layerHeightMm': 1, 'baseThicknessMm': 1})
      check_closed_and_volume(self, mesh(out/'model.stl'), 9*3*1 + 3*3*1)

  def test_zero_heights_need_base_or_positive_region(self):
    p = project([[0,0],[0,0]])
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'mesh'
      with self.assertRaises(ValueError):
        export_stl(p, out, {'layerHeightMm': 0.1})
      self.assertFalse(out.exists())
      export_stl(p, out, {'layerHeightMm': 0.1, 'baseThicknessMm': 1})
      check_closed_and_volume(self, mesh(out/'model.stl'), 8*6)

  def test_diagonal_contact_rejected_and_no_partial_output(self):
    for heights in ([[1,0],[0,1]], [[2,1],[1,2]]):
      with tempfile.TemporaryDirectory() as temp:
        out = Path(temp)/'mesh'
        with self.assertRaisesRegex(ValueError, '对角'):
          export_stl(project(heights), out, {'layerHeightMm': 0.1})
        self.assertFalse(out.exists())

  def test_invalid_options_and_existing_destination(self):
    p = project([[1]])
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'mesh'
      for options in ({}, {'layerHeightMm': 0}, {'layerHeightMm': float('nan')},
                      {'layerHeightMm': 11}, {'layerHeightMm': 0.1,
                                             'baseThicknessMm': -1}):
        with self.assertRaises(ValueError):
          export_stl(p, out, options)
      self.assertFalse(out.exists())
      out.mkdir()
      with self.assertRaisesRegex(ValueError, '已存在'):
        export_stl(p, out, {'layerHeightMm': 0.1})

  def test_float32_coordinate_precision_guard(self):
    p = project([[1]], size=(1e-46, 1))
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'mesh'
      with self.assertRaisesRegex(ValueError, '浮点精度'):
        export_stl(p, out, {'layerHeightMm': 0.1})
      self.assertFalse(out.exists())


if __name__ == '__main__':
  unittest.main()
