import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_v2 import load_project
from v2_io import open_project, save_project
from v2_dispatch import execute_v2

FIXTURES = Path(__file__).resolve().parents[2] / 'tests/fixtures/v2'


class V2FileTests(unittest.TestCase):
  def test_dispatch_print_settings_reach_export(self):
    snapshot = json.loads((FIXTURES / 'normal-v2.json').read_text('utf-8'))
    settings = {'mirror': True, 'rotation': 90, 'order': 'color-first',
                'whiteRepeats': 2, 'colorRepeats': 3}
    with tempfile.TemporaryDirectory() as directory:
      output = Path(directory) / 'bundle'
      result = execute_v2({'action': 'v2:export', 'payload': {'snapshot': snapshot,
        'formats': ['png'], 'outputDirectory': str(output), 'settings': settings}})
      self.assertEqual(result['status'], 'success', result)
      manifest = json.loads((output / 'manifest.json').read_text('utf-8'))
      self.assertEqual(manifest['settings'], settings)
      self.assertEqual(manifest['totalSteps'], 23)
      self.assertEqual(manifest['tasks'][0]['role'], 'color')

  def test_atomic_reopen_and_legacy_save_as_guard(self):
    snapshot = load_project(FIXTURES / 'normal-v2.json')
    with tempfile.TemporaryDirectory() as directory:
      path = Path(directory) / '工程.json'
      save_project(snapshot, path)
      restored = open_project(path)
      self.assertNotEqual(restored['snapshot']['sessionId'], snapshot['sessionId'])
      self.assertEqual(restored['snapshot']['heights']['data'], 'AAAAAAMABgAKAAAAAwAGAAoAAAADAAYA')
      before = path.read_bytes()
      with patch('v2_io.os.replace', side_effect=OSError('disk error')):
        with self.assertRaises(OSError):
          save_project(snapshot, path)
      self.assertEqual(path.read_bytes(), before)
      self.assertEqual(list(Path(directory).glob('*.tmp')), [])
      path.write_bytes((FIXTURES / 'legacy-v1.json').read_bytes())
      legacy_bytes = path.read_bytes()
      self.assertTrue(open_project(path)['migrated'])
      with self.assertRaisesRegex(ValueError, '另存'):
        save_project(snapshot, path)
      self.assertEqual(path.read_bytes(), legacy_bytes)
