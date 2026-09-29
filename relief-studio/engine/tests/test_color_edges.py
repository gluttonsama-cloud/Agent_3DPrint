import base64
import io
import unittest

import numpy as np
from PIL import Image

from color_edges import refine_color_edges
from relief import segment


class ColorEdgeTests(unittest.TestCase):
  def test_green_yellow_transition_is_not_a_separate_light_green_spike(self):
    palette = np.array([[25, 109, 61], [84, 143, 52], [250, 209, 44]], np.uint8)
    labels = np.ones((30, 40), np.uint16)
    labels[:, 20:] = 3
    labels[4:12, 4:12] = 2  # 真实浅绿花苞。
    labels[24, 5] = 2  # 颜色明确的单像素细节。
    rgb = palette[labels-1].copy()
    labels[20, 19] = 2
    rgb[20, 19] = [69, 132, 61]  # 旧的 32 容差会把过渡色误当可靠种子。
    expected = labels.copy()
    expected[20, 19] = 1
    np.testing.assert_array_equal(refine_color_edges(rgb, labels, palette), expected)

  def test_gradient_uses_local_seed_color_instead_of_global_average(self):
    palette = np.array([[25, 109, 61], [84, 143, 52]], np.uint8)
    labels = np.ones((16, 20), np.uint16)
    labels[:, 10:] = 2
    rgb = palette[labels-1].copy()
    rgb[:, :10] = [61, 136, 60]  # 深绿色区在局部渐变到更明亮的绿色。
    rgb[:, 10:] = [106, 158, 54]
    labels[8, 9] = 2
    expected = labels.copy()
    expected[8, 9] = 1
    np.testing.assert_array_equal(refine_color_edges(rgb, labels, palette), expected)

  def test_false_white_on_black_gold_edge_is_reassigned_without_deleting_details(self):
    palette = np.array([[8, 5, 4], [241, 199, 145], [249, 249, 248]], np.uint8)
    labels = np.full((30, 40), 2, np.uint16)
    labels[6:24, 8:18] = 1
    labels[3:20, 30] = 3  # 一像素白线。
    labels[25, 25] = 3  # 孤立白色标点。
    labels[10:14, 10:14] = 2  # 字内孔洞。
    rgb = palette[labels-1].copy()
    labels[12, 18] = 3
    rgb[12, 18] = [216, 199, 181]  # 黑金边缘的失真混合色，不是真正白色。
    labels[0, :] = 0
    before = labels.copy()
    result = refine_color_edges(rgb, labels, palette)
    self.assertEqual(result[12, 18], 2)
    expected = before.copy()
    expected[12, 18] = 2
    np.testing.assert_array_equal(result, expected)
    np.testing.assert_array_equal(labels, before)

  def test_flat_shaded_material_is_not_overwritten_by_neighbor_palette_color(self):
    palette = np.array([[240, 190, 110], [250, 250, 250]], np.uint8)
    labels = np.ones((20, 30), np.uint16)
    labels[:, 15:] = 2
    rgb = palette[labels-1].copy()
    rgb[5:15, 5:15] = [150, 112, 60]
    result = refine_color_edges(rgb, labels, palette)
    np.testing.assert_array_equal(result, labels)

  def test_no_supported_color_keeps_original_label(self):
    palette = np.array([[0, 0, 0], [255, 255, 255]], np.uint8)
    labels = np.zeros((10, 10), np.uint16)
    labels[5, 5] = 2
    rgb = np.full((10, 10, 3), 120, np.uint8)
    np.testing.assert_array_equal(refine_color_edges(rgb, labels, palette), labels)

  def test_jpeg_black_gold_edges_do_not_create_white_height_islands(self):
    rgb = np.full((100, 140, 3), [241, 199, 145], np.uint8)
    rgb[15:85, 15:30] = 0
    rgb[15:30, 15:70] = 0
    rgb[45:60, 15:65] = 0
    rgb[15:85, 95:125] = 0
    rgb[20:80, 102:108] = 255
    rgb[75:79, 115:119] = 255
    encoded = io.BytesIO()
    Image.fromarray(rgb).save(encoded, format='JPEG', quality=75, subsampling=2)
    data = 'data:image/jpeg;base64,'+base64.b64encode(encoded.getvalue()).decode('ascii')
    result = segment({'image': data, 'subjectMask': [1]*14000})
    white = max(result['regions'], key=lambda r: int(r['color'][1:3], 16))['id']
    labels = np.array(result['labels']).reshape(100, 140)
    self.assertFalse((labels[:, :80] == white).any())
    self.assertTrue((labels[23:77, 104:106] == white).all())
    self.assertEqual(labels[76, 116], white)
