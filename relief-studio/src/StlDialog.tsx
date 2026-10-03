import { useState } from 'react';
import type { Project, StlOptions } from './types';

export function StlDialog({
  project,
  busy,
  error,
  onCancel,
  onExport,
}: {
  project: Project;
  busy: boolean;
  error: string;
  onCancel(): void;
  onExport(options: StlOptions): void;
}) {
  const [layer, setLayer] = useState('0.1');
  const [base, setBase] = useState('1');
  const [repair, setRepair] = useState(false);
  const [withBase, setWithBase] = useState(true);
  const thickness = Number(layer),
    bottom = withBase ? Number(base) : 0;
  const used = new Set(project.labels);
  const max = Math.max(0, ...project.regions.filter((r) => used.has(r.id)).map((r) => r.layers));
  const valid =
    layer.trim() !== '' &&
    Number.isFinite(thickness) &&
    thickness >= 0.001 &&
    thickness <= 10 &&
    (!withBase || base.trim() !== '') &&
    Number.isFinite(bottom) &&
    bottom >= (withBase ? 0.01 : 0) &&
    bottom <= 100 &&
    (max > 0 || bottom > 0);
  return (
    <div className="modal-backdrop">
      <form
        className="confirm-dialog stl-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="导出 STL"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && !busy)
            onExport({
              layerHeightMm: thickness,
              baseThicknessMm: bottom,
              repairDiagonalContacts: repair,
            });
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onCancel();
          if (event.key === 'Tab') {
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'input:not(:disabled), button:not(:disabled), summary',
              ),
            ).filter((element) => element.getClientRects().length);
            const first = controls[0],
              last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <h2>导出 STL 模型</h2>
        <p>成品尺寸 {project.sizeMm.join(' × ')} mm。模型使用毫米尺寸，不包含颜色。</p>
        <label className="stack-field">
          每层厚度（mm）
          <input
            autoFocus
            aria-label="STL 每层厚度"
            type="number"
            min="0.001"
            max="10"
            step="any"
            required
            value={layer}
            disabled={busy}
            onChange={(e) => setLayer(e.target.value)}
          />
        </label>
        <small>示例值为 0.1 mm，请按需要填写；不会使用三维预览的夸张比例。</small>
        <label className="base-toggle">
          <input
            type="checkbox"
            checked={withBase}
            disabled={busy}
            onChange={(e) => setWithBase(e.target.checked)}
          />
          添加矩形底板
        </label>
        {withBase && (
          <label className="stack-field">
            底板厚度（mm）
            <input
              aria-label="STL 底板厚度"
              type="number"
              min="0.01"
              max="100"
              step="any"
              required
              value={base}
              disabled={busy}
              onChange={(e) => setBase(e.target.value)}
            />
          </label>
        )}
        <p>
          {withBase
            ? '底板覆盖完整矩形画幅；清除区域不生成凸起。'
            : '只输出有高度的图案；零层与清除区域不生成实体。'}
        </p>
        <details>
          <summary>模型修复选项</summary>
          <label className="base-toggle">
            <input
              type="checkbox"
              checked={repair}
              disabled={busy}
              onChange={(event) => setRepair(event.target.checked)}
            />
            修复像素角点连接
          </label>
          <small>
            仅在 STL 中补齐极小的连接缺口，可能增加局部材料；原工程不变。遇到角点连接错误时可开启。
          </small>
        </details>
        <p>最高处：{valid ? `${(bottom + max * thickness).toFixed(3)} mm` : '请填写有效厚度'}</p>
        {error && (
          <p className="stl-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <button type="button" disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="primary" disabled={!valid || busy}>
            {busy ? '导出中…' : '选择位置并导出'}
          </button>
        </div>
      </form>
    </div>
  );
}
