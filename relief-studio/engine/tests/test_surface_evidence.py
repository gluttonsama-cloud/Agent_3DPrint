import unittest

import numpy as np

from refine import text_mask
from surface_evidence import background_effects


class SurfaceTests(unittest.TestCase):
  def test_black_letter_beside_gold_is_not_a_shadow(self):
    rgb = np.full((80,120,3),60,np.uint8)
    probability = np.full((80,120),.01)
    rgb[15:65,15:55] = [225,180,100]
    probability[15:65,15:55] = .99
    black = np.zeros((80,120),bool)
    black[20:60,75:81] = True
    black[20:26,75:100] = True
    black[54:60,75:100] = True
    rgb[black] = 8
    probability[black] = .99
    mask,_ = text_mask(rgb,probability,np.ones((80,120),bool),np.zeros((80,120),np.uint8))
    self.assertTrue(mask[black].all())

  def test_enclosed_black_detail_inside_gold_is_not_cut_into_a_hole(self):
    rgb = np.full((80,120,3),60,np.uint8)
    probability = np.full((80,120),.01)
    rgb[15:65,15:65] = [225,180,100]
    probability[15:65,15:65] = .99
    black = np.zeros((80,120),bool)
    black[30:50,30:35] = True
    black[30:35,30:50] = True
    black[45:50,30:50] = True
    rgb[black] = 8
    mask,_ = text_mask(rgb,probability,np.ones((80,120),bool),np.zeros((80,120),np.uint8))
    self.assertTrue(mask[black].all())

  def test_confident_black_shadow_removed_but_gold_stroke_and_hole_remain(self):
    rgb = np.full((80,100,3),60,np.uint8)
    probability = np.full((80,100),.01)
    rgb[20:65,25:70] = [12,8,2]
    probability[20:65,25:70] = .99
    rgb[18:60,20:65] = [225,180,100]
    probability[18:60,20:65] = .99
    rgb[30:45,30:50] = 60
    probability[30:45,30:50] = .01
    mask,_ = text_mask(rgb,probability,np.ones((80,100),bool),np.zeros((80,100),np.uint8))
    self.assertFalse(mask[61:65,30:70].any())
    self.assertFalse(mask[30:45,30:50].any())
    self.assertTrue(mask[20:28,22:63].all())

  def test_black_text_is_not_treated_as_shadow(self):
    rgb = np.full((60,80,3),240,np.uint8)
    rgb[20:40,20:60] = 8
    probability = np.full((60,80),.01)
    probability[20:40,20:60] = .99
    self.assertFalse(background_effects(rgb,probability,np.ones((60,80),bool)).any())

  def test_manual_keep_overrides_shadow_evidence(self):
    rgb = np.full((80,100,3),60,np.uint8)
    probability = np.full((80,100),.01)
    rgb[18:60,20:65] = [225,180,100]
    probability[18:60,20:65] = .99
    rgb[58:65,30:60] = [12,8,2]
    probability[58:65,30:60] = .99
    hints = np.zeros((80,100),np.uint8)
    hints[62,40] = 1
    mask,_ = text_mask(rgb,probability,np.ones((80,100),bool),hints)
    self.assertTrue(mask[62,40])
    self.assertFalse(mask[63,50])

  def test_background_colored_glow_is_not_a_bridge(self):
    rgb = np.full((80,100,3),70,np.uint8)
    rgb[20:60] = [120,105,75]
    probability = np.full((80,100),.01)
    for x in (25,65):
      rgb[10:70,x:x+4] = [240,200,120]
      probability[10:70,x:x+4] = .99
    probability[36:40,29:65] = .99
    effects = background_effects(rgb,probability,np.ones((80,100),bool))
    self.assertTrue(effects[37,45])
    self.assertFalse(effects[20,26])
