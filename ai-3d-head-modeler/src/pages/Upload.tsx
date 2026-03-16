import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X, Camera, CloudUpload } from 'lucide-react';

export default function Upload() {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const slots = [
    { id: 0, label: '主视角' },
    { id: 1, label: '侧面照' },
    { id: 2, label: '仰视照' },
    { id: 3, label: '其他角度' },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && activeSlot !== null) {
      let currentSlot = activeSlot;
      const filesArray = Array.from(files);

      filesArray.forEach((file) => {
        if (currentSlot < 4) {
          const slotToFill = currentSlot;
          const reader = new FileReader();
          reader.onloadend = () => {
            setPhotos((prev) => {
              const newPhotos = [...prev];
              newPhotos[slotToFill] = reader.result as string;
              return newPhotos;
            });
          };
          reader.readAsDataURL(file);
          currentSlot++;
        }
      });
    }
    // Reset file input so the same file can be selected again if needed
    if (e.target) {
      e.target.value = '';
    }
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
          <p className="text-sm font-medium text-[var(--text-charcoal)]/80">请上传至少 3 张不同角度的照片 (正脸、侧脸、仰视)。</p>
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
                <button 
                  onClick={(e) => removePhoto(index, e)}
                  className="absolute top-2 right-2 bg-white w-6 h-6 flex items-center justify-center border-2 border-[var(--border-charcoal)] text-[var(--text-charcoal)] hover:bg-gray-100"
                >
                  <X className="w-4 h-4 font-bold" strokeWidth={3} />
                </button>
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col">
              <span className="font-bold text-lg text-[var(--text-charcoal)]">开启背景抠图</span>
              <span className="text-xs font-medium text-[var(--text-charcoal)]/60 mt-1">自动去除杂乱背景</span>
            </div>
            <label className="neo-toggle-wrapper">
              <input type="checkbox" className="neo-toggle-input" defaultChecked />
              <span className="neo-toggle-slider"></span>
            </label>
          </div>

          <button 
            onClick={() => {
              // TODO: Replace with actual backend API call
              // Example:
              // const formData = new FormData();
              // formData.append('front', frontPhotoFile);
              // formData.append('side', sidePhotoFile);
              // await fetch('https://your-backend-api.com/upload', { method: 'POST', body: formData });
              navigate('/processing');
            }}
            className="w-full h-14 bg-[var(--action-slate)] text-white text-lg font-bold tracking-widest uppercase border-2 border-[var(--border-charcoal)] shadow-[4px_4px_0px_var(--border-charcoal)] flex items-center justify-center gap-3 active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all hover:bg-[#5f6f7f]"
          >
            <CloudUpload className="w-6 h-6" />
            开始上传生成
          </button>
          
          <div className="text-center mt-4">
            <p className="text-[10px] font-bold text-[var(--text-charcoal)]/40 uppercase tracking-widest">预计消耗: 0.3 元 / 次</p>
          </div>
        </div>
      </main>

      {/* Decorative elements */}
      <div className="fixed top-32 right-[-40px] w-32 h-32 bg-[var(--accent-beige)] border-2 border-[var(--border-charcoal)] rotate-12 z-0 opacity-50"></div>
      <div className="fixed bottom-[30%] left-[-20px] w-16 h-16 bg-[#D4D4D8] border-2 border-[var(--border-charcoal)] -rotate-6 z-0 opacity-60"></div>
    </div>
  );
}
