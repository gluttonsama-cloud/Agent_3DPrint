import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** 从输出 OBJ/MTL/贴图重新解析，独立于工程预览几何生成器。 */
export function ObjInspector() {
  const host = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState('选择 OBJ、MTL 和 texture.png 一起检查');
  useEffect(() => {
    if (!files.length || !host.current) return;
    const target = host.current;
    let disposed = false;
    let cleanup = () => {};
    const urls = new Map(files.map(file => [file.name, URL.createObjectURL(file)]));
    void (async () => {
      const obj = files.find(file => file.name.endsWith('.obj'));
      if (!obj) throw new Error('需要 OBJ 文件');
      if (obj.size > 512 * 1024 ** 2) throw new Error('查看文件超过 512 MiB');
      const manager = new THREE.LoadingManager();
      manager.setURLModifier(url => urls.get(url.split('/').pop()!) ?? url);
      const loader = new OBJLoader(manager);
      const mtl = files.find(file => file.name.endsWith('.mtl'));
      if (mtl) {
        const materials = new MTLLoader(manager).parse(await mtl.text(), '');
        materials.preload(); loader.setMaterials(materials);
      }
      const object = loader.parse(await obj.text());
      let vertexCount = 0;
      object.traverse(item => {
        if (!(item instanceof THREE.Mesh)) return;
        const positions = item.geometry.getAttribute('position');
        if (!positions) return;
        vertexCount += positions.count;
        for (let index = 0; index < positions.count; index++) {
          if (![positions.getX(index), positions.getY(index), positions.getZ(index)].every(Number.isFinite)) {
            throw new Error('OBJ 包含无效坐标');
          }
        }
      });
      if (!vertexCount) throw new Error('OBJ 没有可查看的网格');
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9eee9');
      scene.add(object, new THREE.HemisphereLight(0xffffff, 0x999999, 2));
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      const camera = new THREE.PerspectiveCamera(40, 1, 0.01, Math.max(1000, size.length() * 10));
      camera.up.set(0, 0, 1);
      const distance = Math.max(1, size.length());
      camera.position.set(distance, -distance, distance);
      const controls = new OrbitControls(camera, renderer.domElement);
      const resize = new ResizeObserver(() => {
        renderer.setSize(target.clientWidth, 400); camera.aspect = target.clientWidth / 400;
        camera.updateProjectionMatrix();
      });
      cleanup = () => {
        renderer.setAnimationLoop(null); resize.disconnect(); controls.dispose(); renderer.dispose();
        object.traverse(item => { if (item instanceof THREE.Mesh) {
          item.geometry.dispose();
          (Array.isArray(item.material) ? item.material : [item.material]).forEach(material => {
            if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
            material.dispose();
          });
        } });
        renderer.domElement.remove();
      };
      if (disposed) { cleanup(); return; }
      target.appendChild(renderer.domElement); resize.observe(target);
      renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
      setMessage(`OBJ 边界尺寸：${size.toArray().map(value => value.toFixed(3)).join(' × ')} mm（X/Y/Z）`);
    })().catch(error => { if (!disposed) setMessage(String(error)); });
    return () => { disposed = true; cleanup(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [files]);
  return <section><h2>独立 OBJ 文件检查</h2>
    <input aria-label="OBJ 检查文件" type="file" multiple accept=".obj,.mtl,.png"
      onChange={event => setFiles(Array.from(event.target.files ?? []))} />
    <p role="status" aria-label="OBJ 尺寸">{message}</p><div ref={host} />
  </section>;
}
