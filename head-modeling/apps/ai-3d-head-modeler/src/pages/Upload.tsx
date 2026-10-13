import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DraftPhoto } from '../components/PhotoPreprocessor';

const views = ['正面照', '左侧照', '右侧照', '其他角度'];

function Thumbnail({ photo }: { photo: DraftPhoto }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const imageUrl = typeof photo.source === 'string'
      ? photo.source : URL.createObjectURL(photo.source);
    setUrl(imageUrl);
    return () => {
      if (typeof photo.source !== 'string') URL.revokeObjectURL(imageUrl);
    };
  }, [photo.source]);
  return <img src={url || undefined} alt={photo.view} className="w-full h-48 object-contain" />;
}

export default function Upload() {
  const navigate = useNavigate();
  const location = useLocation();
  const [photos, setPhotos] = useState<(DraftPhoto | null)[]>(() => {
    const previous = (location.state as { draftPhotos?: DraftPhoto[] } | null)?.draftPhotos ?? [];
    return views.map(view => previous.find(photo => photo.view === view) ?? null);
  });
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const activeSlot = useRef(0);
  const validPhotos = photos.filter((photo): photo is DraftPhoto => photo !== null);

  function select(index: number) {
    activeSlot.current = index;
    fileInput.current?.click();
  }

  function receiveFiles(files: FileList | null) {
    setError('');
    if (!files?.length) return;
    const selected = Array.from(files);
    if (selected.length > views.length - activeSlot.current) {
      setError('最多选择四张照片，请减少本次选择数量');
      return;
    }
    if (selected.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setError('请选择 JPEG、PNG 或 WebP 图片；HEIC 照片请先转换格式');
      return;
    }
    if (selected.some(file => !file.size || file.size > 20 * 1024 * 1024)) {
      setError('单张图片须大于 0 字节且不超过 20 MB');
      return;
    }
    const start = activeSlot.current;
    setPhotos(previous => {
      const next = [...previous];
      selected.forEach((file, offset) => {
        next[start + offset] = { id: crypto.randomUUID(), source: file, view: views[start + offset] };
      });
      return next;
    });
  }

  function move(index: number, target: number) {
    setPhotos(previous => {
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((photo, slot) => photo ? { ...photo, view: views[slot] } : null);
    });
  }

  return <main className="min-h-screen bg-[var(--bg-sand)] p-4 sm:p-8">
    <div className="max-w-3xl mx-auto space-y-6">
      <button className="underline" onClick={() => navigate('/')}>返回拍摄指引</button>
      <header>
        <h1 className="text-3xl font-bold mb-3">上传建模照片</h1>
        <p>先选择正面照，再按需补充侧面。保持同一个人的发型、表情和光线一致。</p>
        <p className="text-sm text-stone-600 mt-2">支持 JPEG、PNG、WebP，每张最多 20 MB。下一步可旋转、裁剪和移除背景。</p>
      </header>
      <input ref={fileInput} type="file" className="hidden"
        accept="image/jpeg,image/png,image/webp" multiple onChange={event => {
          receiveFiles(event.target.files); event.target.value = '';
        }} />
      <div className="grid grid-cols-2 gap-4">
        {views.map((view, index) => <section key={view}
          className="bg-white border-2 border-[var(--border-charcoal)] p-3 space-y-3">
          <h2 className="font-bold">{view}{index === 0 ? '（必选）' : '（可选）'}</h2>
          <button type="button" aria-label={`选择${view}`} className="w-full" onClick={() => select(index)}>
            {photos[index] ? <Thumbnail photo={photos[index]!} />
              : <div className="h-48 grid place-items-center border border-dashed">＋ 选择照片</div>}
          </button>
          {photos[index] && <div className="flex flex-wrap gap-3 text-sm">
            <button aria-label={`删除${view}`} className="underline" onClick={() => {
              setPhotos(previous => previous.map((photo, slot) => slot === index ? null : photo));
            }}>删除</button>
            {index > 0 && <button className="underline" onClick={() => move(index, index - 1)}>前移</button>}
            {index < 3 && <button className="underline" onClick={() => move(index, index + 1)}>后移</button>}
          </div>}
        </section>)}
      </div>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <p className="text-sm">已选 {validPhotos.length} 张。此步骤只准备照片，确认预处理结果后才提交建模。</p>
      <button disabled={!photos[0]} className="w-full bg-[var(--action-slate)] text-white p-4 font-bold disabled:opacity-50"
        onClick={() => navigate('/preprocess', { state: { draftPhotos: validPhotos } })}>
        检查与处理照片
      </button>
    </div>
  </main>;
}
