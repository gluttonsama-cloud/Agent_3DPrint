"""在独立后台 Blender 中导入 OBJ 并保存检查视图，不修改交付模型。"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    args.out.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=str(args.input.resolve()), forward_axis='Y', up_axis='Z')
    scene = bpy.context.scene
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    if not meshes:
        raise AssertionError('OBJ 没有导入网格')
    scene.view_layers.update()
    points = [obj.matrix_world @ Vector(point) for obj in meshes for point in obj.bound_box]
    lower = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    upper = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    center = (lower + upper) / 2
    span = max(upper.x - lower.x, upper.y - lower.y)
    textures = [image for image in bpy.data.images if image.source == 'FILE']
    for image in textures:
        if not Path(bpy.path.abspath(image.filepath)).is_file():
            raise AssertionError('OBJ 贴图文件不存在')
        image.reload()
        _ = image.pixels[0]
    if not textures or not all(image.has_data for image in textures):
        raise AssertionError('OBJ 贴图未成功加载')
    camera_data = bpy.data.cameras.new('AcceptanceCamera')
    camera = bpy.data.objects.new('AcceptanceCamera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = span * 1.35
    camera_data.clip_end = span * 10
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.background_type = 'WORLD'
    scene.world = bpy.data.worlds.new('AcceptanceWorld')
    scene.world.color = (.16, .16, .16)
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    for name, offset in [('top', (0, 0, 2)), ('oblique', (0, -1.3, 1.7))]:
        camera.location = center + Vector(offset) * span
        camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str((args.out / (name + '.png')).resolve())
        bpy.ops.render.render(write_still=True)
    report = {'blender': bpy.app.version_string, 'obj': str(args.input.resolve()),
              'objSha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
              'bounds': [list(lower), list(upper)],
              'triangles': sum(len(obj.data.polygons) for obj in meshes),
              'textures': [bpy.path.abspath(image.filepath) for image in textures],
              'scope': 'OBJ imported by Blender with original geometry and texture; not solid or print validation'}
    (args.out / 'report.json').write_text(json.dumps(report, indent=2), 'utf-8')


if __name__ == '__main__':
    main()
