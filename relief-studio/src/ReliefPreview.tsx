import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Project } from './types';
import type { ProjectSnapshot } from './contracts';
import { previewData } from './preview-model';

export interface PreviewCamera {
  position: [number, number, number];
  target: [number, number, number];
}
export function ReliefPreview({
  project,
  cameraState,
  comparison,
  comparisonTarget,
}: {
  project: Project | ProjectSnapshot;
  cameraState?: { current: PreviewCamera | null };
  comparison?: Project | ProjectSnapshot;
  comparisonTarget?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const rememberedCamera = useRef<PreviewCamera | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const host = container.current!;
    let data: ReturnType<typeof previewData>;
    try {
      data = previewData(project, comparison, comparisonTarget);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError('当前环境无法启用 WebGL，请使用二维高度层视图。');
      return;
    }
    setError('');
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0xefefe8, 1);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    camera.position.set(65, 90, 112);
    const controls = new OrbitControls(camera, renderer.domElement);
    const savedCamera = cameraState?.current ?? rememberedCamera.current;
    if (savedCamera) {
      camera.position.fromArray(savedCamera.position);
      controls.target.fromArray(savedCamera.target);
    }
    const rememberCamera = () => {
      rememberedCamera.current = {
        position: camera.position.toArray() as [number, number, number],
        target: controls.target.toArray() as [number, number, number],
      };
      if (cameraState)
        cameraState.current = {
          position: camera.position.toArray() as [number, number, number],
          target: controls.target.toArray() as [number, number, number],
        };
    };
    controls.addEventListener('change', rememberCamera);
    controls.enableDamping = true;
    controls.minDistance = 35;
    controls.maxDistance = 250;
    controls.maxPolarAngle = Math.PI * 0.49;
    const heights = data.heights;
    const w = data.width,
      h = data.height;
    const visible = new Uint8Array(w * h),
      z = new Float32Array(w * h);
    const physicalScale = 85 / Math.max(...project.sizeMm);
    const dx = (project.sizeMm[0] * physicalScale) / w;
    const dy = (project.sizeMm[1] * physicalScale) / h;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const source = y * w + x;
        visible[y * w + x] = project.labels[source] ? 1 : 0;
        z[y * w + x] = project.version === 2
          ? data.millimeters[source] * physicalScale : 0.25 + heights[source] * 0.22;
      }
    const positions: number[] = [],
      uvs: number[] = [];
    const sides: number[] = [];
    const px = (x: number) => (x - w / 2) * dx;
    const py = (y: number) => (y - h / 2) * dy;
    const quad = (target: number[], a: number[], b: number[], c: number[], d: number[]) => {
      target.push(...a, ...b, ...c, ...a, ...c, ...d);
    };
    // 同高相邻顶面合并为行条带，保留逐像素边缘和原图纹理。
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (!visible[y * w + x]) {
          x++;
          continue;
        }
        const begin = x,
          level = z[y * w + x];
        while (x < w && visible[y * w + x] && z[y * w + x] === level) x++;
        quad(
          positions,
          [px(begin), level, py(y)],
          [px(begin), level, py(y + 1)],
          [px(x), level, py(y + 1)],
          [px(x), level, py(y)],
        );
        uvs.push(
          begin / w,
          1 - y / h,
          begin / w,
          1 - (y + 1) / h,
          x / w,
          1 - (y + 1) / h,
          begin / w,
          1 - y / h,
          x / w,
          1 - (y + 1) / h,
          x / w,
          1 - y / h,
        );
      }
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!visible[y * w + x]) continue;
        const top = z[y * w + x];
        const neighbors = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        neighbors.forEach(([nx, ny], direction) => {
          const bottom =
            nx < 0 || nx >= w || ny < 0 || ny >= h || !visible[ny * w + nx] ? 0 : z[ny * w + nx];
          if (bottom >= top) return;
          const edges = [
            [
              [x, y],
              [x, y + 1],
            ],
            [
              [x + 1, y + 1],
              [x + 1, y],
            ],
            [
              [x + 1, y],
              [x, y],
            ],
            [
              [x, y + 1],
              [x + 1, y + 1],
            ],
          ];
          const [a, b] = edges[direction];
          quad(
            sides,
            [px(a[0]), bottom, py(a[1])],
            [px(b[0]), bottom, py(b[1])],
            [px(b[0]), top, py(b[1])],
            [px(a[0]), top, py(a[1])],
          );
        });
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    const texture = project.version === 2
      ? new THREE.DataTexture(project.colors.slice(), w, h, THREE.RGBAFormat)
      : new THREE.TextureLoader().load(project.image);
    if (project.version === 2) { texture.flipY = true; texture.needsUpdate = true; }
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.68,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(geometry, material));
    const sideGeometry = new THREE.BufferGeometry();
    sideGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3));
    sideGeometry.computeVertexNormals();
    const sideMaterial = new THREE.MeshStandardMaterial({
      color: 0xe4d5b8,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(sideGeometry, sideMaterial));
    // 增加显示为绿色顶面；删除用原高度红线标记，不改工程或导出数据。
    const addedVertices: number[] = [],
      removedEdges: number[] = [];
    if (comparison && comparisonTarget !== undefined) {
      const oldData = previewData(comparison);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (comparison.labels[i] === project.labels[i]) continue;
          if (project.labels[i] === comparisonTarget) {
            const begin = x;
            while (
              x + 1 < w &&
              project.labels[y * w + x + 1] === comparisonTarget &&
              comparison.labels[y * w + x + 1] !== comparisonTarget
            )
              x++;
            const top = z[i] + 0.025;
            quad(
              addedVertices,
              [px(begin), top, py(y)],
              [px(begin), top, py(y + 1)],
              [px(x + 1), top, py(y + 1)],
              [px(x + 1), top, py(y)],
            );
          } else if (comparison.labels[i] === comparisonTarget) {
            const top = comparison.version === 2 ? oldData.millimeters[i] * physicalScale + 0.025
              : 0.275 + oldData.heights[i] * 0.22;
            const removed = (n: number) =>
              comparison.labels[n] === comparisonTarget && project.labels[n] !== comparisonTarget;
            if (x === 0 || !removed(i - 1))
              removedEdges.push(px(x), top, py(y), px(x), top, py(y + 1));
            if (x === w - 1 || !removed(i + 1))
              removedEdges.push(px(x + 1), top, py(y), px(x + 1), top, py(y + 1));
            if (y === 0 || !removed(i - w))
              removedEdges.push(px(x), top, py(y), px(x + 1), top, py(y));
            if (y === h - 1 || !removed(i + w))
              removedEdges.push(px(x), top, py(y + 1), px(x + 1), top, py(y + 1));
          }
        }
    }
    const addedGeometry = new THREE.BufferGeometry();
    addedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(addedVertices, 3));
    const addedMaterial = new THREE.MeshBasicMaterial({ color: 0x00e691, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(addedGeometry, addedMaterial));
    const removedGeometry = new THREE.BufferGeometry();
    removedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(removedEdges, 3));
    const removedMaterial = new THREE.LineBasicMaterial({ color: 0xff3750, depthTest: false });
    scene.add(new THREE.LineSegments(removedGeometry, removedMaterial));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9b87, 1.7));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(-50, 100, 40);
    scene.add(light);
    const grid = new THREE.GridHelper(130, 26, 0xc4ccc4, 0xdde1da);
    grid.position.y = -0.15;
    scene.add(grid);
    const resize = new ResizeObserver(() => {
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      camera.updateProjectionMatrix();
    });
    resize.observe(host);
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      resize.disconnect();
      rememberCamera();
      controls.removeEventListener('change', rememberCamera);
      renderer.setAnimationLoop(null);
      controls.dispose();
      geometry.dispose();
      sideGeometry.dispose();
      material.dispose();
      sideMaterial.dispose();
      texture.dispose();
      addedGeometry.dispose();
      addedMaterial.dispose();
      removedGeometry.dispose();
      removedMaterial.dispose();
      grid.geometry.dispose();
      (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach((value) =>
        value.dispose(),
      );
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [project, comparison, comparisonTarget, cameraState]);
  return (
    <div className="preview-wrap">
      <div className="preview-host" ref={container} />
      <span className="preview-hint">{error || '拖动旋转 · 滚轮缩放'}</span>
    </div>
  );
}
