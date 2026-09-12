import unittest
import json
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import numpy as np

from auto_optimize import optimize_subject
from repair import repair_project
from test_repair import job_for
from metadata import restore_metadata, restore_text


class AutomaticTests(unittest.TestCase):
  def test_legacy_names_restore_without_changing_geometry_or_custom_names(self):
    for name in ('茅','茂','漏','客户自定义 · A区'):
      self.assertEqual(restore_text(name),name)
    project = job_for(np.ones((16,16),np.uint16))['project']
    project['name'] = '微信图片'.encode('utf-8').decode('gbk',errors='replace')+'_2026'
    project['regions'][0]['name'] = '平面背景'.encode('utf-8').decode('gbk',errors='replace')
    project['regions'][1]['name'] = '客户自定义 · A区'
    restored = restore_metadata(project)
    self.assertEqual(restored['name'],'微信图片_2026')
    self.assertEqual(restored['regions'][0]['name'],'平面背景')
    self.assertEqual(restored['regions'][1]['name'],'客户自定义 · A区')
    self.assertEqual(restored['labels'],project['labels'])
    self.assertEqual(restored['image'],project['image'])

  def test_worker_jsonl_uses_utf8_even_with_legacy_codepage(self):
    request = json.dumps({'id':'中文名称往返'},ensure_ascii=False)+'\n'
    worker = Path(__file__).resolve().parents[1]/'subject_worker.py'
    completed = subprocess.run([sys.executable,str(worker),'--checkpoint','missing.pt'],
      input=request.encode('utf-8'),capture_output=True,
      env={**os.environ,'PYTHONIOENCODING':'gbk','PYTHONUTF8':'0'},timeout=30)
    self.assertEqual(json.loads(completed.stdout.decode('utf-8'))['id'],'中文名称往返')

  def test_zero_layer_background_cannot_be_repaired_into_higher_region(self):
    labels = np.ones((32,32),np.uint16)
    labels[8:24,8:24] = 2
    with self.assertRaisesRegex(ValueError, '背景不能高于'):
      repair_project(job_for(labels, target=1, background=2))

  def test_automatic_keeps_letter_holes_marks_and_transparent_range(self):
    mask = np.zeros((120,180),bool)
    mask[25:75,20:50] = True
    mask[35:65,28:42] = False
    mask[25:75,60:90] = True
    mask[72:75,98:101] = True
    rgba = np.full((120,180,4),255,np.uint8)
    rgba[:,:,:3] = 25
    rgba[mask,:3] = 230
    valid = np.ones_like(mask)
    valid[:5] = False
    probability = np.where(mask,.98,.02)
    class Worker:
      def run(self, job):
        raise AssertionError('行内文字不应执行实体填充')
    actual, _ = optimize_subject(Worker(),rgba,valid,probability)
    self.assertFalse(actual[35:65,28:42].any())
    self.assertTrue(actual[72:75,98:101].all())
    self.assertFalse(actual[:5].any())

  def test_no_confident_colors_preserves_initial(self):
    rgba = np.full((32,32,4),255,np.uint8)
    probability = np.zeros((32,32))
    probability[5:25,5:25] = .6
    with patch('auto_optimize.text_mask',side_effect=ValueError('无种子')):
      actual, _ = optimize_subject(None,rgba,np.ones((32,32),bool),probability)
    np.testing.assert_array_equal(actual,probability>=.5)

  def test_optional_solid_no_candidate_keeps_initial(self):
    mask = np.zeros((400,400),bool)
    mask[100:140,100:103] = True
    mask[100:103,100:116] = True
    rgba = np.full((400,400,4),255,np.uint8)
    class Worker:
      source_data = 'test'
      def run(self, job):
        raise ValueError('未识别到点击位置的图案')
    with patch('auto_optimize.text_mask',side_effect=ValueError('无种子')):
      actual, report = optimize_subject(Worker(),rgba,np.ones_like(mask),np.where(mask,.98,.02))
    np.testing.assert_array_equal(actual,mask)
    self.assertIn('skipped',report['decisions'][0])
