import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles, Clock } from 'lucide-react';

export default function Processing() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrameId: number;

    const updateProgress = (currentTime: number) => {
      if (startTime === null) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const newProgress = Math.min((elapsed / 5000) * 100, 100);
      
      setProgress(newProgress);

      if (newProgress < 100) {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    animationFrameId = requestAnimationFrame(updateProgress);

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  useEffect(() => {
    if (progress >= 100) {
      const timeout = setTimeout(() => {
        navigate('/preview');
      }, 200); // Short delay before navigation
      return () => clearTimeout(timeout);
    }
  }, [progress, navigate]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-between p-6 relative bg-[var(--bg-sand)]">
      <div className="pattern-bg absolute inset-0 z-0 pointer-events-none"></div>

      <header className="w-full max-w-md z-10 flex justify-between items-center mb-6">
        <div className="bg-[var(--bg-sand)] border border-[var(--border-charcoal)] px-4 py-2 font-medium tracking-wide shadow-[3px_3px_0px_0px_var(--border-charcoal)] text-[var(--text-charcoal)] text-sm uppercase">
          AI 3D Head
        </div>
        <button 
          onClick={() => navigate('/')}
          className="bg-[var(--text-charcoal)] border border-[var(--border-charcoal)] p-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.2)] hover:brightness-110 transition-colors text-[var(--bg-sand)]"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <main className="w-full max-w-md flex-1 flex flex-col justify-center items-center z-10 space-y-12">
        <div className="relative w-full aspect-square max-w-[240px] flex items-center justify-center">
          <div className="absolute inset-0 border border-[var(--accent-beige)] rounded-full"></div>
          <div className="absolute inset-4 border-2 border-[var(--border-charcoal)] rounded-full border-t-transparent animate-spin" style={{ animationDuration: '3s' }}></div>
          
          <div className="relative w-32 h-32 bg-[var(--accent-beige)] border border-[var(--border-charcoal)] rounded-full flex items-center justify-center shadow-[4px_4px_0px_0px_var(--border-charcoal)]">
            <div className="w-16 h-16 rounded-full bg-[var(--text-charcoal)] flex items-center justify-center animate-pulse">
              <div className="w-12 h-12 rounded-full border-2 border-[var(--bg-sand)] flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-[var(--bg-sand)]"></div>
              </div>
            </div>
          </div>

          <div className="absolute top-0 right-8 w-8 h-8 bg-[var(--slate-grey)] border border-[var(--border-charcoal)] flex items-center justify-center animate-bounce z-20 shadow-[2px_2px_0px_0px_var(--border-charcoal)]">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        </div>

        <div className="text-center space-y-3">
          <h1 className="text-3xl font-medium tracking-wide text-[var(--text-charcoal)] serif-text">正在生成</h1>
          <p className="text-sm font-normal text-[var(--text-charcoal)] opacity-70 tracking-widest uppercase">AI Processing</p>
        </div>

        <div className="w-full space-y-8 px-2">
          <div className="relative w-full h-8 bg-[var(--bg-sand)] border border-[var(--border-charcoal)] shadow-[3px_3px_0px_0px_var(--border-charcoal)]">
            <div 
              className={`h-full bg-[var(--slate-grey)] flex items-center justify-end pr-2 relative min-w-[2.5rem] ${progress < 100 ? 'border-r border-[var(--border-charcoal)]' : ''}`} 
              style={{ width: `${progress}%` }}
            >
              <span className="font-mono text-xs text-white">{Math.floor(progress)}%</span>
            </div>
          </div>

          <div className="w-full pl-2">
            <ul className="space-y-6 border-l border-[var(--accent-beige)] pl-6 relative">
              <li className="flex items-center space-x-4 opacity-50 relative">
                <div className="absolute -left-[33px] w-3 h-3 bg-[var(--text-charcoal)] rounded-full"></div>
                <span className="text-sm font-medium line-through decoration-1 decoration-[var(--border-charcoal)] serif-text">照片预处理</span>
              </li>
              
              <li className="flex items-center space-x-4 relative">
                <div className="absolute -left-[35px] w-4 h-4 bg-[var(--bg-sand)] border-2 border-[var(--text-charcoal)] flex items-center justify-center rounded-full animate-pulse">
                  <div className="w-1.5 h-1.5 bg-[var(--text-charcoal)] rounded-full"></div>
                </div>
                <span className="text-lg font-bold text-[var(--text-charcoal)] serif-text">AI 建模中...</span>
              </li>
              
              <li className="flex items-center space-x-4 opacity-40 relative">
                <div className="absolute -left-[33px] w-3 h-3 bg-[var(--accent-beige)] border border-[var(--border-charcoal)] rounded-full"></div>
                <span className="text-sm font-normal serif-text">优化纹理细节</span>
              </li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-md mt-6 z-10 text-center pb-12">
        <div className="inline-flex items-center space-x-2 bg-[var(--accent-beige)] border border-[var(--border-charcoal)] px-4 py-2 text-xs font-medium shadow-[2px_2px_0px_0px_var(--border-charcoal)] text-[var(--text-charcoal)] uppercase tracking-wider">
          <Clock className="w-4 h-4" />
          <span>预计剩余: {Math.ceil((100 - progress) / 20)}秒</span>
        </div>
      </footer>
    </div>
  );
}
