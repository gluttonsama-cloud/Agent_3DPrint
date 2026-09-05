import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Project } from './types';
import { previewData } from './preview-model';

export function ReliefPreview({ project }: { project: Project }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const host = container.current!;
    let data: ReturnType<typeof previewData>;
    try {
      data = previewData(project);
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
    renderer.setClearColor(0xeceee9, 1);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    camera.position.set(65, 90, 112);
    const controls = new OrbitControls(camera, renderer.domElement);
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
        z[y * w + x] = 0.25 + heights[source] * 0.22;
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
    const texture = new THREE.TextureLoader().load(project.image);
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
      renderer.setAnimationLoop(null);
      controls.dispose();
      geometry.dispose();
      sideGeometry.dispose();
      material.dispose();
      sideMaterial.dispose();
      texture.dispose();
      grid.geometry.dispose();
      (Array.isArray(grid.material) ? grid.material : [grid.material]).forEach((value) =>
        value.dispose(),
      );
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [project]);
  return (
    <div className="preview-wrap">
      <div className="preview-host" ref={container} />
      <span className="preview-hint">
        {error || '拖动旋转 · 滚轮缩放 · 原分辨率几何 · Z 向为示意比例'}
      </span>
    </div>
  );
}
