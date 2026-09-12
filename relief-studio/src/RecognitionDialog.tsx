import { useEffect, useRef, useState } from 'react';
import type { Project } from './types';
import { loadImage } from './image';
import { NumberField } from './Fields';
import { combineSubjectMask } from './subject-mask';
import { connectedSelection } from './model';

interface Props {
  image: string;
  name: string;
  sizeMm: [number, number];
  validMask?: number[];
  replacing: boolean;
  onCancel(): void;
  onApply(project: Project): void;
}
export function RecognitionDialog(props: Props) {
  const [route, setRoute] = useState<'color' | 'subject'>('color');
  const [automatic, setAutomatic] = useState(true),
    [count, setCount] = useState(3),
    [tolerance, setTolerance] = useState(12);
  const [height, setHeight] = useState(10),
    [preview, setPreview] = useState<Project | null>(null);
  const [subject, setSubject] = useState<Uint8Array | null>(null);
  const [background, setBackground] = useState<Uint8Array | null>(null);
  const [markBackground, setMarkBackground] = useState(false);
  const [history, setHistory] = useState<(Uint8Array | null)[]>([]);
  const [brushSize, setBrushSize] = useState(8);
  const [showOriginal, setShowOriginal] = useState(false);
  const [tool, setTool] = useState<'keep' | 'remove' | 'brush' | 'erase' | 'box'>('keep');
  const boxStart = useRef<number[] | null>(null);
  const [status, setStatus] = useState('选择识别方式后生成预览'),
    [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false),
    [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    source = useRef<ImageData | null>(null);
  const version = useRef(0),
    alive = useRef(true),
    stroke = useRef<Uint8Array | null>(null);

  useEffect(() => {
    alive.current = true;
    void window.relief?.subjectStatus().then((value) => {
      if (alive.current) setInstalled(value.installed);
    });
    void loadImage(props.image).then((image) => {
      if (!alive.current) return;
      const c = canvas.current!;
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      source.current = ctx.getImageData(0, 0, c.width, c.height);
      setReady(true);
    });
    return () => {
      alive.current = false;
      version.current++;
      void window.relief?.cancelSubject();
      void window.relief?.cancelSegment();
    };
  }, [props.image]);
  const valid = (index: number) =>
    !!source.current?.data[index * 4 + 3] && (!props.validMask || !!props.validMask[index]);
  function currentMask() {
    return subject || new Uint8Array((source.current?.width || 0) * (source.current?.height || 0));
  }
  function updateSubject(mask: Uint8Array) {
    setHistory((previous) => [...previous.slice(-19), subject]);
    setSubject(mask);
    setShowOriginal(false);
  }
  function undoSubject() {
    if (!history.length || busy) return;
    setSubject(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setShowOriginal(false);
    setStatus('已撤销上一步主体修改');
  }
  function draw(mask?: Uint8Array) {
    if (!source.current) return;
    const data = new Uint8ClampedArray(source.current.data);
    if (mask)
      for (let i = 0; i < mask.length; i++)
        if (!mask[i] && valid(i)) {
          data[i * 4] = Math.round(data[i * 4] * 0.1 + 130 * 0.9);
          data[i * 4 + 1] = Math.round(data[i * 4 + 1] * 0.1 + 137 * 0.9);
          data[i * 4 + 2] = Math.round(data[i * 4 + 2] * 0.1 + 123 * 0.9);
        }
    for (let i = 0; i < data.length / 4; i++)
      if (!valid(i) || (route === 'color' && preview && background?.[i])) data[i * 4 + 3] = 0;
    canvas
      .current!.getContext('2d')!
      .putImageData(new ImageData(data, source.current.width, source.current.height), 0, 0);
  }
  useEffect(() => {
    draw(route === 'subject' && subject && !showOriginal ? subject : undefined);
  }, [ready, subject, showOriginal, route, background, preview]);
  useEffect(() => {
    setBackground(null);
    setMarkBackground(false);
  }, [preview]);
  function toggleBackground(x: number, y: number) {
    if (!preview || !markBackground) return;
    const start = y * preview.width + x;
    const indices = connectedSelection(preview.labels, preview.width, preview.height, start);
    if (!indices.length) return;
    const next = background?.slice() || new Uint8Array(preview.labels.length);
    const value = next[start] ? 0 : 1;
    for (const index of indices) next[index] = value;
    setBackground(next);
    setStatus(value ? '已排除相邻背景，再次点击可恢复' : '已恢复点击区域');
  }
  async function decode(mask: string) {
    const image = await loadImage(mask),
      c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d')!.drawImage(image, 0, 0);
    const bytes = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    return Uint8Array.from({ length: c.width * c.height }, (_, i) => (bytes[i * 4 + 3] ? 1 : 0));
  }
  async function run(action: (id: number) => Promise<void>) {
    if (busy) return;
    const id = ++version.current;
    setBusy(true);
    setStatus('正在识别…');
    try {
      await action(id);
    } catch (error) {
      if (alive.current && version.current === id)
        setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      if (alive.current && version.current === id) setBusy(false);
    }
  }
  function fresh(id: number) {
    return alive.current && version.current === id;
  }
  async function cancel() {
    version.current++;
    setStatus('正在停止…');
    await Promise.all([window.relief?.cancelSubject(), window.relief?.cancelSegment()]);
    if (alive.current) {
      setBusy(false);
      setStatus('识别已取消');
    }
  }
  async function close() {
    await cancel();
    props.onCancel();
  }
  async function generate() {
    await run(async (id) => {
      if (!window.relief) throw new Error('请使用桌面版生成识别预览');
      if (route === 'color') {
        const result = await window.relief.segment({
          image: props.image,
          name: props.name,
          sizeMm: props.sizeMm,
          colors: automatic ? 'auto' : count,
          tolerance,
          validMask: props.validMask,
        });
        if (fresh(id)) {
          setPreview(result);
          setStatus(`已识别 ${result.regions.length} 个区域，初始高度均为 0 层`);
        }
      } else {
        setStatus('正在提取主体并自动优化文字、轮廓与暗面…');
        const result = await window.relief.subject({
          id: String(id),
          action: 'propose',
          image: props.image,
          validMask: props.validMask,
        });
        if (!result.mask) throw new Error('模型未返回主体掩膜，请更新模型包');
        const mask = await decode(result.mask);
        if (fresh(id)) {
          updateSubject(mask);
          setStatus('主体提取与自动优化已完成');
        }
      }
    });
  }
  async function prompt(x: number, y: number) {
    await run(async (id) => {
      const operation = tool === 'remove' ? 'remove' : 'keep';
      const result = await window.relief!.subject({
        id: String(id),
        action: 'predict',
        image: props.image,
        validMask: props.validMask,
        points: [{ x, y, label: 1 }],
      });
      if (!result.mask) throw new Error('模型未返回局部选区');
      const patch = await decode(result.mask);
      if (fresh(id)) {
        updateSubject(combineSubjectMask(currentMask(), patch, operation));
        setStatus(`${operation === 'keep' ? '已补选' : '已排除'}点击区域 · 可撤销`);
      }
    });
  }
  function boxBounds(end: number[]): [number, number, number, number] {
    const start = boxStart.current!;
    return [
      Math.min(start[0], end[0]),
      Math.min(start[1], end[1]),
      Math.max(start[0], end[0]) + 1,
      Math.max(start[1], end[1]) + 1,
    ];
  }
  function drawBox(end: number[]) {
    draw(subject || undefined);
    const [left, top, right, bottom] = boxBounds(end);
    const ctx = canvas.current!.getContext('2d')!;
    const scale = canvas.current!.width / canvas.current!.getBoundingClientRect().width;
    ctx.save();
    ctx.fillStyle = 'rgba(193, 127, 59, 0.16)';
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 * scale;
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.strokeStyle = '#a66930';
    ctx.lineWidth = scale;
    ctx.setLineDash([6 * scale, 4 * scale]);
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.restore();
  }
  async function selectBox(box: [number, number, number, number]) {
    if (box[2] - box[0] < 8 || box[3] - box[1] < 8) {
      setStatus('请拖出至少 8 × 8 像素的框选范围');
      return;
    }
    await run(async (id) => {
      setStatus('正在识别框内图案…');
      const result = await window.relief!.subject({
        id: String(id),
        action: 'predict',
        image: props.image,
        validMask: props.validMask,
        box,
      });
      if (!result.mask) throw new Error('模型未返回框选结果');
      const patch = await decode(result.mask);
      if (fresh(id)) {
        if (!patch.some((v) => v)) {
          setStatus('框内未识别到主体，可缩小范围或使用画笔补选');
          return;
        }
        updateSubject(combineSubjectMask(currentMask(), patch, 'keep'));
        setStatus('已补选框内图案 · 可撤销');
      }
    });
  }
  function apply() {
    if (route === 'color' && preview) {
      const labels = preview.labels.map((id, i) => (background?.[i] ? 0 : id));
      if (!labels.some((id) => id)) {
        setStatus('请至少保留一个打印区域');
        return;
      }
      props.onApply({ ...preview, labels });
      return;
    }
    if (!source.current) return;
    const mask = currentMask();
    if (!mask.some((v) => v)) {
      setStatus('请先选择主体');
      return;
    }
    props.onApply({
      version: 1,
      image: props.image,
      name: props.name,
      sizeMm: props.sizeMm,
      width: source.current.width,
      height: source.current.height,
      labels: Array.from(mask, (v, i) => (valid(i) ? (v ? 2 : 1) : 0)),
      regions: [
        { id: 1, name: '平面背景', color: '#82897b', layers: 0 },
        { id: 2, name: '浮雕主体', color: '#d9b477', layers: height },
      ],
    });
  }
  function point(event: React.PointerEvent) {
    const box = canvas.current!.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(
          canvas.current!.width - 1,
          Math.floor(((event.clientX - box.left) / box.width) * canvas.current!.width),
        ),
      ),
      Math.max(
        0,
        Math.min(
          canvas.current!.height - 1,
          Math.floor(((event.clientY - box.top) / box.height) * canvas.current!.height),
        ),
      ),
    ];
  }
  const last = useRef<number[] | null>(null);
  function paint(p: number[]) {
    if (!stroke.current || !source.current) return;
    const from = last.current || p;
    const steps = Math.max(1, Math.ceil(Math.hypot(p[0] - from[0], p[1] - from[1])));
    for (let n = 0; n <= steps; n++) {
      const cx = from[0] + ((p[0] - from[0]) * n) / steps,
        cy = from[1] + ((p[1] - from[1]) * n) / steps;
      for (
        let y = Math.max(0, Math.floor(cy - brushSize));
        y < Math.min(source.current.height, cy + brushSize + 1);
        y++
      )
        for (
          let x = Math.max(0, Math.floor(cx - brushSize));
          x < Math.min(source.current.width, cx + brushSize + 1);
          x++
        ) {
          const i = y * source.current.width + x;
          if (valid(i) && (x - cx) ** 2 + (y - cy) ** 2 <= brushSize ** 2)
            stroke.current[i] = tool === 'brush' ? 1 : 0;
        }
    }
    last.current = p;
    draw(stroke.current);
  }
  return (
    <div className="modal-backdrop">
      <section className="recognition-dialog" role="dialog" aria-modal="true" aria-label="识别区域">
        <header>
          <h2>识别区域</h2>
          <button onClick={close}>取消</button>
        </header>
        <div className="recognition-body">
          <aside>
            <div className="view-tabs">
              <button
                disabled={busy}
                className={route === 'color' ? 'active' : ''}
                onClick={() => setRoute('color')}
              >
                自动分色
              </button>
              <button
                disabled={busy}
                className={route === 'subject' ? 'active' : ''}
                onClick={() => setRoute('subject')}
              >
                主体提取
              </button>
            </div>
            {route === 'color' ? (
              <>
                <label className="field-row">
                  自动识别数量
                  <input
                    type="checkbox"
                    checked={automatic}
                    disabled={busy}
                    onChange={(e) => {
                      setAutomatic(e.target.checked);
                      setPreview(null);
                    }}
                  />
                </label>
                {!automatic && (
                  <label className="stack-field">
                    分区数量
                    <NumberField
                      label="识别分区数量"
                      value={count}
                      min={1}
                      max={12}
                      disabled={busy}
                      onCommit={(v) => {
                        setCount(v);
                        setPreview(null);
                      }}
                    />
                  </label>
                )}
                <label className="stack-field">
                  颜色容差
                  <NumberField
                    label="颜色容差"
                    value={tolerance}
                    min={1}
                    max={50}
                    disabled={busy}
                    onCommit={(v) => {
                      setTolerance(v);
                      setPreview(null);
                    }}
                  />
                </label>
                {preview && (
                  <div>
                    <button
                      className="full-button"
                      disabled={busy}
                      aria-pressed={markBackground}
                      onClick={() => setMarkBackground(!markBackground)}
                    >
                      标记背景
                    </button>
                    <p className="muted">
                      {markBackground
                        ? '点击相邻的同色背景，再次点击恢复'
                        : '标记背景后，该区域不参与打印'}
                    </p>
                    {background?.some((v) => v) && (
                      <button
                        className="full-button"
                        disabled={busy}
                        onClick={() => setBackground(null)}
                      >
                        恢复全部背景
                      </button>
                    )}
                  </div>
                )}
                {preview && (
                  <div className="recognition-colors">
                    {preview.regions.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          draw(Uint8Array.from(preview.labels, (id) => (id === r.id ? 1 : 0)));
                        }}
                      >
                        <span className="swatch" style={{ background: r.color }} />
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="muted">{installed ? '本地 GPU 模型' : '未安装 GPU 模型包'}</p>
                <label className="stack-field">
                  主体堆叠层数
                  <NumberField label="主体堆叠层数" value={height} onCommit={setHeight} />
                </label>
                <div className="recognition-tools">
                  {(
                    [
                      ['keep', '点击补选'],
                      ['remove', '点击排除'],
                      ['box', '框选补选'],
                      ['brush', '画笔修边'],
                      ['erase', '擦除修边'],
                    ] as const
                  ).map(([id, name]) => (
                    <button
                      key={id}
                      disabled={
                        busy ||
                        !ready ||
                        ((id === 'keep' || id === 'remove' || id === 'box') && !installed)
                      }
                      aria-pressed={tool === id}
                      onClick={() => setTool(id)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <p className="muted">
                  {tool === 'keep'
                    ? '点击需要加入主体的图案'
                    : tool === 'box'
                      ? '拖框圈出需要补选的图案，松开后识别'
                      : tool === 'remove'
                        ? '点击需要排除的图案'
                        : '拖动画笔修改主体边缘'}
                </p>
                {(tool === 'brush' || tool === 'erase') && (
                  <label className="stack-field">
                    画笔半径 · {brushSize} px
                    <input
                      aria-label="主体画笔半径"
                      type="range"
                      min="1"
                      max="40"
                      value={brushSize}
                      disabled={busy}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                    />
                  </label>
                )}
                <button
                  className="full-button"
                  disabled={busy || !history.length}
                  onClick={undoSubject}
                >
                  撤销主体修改
                </button>
                <button
                  className="full-button"
                  disabled={busy || !subject}
                  aria-pressed={showOriginal}
                  onClick={() => setShowOriginal(!showOriginal)}
                >
                  {showOriginal ? '查看主体' : '对照原图'}
                </button>
              </>
            )}
            <button
              className="primary full-button"
              disabled={!ready || busy || (route === 'subject' && !installed)}
              onClick={generate}
            >
              生成预览
            </button>
            {busy && (
              <button className="full-button" onClick={cancel}>
                停止识别
              </button>
            )}
          </aside>
          <div className="recognition-stage checker">
            <canvas
              ref={canvas}
              aria-label="识别预览画布"
              onPointerDown={(e) => {
                if (busy || !ready) return;
                const p = point(e);
                if (route === 'color') {
                  toggleBackground(p[0], p[1]);
                  return;
                }
                if (tool === 'keep' || tool === 'remove') {
                  void prompt(p[0], p[1]);
                  return;
                }
                if (tool === 'box') {
                  if (!installed) return;
                  setShowOriginal(false);
                  boxStart.current = p;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drawBox(p);
                  return;
                }
                setShowOriginal(false);
                stroke.current = currentMask().slice();
                last.current = null;
                e.currentTarget.setPointerCapture(e.pointerId);
                paint(p);
              }}
              onPointerMove={(e) => {
                if (boxStart.current) drawBox(point(e));
                if (stroke.current) paint(point(e));
              }}
              onPointerUp={(e) => {
                if (boxStart.current) {
                  const box = boxBounds(point(e));
                  boxStart.current = null;
                  draw(subject || undefined);
                  void selectBox(box);
                  return;
                }
                if (stroke.current) updateSubject(stroke.current);
                stroke.current = null;
                last.current = null;
              }}
              onPointerCancel={() => {
                boxStart.current = null;
                stroke.current = null;
                last.current = null;
                draw(subject || undefined);
              }}
            />
          </div>
        </div>
        <footer>
          <p role="status">{status}</p>
          {props.replacing && <p>应用后将替换当前区域与高度，可撤销。</p>}
          <button
            className="primary"
            disabled={
              busy || !ready || (route === 'color' && !preview) || (route === 'subject' && !subject)
            }
            onClick={apply}
          >
            应用识别结果
          </button>
        </footer>
      </section>
    </div>
  );
}
