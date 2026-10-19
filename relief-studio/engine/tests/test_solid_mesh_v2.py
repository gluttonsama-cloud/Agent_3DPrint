"""实体模型以真实像素高度为依据，独立核对闭边与体积。"""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from PIL import Image

from test_stl import project, mesh, check_closed_and_volume
from project_v2 import migrate_v1, encode_project
from stl_export import export_stl
from export_obj import export_obj
from export_layers import export_bundle


def snapshot(values):
  values = np.asarray(values, dtype=np.uint16)
  source = migrate_v1(project(np.ones(values.shape, dtype=np.uint8), size=(values.shape[1], values.shape[0])))
  source['heights'] = values.ravel().copy()
  return source


def obj_triangles(path):
  vertices, faces = [], []
  for line in path.read_text('utf-8').splitlines():
    if line.startswith('v '):
      vertices.append(tuple(float(value) for value in line.split()[1:]))
    elif line.startswith('f '):
      faces.append([int(value.split('/')[0])-1 for value in line.split()[1:]])
  triangles = []
  for face in faces:
    points = [vertices[index] for index in face]
    normal = np.cross(np.asarray(points[1])-points[0], np.asarray(points[2])-points[0])
    triangles.append((normal, points))
  return triangles


class SolidMeshTests(unittest.TestCase):
  def test_solid_obj_textures_only_upward_faces_and_keeps_closed_base(self):
    for values in ([[1, 1], [1, 1]], [[0, 1, 3], [0, 1, 2]]):
      source = snapshot(values)
      with tempfile.TemporaryDirectory() as root:
        target = Path(root)/'obj'
        export_obj(source, target, options={'mode': 'solid'})
        vertices, material = [], None
        for line in (target/'relief.obj').read_text('utf-8').splitlines():
          words = line.split()
          if words[0] == 'v':
            vertices.append(list(map(float, words[1:])))
          elif words[0] == 'usemtl':
            material = words[1]
          elif words[0] == 'f':
            tri = np.array([vertices[int(word.split('/')[0])-1] for word in words[1:]])
            normal = np.cross(tri[1]-tri[0], tri[2]-tri[0])
            self.assertEqual(material, 'relief' if normal[2] > 0 else 'base')
        materials = (target/'relief.mtl').read_text('utf-8')
        self.assertIn('newmtl base', materials)
        self.assertNotIn('map_Kd', materials.split('newmtl base')[1])
        check_closed_and_volume(self, obj_triangles(target/'relief.obj'),
                                source['heights'].size + float(source['heights'].sum())*.1)

  def test_stl_uses_mixed_pixel_heights_instead_of_region_defaults(self):
    source = snapshot([[1, 3, 2], [1, 2, 2]])
    before = source['heights'].copy()
    with tempfile.TemporaryDirectory() as root:
      target = Path(root)/'stl'
      export_stl(encode_project(source), target, {'layerHeightMm': .2, 'baseThicknessMm': 1})
      triangles = mesh(target/'model.stl')
      check_closed_and_volume(self, triangles, 6 + before.sum()*.2)
      top = {round(vertex[2], 6) for normal, tri in triangles if normal[2] > 0 for vertex in tri}
      self.assertEqual(top, {1.2, 1.4, 1.6})
      np.testing.assert_array_equal(source['heights'], before)

  def test_stl_uses_calibration_and_rejects_uniform_override(self):
    source = snapshot([[0, 1, 2, 3]])
    source['heightMapping'] = {'kind': 'calibrated', 'profileId': 'measured', 'mmByLayer': [0, .02, .09, .21]}
    with tempfile.TemporaryDirectory() as root:
      target = Path(root)/'stl'
      export_stl(encode_project(source), target, {'baseThicknessMm': 1})
      check_closed_and_volume(self, mesh(target/'model.stl'), 4 + .02 + .09 + .21)
      with self.assertRaisesRegex(ValueError, '标定'):
        export_stl(encode_project(source), Path(root)/'override', {'layerHeightMm': .1})

  def test_closed_obj_preserves_mixed_height_texture_and_zero_layer_base(self):
    source = snapshot([[0, 1, 3], [0, 1, 2]])
    source['labels'][0] = 0
    source['colors'][:4] = [230, 20, 60, 0]
    source['original'][:4] = [230, 20, 60, 0]
    before = copy.deepcopy(source)
    with tempfile.TemporaryDirectory() as root:
      target = Path(root)/'obj'
      export_obj(source, target, options={'mode': 'solid', 'baseThicknessMm': 1})
      triangles = obj_triangles(target/'relief.obj')
      check_closed_and_volume(self, triangles, 6 + source['heights'].sum()*.1)
      metadata = json.loads((target/'obj-meta.json').read_text('utf-8'))
      self.assertTrue(metadata['closedSolid'])
      self.assertEqual(metadata['baseThicknessMm'], 1)
      texture = np.asarray(Image.open(target/'texture.png').convert('RGB'))
      np.testing.assert_array_equal(texture[0, 0], [255, 255, 255])
      np.testing.assert_array_equal(texture[1, 0], source['colors'].reshape(2, 3, 4)[1, 0, :3])
      for field in ('heights', 'labels', 'colors', 'original', 'protection'):
        np.testing.assert_array_equal(source[field], before[field])

  def test_solid_obj_and_stl_share_calibrated_geometry_and_explicit_repair(self):
    source = snapshot([[1, 0], [0, 1]])
    source['heightMapping'] = {'kind': 'calibrated', 'profileId': 'small-steps', 'mmByLayer': [0, .015]}
    with tempfile.TemporaryDirectory() as root:
      with self.assertRaisesRegex(ValueError, '对角'):
        export_obj(source, Path(root)/'bad', options={'mode': 'solid', 'baseThicknessMm': 1})
      self.assertFalse((Path(root)/'bad/relief.obj').exists())
      options = {'baseThicknessMm': 1, 'repairDiagonalContacts': True}
      obj = Path(root)/'obj'
      stl = Path(root)/'stl'
      export_obj(source, obj, options={'mode': 'solid', **options})
      export_stl(encode_project(source), stl, options)
      check_closed_and_volume(self, obj_triangles(obj/'relief.obj'), 4 + 3*.015)
      check_closed_and_volume(self, mesh(stl/'model.stl'), 4 + 3*.015)
      metadata = json.loads((obj/'obj-meta.json').read_text('utf-8'))
      self.assertEqual(metadata['repairedPixels'], 1)
      self.assertAlmostEqual(metadata['addedVolumeMm3'], .015, places=6)
      np.testing.assert_array_equal(source['heights'], [1, 0, 0, 1])

  def test_obj_options_reach_bundle_and_explain_model_only_repair(self):
    source = snapshot([[1, 0], [0, 1]])
    with tempfile.TemporaryDirectory() as root:
      target = Path(root)/'bundle'
      result = export_bundle(source, target, obj=True, obj_options={
        'mode': 'solid', 'baseThicknessMm': 1, 'repairDiagonalContacts': True})
      self.assertTrue(any(check['code'] == 'OBJ_GEOMETRY_REPAIRED' for check in result['checks']))
      np.testing.assert_array_equal(np.asarray(Image.open(target/'height.png')).ravel(), source['heights'])
      self.assertTrue(json.loads((target/'obj-meta.json').read_text('utf-8'))['closedSolid'])

  def test_solid_cancel_and_resource_limit_leave_no_partial_files(self):
    source = snapshot([[1, 2], [1, 2]])
    with tempfile.TemporaryDirectory() as root:
      target = Path(root)/'obj'
      with self.assertRaises(InterruptedError):
        export_obj(source, target, options={'mode': 'solid'}, cancelled=lambda: True)
      self.assertFalse((target/'relief.obj').exists())

      with patch('export_solid_obj.MAX_BYTES', 1), self.assertRaisesRegex(ValueError, '上限'):
        export_obj(source, target, options={'mode': 'solid'})
      self.assertFalse((target/'relief.obj').exists())

  def test_calibration_plateaus_are_valid_but_precision_collapse_is_not(self):
    source = snapshot([[1, 2], [3, 0]])
    source['heightMapping'] = {'kind': 'calibrated', 'profileId': 'plateaus',
                               'mmByLayer': [0, 0, 0, .17]}
    with tempfile.TemporaryDirectory() as root:
      target = Path(root)/'valid'
      result = export_stl(encode_project(source), target, {'baseThicknessMm': 1})
      check_closed_and_volume(self, mesh(target/'model.stl'), 4 + .17)
      self.assertEqual(result['repairedPixels'], 0)
      source['heightMapping']['mmByLayer'] = [0, 1e-9, 1e-9, .17]
      with self.assertRaisesRegex(ValueError, '浮点精度'):
        export_stl(encode_project(source), Path(root)/'invalid', {'baseThicknessMm': 100})

  def test_nonfinite_coordinates_rejected_and_override_recorded(self):
    source = snapshot([[1]])
    with tempfile.TemporaryDirectory() as root:
      result = export_stl(encode_project(source), Path(root)/'override', {'layerHeightMm': .2})
      self.assertEqual(result['heightMapping']['mmPerLayer'], .2)
      source['sizeMm'] = [1e300, 1]
      with self.assertRaisesRegex(ValueError, '有限浮点'):
        export_obj(source, Path(root)/'invalid', options={'mode': 'solid'})
      self.assertFalse((Path(root)/'invalid/relief.obj').exists())

  def test_large_metadata_is_included_in_obj_budget(self):
    source = snapshot([[1]])
    source['sessionId'] = '项目' * 100000
    with tempfile.TemporaryDirectory() as root:
      target = Path(root)/'obj'
      with patch('export_solid_obj.MAX_BYTES', 70000), self.assertRaisesRegex(ValueError, '上限'):
        export_obj(source, target, options={'mode': 'solid'})
      self.assertFalse((target/'relief.obj').exists())

  def test_uniform_box_keeps_opaque_color_texture_and_cancel_cleans_written_files(self):
    source = snapshot([[0, 0], [0, 0]])
    source['colors'][:4] = [230, 20, 60, 0]
    source['labels'][0] = 0
    with tempfile.TemporaryDirectory() as root:
      target = Path(root)/'uniform'
      result = export_obj(source, target, options={'mode': 'solid'})
      self.assertEqual(result['triangles'], 12)
      check_closed_and_volume(self, obj_triangles(target/'relief.obj'), 4)
      with Image.open(target/'texture.png') as image:
        self.assertEqual(image.mode, 'RGB')
      np.testing.assert_array_equal(np.asarray(Image.open(target/'texture.png'))[0, 0], [255]*3)
      source = snapshot([[1, 2], [1, 2]])
      cancelled = [False]
      def progress(*args):
        if (Path(root)/'cancel/relief.obj').exists():
          cancelled[0] = True
      with self.assertRaises(InterruptedError):
        export_obj(source, Path(root)/'cancel', options={'mode': 'solid'},
                   cancelled=lambda: cancelled[0], progress=progress)
      self.assertEqual(list((Path(root)/'cancel').iterdir()), [])


if __name__ == '__main__':
  unittest.main()
