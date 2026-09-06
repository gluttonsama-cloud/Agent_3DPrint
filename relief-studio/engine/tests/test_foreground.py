import unittest
import numpy as np
from foreground import foreground_mask, clicked_mask


class ForegroundTests(unittest.TestCase):
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
