import { Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Menu, CheckCircle, ZoomIn, ZoomOut, Grid, Rotate3D, Share2, Download, Edit2 } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';

const LOCAL_MODEL_PATH = '/model.glb';

function HeadModel({ url }: { url: string }) {
  const { scene } = useGLTF(url) as any;
  return <primitive object={scene} scale={2.5} position={[0, -1, 0]} />;
}

export default function Preview() {
  const navigate = useNavigate();
  const [autoRotate, setAutoRotate] = useState(true);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-sand)]">
      <header className="flex items-center justify-between p-4 border-b-2 border-[var(--charcoal)] bg-[var(--bg-sand)] z-10">
        <button 
          onClick={() => navigate('/')}
          className="w-10 h-10 flex items-center justify-center neo-button bg-white rounded-md text-[var(--charcoal)] hover:bg-[var(--muted-beige)]"
        >
          <ArrowLeft className="w-5 h-5 font-medium" />
        </button>
        <h1 className="text-xl font-bold tracking-tight uppercase text-[var(--charcoal)]">AI 3D Head</h1>
        <button className="w-10 h-10 flex items-center justify-center neo-button bg-white rounded-md text-[var(--charcoal)] hover:bg-[var(--muted-beige)]">
          <Menu className="w-5 h-5 font-medium" />
        </button>
      </header>

      <main className="flex-1 flex flex-col p-4 space-y-5 overflow-y-auto">
        <div className="flex justify-between items-center mb-1">
          <div className="status-badge bg-white text-[var(--charcoal)] rounded-none">
            <CheckCircle className="w-4 h-4 mr-2 text-[var(--slate-grey)]" />
            生成完毕
          </div>
          <span className="font-bold text-xs bg-[var(--muted-beige)] border-2 border-[var(--charcoal)] px-3 py-1 shadow-custom rounded-none text-[var(--charcoal)]">
            Hunyuan3D-2.1
          </span>
        </div>

        <div className="relative w-full aspect-[4/5] bg-white neo-box neo-viewport flex items-center justify-center overflow-hidden rounded-none">
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
            <button className="bg-white border-2 border-[var(--charcoal)] w-10 h-10 flex items-center justify-center shadow-custom active:translate-x-[1px] active:translate-y-[1px] active:shadow-none rounded-none text-[var(--charcoal)] hover:bg-[var(--muted-beige)] transition-colors">
              <ZoomIn className="w-5 h-5" />
            </button>
            <button className="bg-white border-2 border-[var(--charcoal)] w-10 h-10 flex items-center justify-center shadow-custom active:translate-x-[1px] active:translate-y-[1px] active:shadow-none rounded-none text-[var(--charcoal)] hover:bg-[var(--muted-beige)] transition-colors">
              <ZoomOut className="w-5 h-5" />
            </button>
            <button className="bg-white border-2 border-[var(--charcoal)] w-10 h-10 flex items-center justify-center shadow-custom active:translate-x-[1px] active:translate-y-[1px] active:shadow-none rounded-none text-[var(--charcoal)] hover:bg-[var(--muted-beige)] transition-colors">
              <Grid className="w-5 h-5" />
            </button>
          </div>

          <div className="relative w-full h-full border-2 border-[var(--charcoal)] bg-white shadow-sm">
            <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
              <ambientLight intensity={1} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <OrbitControls 
                autoRotate={autoRotate} 
                autoRotateSpeed={2} 
                enableZoom={true} 
              />
              <Suspense fallback={
                <mesh>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshBasicMaterial color="#708090" />
                </mesh>
              }>
                <HeadModel url={LOCAL_MODEL_PATH} />
              </Suspense>
            </Canvas>
          </div>

          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-white px-5 py-2 border-2 border-[var(--charcoal)] text-xs font-bold shadow-custom flex items-center gap-2 whitespace-nowrap uppercase tracking-widest rounded-full text-[var(--charcoal)]">
            <Rotate3D className="w-4 h-4" />
            3D 视图
          </div>
        </div>

        <div className="neo-box bg-white p-5 flex justify-between items-center rounded-none">
          <div>
            <h2 className="text-xl font-bold leading-none mb-1.5 text-[var(--charcoal)] tracking-tight">HEAD_SCAN_042.OBJ</h2>
            <p className="text-xs font-medium text-[var(--slate-grey)] uppercase tracking-wide">24MB • 4k 纹理 • 高精度</p>
          </div>
          <button className="w-10 h-10 flex items-center justify-center border-2 border-[var(--charcoal)] bg-white text-[var(--charcoal)] hover:bg-[var(--muted-beige)] transition-all shadow-custom active:shadow-none active:translate-x-[2px] active:translate-y-[2px] rounded-none">
            <Edit2 className="w-5 h-5" />
          </button>
        </div>
      </main>

      <footer className="p-4 bg-[var(--bg-sand)] border-t-2 border-[var(--charcoal)] z-20 pb-8">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <button 
            onClick={() => setAutoRotate(!autoRotate)}
            className="neo-button bg-[var(--muted-beige)] h-14 flex items-center justify-center gap-2 text-[var(--charcoal)] hover:brightness-95 rounded-none"
          >
            <Rotate3D className="w-5 h-5" />
            <span className="text-base font-bold tracking-wide">{autoRotate ? '停止旋转' : '旋转预览'}</span>
          </button>
          <button className="neo-button bg-[var(--muted-beige)] h-14 flex items-center justify-center gap-2 text-[var(--charcoal)] hover:brightness-95 rounded-none">
            <Share2 className="w-5 h-5" />
            <span className="text-base font-bold tracking-wide">分享模型</span>
          </button>
        </div>

        <a 
          href={LOCAL_MODEL_PATH}
          download="head_model.glb"
          className="w-full neo-button bg-[var(--slate-grey)] text-white h-16 flex items-center justify-between px-6 hover:brightness-110 rounded-none border-[var(--charcoal)] group"
        >
          <div className="flex items-center gap-3">
            <div className="p-1 bg-white border-2 border-[var(--charcoal)] rounded-sm group-hover:bg-[var(--muted-beige)] transition-colors">
              <Download className="w-6 h-6 text-[var(--charcoal)] block" />
            </div>
            <div className="flex flex-col items-start leading-tight">
              <span className="text-lg font-bold tracking-wide">下载文件</span>
              <span className="text-[10px] font-medium opacity-80 uppercase tracking-wider">GLB / OBJ 格式支持</span>
            </div>
          </div>
          <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </a>
      </footer>
    </div>
  );
}
