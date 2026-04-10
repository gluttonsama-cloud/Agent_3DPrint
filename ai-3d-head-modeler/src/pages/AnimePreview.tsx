import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Sparkles, Check, X, Loader2 } from 'lucide-react';
import { stylizeImage } from '../services/animeFilterService';
import { uploadPhotos, PhotoFile } from '../services/uploadService';

interface UploadState {
  photos: (string | null)[];
  photoFiles: File[];
  enableBackgroundRemoval: boolean;
}

export default function AnimePreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as UploadState;

  const [animePhotos, setAnimePhotos] = useState<(string | null)[]>([null, null, null, null]);
  const [processing, setProcessing] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state?.photos) {
      navigate('/upload');
      return;
    }

    const processPhotos = async () => {
      setProcessing(true);
      setError(null);
      const results = [...animePhotos];
      
      try {
        for (let i = 0; i < state.photos.length; i++) {
          const photoUrl = state.photos[i];
          if (photoUrl) {
            const img = new Image();
            img.src = photoUrl;
            await new Promise((resolve, reject) => { 
              img.onload = resolve;
              img.onerror = () => reject(new Error('图片加载失败'));
            });
            results[i] = await stylizeImage(img);
          }
        }
        setAnimePhotos(results);
      } catch (err: any) {
        console.error(`Failed to process photos:`, err);
        setError(err.message || '动漫化处理失败');
      } finally {
        setProcessing(false);
      }
    };

    processPhotos();
  }, [state, navigate]);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    const validSlots = state.photos
      .map((p, i) => p ? i : -1)
      .filter(i => i !== -1);

    const photoFilesToUpload: PhotoFile[] = validSlots.map(index => ({
      // 优先使用动漫化后的预览图数据，彻底解决 Android 真机无法加载 File 对象的问题
      base64: animePhotos[index] || undefined, 
      file: animePhotos[index] ? undefined : state.photoFiles[index],
      view: index === 0 ? '主视角' : `角度${index + 1}`,
    }));

    const result = await uploadPhotos(photoFilesToUpload, state.enableBackgroundRemoval, 'multiview');

    if (result.success && result.taskId) {
      navigate('/processing', {
        state: {
          taskId: result.taskId,
          estimatedTime: result.estimatedTime,
          photoCount: validSlots.length,
        },
      });
    } else {
      alert(`上传失败：${result.error || '请重试'}`);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-sand)]">
      <header className="p-6 flex justify-between items-center z-10 border-b-2 border-[var(--border-charcoal)]/10">
        <button 
          onClick={() => navigate('/upload')}
          className="w-10 h-10 flex items-center justify-center bg-white border-2 border-[var(--border-charcoal)] shadow-[3px_3px_0px_var(--border-charcoal)] active:translate-x-[1px] active:translate-y-[1px] text-[var(--text-charcoal)]"
        >
          <ArrowLeft className="w-5 h-5 font-bold" strokeWidth={3} />
        </button>
        <h1 className="text-lg font-bold tracking-widest uppercase">动漫预览</h1>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 p-6 flex flex-col overflow-y-auto">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-[var(--action-slate)]" />
            <span className="text-xs font-black uppercase tracking-tighter text-[var(--action-slate)]">AI Stylization Entry</span>
          </div>
          <h2 className="text-3xl font-bold leading-none mb-4">这是您的<br />虚拟动漫形象</h2>
          <p className={`text-sm font-medium ${error ? 'text-red-500' : 'text-[var(--text-charcoal)]/60'}`}>
            {processing 
              ? '正在通过 TFJS 实时重塑您的面部特征...' 
              : error 
                ? `❌ ${error}` 
                : '效果已生成！确认无误后即可启动 3D 建模。'}
          </p>
        </div>

        <div className="flex-1 flex flex-col gap-6">
          {/* 大图卡片流展示 */}
          <div className="overflow-x-auto pb-4 flex gap-4 snap-x">
            {state.photos.map((original, index) => (
              original && (
                <div key={index} className="flex-shrink-0 w-[85%] snap-center">
                  <div className="aspect-[3/4] neo-box bg-white relative overflow-hidden">
                    {processing && !animePhotos[index] ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--accent-beige)]">
                        <Loader2 className="w-10 h-10 animate-spin mb-4 text-[var(--action-slate)]" />
                        <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Processing...</span>
                      </div>
                    ) : (
                      <img 
                        src={animePhotos[index] || original} 
                        className="w-full h-full object-cover"
                        alt="Anime Preview"
                      />
                    )}
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                      <div className="bg-[var(--action-slate)] border-2 border-[var(--border-charcoal)] px-3 py-1 text-[10px] font-bold text-white uppercase tracking-widest">
                        视角 {index + 1}
                      </div>
                      {!processing && (
                        <div className="bg-white border-2 border-[var(--border-charcoal)] p-2 shadow-[2px_2px_0px_var(--border-charcoal)]">
                          <Check className="w-4 h-4 text-green-600" strokeWidth={4} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <button 
            onClick={handleConfirm}
            disabled={processing || isSubmitting}
            className="w-full h-16 bg-[var(--action-slate)] text-white text-lg font-black tracking-widest uppercase border-2 border-[var(--border-charcoal)] shadow-[6px_6px_0px_var(--border-charcoal)] flex items-center justify-center gap-3 active:shadow-none active:translate-x-[6px] active:translate-y-[6px] transition-all disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
            确认并启动 3D 重塑
          </button>
          
          <button 
            onClick={() => navigate('/upload')}
            className="w-full h-14 bg-white text-[var(--text-charcoal)] text-sm font-bold tracking-widest uppercase border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] flex items-center justify-center gap-3 active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all"
          >
            <X className="w-5 h-5" />
            不满意，返回重选
          </button>
        </div>
      </main>

      {/* Background Decor */}
      <div className="fixed bottom-[-20px] left-[-20px] w-40 h-40 bg-[var(--accent-beige)] border-2 border-[var(--border-charcoal)] -rotate-12 z-0 opacity-40"></div>
    </div>
  );
}
