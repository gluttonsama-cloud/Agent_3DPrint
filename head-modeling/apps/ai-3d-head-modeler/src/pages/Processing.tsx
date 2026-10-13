import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Sparkles, Clock, AlertCircle } from 'lucide-react';
import { pollTaskStatus } from '../services/uploadService';

interface ProcessingState {
  taskId?: string;
  estimatedTime?: string;
  photoCount?: number;
}

export default function Processing() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ProcessingState | undefined;
  
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('正在提交任务...');
  const [error, setError] = useState<string | null>(null);
  const stopPollingRef = useRef<(() => void) | null>(null);

  const handleComplete = useCallback((modelUrls: string[]) => {
    setProgress(100);
    setStatusMessage('生成完成！');
    
    setTimeout(() => {
      navigate('/preview', {
        state: {
          taskId: state?.taskId,
          modelUrls,
        },
      });
    }, 500);
  }, [navigate, state?.taskId]);

  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
    setStatusMessage('生成失败');
  }, []);

  const handleProgress = useCallback((newProgress: number, status: string, message?: string) => {
    setProgress(newProgress);
    if (message) {
      setStatusMessage(message);
    } else if (status === 'PENDING') {
      setStatusMessage('正在提交任务...');
    } else if (status === 'IN_PROGRESS') {
      setStatusMessage('AI 建模中...');
    }
  }, []);

  useEffect(() => {
    if (!state?.taskId) {
      setError('缺少任务 ID');
      return;
    }

    stopPollingRef.current = pollTaskStatus(
      state.taskId,
      handleProgress,
      handleComplete,
      handleError,
      3000
    );

    return () => {
      if (stopPollingRef.current) {
        stopPollingRef.current();
      }
    };
  }, [state?.taskId, handleProgress, handleComplete, handleError]);

  const handleCancel = () => {
    if (stopPollingRef.current) {
      stopPollingRef.current();
    }
    navigate('/');
  };

  if (error) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[var(--bg-sand)]">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-2xl font-bold text-[var(--text-charcoal)]">生成失败</h1>
          <p className="text-[var(--text-charcoal)]/70">{error}</p>
          <button
            onClick={() => navigate('/upload')}
            className="mt-4 px-6 py-3 bg-[var(--action-slate)] text-white font-bold uppercase tracking-wider"
          >
            重新上传
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-between p-6 relative bg-[var(--bg-sand)]">
      <div className="pattern-bg absolute inset-0 z-0 pointer-events-none"></div>

      <header className="w-full max-w-md z-10 flex justify-between items-center mb-6">
        <div className="bg-[var(--bg-sand)] border border-[var(--border-charcoal)] px-4 py-2 font-medium tracking-wide shadow-[3px_3px_0px_0px_var(--border-charcoal)] text-[var(--text-charcoal)] text-sm uppercase">
          AI 3D Head
        </div>
        <button 
          onClick={handleCancel}
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
          <h1 className="text-3xl font-medium tracking-wide text-[var(--text-charcoal)] serif-text">{statusMessage}</h1>
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
          <span>预计剩余: {state?.estimatedTime || '3-5 分钟'}</span>
        </div>
      </footer>
    </div>
  );
}
