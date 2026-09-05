import base64
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from relief import export_project, segment, validate_project


def data_url(pixels):
  stream = io.BytesIO()
  Image.fromarray(np.array(pixels, dtype=np.uint8), 'RGBA').save(stream, format='PNG')
  return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode()


def project():
  return {
    'version': 1, 'name': '细字·测试', 'width': 3, 'height': 2, 'sizeMm': [55, 55],
    'image': data_url([[[0, 0, 0, 255], [255, 255, 255, 255], [220, 180, 120, 255]],
                       [[255, 255, 255, 0], [0, 0, 0, 255], [255, 255, 255, 255]]]),
    'labels': [1, 3, 2, 0, 1, 3],
    'regions': [{'id': 1, 'name': '黑', 'color': '#000000', 'layers': 0},
                {'id': 2, 'name': '金', 'color': '#dcb478', 'layers': 2},
                {'id': 3, 'name': '白', 'color': '#ffffff', 'layers': 4}]
  }


class EngineTests(unittest.TestCase):
  def test_export_reconstructs_exact_height_and_preserves_holes(self):
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp) / '输出'
      p = project()
      export_project(p, out)
      height = np.array(Image.open(out / 'height.png'))
      np.testing.assert_array_equal(height, [[0, 4, 2], [0, 0, 4]])
      layers = [np.array(Image.open(path)) // 255 for path in sorted((out/'layers').glob('*.png'))]
      np.testing.assert_array_equal(sum(layers), height)
      self.assertTrue(all(np.all(b <= a) for a, b in zip(layers, layers[1:])))
      self.assertEqual(json.loads((out/'project.json').read_text('utf-8')), p)
      color = np.array(Image.open(out/'color.png'))
      self.assertEqual(color[1, 0, 3], 0)
      self.assertEqual(color[0, 0, 3], 255)
      with Image.open(out/'height.png') as image:
        self.assertEqual(image.mode, 'I;16')

  def test_reject_unknown_region_and_invalid_sizes(self):
    for mutation in [('labels', [99]*6), ('sizeMm', [float('nan'), 55]), ('width', 0)]:
      p = project()
      p[mutation[0]] = mutation[1]
      with self.assertRaises(ValueError):
        validate_project(p)

  def test_no_overwrite(self):
    with tempfile.TemporaryDirectory() as temp:
      with self.assertRaises(ValueError):
        export_project(project(), Path(temp))

  def test_transparent_pixels_cannot_be_assigned(self):
    p = project()
    p['labels'][3] = 3
    with self.assertRaises(ValueError):
      validate_project(p)

  def test_segment_keeps_single_pixel_and_disconnected_white(self):
    p = project()
    result = segment({'image': p['image'], 'colors': 3, 'sizeMm': [55, 55]})
    self.assertEqual(result['labels'][3], 0)
    self.assertEqual(result['labels'][1], result['labels'][5])
    self.assertNotEqual(result['labels'][1], result['labels'][0])
    self.assertEqual(len(result['regions']), 3)
    validate_project(result)

  def test_zero_height_export(self):
    p = project()
    for region in p['regions']:
      region['layers'] = 0
    with tempfile.TemporaryDirectory() as temp:
      out = Path(temp)/'zero'
      export_project(p, out)
      self.assertEqual(list((out/'layers').glob('*.png')), [])

  def test_duplicate_ids_and_non_integer_layers(self):
    for invalid in [True, 2.5, -1, 257, float('inf')]:
      p = project()
      p['regions'][0]['layers'] = invalid
      with self.assertRaises(ValueError):
        validate_project(p)
    p = project()
    p['regions'][1]['id'] = 1
    with self.assertRaises(ValueError):
      validate_project(p)

  def test_recolor_does_not_change_layer_outputs(self):
    p = project()
    with tempfile.TemporaryDirectory() as temp:
      export_project(p, Path(temp)/'before')
      p['regions'][2]['color'] = '#ff0000'
      p['image'] = data_url([[[0,0,0,255],[255,0,0,255],[220,180,120,255]],
                              [[255,255,255,0],[0,0,0,255],[255,0,0,255]]])
      export_project(p, Path(temp)/'after')
      self.assertEqual((Path(temp)/'before/height.png').read_bytes(),
                       (Path(temp)/'after/height.png').read_bytes())

  def test_jpeg_noise_and_all_transparent(self):
    stream = io.BytesIO()
    with Image.open(io.BytesIO(base64.b64decode(project()['image'].split(',')[1]))) as image:
      image.convert('RGB').resize((30,20), resample=Image.Resampling.NEAREST).save(
        stream, format='JPEG', quality=85)
    source = 'data:image/jpeg;base64,' + base64.b64encode(stream.getvalue()).decode()
    result = segment({'image':source,'colors':3})
    self.assertEqual((result['width'],result['height']),(30,20))
    validate_project(result)
    with self.assertRaises(ValueError):
      segment({'image':data_url([[[0,0,0,0]]]),'colors':3})

  def test_large_image_retains_off_stride_single_white_pixel(self):
    pixels = np.zeros((400,400,4),dtype=np.uint8)
    pixels[:,:,3] = 255
    pixels[100,102,:3] = 255
    result = segment({'image':data_url(pixels),'colors':2})
    self.assertEqual(len(result['regions']),2)
    self.assertNotEqual(result['labels'][100*400+102], result['labels'][0])

  def test_uniform_image_returns_single_valid_region(self):
    for color in [[0,0,0,255],[120,80,40,255]]:
      pixels = np.tile(np.array(color,dtype=np.uint8),(10,10,1))
      result = segment({'image':data_url(pixels),'colors':3})
      self.assertEqual(len(result['regions']),1)
      self.assertEqual(set(result['labels']),{1})
      validate_project(result)

  def test_logo_separates_gold_and_white_despite_jpeg_edges(self):
    source = Path(__file__).resolve().parents[2]/'samples/cropped-logo.png'
    with Image.open(source) as image:
      rgba = np.array(image.convert('RGBA'))
    result = segment({'image':data_url(rgba),'colors':3})
    labels = np.array(result['labels']).reshape(rgba.shape[:2])
    white = (rgba[:,:,:3].min(axis=2)>235) & (rgba[:,:,3]>0)
    gold = (rgba[:,:,0]>225)&(rgba[:,:,1]>170)&(rgba[:,:,1]<220)&(rgba[:,:,2]<170)&(rgba[:,:,3]>0)
    self.assertGreater(float((labels[white]==3).mean()),0.98)
    self.assertGreater(float((labels[gold]==2).mean()),0.98)


if __name__ == '__main__':
  unittest.main()
