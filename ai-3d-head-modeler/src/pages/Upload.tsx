import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X, Camera, CloudUpload, Sparkles } from 'lucide-react';
import { PhotoFile } from '../services/uploadService';

export default function Upload() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [enableAnimePreview, setEnableAnimePreview] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const slots = [
    { id: 0, label: '主视角' },
    { id: 1, label: '侧面照' },
    { id: 2, label: '仰视照' },
    { id: 3, label: '其他角度' },
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && activeSlot !== null) {
      const filesArray = Array.from(files);
      let currentSlot = activeSlot;
      
      const newPhotoFiles = [...photoFiles];
      const newPhotoDataUrls = [...photos];

      // 顺序读取文件以保证顺序
      for (const file of filesArray) {
        if (currentSlot < 4) {
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          newPhotoDataUrls[currentSlot] = dataUrl;
          newPhotoFiles[currentSlot] = file;
          currentSlot++;
        }
      }

      setPhotos(newPhotoDataUrls);
      setPhotoFiles(newPhotoFiles);
    }
    if (e.target) {
      e.target.value = '';
    }
  };

  const movePhoto = (index: number, direction: 'left' | 'right') => {
    const newIndex = direction === 'left' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= 4) return;

    setPhotos(prev => {
      const next = [...prev];
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });

    setPhotoFiles(prev => {
      const next = [...prev];
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });
  };

  const triggerUpload = (index: number) => {
    setActiveSlot(index);
    fileInputRef.current?.click();
  };

  const removePhoto = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newPhotos = [...photos];
    newPhotos[index] = null;
    setPhotos(newPhotos);
    
    const newPhotoFiles = [...photoFiles];
    newPhotoFiles[index] = undefined as unknown as File;
    setPhotoFiles(newPhotoFiles);
  };

  const validPhotoCount = photos.filter(p => p !== null).length;
  const canSubmit = validPhotoCount >= 1;

  const handleContinue = async () => {
    if (!canSubmit || isUploading) return;

    if (enableAnimePreview) {
      navigate('/anime-preview', {
        state: {
          photos,
          photoFiles,
        }
      });
    } else {
      setIsUploading(true);
      try {
        const { uploadPhotos } = await import('../services/uploadService');
        const validPhotos: PhotoFile[] = [];
        
        photos.forEach((p, i) => {
          if (p) {
            validPhotos.push({
              file: photoFiles[i],
              view: slots[i].label
            });
          }
        });

        const result = await uploadPhotos(validPhotos, false);
        if (result.success && result.taskId) {
          navigate('/processing', {
            state: {
              taskId: result.taskId,
              estimatedTime: result.estimatedTime
            }
          });
        } else {
          alert(result.error || '上传失败，请重试');
        }
      } catch (err) {
        console.error('上传出错:', err);
        alert('无法启动建模任务，请检查网络连接');
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[var(--bg-sand)]">
      <header className="p-6 flex justify-between items-center z-10 relative">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center bg-white border-2 border-[var(--border-charcoal)] shadow-[3px_3px_0px_var(--border-charcoal)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_var(--border-charcoal)] text-[var(--text-charcoal)] hover:bg-[var(--accent-beige)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5 font-bold" strokeWidth={3} />
        </button>
        <h1 className="text-lg font-bold tracking-widest uppercase text-[var(--text-charcoal)]">上传照片</h1>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 flex flex-col px-6 pb-6 z-10 relative">
        <div className="mb-8 mt-2">
          <h2 className="text-3xl font-bold mb-4 leading-tight tracking-tight text-[var(--text-charcoal)]">创建您的<br />3D 数字分身</h2>
          <p className="text-sm font-medium text-[var(--text-charcoal)]/80">请上传至少 1 张照片，建议 3-4 张不同角度以获得最佳效果。</p>
        </div>

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          multiple
          onChange={handleFileChange} 
        />

        <div className="grid grid-cols-2 gap-4 mb-8">
          {slots.map((slot, index) => (
            photos[index] ? (
              <div key={slot.id} className="aspect-square neo-box bg-white relative group overflow-hidden cursor-pointer" onClick={() => triggerUpload(index)}>
                <img 
                  alt={`User Photo ${index}`} 
                  className="w-full h-full object-cover" 
                  src={photos[index]!} 
                />
                
                <div className="absolute top-1 right-1 flex gap-1">
                  {index > 0 && (
                     <button 
                      onClick={(e) => { e.stopPropagation(); movePhoto(index, 'left'); }}
                      className="bg-white/90 w-6 h-6 flex items-center justify-center border border-[var(--border-charcoal)] text-[var(--text-charcoal)] hover:bg-white"
                    >
                      <ArrowLeft className="w-3 h-3" strokeWidth={3} />
                    </button>
                  )}
                  {index < 3 && (
                     <button 
                      onClick={(e) => { e.stopPropagation(); movePhoto(index, 'right'); }}
                      className="bg-white/90 w-6 h-6 flex items-center justify-center border border-[var(--border-charcoal)] text-[var(--text-charcoal)] hover:bg-white"
                    >
                      <ArrowLeft className="w-3 h-3 rotate-180" strokeWidth={3} />
                    </button>
                  )}
                  <button 
                    onClick={(e) => removePhoto(index, e)}
                    className="bg-white w-6 h-6 flex items-center justify-center border-2 border-[var(--border-charcoal)] text-[var(--text-charcoal)] hover:bg-gray-100"
                  >
                    <X className="w-4 h-4 font-bold" strokeWidth={3} />
                  </button>
                </div>
                {index === 0 && (
                  <div className="absolute bottom-0 left-0 bg-[var(--action-slate)] border-t-2 border-r-2 border-[var(--border-charcoal)] px-3 py-1 text-[10px] font-bold text-white tracking-wider">
                    主视角
                  </div>
                )}
              </div>
            ) : (
              <div 
                key={slot.id} 
                onClick={() => triggerUpload(index)}
                className="aspect-square dashed-slot flex flex-col items-center justify-center cursor-pointer hover:bg-[var(--accent-beige)] transition-colors relative active:bg-white border-[var(--border-charcoal)]/50"
              >
                <Camera className="w-10 h-10 mb-2 text-[var(--text-charcoal)] opacity-60" strokeWidth={1.5} />
                <span className="text-xs font-bold uppercase text-[var(--text-charcoal)] opacity-80">{slot.label}</span>
              </div>
            )
          ))}
        </div>

        <div className="mt-auto bg-white border-2 border-[var(--border-charcoal)] p-6 shadow-[6px_6px_0px_var(--border-charcoal)] relative">
          <div className="flex items-center justify-between mb-8">
            <div className="flex flex-col">
              <span className="font-bold text-lg text-[var(--text-charcoal)]">开启动漫化预览</span>
              <span className="text-xs font-medium text-[var(--text-charcoal)]/60 mt-1">生成前查看 AI 预览效果</span>
            </div>
            <label className="neo-toggle-wrapper">
              <input 
                type="checkbox" 
                className="neo-toggle-input" 
                checked={enableAnimePreview}
                onChange={(e) => setEnableAnimePreview(e.target.checked)}
              />
              <span className="neo-toggle-slider"></span>
            </label>
          </div>

          <button 
            onClick={handleContinue}
            disabled={!canSubmit || isUploading}
            className="w-full h-14 bg-[var(--action-slate)] text-white text-lg font-bold tracking-widest uppercase border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] flex items-center justify-center gap-3 active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all hover:bg-[#5f6f7f] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0px_var(--border-charcoal)]"
          >
            {isUploading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : <Sparkles className="w-6 h-6" />}
            {isUploading ? '正在上传...' : (enableAnimePreview ? '查看动漫化预览' : '直接启动重塑')}
          </button>
          
          <div className="text-center mt-4">
            <p className="text-[10px] font-bold text-[var(--text-charcoal)]/40 uppercase tracking-widest">
              已选 {validPhotoCount} 张照片 | 预计消耗: 0.3 元 / 次
            </p>
          </div>
        </div>
      </main>

      {/* Decorative elements */}
      <div className="fixed top-32 right-[-40px] w-32 h-32 bg-[var(--accent-beige)] border-2 border-[var(--border-charcoal)] rotate-12 z-0 opacity-50"></div>
      <div className="fixed bottom-[30%] left-[-20px] w-16 h-16 bg-[#D4D4D8] border-2 border-[var(--border-charcoal)] -rotate-6 z-0 opacity-60"></div>
    </div>
  );
}
