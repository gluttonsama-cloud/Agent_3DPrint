import unittest
import numpy as np
from foreground import foreground_mask, clicked_mask, regional_foreground
from unittest.mock import Mock


class ForegroundTests(unittest.TestCase):
  def test_local_prediction_is_aligned_clipped_and_preserves_source(self):
    rgba = np.full((20, 30, 4), 255, dtype=np.uint8)
    rgba[:, :, :3] = 32
    original = rgba.copy()
    valid = np.ones((20, 30), dtype=bool)
    valid[6, 11] = False
    model = Mock()
    model.predict.return_value = np.ones((8, 10), dtype=np.float32)
    result = regional_foreground(model, rgba, valid, [10, 5, 20, 13])
    self.assertEqual(result.shape, (20, 30))
    self.assertEqual(int(result.sum()), 79)
    self.assertTrue(result[5, 10])
    self.assertFalse(result[6, 11])
    self.assertFalse(result[13, 10])
    self.assertFalse(result[5, 20])
    self.assertEqual(model.predict.call_args.args[0].shape, (8, 10, 3))
    np.testing.assert_array_equal(model.predict.call_args.args[0][1, 1], [255]*3)
    np.testing.assert_array_equal(rgba, original)

  def test_invalid_or_empty_box_does_not_run_prediction(self):
    model = Mock()
    rgba = np.ones((20, 30, 4), dtype=np.uint8)
    valid = np.ones((20, 30), dtype=bool)
    for box in [[0, 0, 7, 8], [-1, 0, 10, 10], [0, 0, 31, 20],
                [0, 0, 10.0, 10], [False, 0, 10, 10], 'invalid']:
      with self.assertRaises(ValueError):
        regional_foreground(model, rgba, valid, box)
    with self.assertRaises(ValueError):
      regional_foreground(model, rgba, ~valid, [0, 0, 10, 10])
    model.predict.assert_not_called()

  def test_keep_small_subject_and_holes_with_valid_range(self):
    probability = np.ones((5, 5), dtype=np.float32)
    probability[2, 2] = 0
    valid = np.ones((5, 5), dtype=bool)
    valid[0, 0] = False
    result = foreground_mask(probability, valid)
    self.assertFalse(result[2, 2])
    self.assertFalse(result[0, 0])
    self.assertEqual(int(result.sum()), 23)

  def test_probability_size_mismatch_rejected(self):
    with self.assertRaises(ValueError):
      foreground_mask(np.zeros((2, 2)), np.ones((3, 3), dtype=bool))

  def test_point_only_returns_connected_clicked_object(self):
    masks = np.zeros((3, 6, 6), dtype=bool)
    masks[:, 1:3, 1:3] = True
    masks[:, 4:6, 4:6] = True
    result = clicked_mask(masks, np.array([.9, .8, .7]), 1, 1)
    self.assertEqual(int(result.sum()), 4)
    self.assertFalse(result[4, 4])

  def test_ignores_prediction_that_does_not_contain_click(self):
    masks = np.zeros((2, 4, 4), dtype=bool)
    masks[0, 0, 0] = True
    masks[1, 2, 2] = True
    result = clicked_mask(masks, np.array([.99, .7]), 2, 2)
    self.assertTrue(result[2, 2])
    self.assertFalse(result[0, 0])
