"""供桌面端及第三方 PC 软件调用的文件式 CLI。"""
import argparse
import json
import sys
import time
from pathlib import Path

from relief import export_project, segment, validate_project, write_json


def main():
  parser = argparse.ArgumentParser(description='Relief Studio engine')
  parser.add_argument('--job', required=True)
  parser.add_argument('--out', required=True)
  args = parser.parse_args()
  started = time.perf_counter()
  try:
    job_path = Path(args.job)
    if job_path.stat().st_size > 144 * 1024 * 1024:
      raise ValueError('任务文件过大')
    job = json.loads(job_path.read_text('utf-8-sig'))
    if not isinstance(job, dict):
      raise ValueError('任务必须为 JSON 对象')
    action = job.get('action', 'export')
    output = Path(args.out).resolve()
    if action.startswith('v2:'):
      from v2_dispatch import execute_v2
      result = execute_v2(job)
      output.mkdir(parents=True, exist_ok=False)
      write_json(output/'result.json', result)
    elif action == 'segment':
      project = segment(job)
      output.mkdir(parents=True, exist_ok=False)
      write_json(output/'project.json', project)
    elif action == 'repair':
      from repair import repair_project
      result = repair_project(job)
      output.mkdir(parents=True, exist_ok=False)
      write_json(output/'result.json', result)
    elif action == 'normalize':
      from metadata import restore_metadata
      validate_project(job.get('project'))
      output.mkdir(parents=True, exist_ok=False)
      write_json(output/'project.json', restore_metadata(job['project']))
    elif action == 'validate':
      validate_project(job.get('project'))
    elif action == 'export':
      export_project(job.get('project'), output)
    elif action == 'stl':
      from stl_export import export_stl
      export_stl(job.get('project'), output, job.get('options', {}))
    else:
      raise ValueError('未知任务类型')
    print(json.dumps({'ok': True, 'path': str(output),
                      'projectPath': str(output/'project.json'),
                      'elapsedSeconds': round(time.perf_counter()-started, 4)}))
    return 0
  except Exception as error:
    print(json.dumps({'ok': False, 'error': {'code': 'INVALID_JOB', 'message': str(error)}}))
    return 1


if __name__ == '__main__':
  sys.exit(main())
