import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PhotoPreprocessor from '../components/PhotoPreprocessor';
import type { DraftPhoto, PhotoEdit } from '../components/PhotoPreprocessor';
import type { PreparedImage } from '../services/imagePreprocessing';
import { uploadPhotos } from '../services/uploadService';

export default function Preprocess() {
  const location = useLocation();
  const navigate = useNavigate();
  const photos = (location.state as { draftPhotos?: DraftPhoto[] } | null)?.draftPhotos;
  const [results, setResults] = useState<Record<string, PreparedImage | null>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, PhotoEdit>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const submittingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!photos?.length) navigate('/upload', { replace: true });
  }, [photos, navigate]);
  const onReady = useCallback((id: string, result: PreparedImage | null) => {
    setResults(previous => ({ ...previous, [id]: result }));
  }, []);
  const onBusy = useCallback((id: string, value: boolean) => {
    setBusy(previous => ({ ...previous, [id]: value }));
  }, []);
  const onEdit = useCallback((id: string, edit: PhotoEdit) => {
    setEdits(previous => ({ ...previous, [id]: edit }));
  }, []);
  if (!photos?.length) return null;
  const ready = photos.every(photo => results[photo.id]) && !Object.values(busy).some(Boolean);

  async function submit() {
    if (!ready || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await uploadPhotos(photos.map(photo => ({
        preparedImage: results[photo.id]!, view: photo.view,
      })), false, photos.length === 1 ? 'single' : 'multiview');
      if (!mounted.current) return;
      if (!result.success || !result.taskId) throw new Error(result.error || '提交失败，请重试');
      navigate('/processing', { state: { taskId: result.taskId,
        estimatedTime: result.estimatedTime, photoCount: photos.length } });
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : '提交失败，请重试');
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return <main className="min-h-screen bg-[var(--bg-sand)] p-4 sm:p-8">
    <div className="max-w-4xl mx-auto space-y-6">
      <button disabled={submitting} className="underline disabled:opacity-50"
        onClick={() => navigate('/upload', { state: {
          draftPhotos: photos.map(photo => ({ ...photo, edit: edits[photo.id] ?? photo.edit })),
        } })}>返回选择照片</button>
      <header>
        <h1 className="text-2xl font-bold mb-2">准备建模照片</h1>
        <p>核对方向与裁剪范围，可切换原图对照。确认处理结果后开始建模。</p>
      </header>
      {photos.map(photo => <PhotoPreprocessor key={photo.id} photo={photo}
        disabled={submitting} onReady={onReady} onBusy={onBusy} onEdit={onEdit} />)}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={!ready || submitting} onClick={submit}
        className="w-full bg-[var(--action-slate)] text-white p-4 font-bold border-2 border-black disabled:opacity-50">
        {submitting ? '正在提交…' : ready ? `确认 ${photos.length} 张照片并开始建模` : '等待图片处理完成'}
      </button>
    </div>
  </main>;
}
