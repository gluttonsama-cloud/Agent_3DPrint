import os
import unittest
from unittest.mock import patch
import numpy as np
from test_height_ops import fixture, applied
from project_v2 import _metadata, _pixels, decode_raster
from recognition_ops import recognize, import_snapshot


class RecognitionTests(unittest.TestCase):
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
