"""记录可复现的传统算法性能和导出不变量，不把开发机当成干净系统。"""
import json
import platform
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import psutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'engine'))
from relief import write_json


def measure(job, output):
  with tempfile.TemporaryDirectory() as temp:
    job_path = Path(temp)/'job.json'
    write_json(job_path, job)
    start = time.perf_counter()
    child = subprocess.Popen([sys.executable, str(ROOT/'engine/main.py'),
                              '--job', str(job_path), '--out', str(output)],
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    monitor = psutil.Process(child.pid)
    peak = 0
    while child.poll() is None:
      try:
        tree = [monitor] + monitor.children(recursive=True)
        rss = sum(process.memory_info().rss for process in tree if process.is_running())
        peak = max(peak, rss)
      except psutil.NoSuchProcess:
        pass
      time.sleep(0.02)
    stdout, stderr = child.communicate()
    if child.returncode:
      raise RuntimeError(stdout.decode()+stderr.decode())
    result = json.loads(stdout)
    return {'wallSeconds': round(time.perf_counter()-start,4),
            'engineSeconds':result['elapsedSeconds'], 'peakRssMB':round(peak/1024**2,2)}


def main():
  project = json.loads((ROOT/'samples/sample-project.json').read_text('utf-8'))
  with tempfile.TemporaryDirectory() as temp:
    trials = [measure({'action':'segment','image':project['image'],'colors':3},
                      Path(temp)/f'segment-{index}') for index in range(3)]
    output = Path(temp)/'export'
    exported = measure({'project':project}, output)
    height = np.array(Image.open(output/'height.png'))
    total = np.zeros_like(height)
    previous = np.full_like(height, 255, dtype=np.uint8)
    nested = True
    for file in sorted((output/'layers').glob('*.png')):
      layer = np.array(Image.open(file))
      nested = nested and bool(np.all(layer <= previous))
      total += layer.astype(np.uint16)//255
      previous = layer
    stats = {'platform':platform.platform(), 'python':platform.python_version(),
      'cpu':platform.processor(), 'logicalCPUs':psutil.cpu_count(),
      'ramGB':round(psutil.virtual_memory().total/1024**3,2),
      'imagePixels':[project['width'],project['height']], 'segmentationTrials':trials,
      'segmentationMedianWallSeconds':statistics.median(t['wallSeconds'] for t in trials),
      'export':exported, 'sumEqualsHeight':bool(np.array_equal(total,height)),
      'nestedMasks':nested, 'layerCount':len(list((output/'layers').glob('*.png'))),
      'physicalPrintTest':False,'cleanWindowsTest':False}
    write_json(ROOT/'artifacts/benchmark.json', stats)
    print(json.dumps(stats))


if __name__ == '__main__':
  main()
