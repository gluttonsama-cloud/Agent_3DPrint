"""真实 SAM 工作进程探针；首个 CUDA 卷积结束后记录取消观测点。"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))

import sam2.build_sam
import torch
from sam2.build_sam import build_sam2 as original_build
from subject_worker import main

directory = Path(os.environ['RELIEF_SAM_PROBE'])


def build(*args, **kwargs):
    model = original_build(*args, **kwargs)
    first = next(module for module in model.image_encoder.modules()
                 if isinstance(module, torch.nn.Conv2d))

    def observed(module, inputs, output):
        torch.cuda.synchronize()
        (directory / 'forward-start.json').write_text(json.dumps({
            'pid': os.getpid(), 'device': str(output.device),
            'allocatedBytes': torch.cuda.memory_allocated(),
        }), encoding='utf-8')

    first.register_forward_hook(observed)
    return model


sam2.build_sam.build_sam2 = build
main()
