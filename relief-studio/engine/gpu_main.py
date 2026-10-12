"""同一 GPU 可执行文件支持 JSONL 主体窗口与 v2 文件任务。"""
import json
import os
import sys
from pathlib import Path


def runtime_directory() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1] / 'model-runtime'


def main() -> int | None:
    directory = runtime_directory()
    os.environ.setdefault('RELIEF_BIREFNET_DIRECTORY', str(directory / 'birefnet-hr'))
    os.environ.setdefault('RELIEF_SAM_CHECKPOINT', str(directory / 'sam2.1_hiera_tiny.pt'))
    if '--diagnose' in sys.argv:
        import torch
        ready = torch.cuda.is_available()
        report = {'cudaAvailable': ready, 'torch': torch.__version__}
        if ready:
            tensor = torch.ones(1, device='cuda')
            torch.cuda.synchronize()
            report.update(device=torch.cuda.get_device_name(0), probe=float(tensor.item()))
        print(json.dumps(report))
        return 0
    if '--job' in sys.argv:
        from main import main as run
    else:
        from subject_worker import main as run
    return run()


if __name__ == '__main__':
    sys.exit(main())
