import os
import unittest
from unittest.mock import patch
import numpy as np
from test_height_ops import fixture, applied
from project_v2 import _metadata, _pixels, decode_raster
from recognition_ops import recognize, import_snapshot


class RecognitionTests(unittest.TestCase):
  def test_color_background_exclusion_is_consistent_when_all_pixels_are_excluded(self):
    value = fixture()
    for excluded_count in (32, 64):
      with self.subTest(excluded_count=excluded_count):
        excluded = np.zeros(64, 'uint8')
        excluded[:excluded_count] = 1
        result = applied(value, recognize(value, mode='color', keep_background=True,
                                          excluded_mask=excluded))
        self.assertTrue(np.all(result['labels'][:excluded_count] == 0))
        self.assertTrue(np.all(result['heights'][:excluded_count] == 0))
        self.assertTrue(np.all(result['labels'][excluded_count:] != 0))

  def test_preserve_keeps_manual_region_name_when_reusing_region_id(self):
    value = fixture()
    value['regions'][0]['name'] = '白色立体文字'
    result = applied(value, recognize(value, mode='color'))
    self.assertEqual(result['regions'][0]['id'], 1)
    self.assertEqual(result['regions'][0]['name'], '白色立体文字')

  def test_v2_explicit_subject_retains_opt_in_material_shade_merge(self):
    value = fixture(16, 16)
    rgba = value['original'].reshape(16, 16, 4)
    rgba[:, :8, :3] = [210, 160, 70]
    rgba[:, 8:, :3] = [120, 90, 38]
    value['colors'][:] = value['original']
    mask = np.ones(256, 'uint8')
    for options, expected in (({}, 2), ({'merge_material_shades': True}, 1),
                              ({'merge_material_shades': False}, 2)):
      with self.subTest(options=options):
        result = applied(value, recognize(value, subject_mask=mask, **options))
        self.assertEqual(len(set(result['labels'])), expected)
        np.testing.assert_array_equal(result['colors'], value['original'])
        np.testing.assert_array_equal(result['heights'], value['heights'])

  def test_color_reanalysis_uses_original_preserves_manual_pixels_and_local_scope(self):
    value = fixture(32, 16)
    rgba = value['original'].reshape(16, 32, 4)
    rgba[:, :16, :3] = [210, 30, 20]
    rgba[:, 16:, :3] = [20, 40, 220]
    value['colors'][:] = value['original']
    value['colors'][4:8] = [10, 240, 10, 255]
    value['protection'][1] = 2
    value['labels'][2] = value['heights'][2] = 0
    value['protection'][2] = 5
    value['heights'][3] = 47
    value['protection'][3] = 4
    selection = np.zeros(512, 'uint8')
    selection.reshape(16, 32)[:, :16] = 1
    candidate = recognize(value, selection, mode='color')
    result = applied(value, candidate)
    for field in ('labels', 'heights', 'protection'):
      np.testing.assert_array_equal(result[field][selection == 0], value[field][selection == 0])
    np.testing.assert_array_equal(result['colors'].reshape(-1, 4)[selection == 0],
                                  value['colors'].reshape(-1, 4)[selection == 0])
    self.assertEqual(result['labels'][2], 0)
    self.assertEqual(result['heights'][3], 47)
    np.testing.assert_array_equal(result['colors'][4:8], [10, 240, 10, 255])
    np.testing.assert_array_equal(result['protection'], value['protection'])
    selected_region = next(r for r in result['regions'] if r['id'] == result['labels'][1])
    self.assertEqual(selected_region['color'], '#d21e14')
    self.assertEqual(candidate['diagnostics']['source'], 'original-color')
    _pixels(result, *_metadata(result))

  def test_overwrite_recalculates_selected_heights_and_releases_only_selected_protection(self):
    value = fixture()
    value['heights'][0] = 47
    value['protection'][:] = 7
    value['colors'][:4] = [20, 30, 40, 255]
    selection = np.zeros(64, 'uint8')
    selection[:16] = 1
    result = applied(value, recognize(value, selection, mode='color',
                                      protection_policy='overwrite', default_layers=6))
    self.assertTrue(np.all(result['heights'][:16] == 6))
    self.assertTrue(np.all(result['protection'][:16] == 0))
    np.testing.assert_array_equal(result['protection'][16:], value['protection'][16:])
    np.testing.assert_array_equal(result['colors'][:4], value['original'][:4])

  def test_explicit_subject_mask_and_background_exclusion_honor_range_protection(self):
    value = fixture(16, 16)
    mask = np.zeros(256, 'uint8')
    mask[32:224] = 1
    value['protection'][0] = 1
    result = applied(value, recognize(value, subject_mask=mask, default_layers=9,
                                      predictor=lambda _: self.fail('显式主体不需要模型')))
    self.assertEqual(result['labels'][0], 1)
    self.assertEqual(result['heights'][0], 12)
    self.assertEqual(result['labels'][1], 0)
    excluded = np.zeros(256, 'uint8')
    excluded[:32] = 1
    result = applied(value, recognize(value, mode='color', excluded_mask=excluded))
    self.assertEqual(result['labels'][0], 1)
    self.assertEqual(result['labels'][1], 0)

  def test_transparency_holes_and_same_color_disconnected_text(self):
    value = fixture(12, 12)
    rgba = value['original'].reshape(12, 12, 4)
    rgba[:, :, 3] = 0
    rgba[2, 1:9, 3] = 255
    rgba[7:10, 7:10, 3] = 255
    rgba[8, 8, 3] = 0
    visible = rgba[:, :, 3].ravel() > 0
    value['labels'][~visible] = 0
    value['heights'][~visible] = 0
    candidate = recognize(value, predictor=lambda _: self.fail('透明图不应调用预测器'))
    result = applied(value, candidate)
    np.testing.assert_array_equal(result['labels'] != 0, visible)
    self.assertEqual(candidate['diagnostics']['source'], 'alpha')
    self.assertEqual(set(result['labels'][visible]), {1})

  def test_protection_and_cross_field_conflicts(self):
    value = fixture()
    value['protection'][0:3] = [1, 2, 4]
    value['colors'][4:8] = [20, 30, 40, 255]
    candidate = recognize(value, predictor=lambda rgb: np.zeros(rgb.shape[:2]))
    result = applied(value, candidate)
    self.assertEqual(result['labels'][0], 1)
    self.assertEqual(result['labels'][2], 1)
    self.assertEqual(result['heights'][2], 12)
    np.testing.assert_array_equal(result['colors'][4:8], value['colors'][4:8])
    self.assertEqual(result['labels'][3], 0)
    count, ids = _metadata(result)
    _pixels(result, count, ids)
    self.assertEqual(decode_raster(candidate['diagnostics']['uncertain'], 'uint8', 64)[2], 1)
    overwritten = applied(value, recognize(value, protection_policy='overwrite', predictor=lambda rgb: np.zeros(rgb.shape[:2])))
    self.assertTrue(np.all(overwritten['labels'] == 0))
    self.assertTrue(np.all(value['labels'] == 1))

  def test_local_coordinates_and_zero_layer_background(self):
    value = fixture()
    selection = np.zeros(64, 'uint8')
    selection.reshape(8, 8)[4:6, 5:7] = 1
    shapes = []
    def predict(rgb):
      shapes.append(rgb.shape)
      return np.array([[1, 0], [1, .5]])
    candidate = recognize(value, selection, keep_background=True, predictor=predict)
    result = applied(value, candidate)
    self.assertEqual(shapes, [(2, 2, 3)])
    np.testing.assert_array_equal(result['heights'][selection == 0], value['heights'][selection == 0])
    self.assertEqual(result['heights'].reshape(8, 8)[4, 6], 0)
    self.assertNotEqual(result['labels'].reshape(8, 8)[4, 6], 0)

  def test_empty_failure_and_cancellation(self):
    value = fixture()
    self.assertEqual(recognize(value, np.zeros(64, 'uint8'))['blocks'], [])
    with patch.dict(os.environ, {'RELIEF_BIREFNET_DIRECTORY': '/missing-model'}):
      with self.assertRaisesRegex(RuntimeError, '缺少 BiRefNet'):
        recognize(value)
    with self.assertRaises(ValueError):
      recognize(value, predictor=lambda rgb: np.ones((1, 1)))
    with self.assertRaises(InterruptedError):
      recognize(value, cancelled=lambda: True)
    calls = [False, True]
    with self.assertRaises(InterruptedError):
      recognize(value, predictor=lambda rgb: np.ones(rgb.shape[:2]), cancelled=lambda: calls.pop(0))

  def test_2048_local_selection_diagnostics_work_coordinates(self):
    value = fixture(2048, 2048)
    selection = np.zeros(2048*2048, 'uint8')
    selection.reshape(2048, 2048)[2040:2048, 2040:2048] = 1
    candidate = recognize(value, selection, predictor=lambda rgb: np.zeros(rgb.shape[:2]))
    removed = decode_raster(candidate['diagnostics']['removed'], 'uint8', 2048*2048)
    np.testing.assert_array_equal(removed, selection)
    result = applied(value, candidate)
    self.assertEqual(result['labels'][0], 1)
    self.assertEqual(result['labels'][-1], 0)

  def test_background_empty_subject_adds_printable_zero_layer_region(self):
    value = fixture()
    value['labels'][:] = 0
    value['heights'][:] = 0
    result = applied(value, recognize(value, keep_background=True, predictor=lambda rgb: np.zeros(rgb.shape[:2])))
    self.assertTrue(np.all(result['labels'] != 0))
    self.assertTrue(np.all(result['heights'] == 0))

  def test_import_preserves_original_alpha_and_subject_default_ten(self):
    from relief import encode_image
    rgba = np.full((8, 8, 4), 255, 'uint8')
    rgba[0, :, 3] = 0
    value = import_snapshot(encode_image(rgba), [50, 40], '导入图', session_id='import-test')
    np.testing.assert_array_equal(value['original'], rgba.ravel())
    self.assertTrue(np.all(value['labels'][:8] == 0))
    self.assertTrue(np.all(value['heights'][8:] == 10))
    self.assertEqual(value['sessionId'], 'import-test')

  def test_import_exif_orientation_is_corrected_before_work_coordinates(self):
    import base64
    import io
    from PIL import Image
    image = Image.new('RGB', (12, 8), (200, 20, 10))
    exif = Image.Exif()
    exif[274] = 6
    stream = io.BytesIO()
    image.save(stream, format='JPEG', exif=exif)
    url = 'data:image/jpeg;base64,' + base64.b64encode(stream.getvalue()).decode('ascii')
    value = import_snapshot(url, [40, 60], predictor=lambda rgb: np.ones(rgb.shape[:2]))
    self.assertEqual((value['width'], value['height']), (8, 12))
    self.assertTrue(np.all(value['heights'] == 10))

  def test_sam_work_coordinates_selection_transparency_and_protection(self):
    value = fixture(16, 16)
    value['original'][3] = 0
    value['labels'][0] = value['heights'][0] = 0
    selection = np.zeros(256, 'uint8')
    selection.reshape(16, 16)[8:16, 8:16] = 1
    value['protection'][-1] = 4
    prompt = {'points': [{'x': 12, 'y': 11, 'label': 1}], 'box': [8, 8, 16, 16]}
    calls = []
    def sam(rgba, received):
      calls.append((rgba.shape, received))
      return np.zeros((16, 16), dtype=bool)
    candidate = recognize(value, selection, prompt=prompt, sam_predictor=sam,
                          predictor=lambda _: self.fail('SAM 提示不能走自动 BiRefNet'))
    result = applied(value, candidate)
    self.assertEqual(calls, [((16, 16, 4), prompt)])
    self.assertEqual(candidate['diagnostics']['source'], 'injected-test-sam')
    self.assertEqual(result['labels'][0], 0)
    self.assertEqual(result['labels'][1], 1)
    self.assertEqual(result['labels'][-1], 1)
    self.assertEqual(result['labels'][-2], 0)
    self.assertEqual(result['heights'][-1], 12)

  def test_sam_bad_prompt_missing_model_bad_result_and_cancel(self):
    value = fixture(16, 16)
    prompts = [{}, {'points': [{'x': 16, 'y': 0, 'label': 1}]},
               {'points': [{'x': 2, 'y': 2, 'label': True}]}, {'box': [0, 0, 4, 4]}]
    for prompt in prompts:
      with self.subTest(prompt=prompt), self.assertRaises(ValueError):
        recognize(value, prompt=prompt, sam_predictor=lambda *_: np.ones((16, 16)))
    prompt = {'points': [{'x': 8, 'y': 8, 'label': 1}]}
    with patch.dict(os.environ, {'RELIEF_SAM_CHECKPOINT': '/missing-checkpoint'}):
      with self.assertRaisesRegex(RuntimeError, '缺少 SAM'):
        recognize(value, prompt=prompt)
    with self.assertRaises(ValueError):
      recognize(value, prompt=prompt, sam_predictor=lambda *_: np.ones((1, 1)))
    calls = [False, True]
    with self.assertRaises(InterruptedError):
      recognize(value, prompt=prompt, sam_predictor=lambda *_: np.ones((16, 16)),
                cancelled=lambda: calls.pop(0))
    self.assertTrue(np.all(value['labels'] == 1))


if __name__ == '__main__':
  unittest.main()
