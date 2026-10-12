import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_v2 import (decode_project, decode_raster, dumps_project, encode_project,
                        encode_raster, load_project, loads_project, migrate_v1)
from relief import validate_project

FIXTURES = Path(__file__).resolve().parents[2] / 'tests' / 'fixtures' / 'v2'


def fixture():
  return json.loads((FIXTURES / 'normal-v2.json').read_text(encoding='utf-8'))


class ProjectV2Tests(unittest.TestCase):
  def test_typescript_fixture_round_trip_and_independent_arrays(self):
    wire = fixture()
    runtime = decode_project(wire)
    self.assertEqual(encode_project(runtime), wire)
    self.assertEqual(json.loads(dumps_project(runtime)), wire)
    np.testing.assert_array_equal(runtime['heights'], [0, 0, 3, 6, 10, 0, 3, 6, 10, 0, 3, 6])
    runtime['colors'][0] = 99
    self.assertEqual(runtime['original'][0], 0)
    self.assertEqual(decode_project(wire)['colors'][0], 0)

  def test_little_endian_matches_typescript_and_accepts_big_endian_runtime(self):
    encoded = encode_raster(np.array([0, 3, 256], dtype='>u2'))
    self.assertEqual(encoded, {'type': 'uint16', 'encoding': 'base64-le', 'data': 'AAADAAAB'})
    np.testing.assert_array_equal(decode_raster(encoded, 'uint16', 3), [0, 3, 256])

  def test_reject_invalid_raster_without_lossy_cast(self):
    for array in [np.array([-1]), np.array([1.5]), np.array([True]), np.zeros((2, 2), 'u1')]:
      with self.subTest(dtype=array.dtype, shape=array.shape), self.assertRaises(ValueError):
        encode_raster(array)
    for value in ['!', 'AB==', 'AA==', 'AAAA\n']:
      with self.subTest(value=value), self.assertRaises(ValueError):
        decode_raster({'type': 'uint16', 'encoding': 'base64-le', 'data': value}, 'uint16', 1)
    with self.assertRaises(ValueError):
      decode_raster(encode_raster(np.array([1], dtype='u1')), 'uint16', 1)
    with self.assertRaises(ValueError):
      decode_raster(encode_raster(np.array([1], dtype='u1')), 'uint8', True)

  def test_corrupt_fixture_and_shape_limits(self):
    with self.assertRaisesRegex(ValueError, 'heights'):
      loads_project((FIXTURES / 'corrupt-base64-v2.json').read_bytes())
    for key, value in [('width', 2049), ('height', 0), ('width', True),
                       ('revision', -1), ('revision', 2**53), ('sessionId', '')]:
      wire = fixture()
      wire[key] = value
      with self.subTest(key=key, value=value), self.assertRaises(ValueError):
        decode_project(wire)

  def test_pixel_invariants_and_native_shape(self):
    for field, index, value in [('labels', 1, 99), ('heights', 0, 1),
                                ('heights', 2, 257), ('protection', 1, 8), ('labels', 0, 1)]:
      runtime = decode_project(fixture())
      runtime[field][index] = value
      with self.subTest(field=field, value=value), self.assertRaises(ValueError):
        encode_project(runtime)
    runtime = decode_project(fixture())
    runtime['heights'] = runtime['heights'].reshape(3, 4)
    with self.assertRaises(ValueError):
      encode_project(runtime)

  def test_metadata_rejected_instead_of_silently_coerced(self):
    cases = [
      ('sizeMm', [float('nan'), 1]), ('sizeMm', [True, 1]), ('sizeMm', [10**400, 1]),
      ('regions', [{'id': 1, 'name': 'a', 'color': '#000000', 'defaultLayers': 257}]),
      ('heightMapping', {'kind': 'design', 'mmPerLayer': 0}),
      ('heightMapping', {'kind': 'design', 'mmPerLayer': 0.2}),
      ('heightMapping', {'kind': 'calibrated', 'profileId': 'x', 'mmByLayer': [0, 1]}),
      ('device', {**fixture()['device'], 'verified': 'yes'}),
      ('device', {**fixture()['device'], 'colorSpace': 'LAB'}),
    ]
    for key, value in cases:
      wire = fixture()
      wire[key] = value
      with self.subTest(key=key), self.assertRaises(ValueError):
        decode_project(wire)
    wire = fixture()
    wire['regions'].append(copy.deepcopy(wire['regions'][0]))
    with self.assertRaises(ValueError):
      decode_project(wire)

  def test_max_layer_and_calibration_range_round_trip(self):
    runtime = decode_project(fixture())
    runtime['heights'][2] = 256
    runtime['heightMapping'] = {'kind': 'calibrated', 'profileId': 'measured',
                               'mmByLayer': [i * 0.08 for i in range(257)]}
    self.assertEqual(loads_project(dumps_project(runtime))['heights'][2], 256)
    runtime['heightMapping']['mmByLayer'][2] = -1
    with self.assertRaises(ValueError):
      encode_project(runtime)
    runtime['heightMapping']['mmByLayer'][2] = 2
    with self.assertRaises(ValueError):
      encode_project(runtime)

  def test_max_dimensions_and_empty_print_range(self):
    # 2048 上限及全空图是合法工程；不以区域默认值重建像素高度。
    runtime = decode_project(fixture())
    runtime.update(width=2048, height=1, regions=[])
    for field in ('original', 'colors'):
      runtime[field] = np.zeros(2048 * 4, dtype=np.uint8)
    for field in ('labels', 'heights'):
      runtime[field] = np.zeros(2048, dtype=np.uint16)
    runtime['protection'] = np.zeros(2048, dtype=np.uint8)
    self.assertEqual(loads_project(dumps_project(runtime))['width'], 2048)

  def test_unknown_fields_and_mutable_metadata_are_not_shared(self):
    wire = fixture()
    wire['unrecognized'] = 1
    with self.assertRaises(ValueError):
      decode_project(wire)
    wire = fixture()
    runtime = decode_project(wire)
    runtime['regions'][0]['name'] = 'changed'
    self.assertNotEqual(wire['regions'][0]['name'], 'changed')
    encoded = encode_project(runtime)
    encoded['device']['name'] = 'changed'
    self.assertNotEqual(runtime['device']['name'], 'changed')

  def test_strict_json_utf8_and_size_limit(self):
    for text in ['{"version":2,"version":2}', '{"x":NaN}', '[]', b'\xff', '{']:
      with self.subTest(text=text), self.assertRaises(ValueError):
        loads_project(text)
    with patch('project_v2.MAX_FILE_BYTES', 16):
      with self.assertRaisesRegex(ValueError, '128 MiB'):
        loads_project('中' * 6)
      with self.assertRaises(ValueError):
        dumps_project(decode_project(fixture()))
      with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'oversize.json'
        path.write_bytes(b' ' * 17)
        with self.assertRaises(ValueError):
          load_project(path)

  def test_v1_migration_preserves_colors_labels_background_and_height(self):
    legacy = json.loads((FIXTURES / 'legacy-v1.json').read_text(encoding='utf-8'))
    untouched = copy.deepcopy(legacy)
    rgba, labels = validate_project(legacy)
    result = migrate_v1(legacy, session_id='migration-test')
    self.assertEqual(legacy, untouched)
    np.testing.assert_array_equal(result['original'], rgba.ravel())
    np.testing.assert_array_equal(result['colors'], rgba.ravel())
    np.testing.assert_array_equal(result['labels'], labels.ravel())
    expected = np.zeros(labels.shape, dtype=np.uint16)
    for region in legacy['regions']:
      expected[labels == region['id']] = region['layers']
    np.testing.assert_array_equal(result['heights'], expected.ravel())
    self.assertFalse(result['protection'].any())
    self.assertEqual(result['heightMapping'], {'kind': 'design', 'mmPerLayer': 0.1})
    self.assertFalse(result['device']['verified'])
    self.assertEqual(result['sessionId'], 'migration-test')
    self.assertEqual(encode_project(loads_project(dumps_project(result))), encode_project(result))

  def test_v1_zero_height_color_and_invalid_input(self):
    from test_engine import project
    legacy = project()
    result = migrate_v1(legacy, session_id='legacy')
    self.assertEqual(result['labels'][0], 1)
    self.assertEqual(result['heights'][0], 0)
    self.assertEqual(result['colors'][3], 255)
    legacy['regions'][0]['layers'] = 257
    with self.assertRaises(ValueError):
      migrate_v1(legacy, session_id='legacy')
    with self.assertRaises(ValueError):
      loads_project(json.dumps(project()))


if __name__ == '__main__':
  unittest.main()
