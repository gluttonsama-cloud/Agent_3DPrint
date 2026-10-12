"""历史真实工程的迁移、倒角及输出核对；不把历史标签当识别真值。"""
import argparse
import base64
import copy
import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'engine'))
from export_layers import export_bundle
from height_ops import run_height
from project_v2 import decode_raster, migrate_v1


def verify(source, directory):
    raw = source.read_bytes()
    legacy = json.loads(raw)
    snapshot = migrate_v1(legacy, session_id='real-sample-review')
    source_rgba = np.asarray(Image.open(io.BytesIO(base64.b64decode(legacy['image'].split(',', 1)[1]))).convert('RGBA'))
    np.testing.assert_array_equal(snapshot['original'], source_rgba.ravel())
    np.testing.assert_array_equal(snapshot['colors'], source_rgba.ravel())
    np.testing.assert_array_equal(snapshot['labels'], legacy['labels'])
    expected_heights = np.zeros(len(legacy['labels']), dtype=np.uint16)
    for region in legacy['regions']:
        expected_heights[np.asarray(legacy['labels']) == region['id']] = region['layers']
    np.testing.assert_array_equal(snapshot['heights'], expected_heights)
    if snapshot['sizeMm'] != legacy['sizeMm'] or [snapshot['width'], snapshot['height']] != [legacy['width'], legacy['height']]:
        raise AssertionError('迁移不能改变尺寸')
    shape = (snapshot['height'], snapshot['width'])
    heights = snapshot['heights'].reshape(shape)
    labels = snapshot['labels'].reshape(shape)
    candidate = copy.deepcopy(snapshot)
    patch = run_height(snapshot, {'kind': 'bevel', 'radiusPx': 3})
    for block in patch['blocks']:
        data = block['after']
        if block['field'] != 'heights':
            raise AssertionError('倒角不应改变其他字段')
        count = len(base64.b64decode(data['data'])) // 2
        values = decode_raster(data, 'uint16', count)
        candidate['heights'][block['offset']:block['offset'] + count] = values
    beveled = candidate['heights'].reshape(shape)
    np.testing.assert_array_equal(beveled > 0, heights > 0)
    np.testing.assert_array_equal(candidate['labels'], snapshot['labels'])
    if np.any(beveled > heights):
        raise AssertionError('内部倒角不应增高')
    export_bundle(candidate, directory, formats=('png', 'jpg'), obj=True)
    np.testing.assert_array_equal(np.asarray(Image.open(directory / 'height.png')), beveled)
    rebuilt = np.zeros(shape, dtype=np.uint16)
    layers = sorted((directory / 'white').glob('*.png'))
    if [layer.name for layer in layers] != [f'{value:04d}.png' for value in range(1, int(beveled.max()) + 1)]:
        raise AssertionError('白墨文件层数或编号不一致')
    for layer in layers:
        with Image.open(layer) as image:
            values = np.asarray(image)
            if image.mode != 'L' or values.shape != shape or not np.all((values == 0) | (values == 255)):
                raise AssertionError('白墨必须是原尺寸的 0/255 灰度图')
            rebuilt += (values == 255).astype(np.uint16)
    np.testing.assert_array_equal(rebuilt, beveled)
    color = np.asarray(Image.open(directory / 'color.png'))
    np.testing.assert_array_equal(color[labels != 0], snapshot['colors'].reshape(*shape, 4)[labels != 0])
    np.testing.assert_array_equal(color[labels == 0, 3], 0)
    vertices, faces = [], []
    with (directory / 'relief.obj').open(encoding='utf-8') as stream:
        for line in stream:
            if line.startswith('v '):
                vertices.append([float(value) for value in line.split()[1:]])
            elif line.startswith('f '):
                faces.append([int(value.split('/')[0]) - 1 for value in line.split()[1:]])
    vertices = np.asarray(vertices)
    width_mm, height_mm = snapshot['sizeMm']
    if np.any(vertices < -1e-8) or np.any(vertices > np.array([width_mm, height_mm, float(beveled.max()) * .1]) + 1e-8):
        raise AssertionError('OBJ 顶点超出物理范围')
    triangles = vertices[np.asarray(faces)]
    tops = triangles[np.ptp(triangles[:, :, 2], axis=1) < 1e-10]
    centers = tops.mean(axis=1)
    x = np.clip(np.floor(centers[:, 0] / width_mm * shape[1]).astype(int), 0, shape[1] - 1)
    y = np.clip(np.floor((1 - centers[:, 1] / height_mm) * shape[0]).astype(int), 0, shape[0] - 1)
    if not np.all(labels[y, x] != 0):
        raise AssertionError('OBJ 顶面覆盖非打印区')
    np.testing.assert_allclose(centers[:, 2], beveled[y, x] * .1, atol=1e-8)
    area = np.linalg.norm(np.cross(tops[:, 1] - tops[:, 0], tops[:, 2] - tops[:, 0]), axis=1).sum() / 2
    np.testing.assert_allclose(area, np.count_nonzero(labels) * width_mm * height_mm / labels.size, rtol=1e-8)
    return {'source': str(source.resolve()), 'sha256': hashlib.sha256(raw).hexdigest(),
            'size': [shape[1], shape[0]], 'sizeMm': snapshot['sizeMm'],
            'positivePixels': int(np.count_nonzero(heights)),
            'bevelChangedPixels': int(np.count_nonzero(beveled != heights)),
            'heightAndWhiteExact': True, 'bevelPositiveSupportExact': True,
            'migrationMatchesLegacy': True, 'colorExact': True,
            'objTopCentroidsAndSummedAreaVerified': True,
            'objTriangles': len(faces), 'jpeg': json.loads((directory / 'jpeg-report.json').read_text('utf-8')),
            'recognitionGroundTruth': False, 'deviceValidated': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', type=Path, action='append', required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=False)
    rows = []
    for index, source in enumerate(args.project):
        row = verify(source, args.out / str(index + 1))
        rows.append(row)
        (args.out / 'report.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), 'utf-8')
        print(json.dumps({key: value for key, value in row.items() if key != 'jpeg'}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
