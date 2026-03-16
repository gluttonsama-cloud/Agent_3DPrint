import { useNavigate } from 'react-router-dom';
import { RefreshCw, Sun, Smile, Camera } from 'lucide-react';

export default function Guide() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[var(--warm-sand)]">
      <div className="bg-[var(--deep-charcoal)] text-[var(--warm-sand)] py-3 neo-border border-b-2 border-t-0 border-x-0 overflow-hidden">
        <div className="marq-container font-medium text-xs tracking-[0.2em] uppercase">
          <div className="marq-content">
            AI 3D HEAD MODELING /// ZEN MODE /// PRECISION /// 快速建模 /// 3D 头部建模 /// AI 3D HEAD MODELING /// ZEN MODE /// PRECISION /// 快速建模 /// 3D 头部建模 ///
          </div>
        </div>
      </div>

      <main className="flex-1 px-6 pt-10 pb-36 flex flex-col gap-8 max-w-md mx-auto w-full">
        <header className="relative z-10 flex flex-col items-start gap-2">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full border-[1px] border-[var(--deep-charcoal)] opacity-10 -z-10"></div>
          <div className="inline-block px-3 py-1 border border-[var(--deep-charcoal)] rounded-full text-xs font-bold tracking-widest uppercase bg-[var(--white)] text-[var(--deep-charcoal)] mb-2">
            Photo Guide
          </div>
          <h1 className="text-5xl font-light tracking-wide text-[var(--deep-charcoal)] leading-tight">
            3D<br />
            <span className="font-bold">头部建模</span>
          </h1>
          <p className="mt-2 text-[var(--slate-grey)] text-base font-normal tracking-wide max-w-[80%] leading-relaxed">
            只需简单几步，即可生成高精度模型。请遵循以下禅意指南。
          </p>
        </header>

        <div className="flex flex-col gap-5 mt-2">
          <div className="bg-[var(--white)] neo-border p-6 relative group hover:bg-[var(--muted-beige)] transition-colors duration-300">
            <div className="absolute -top-3 -left-3 w-8 h-8 bg-[var(--deep-charcoal)] text-[var(--warm-sand)] flex items-center justify-center font-bold text-sm neo-border shadow-[2px_2px_0px_0px_var(--slate-grey)]">01</div>
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center border border-[var(--deep-charcoal)] rounded-full bg-[var(--warm-sand)]">
                <RefreshCw className="w-7 h-7 text-[var(--deep-charcoal)]" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2 tracking-wide text-[var(--deep-charcoal)]">多角度拍摄</h3>
                <p className="text-sm font-light leading-relaxed text-[var(--slate-grey)]">
                  请围绕头部平视拍摄一圈。建议采集 <span className="border-b border-[var(--slate-grey)] font-medium text-[var(--deep-charcoal)]">3-5 张</span> 照片以覆盖所有细节。
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[var(--white)] neo-border p-6 relative group hover:bg-[var(--muted-beige)] transition-colors duration-300">
            <div className="absolute -top-3 -left-3 w-8 h-8 bg-[var(--deep-charcoal)] text-[var(--warm-sand)] flex items-center justify-center font-bold text-sm neo-border shadow-[2px_2px_0px_0px_var(--slate-grey)]">02</div>
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center border border-[var(--deep-charcoal)] rounded-full bg-[var(--warm-sand)]">
                <Sun className="w-7 h-7 text-[var(--deep-charcoal)]" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2 tracking-wide text-[var(--deep-charcoal)]">柔和光线</h3>
                <p className="text-sm font-light leading-relaxed text-[var(--slate-grey)]">
                  寻找均匀、柔和的光线环境。避免强烈的阴影，让 AI 更清晰地捕捉面部特征。
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[var(--white)] neo-border p-6 relative group hover:bg-[var(--muted-beige)] transition-colors duration-300">
            <div className="absolute -top-3 -left-3 w-8 h-8 bg-[var(--deep-charcoal)] text-[var(--warm-sand)] flex items-center justify-center font-bold text-sm neo-border shadow-[2px_2px_0px_0px_var(--slate-grey)]">03</div>
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center border border-[var(--deep-charcoal)] rounded-full bg-[var(--warm-sand)]">
                <Smile className="w-7 h-7 text-[var(--deep-charcoal)]" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2 tracking-wide text-[var(--deep-charcoal)]">保持静止</h3>
                <p className="text-sm font-light leading-relaxed text-[var(--slate-grey)]">
                  保持面部自然放松。在拍摄过程中，请尽量保持头部不动，维持同一表情。
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-[var(--warm-sand)] border-t border-[var(--deep-charcoal)] p-6 z-50">
        <div className="max-w-md mx-auto">
          <button 
            onClick={() => navigate('/upload')}
            className="w-full bg-[var(--slate-grey)] text-[var(--white)] text-xl font-medium tracking-widest py-4 neo-border hard-shadow hover:bg-[var(--deep-charcoal)] hard-shadow-hover transition-all flex items-center justify-center gap-3"
          >
            <Camera className="w-6 h-6" />
            开始拍摄
          </button>
          <div className="text-center mt-4 text-[10px] tracking-[0.2em] uppercase font-medium text-[var(--slate-grey)]">
            Powered by Hunyuan 3D API
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="fixed top-24 right-[-40px] w-32 h-32 border-[1px] border-[var(--deep-charcoal)] rounded-full opacity-20 pointer-events-none"></div>
      <div className="fixed bottom-32 left-[-20px] w-24 h-24 bg-[var(--muted-beige)] border border-[var(--deep-charcoal)] rounded-full -z-10 pointer-events-none opacity-50"></div>
      <div className="fixed top-[20%] left-6 w-2 h-2 bg-[var(--deep-charcoal)] rounded-full pointer-events-none"></div>
      <div className="fixed top-[18%] left-8 w-1 h-1 bg-[var(--slate-grey)] rounded-full pointer-events-none"></div>
      <div className="fixed bottom-[25%] right-6 w-3 h-3 border border-[var(--deep-charcoal)] transform rotate-45 pointer-events-none"></div>
    </div>
  );
}
