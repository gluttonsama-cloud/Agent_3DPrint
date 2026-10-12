import contextlib
import io
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gpu_main


class GpuEntryTests(unittest.TestCase):
    def test_file_protocol_preserves_failure_exit_code(self):
        with patch.object(sys, 'argv', ['engine', '--job', 'invalid.json']), patch.dict(sys.modules, {'main': SimpleNamespace(main=lambda: 1)}):
            self.assertEqual(gpu_main.main(), 1)

    def test_diagnostic_reports_no_cuda_without_invoking_worker(self):
        fake = SimpleNamespace(__version__='test', cuda=SimpleNamespace(is_available=lambda: False))
        output = io.StringIO()
        with patch.object(sys, 'argv', ['engine', '--diagnose']), patch.dict(sys.modules, {'torch': fake}), contextlib.redirect_stdout(output):
            gpu_main.main()
        self.assertFalse(json.loads(output.getvalue())['cudaAvailable'])

    def test_both_protocols_and_explicit_model_override(self):
        for args, module in [(['engine', '--job', 'job.json'], 'main'),
                             (['engine', '--checkpoint', 'sam.pt'], 'subject_worker')]:
            run = Mock()
            with patch.object(sys, 'argv', args), patch.dict(sys.modules, {module: SimpleNamespace(main=run)}), \
                    patch.dict(os.environ, {'RELIEF_BIREFNET_DIRECTORY': 'override'}, clear=True):
                gpu_main.main()
                run.assert_called_once_with()
                self.assertEqual(os.environ['RELIEF_BIREFNET_DIRECTORY'], 'override')
                self.assertTrue(os.environ['RELIEF_SAM_CHECKPOINT'].endswith('sam2.1_hiera_tiny.pt'))

    def test_frozen_model_location_is_next_to_executable(self):
        with patch.object(sys, 'frozen', True, create=True), patch.object(sys, 'executable', str(Path('runtime/subject-engine.exe').resolve())):
            self.assertEqual(gpu_main.runtime_directory(), Path('runtime').resolve())
