import { useEffect, useRef, useState } from 'react';
import PhotoCropEditor from './PhotoCropEditor';
import { EMPTY_CROP, prepareImage } from '../services/imagePreprocessing';
import type { CropMargins, PreparedImage } from '../services/imagePreprocessing';
import { removePortraitBackground } from '../services/preprocessingApi';

export interface DraftPhoto {
  id: string;
  view: string;
  source: File | string;
  edit?: PhotoEdit;
}

export interface PhotoEdit {
  source: File | string;
  crop: CropMargins;
  rotation: number;
  removed: boolean;
}

interface Props {
  photo: DraftPhoto;
  disabled: boolean;
  onReady: (id: string, result: PreparedImage | null) => void;
  onBusy: (id: string, busy: boolean) => void;
  onEdit: (id: string, edit: PhotoEdit) => void;
}

export default function PhotoPreprocessor({ photo, disabled, onReady, onBusy, onEdit }: Props) {
  const [source, setSource] = useState(photo.edit?.source ?? photo.source);
  const [originalUrl, setOriginalUrl] = useState('');
  const [crop, setCrop] = useState<CropMargins>({ ...(photo.edit?.crop ?? EMPTY_CROP) });
  const [rotation, setRotation] = useState(photo.edit?.rotation ?? 0);
  const [preview, setPreview] = useState<PreparedImage | null>(null);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const cropButton = useRef<HTMLButtonElement>(null);
  const [removed, setRemoved] = useState(photo.edit?.removed ?? false);
  const revision = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    onEdit(photo.id, { source, crop, rotation, removed });
  }, [photo.id, source, crop, rotation, removed, onEdit]);

  useEffect(() => {
    mounted.current = true;
    const url = typeof photo.source === 'string'
      ? photo.source : URL.createObjectURL(photo.source);
    setOriginalUrl(url);
    return () => {
      mounted.current = false;
      revision.current++;
      if (typeof photo.source !== 'string') URL.revokeObjectURL(url);
    };
  }, [photo.source]);

  useEffect(() => {
    const current = ++revision.current;
    onReady(photo.id, null);
    setPreview(null);
    // 参数更新后只处理最新版本，旧的解码结果不能写回。
    const timer = window.setTimeout(() => {
      prepareImage(source, { crop, rotation }).then(result => {
        if (!mounted.current || current !== revision.current) return;
        setPreview(result);
        onReady(photo.id, result);
      }).catch(reason => {
        if (mounted.current && current === revision.current) {
          setError(reason instanceof Error ? reason.message : '图片处理失败');
        }
      });
    }, 120);
    return () => { clearTimeout(timer); revision.current++; };
  }, [source, crop, rotation, photo.id, onReady]);

  function invalidate() {
    revision.current++;
    setError('');
    setPreview(null);
    onReady(photo.id, null);
  }

  function reset() {
    invalidate();
    setSource(photo.source);
    setCrop({ ...EMPTY_CROP });
    setRotation(0);
    setRemoved(false);
    setShowOriginal(false);
  }

  function finishCrop(next?: CropMargins) {
    if (next) {
      invalidate();
      setCrop(next);
      setShowOriginal(false);
    }
    setCropping(false);
    onBusy(photo.id, false);
    requestAnimationFrame(() => cropButton.current?.focus());
  }

  async function removeBackground() {
    if (!preview || removing) return;
    setRemoving(true);
    onBusy(photo.id, true);
    setError('');
    const current = ++revision.current;
    try {
      const image = await removePortraitBackground(preview.dataUrl);
      // 先验证响应可解码；坏结果不能覆盖用户当前的有效图像。
      await prepareImage(image);
      if (!mounted.current || current !== revision.current) return;
      invalidate();
      setSource(image);
      setCrop({ ...EMPTY_CROP });
      setRotation(0);
      setRemoved(true);
    } catch (reason) {
      if (mounted.current && current === revision.current) {
        setError(`${reason instanceof Error ? reason.message : '抠图失败'}。当前图像已保留。`);
      }
    } finally {
      if (mounted.current) {
        setRemoving(false);
        onBusy(photo.id, false);
      }
    }
  }

  return (
    <section className="bg-white border-2 border-[var(--border-charcoal)] p-4 sm:p-6 space-y-4">
      <h2 className="text-lg font-bold">{photo.view}</h2>
      {cropping ? <PhotoCropEditor source={source} rotation={rotation} crop={crop}
        onApply={finishCrop} onCancel={() => finishCrop()} /> : <>
        <div className="inline-flex rounded-lg bg-stone-100 p-1" aria-label="照片对照">
          <button type="button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}
            className={`rounded-md px-4 py-2 text-sm ${!showOriginal ? 'bg-white shadow-sm font-bold' : ''}`}>
            处理结果
          </button>
          <button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}
            className={`rounded-md px-4 py-2 text-sm ${showOriginal ? 'bg-white shadow-sm font-bold' : ''}`}>
            查看原图
          </button>
        </div>
        <figure hidden={!showOriginal}>
          <figcaption className="text-sm mb-2">原图</figcaption>
          <img src={originalUrl || undefined} alt={`${photo.view}原图`}
            className="w-full max-h-[65vh] object-contain rounded-lg bg-stone-100" />
        </figure>
        <figure hidden={showOriginal} aria-busy={!preview || removing}>
          <figcaption className="text-sm mb-2">建模输入 · {removed ? '已抠图／白底' : '保留背景'}</figcaption>
          {preview ? <img src={preview.dataUrl} alt={`${photo.view}处理结果`}
            className="w-full max-h-[65vh] object-contain rounded-lg bg-stone-100" />
            : <div className="h-64 grid place-items-center bg-stone-100 text-sm">
              {error ? '请调整图片或返回重选' : '正在处理…'}
            </div>}
        </figure>
        <fieldset disabled={disabled || removing} className="flex flex-wrap gap-3">
          <legend className="sr-only">照片编辑</legend>
          <button ref={cropButton} type="button" disabled={!preview}
            className="rounded-lg border px-4 py-3 disabled:opacity-50" onClick={() => {
              setCropping(true); onBusy(photo.id, true);
            }}>裁剪照片</button>
          <button type="button" className="rounded-lg border px-4 py-3" onClick={() => {
            invalidate(); setRotation(value => (value + 1) % 4); setCrop({ ...EMPTY_CROP });
            setShowOriginal(false);
          }}>顺时针旋转 90°</button>
          <button type="button" className="rounded-lg border px-4 py-3" onClick={reset}>恢复原图</button>
          <button type="button" className="rounded-lg border px-4 py-3 disabled:opacity-50"
            disabled={!preview || removed} onClick={removeBackground}>
            {removing ? '正在抠图…' : removed ? '已移除背景' : '移除背景'}
          </button>
        </fieldset>
      </>}
      <p className="text-xs text-stone-600">移除背景会将当前图片发送到云端抠图服务，按该服务额度计费。</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {preview && <div aria-live="polite" className="text-sm text-stone-600">
        <p>{preview.width} × {preview.height} 像素 · {Math.ceil(preview.bytes / 1024)} KB</p>
        {preview.warnings.map(warning => <p key={warning} className="text-amber-800">{warning}</p>)}
      </div>}
    </section>
  );
}
