import { useEffect, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import type { PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { prepareImage } from '../services/imagePreprocessing';
import type { CropMargins, PreparedImage } from '../services/imagePreprocessing';

interface Props {
  source: File | string;
  rotation: number;
  crop: CropMargins;
  onApply: (crop: CropMargins) => void;
  onCancel: () => void;
}

const ratios = [
  { label: '自由比例', value: undefined },
  { label: '正方形', value: 1 },
  { label: '3:4', value: 3 / 4 },
];

export default function PhotoCropEditor({ source, rotation, crop, onApply, onCancel }: Props) {
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [error, setError] = useState('');
  const [aspect, setAspect] = useState<number | undefined>();
  const [selection, setSelection] = useState<PercentCrop>({ unit: '%',
    x: crop.left, y: crop.top, width: 100 - crop.left - crop.right,
    height: 100 - crop.top - crop.bottom });

  useEffect(() => {
    let active = true;
    // 编辑器显示旋转后的完整处理基图，重复裁剪仍可向外扩展选区。
    prepareImage(source, { rotation }).then(result => {
      if (active) setImage(result);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : '无法加载裁剪图片');
    });
    return () => { active = false; };
  }, [source, rotation]);

  function changeAspect(value: number | undefined) {
    setAspect(value);
    if (value && image) {
      setSelection(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, value,
        image.width, image.height), image.width, image.height));
    }
  }

  function apply() {
    if (!image || selection.width <= 0 || selection.height <= 0) return;
    onApply({ left: selection.x, top: selection.y,
      right: Math.max(0, 100 - selection.x - selection.width),
      bottom: Math.max(0, 100 - selection.y - selection.height) });
  }

  return <div role="group" aria-label="裁剪照片" className="space-y-4"
    onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onCancel(); }
    }}>
    <div>
      <h3 className="font-bold">裁剪照片</h3>
      <p className="mt-1 text-sm text-stone-600">拖动边框调整范围，拖动框内移动选区。保留完整头发、耳朵和下巴。</p>
    </div>
    <div className="flex gap-2" aria-label="裁剪比例">
      {ratios.map(ratio => <button key={ratio.label} type="button" disabled={!image}
        aria-pressed={aspect === ratio.value} onClick={() => changeAspect(ratio.value)}
        className={`rounded-lg border px-4 py-2 text-sm ${aspect === ratio.value
          ? 'bg-[var(--action-slate)] text-white border-transparent' : 'bg-white'}`}>
        {ratio.label}
      </button>)}
    </div>
    <div className="flex justify-center rounded-lg bg-stone-900 p-3 overflow-hidden">
      {image ? <ReactCrop crop={selection} aspect={aspect} keepSelection ruleOfThirds
        minWidth={24} minHeight={24} onChange={(_, percent) => setSelection(percent)}
        ariaLabels={{ cropArea: '移动裁剪选区', nwDragHandle: '调整左上角',
          nDragHandle: '调整上边', neDragHandle: '调整右上角', eDragHandle: '调整右边',
          seDragHandle: '调整右下角', sDragHandle: '调整下边', swDragHandle: '调整左下角',
          wDragHandle: '调整左边' }}>
        <img src={image.dataUrl} alt="裁剪操作图" draggable={false}
          style={{ maxHeight: '65vh', maxWidth: '100%', width: 'auto', display: 'block' }} />
      </ReactCrop> : <p className="p-12 text-white">{error || '正在加载图片…'}</p>}
    </div>
    <div className="flex justify-end gap-3">
      <button type="button" className="rounded-lg border px-5 py-3" onClick={onCancel}>取消裁剪</button>
      <button type="button" disabled={!image || selection.width <= 0 || selection.height <= 0}
        className="rounded-lg bg-[var(--action-slate)] text-white px-5 py-3 disabled:opacity-50"
        onClick={apply}>应用裁剪</button>
    </div>
  </div>;
}
