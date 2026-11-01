"""收集随运行时分发的版权声明，避免构建时遗漏。"""
import importlib.metadata
import shutil
import sys
import sysconfig
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
  destination = ROOT/'licenses'
  destination.mkdir(exist_ok=True)
  # 官方 Python 在不同平台可能将许可放在运行库或 Framework 资源中。
  candidates = [Path(sys.base_prefix)/'LICENSE.txt', Path(sysconfig.get_path('stdlib'))/'LICENSE.txt',
                Path(sys.base_prefix)/'Resources/English.lproj/License.rtf']
  source = next((item for item in candidates if item.is_file()), None)
  if source:
    shutil.copyfile(source, destination/f'Python-LICENSE{source.suffix}')
  else:
    raise FileNotFoundError('未找到 Python 运行时 LICENSE.txt')
  for name in ['numpy','opencv-python-headless','Pillow','psutil']:
    distribution = importlib.metadata.distribution(name)
    count = 0
    for item in distribution.files or []:
      if any(word in str(item).lower() for word in ['license','copying','copyright']):
        source = Path(distribution.locate_file(item))
        if not source.is_file():
          continue
        count += 1
        shutil.copyfile(source, destination/f'{name}-{count}-{source.name}')
    if not count:
      raise FileNotFoundError(f'未找到 {name} 的版权声明')


if __name__ == '__main__':
  main()
