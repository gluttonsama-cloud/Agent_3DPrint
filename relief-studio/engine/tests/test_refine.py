import io
import unittest

import cv2
import numpy as np
from PIL import Image

from refine import refine_project, solid_mask, text_mask
from relief import decode_image, encode_image
from test_repair import job_for


class FakeWorker:
  digest = 'test'
  refine_probability_digest = 'test'
  foreground = object()

  def __init__(self, probability):
    self.refine_probability = probability

  def image(self, data):
    return decode_image(data)

  @staticmethod
  def encode(mask):
    rgba = np.full((*mask.shape, 4), 255, dtype=np.uint8)
    rgba[:, :, 3] = mask.astype(np.uint8)*255
    return encode_image(rgba)


class RefineTests(unittest.TestCase):
  def test_text_removes_old_bridge_and_keeps_holes_jpeg_and_black_text(self):
    desired = np.zeros((50, 80), dtype=bool)
    desired[8:42, 8:30] = True
    desired[16:34, 14:24] = False
    desired[8:42, 42:64] = True
    for inverse, jpeg in [(False, False), (True, False), (False, True)]:
      rgb = np.full((50,80,3), 235 if inverse else 25, dtype=np.uint8)
      rgb[desired] = 20 if inverse else 220
      if jpeg:
        stream = io.BytesIO()
        Image.fromarray(rgb).save(stream, format='JPEG', quality=55)
        stream.seek(0)
        rgb = np.array(Image.open(stream))
      probability = np.where(desired, .98, .02)
      probability[20:23, 30:42] = .98
      hints = np.zeros(desired.shape, np.uint8)
      hints[20:23, 30:42] = 2
      actual, _ = text_mask(rgb, probability, np.ones_like(desired), hints)
      self.assertFalse(actual[20:23, 30:42].any())
      self.assertFalse(actual[17:33, 15:23].any())
      self.assertTrue(actual[10:40, 44:62].all())

  def test_solid_fills_dark_interior_but_respects_exclusion(self):
    mask = np.zeros((30,30),np.uint8)
    cv2.circle(mask,(15,15),10,1,2)
    hints = np.zeros_like(mask)
    hints[14:17,14:17] = 2
    actual, uncertain = solid_mask(mask>0,np.ones_like(mask,dtype=bool),hints)
    self.assertTrue(actual[12,12])
    self.assertFalse(actual[14:17,14:17].any())
    self.assertTrue(uncertain[12,12])

  def test_replace_is_local_locked_and_differences_are_exact(self):
    labels = np.ones((32,32),np.uint16)
    labels[8:24,8:24] = 2
    labels[10,10] = 0
    labels[11,11] = 3
    project = job_for(labels)['project']
    rgba = decode_image(project['image'])
    rgba[:,:,:3] = 20
    rgba[12:20,12:20,:3] = 230
    project['image'] = encode_image(rgba)
    probability = np.full((32,32),.02)
    probability[12:20,12:20] = .98
    hints = np.zeros((32,32),np.uint8)
    hints[22,22] = 1
    hints[14,14] = 2
    job = {'project':project,'mode':'text','target':2,'background':1,'box':[6,6,26,26],
           'hints':hints.ravel().tolist()}
    result = refine_project(FakeWorker(probability),job)
    actual = np.array(result['project']['labels']).reshape(32,32)
    self.assertEqual(actual[22,22],2)
    self.assertEqual(actual[14,14],1)
    self.assertEqual(actual[10,10],0)
    self.assertEqual(actual[11,11],3)
    np.testing.assert_array_equal(actual[:6],labels[:6])
    for key, expected in [('addedMask',(actual==2)&(labels!=2)),('removedMask',(actual!=2)&(labels==2))]:
      np.testing.assert_array_equal(decode_image(result[key])[:,:,3]>0,expected)
    self.assertEqual(result['project']['image'],project['image'])
    self.assertEqual(result['project']['regions'],project['regions'])
    for update in [{'hints':[]},{'box':None},{'mode':'other'},{'background':0}]:
      with self.assertRaises(ValueError):
        refine_project(FakeWorker(probability),{**job,**update})
