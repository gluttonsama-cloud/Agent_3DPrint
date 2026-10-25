import copy
import json
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_v2 import decode_project, decode_raster, migrate_v1
from height_ops import physical_distance, run_height


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
  def test_bevel_round_and_diamond_caps_do_not_become_height_spikes(self):
    y, x = np.indices((11, 11))
    for shape in ('diamond', 'circle'):
      for operation in ({'kind': 'bevel', 'radiusPx': 8}, {'kind': 'bevel', 'widthMm': 8}):
        with self.subTest(shape=shape, operation=operation):
          value = fixture(11, 11)
          value['sizeMm'] = [11, 11]
          mask = (abs(y-5)+abs(x-5) <= 3) if shape == 'diamond' else ((y-5)**2+(x-5)**2 <= 16)
          value['heights'] = (12*mask).astype('uint16').ravel()
          value['labels'] = mask.astype('uint16').ravel()
          result = applied(value, run_height(value, operation))['heights'].reshape(11, 11)
          self.assertLess(int(result[mask].max()), 12)
          radius = 3 if shape == 'diamond' else 4
          for dy, dx in ((-radius, 0), (radius, 0), (0, -radius), (0, radius)):
            self.assertEqual(result[5+dy, 5+dx], 2)

  def test_bevel_keeps_connected_one_pixel_tail_bridge_and_standalone_line(self):
    for bridge in (False, True):
      for operation in ({'kind': 'bevel', 'radiusPx': 8}, {'kind': 'bevel', 'widthMm': 8}):
        with self.subTest(bridge=bridge, operation=operation):
          value = fixture(25, 13)
          value['sizeMm'] = [25, 13]
          source = value['heights'].reshape(13, 25)
          source[:] = 0
          source[3:8, 2:7] = 12
          source[5, 7:17] = 12
          source[10, 2:17] = 12
          source[1, 23] = 12
          if bridge:
            source[3:8, 17:22] = 12
          value['labels'] = (value['heights'] != 0).astype('uint16')
          result = applied(value, run_height(value, operation))['heights'].reshape(13, 25)
          np.testing.assert_array_equal(result[5, 7:17], 12)
          np.testing.assert_array_equal(result[10, 2:17], 12)
          self.assertEqual(result[1, 23], 12)
          self.assertLess(result[4, 3], 12)

  def test_physical_distance_matches_independent_brute_force_oracle(self):
    rng = np.random.default_rng(904)
    for shape in ((1, 9), (9, 1), (13, 17)):
      for spacing in ((.125, .25), (3.75, .01), (.01, 3.75)):
        for _ in range(4):
          features = rng.random(shape) < .15
          features[shape[0]//2, shape[1]//2] = True
          sources = np.argwhere(features)
          expected = np.empty(shape)
          for y, x in np.ndindex(shape):
            expected[y, x] = min(np.hypot((y-sy)*spacing[0], (x-sx)*spacing[1])
                                 for sy, sx in sources)
          np.testing.assert_allclose(physical_distance(features, spacing, lambda: False),
                                     expected, rtol=1e-12, atol=1e-12)

  def test_physical_distance_equal_spacing_matches_oracle_and_checks_cancel(self):
    features = np.zeros((47, 53), dtype=bool)
    features[3, 7] = features[40, 18] = features[20, 40] = True
    y, x = np.indices(features.shape)
    expected = np.sqrt(np.min([(y-sy)**2+(x-sx)**2 for sy, sx in np.argwhere(features)], axis=0))*.125
    np.testing.assert_allclose(physical_distance(features, (.125, .125), lambda: False),
                               expected, rtol=1e-7, atol=1e-7)
    reference = physical_distance(features, (.125, np.nextafter(.125, np.inf)), lambda: False)
    np.testing.assert_allclose(physical_distance(features, (.125, .125), lambda: False),
                               reference, rtol=1e-7, atol=1e-7)
    calls = 0

    def cancelled():
      nonlocal calls
      calls += 1
      return calls == 2

    with self.assertRaises(InterruptedError):
      physical_distance(features, (.125, .125), cancelled)

  def test_bevel_mm_cancels_inside_distance_transform(self):
    calls = 0

    def cancelled():
      nonlocal calls
      calls += 1
      return calls == 4

    with self.assertRaises(InterruptedError):
      run_height(fixture(512, 512), {'kind': 'bevel', 'widthMm': 2}, cancelled=cancelled)
    self.assertEqual(calls, 4)

  def test_bevel_mm_has_same_physical_width_at_three_resolutions(self):
    for resolution in (512, 1024, 2048):
      with self.subTest(resolution=resolution):
        value = fixture(resolution, resolution)
        value['sizeMm'] = [64, 64]
        value['heights'][:] = 200
        result = applied(value, run_height(value, {'kind': 'bevel', 'widthMm': 2}))
        row = result['heights'].reshape(resolution, resolution)[resolution//2]
        first_full = int(np.flatnonzero(row == 200)[0])+1
        step = 64/resolution
        self.assertLessEqual(abs(first_full*step-2), step+2/400)
        halfway = round(1/step)-1
        self.assertEqual(int(row[halfway]), 100)

  def test_bevel_mm_uses_both_pixel_spacings_and_euclidean_hole_distance(self):
    value = fixture(512, 512)
    value['sizeMm'] = [64, 128]
    value['heights'][:] = 200
    value['labels'][256*512+256] = value['heights'][256*512+256] = 0
    result = applied(value, run_height(value, {'kind': 'bevel', 'widthMm': 2}))
    heights = result['heights'].reshape(512, 512)
    self.assertEqual(heights[128, 7], 100)
    self.assertEqual(heights[3, 128], 100)
    for dy, dx in ((1, 2), (3, 4), (5, 6)):
      distance = np.hypot(dx*.125, dy*.25)
      self.assertEqual(heights[256+dy, 256+dx], int(np.floor(200*min(1, distance/2)+.5)))
    self.assertEqual(heights[256, 256], 0)

  def test_bevel_mm_preserves_thin_line_protection_selection_and_mixed_base(self):
    value = fixture(64, 64)
    value['sizeMm'] = [32, 64]
    heights = value['heights'].reshape(64, 64)
    heights[:, :28] = 0
    heights[:, 28:36] = 10
    heights[:, 36:] = 8
    heights[16, 4:20] = 12
    whole = applied(value, run_height(value, {'kind': 'bevel', 'widthMm': 8}))
    np.testing.assert_array_equal(whole['heights'].reshape(64, 64)[16, 4:20], 12)
    self.assertTrue(np.all(whole['heights'].reshape(64, 64)[32, 28:36] >= 8))
    selection = np.zeros(64*64, dtype='uint8')
    selection.reshape(64, 64)[8:40, 24:40] = 1
    value['protection'][32*64+30] = 4
    local = applied(value, run_height(value, {'kind': 'bevel', 'widthMm': 8}, selection))
    writable = (selection != 0) & (value['protection'] == 0)
    np.testing.assert_array_equal(local['heights'][writable], whole['heights'][writable])
    np.testing.assert_array_equal(local['heights'][~writable], value['heights'][~writable])
    for field in ('labels', 'colors', 'protection'):
      np.testing.assert_array_equal(local[field], value[field])

  def test_bevel_mm_strict_parameters_and_legacy_pixel_compatibility(self):
    value = fixture(32, 32)
    value['sizeMm'] = [16, 16]
    legacy = applied(value, run_height(value, {'kind': 'bevel', 'radiusPx': 4}))
    physical = applied(value, run_height(value, {'kind': 'bevel', 'widthMm': 2}))
    np.testing.assert_array_equal(physical['heights'], legacy['heights'])
    for width in (0, -1, float('nan'), float('inf'), True, '2', None):
      with self.subTest(width=width), self.assertRaises(ValueError):
        run_height(value, {'kind': 'bevel', 'widthMm': width})
    for operation in ({'kind': 'bevel', 'widthMm': 2, 'radiusPx': 4},
                      {'kind': 'bevel', 'widthMm': 2, 'radiusPx': None},
                      {'kind': 'bevel'}, {'kind': 'smooth', 'radiusPx': 2, 'widthMm': 1}):
      with self.subTest(operation=operation), self.assertRaises(ValueError):
        run_height(value, operation)

  def test_bevel_uses_height_edges_not_color_or_selection_edges(self):
    value = fixture(32, 32)
    value['labels'].reshape(32, 32)[:, 16:] = 2
    result = applied(value, run_height(value, {'kind': 'bevel', 'radiusPx': 4}))
    # 等高分色不是物理边缘，中央分色线不能被刻成沟。
    np.testing.assert_array_equal(result['heights'].reshape(32, 32)[12:20, 12:20], 12)
    selection = np.zeros(32*32, dtype='uint8')
    selection.reshape(32, 32)[12:20, 12:20] = 1
    local = run_height(value, {'kind': 'bevel', 'radiusPx': 4}, selection)
    self.assertEqual(local['blocks'], [])

  def test_bevel_transitions_toward_neighbor_height_not_zero(self):
    value = fixture(32, 32)
    value['heights'][:] = 6
    value['labels'].reshape(32, 32)[8:24, 8:24] = 2
    value['heights'].reshape(32, 32)[8:24, 8:24] = 10
    result = applied(value, run_height(value, {'kind': 'bevel', 'radiusPx': 4}))
    heights = result['heights'].reshape(32, 32)
    self.assertGreaterEqual(heights[16, 8], 6)
    self.assertLess(heights[16, 8], 10)
    self.assertEqual(heights[16, 7], 6)
    self.assertEqual(heights[16, 16], 10)
    for field in ('labels', 'colors', 'protection'):
      np.testing.assert_array_equal(result[field], value[field])

  def test_smoothing_does_not_raise_chamfer_edge_back_into_wall(self):
    value = fixture(32, 32)
    labels = value['labels'].reshape(32, 32)
    labels[:] = 0
    labels[8:24, 8:24] = 1
    heights = value['heights'].reshape(32, 32)
    heights[:] = 0
    heights[8:24, 8:24] = 10
    heights[8, 8:24] = heights[23, 8:24] = 2
    heights[8:24, 8] = heights[8:24, 23] = 2
    result = applied(value, run_height(value, {'kind': 'smooth', 'radiusPx': 3}))
    self.assertLessEqual(result['heights'].reshape(32, 32)[8, 16], 2)
    self.assertEqual(result['heights'].reshape(32, 32)[16, 16], 10)
    self.assertTrue(np.all(result['heights'][value['labels'] == 0] == 0))

  def test_bevel_mixed_support_has_no_nearest_base_seam_or_inverted_step(self):
    value = fixture(64, 64)
    heights = value['heights'].reshape(64, 64)
    heights[:, :28] = 0
    heights[:, 28:36] = 10
    heights[:, 36:] = 8
    result = applied(value, run_height(value, {'kind': 'bevel', 'radiusPx': 16}))
    row = result['heights'].reshape(64, 64)[32]
    self.assertTrue(np.all((row[28:36] >= 8) & (row[28:36] <= 10)))
    self.assertLessEqual(np.abs(np.diff(row[28:36].astype(int))).max(), 1)
    self.assertEqual(row[36], 8)

  def test_bevel_local_write_matches_whole_geometry_with_protected_pixels(self):
    value = fixture(40, 40)
    value['heights'][:] = 6
    value['heights'].reshape(40, 40)[8:32, 8:32] = 12
    selection = np.zeros(40*40, dtype='uint8')
    selection.reshape(40, 40)[8:20, 8:20] = 1
    whole = applied(value, run_height(value, {'kind': 'bevel', 'radiusPx': 6}))
    value['protection'][10*40+10] = 4
    local = applied(value, run_height(value, {'kind': 'bevel', 'radiusPx': 6}, selection))
    writable = (selection != 0) & (value['protection'] == 0)
    np.testing.assert_array_equal(local['heights'][writable], whole['heights'][writable])
    np.testing.assert_array_equal(local['heights'][~writable], value['heights'][~writable])

  def test_smoothing_thin_line_and_ring_are_not_eroded_to_minimum(self):
    for ring in (False, True):
      value = fixture(32, 32)
      labels = value['labels'].reshape(32, 32)
      labels[:] = 0
      labels[4, 4:28] = 1
      if ring:
        labels[27, 4:28] = labels[4:28, 4] = labels[4:28, 27] = 1
      value['heights'][:] = 0
      indices = np.flatnonzero(value['labels'])
      value['heights'][indices] = np.resize([2, 100], len(indices))
      result = applied(value, run_height(value, {'kind': 'smooth', 'radiusPx': 128}))
      self.assertGreater(float(result['heights'][indices].mean()), 40)
      self.assertLess(float(result['heights'][indices].mean()), 60)
      self.assertLess(int(np.ptp(result['heights'][indices])), 98)
      np.testing.assert_array_equal(result['heights'][value['labels'] == 0], 0)

  def test_bevel_preserves_2048_existing_gradient_and_checks_mid_operation_cancel(self):
    value = fixture(2048, 2048)
    y, x = np.ogrid[:2048, :2048]
    value['heights'] = ((x+y) % 256+1).astype('uint16').ravel()
    self.assertEqual(len(run_height(value, {'kind': 'bevel', 'radiusPx': 16})['blocks']), 0)
    calls = 0

    def cancel_after_start():
      nonlocal calls
      calls += 1
      return calls > 1

    with self.assertRaises(InterruptedError):
      run_height(fixture(), {'kind': 'bevel', 'radiusPx': 4}, cancelled=cancel_after_start)

  def test_real_logo_bevel_then_smooth_keeps_raised_text_above_gold(self):
    path = Path(__file__).resolve().parents[2]/'samples/sample-project.json'
    value = migrate_v1(json.loads(path.read_text(encoding='utf-8')))
    text = value['heights'] == 10
    result = value
    for kind in ('bevel', 'smooth'):
      result = applied(result, run_height(result, {'kind': kind, 'radiusPx': 4}))
      self.assertGreaterEqual(int(result['heights'][text].min()), 5)
      self.assertEqual(int(result['heights'][text].max()), 10)
      np.testing.assert_array_equal(result['heights'][value['heights'] == 0], 0)
      for field in ('labels', 'colors', 'protection'):
        np.testing.assert_array_equal(result[field], value[field])

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

  def test_suggest_keeps_ambiguous_logo_region_heights(self):
    path = Path(__file__).resolve().parents[2]/'samples/sample-project.json'
    value = migrate_v1(json.loads(path.read_text(encoding='utf-8')))
    candidate = run_height(value, {'kind': 'suggest', 'maxLayers': 10})
    result = applied(value, candidate)
    np.testing.assert_array_equal(result['heights'], value['heights'])
    self.assertEqual(candidate['blocks'], [])
    self.assertGreater(candidate['diagnostics']['ambiguousRegionCount'], 0)
    for field in ('colors', 'labels', 'protection'):
      np.testing.assert_array_equal(result[field], value[field])

  def test_suggest_clear_roles_respect_selection_protection_and_limit(self):
    value = fixture(24, 24)
    value['labels'].reshape(24, 24)[8:16, 8:16] = 2
    selection = np.zeros(24*24, dtype='uint8')
    selection.reshape(24, 24)[:, :12] = 1
    value['protection'][10*24+10] = 4
    result = applied(value, run_height(value, {'kind': 'suggest', 'maxLayers': 4}, selection))
    self.assertEqual(result['heights'][4*24+4], 3)
    self.assertEqual(result['heights'][9*24+9], 4)
    self.assertEqual(result['heights'][10*24+10], 12)
    np.testing.assert_array_equal(result['heights'][selection == 0], value['heights'][selection == 0])

  def test_suggest_conflicting_roles_do_not_depend_on_region_id_order(self):
    value = fixture(32, 32)
    labels = value['labels'].reshape(32, 32)
    # 同一色区既有外围底面，也有内部孤岛，不能按遍历顺序猜层级。
    labels[6:26, 6:26] = 2
    labels[12:20, 12:20] = 1
    candidate = run_height(value, {'kind': 'suggest', 'maxLayers': 10})
    result = applied(value, candidate)
    np.testing.assert_array_equal(result['heights'], value['heights'])
    swapped = copy.deepcopy(value)
    swapped['labels'] = np.where(value['labels'] == 1, 2, 1).astype('uint16')
    other = applied(swapped, run_height(swapped, {'kind': 'suggest', 'maxLayers': 10}))
    np.testing.assert_array_equal(result['heights'], other['heights'])


if __name__ == '__main__':
  unittest.main()
