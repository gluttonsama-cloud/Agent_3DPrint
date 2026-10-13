import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
// @ts-ignore - Three.js example modules don't have proper TypeScript definitions
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
// @ts-ignore
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export interface ModelViewerProps {
  modelUrl: string;              // 模型文件 URL
  width?: string;                // 容器宽度，默认 '100%'
  height?: string;               // 容器高度，默认 '400px'
  autoRotate?: boolean;          // 是否自动旋转，默认 true
  showGrid?: boolean;            // 显示网格地面，默认 false
  backgroundColor?: string;      // 背景颜色，默认 '#f5f5f5'
  onLoad?: () => void;           // 加载完成回调
  onError?: (error: Error) => void; // 错误回调
  onProgress?: (progress: number) => void; // 加载进度回调 (0-1)
}

const ModelViewer: React.FC<ModelViewerProps> = ({
  modelUrl,
  width = '100%',
  height = '400px',
  autoRotate = true,
  showGrid = false,
  backgroundColor = '#f5f5f5',
  onLoad,
  onError,
  onProgress,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // 清理函数
  const cleanupScene = useCallback((
    scene: THREE.Scene | null,
    renderer: THREE.WebGLRenderer | null,
    camera: THREE.PerspectiveCamera | null,
    controls: OrbitControls | null,
    animationId: number | null
  ) => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    
    if (scene) {
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((m) => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }
    
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    }
    
    if (controls) {
      controls.dispose();
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || !modelUrl) return;

    let scene: THREE.Scene | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let controls: OrbitControls | null = null;
    let animationId: number | null = null;
    let modelMesh: THREE.Mesh | null = null;

    const initViewer = async () => {
      try {
        setLoading(true);
        setError(null);
        setProgress(0);

        // 1. 创建场景
        scene = new THREE.Scene();
        scene.background = new THREE.Color(backgroundColor);

        // 2. 创建相机
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        camera = new THREE.PerspectiveCamera(
          45,
          containerWidth / containerHeight,
          0.1,
          1000
        );
        camera.position.set(50, 50, 50);

        // 3. 创建渲染器
        renderer = new THREE.WebGLRenderer({ 
          antialias: true, 
          alpha: true 
        });
        renderer.setSize(containerWidth, containerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // 清空容器并添加渲染器
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(renderer.domElement);

        // 4. 添加控制器
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = false;
        controls.minDistance = 10;
        controls.maxDistance = 500;

        // 5. 添加灯光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        scene.add(directionalLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
        backLight.position.set(-10, 10, -10);
        scene.add(backLight);

        // 6. 添加网格地面（可选）
        if (showGrid) {
          const gridHelper = new THREE.GridHelper(100, 50, 0x444444, 0x888888);
          scene.add(gridHelper);
          
          const axesHelper = new THREE.AxesHelper(10);
          scene.add(axesHelper);
        }

        // 7. 加载模型
        const getExtension = (url: string) => {
          return url.split('?')[0].toLowerCase().split('.').pop() || '';
        };

        const extension = getExtension(modelUrl);
        
        const onLoadModel = (geometry: THREE.BufferGeometry | THREE.Object3D) => {
          let mesh: THREE.Mesh;
          
          if (geometry instanceof THREE.BufferGeometry) {
            // STL 加载
            const material = new THREE.MeshPhongMaterial({
              color: 0x4a90e2,
              specular: 0x111111,
              shininess: 200,
              side: THREE.DoubleSide,
              flatShading: false,
            });
            
            mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          } else {
            // OBJ 加载（返回的是 Group）
            mesh = new THREE.Mesh(
              new THREE.BufferGeometry(),
              new THREE.MeshPhongMaterial({
                color: 0x4a90e2,
                specular: 0x111111,
                shininess: 200,
                side: THREE.DoubleSide,
              })
            );
            
            // 合并 OBJ 中的所有几何体
            geometry.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            
            // 将 Group 转换为单个 Mesh
            mesh = geometry as THREE.Mesh;
          }

          modelMesh = mesh;

          // 居中模型
          if (mesh.geometry) {
            mesh.geometry.center();
          }

          // 计算缩放比例
          const box = new THREE.Box3().setFromObject(mesh);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = maxDim > 0 ? 30 / maxDim : 1;
          mesh.scale.setScalar(scale);

          // 重新计算边界
          box.setFromObject(mesh);
          const center = box.getCenter(new THREE.Vector3());
          
          // 调整相机位置
          const cameraDistance = maxDim * scale * 2;
          camera?.position.set(cameraDistance, cameraDistance * 0.8, cameraDistance);
          camera?.lookAt(0, 0, 0);
          controls?.target.set(0, 0, 0);

          scene?.add(mesh);
          setProgress(100);
          setLoading(false);
          onLoad?.();
        };

        const onProgressModel = (xhr: ProgressEvent) => {
          if (xhr.lengthComputable) {
            const percentComplete = (xhr.loaded / xhr.total) * 100;
            setProgress(Math.round(percentComplete));
            onProgress?.(percentComplete / 100);
          }
        };

        const onErrorModel = (err: ErrorEvent | unknown) => {
          const error = err instanceof ErrorEvent ? new Error(err.message) : new Error('模型加载失败');
          setError(error.message);
          setLoading(false);
          onError?.(error);
        };

        if (extension === 'stl') {
          const loader = new STLLoader();
          loader.load(modelUrl, onLoadModel, onProgressModel, onErrorModel);
        } else if (extension === 'obj') {
          const loader = new OBJLoader();
          loader.load(modelUrl, onLoadModel as any, onProgressModel, onErrorModel);
        } else {
          throw new Error(`不支持的文件格式：${extension}。支持的格式：.stl, .obj`);
        }

        // 8. 动画循环
        const animate = () => {
          animationId = requestAnimationFrame(animate);
          
          if (controls) {
            controls.update();
          }
          
          if (autoRotate && modelMesh && !controls?.enableRotate) {
            modelMesh.rotation.y += 0.005;
          }
          
          if (renderer && scene && camera) {
            renderer.render(scene, camera);
          }
        };
        animate();

        // 9. 处理窗口大小变化
        const handleResize = () => {
          if (!containerRef.current || !camera || !renderer) return;
          
          const newWidth = containerRef.current.clientWidth;
          const newHeight = containerRef.current.clientHeight;
          
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
        };

        window.addEventListener('resize', handleResize);

        // 清理函数
        return () => {
          window.removeEventListener('resize', handleResize);
          cleanupScene(scene, renderer, camera, controls, animationId);
          scene = null;
          renderer = null;
          camera = null;
          controls = null;
          animationId = null;
          modelMesh = null;
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('初始化失败');
        setError(error.message);
        setLoading(false);
        onError?.(error);
      }
    };

    const cleanup = initViewer();

    return () => {
      cleanup?.then((fn) => fn?.());
    };
  }, [modelUrl, backgroundColor, autoRotate, showGrid, cleanupScene, onLoad, onError, onProgress]);

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        position: 'relative',
        background: backgroundColor,
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* 加载状态 */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: backgroundColor,
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: '200px',
              height: '6px',
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '3px',
              overflow: 'hidden',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: '#4a90e2',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div style={{ color: '#666', fontSize: '14px' }}>
            加载模型中... {progress}%
          </div>
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: backgroundColor,
            zIndex: 10,
          }}
        >
          <div
            style={{
              padding: '24px',
              background: '#fff',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              textAlign: 'center',
              maxWidth: '400px',
            }}
          >
            <div style={{ color: '#ff4d4f', fontSize: '16px', marginBottom: '8px', fontWeight: 500 }}>
              加载失败
            </div>
            <div style={{ color: '#666', fontSize: '14px' }}>{error}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelViewer;
