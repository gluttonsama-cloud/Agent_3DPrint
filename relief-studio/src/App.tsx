import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Region } from './types';
import { RecognitionDialog } from './RecognitionDialog';
import './recognition.css';
import { CropDialog } from './CropDialog';
import { EditorCanvas, type Tool } from './EditorCanvas';
import { ReliefPreview } from './ReliefPreview';
import { NameField, NumberField } from './Fields';
import { mergeRegions, nextRegionId, projectStats } from './model';
import { regionSelection, type SelectionOperation } from './selection';
import { trimRegion } from './trim';
import { StlDialog } from './StlDialog';
import { loadImage, readRaster } from './image';

function bridge() {
  if (!window.relief) throw new Error('此操作需要桌面版。请在 Relief Studio 中打开工程。');
  return window.relief;
}
const tools: { id: Tool; name: string; key: string; icon: string }[] = [
  { id: 'smart', name: '智能点选', key: 'S', icon: '✦' },
  { id: 'rectangle', name: '框选', key: 'R', icon: '□' },
  { id: 'lasso', name: '圈选', key: 'L', icon: '⬡' },
  { id: 'color', name: '同色选区', key: 'W', icon: '◉' },
  { id: 'connected', name: '连通选区', key: 'C', icon: '⌖' },
  { id: 'brush', name: '画笔', key: 'B', icon: '╱' },
  { id: 'erase', name: '擦除', key: 'E', icon: '▱' },
  { id: 'hand', name: '平移', key: 'H', icon: '✥' },
];

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [past, setPast] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([]);
  const saved = useRef<Project | null>(null);
  const [busy, setBusy] = useState(''),
    [notice, setNotice] = useState('就绪'),
    [error, setError] = useState('');
  const running = useRef(false);
  const [selected, setSelected] = useState(1),
    [tool, setTool] = useState<Tool>('smart');
  const [advanced, setAdvanced] = useState(false);
  const [snapEdges, setSnapEdges] = useState(true);
  const [tolerance, setTolerance] = useState(24);
  const [stl, setStl] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectionReset, setSelectionReset] = useState(0);
  const [selection, setSelection] = useState<number[]>([]),
    [operation, setOperation] = useState<SelectionOperation>('replace');
  const [radius, setRadius] = useState(5),
    [mode, setMode] = useState<'color' | 'regions' | 'layer'>('regions');
  const [view, setView] = useState<'edit' | 'preview'>('edit'),
    [zoom, setZoom] = useState(1);
  const [layer, setLayer] = useState(1),
    [target, setTarget] = useState(0);
  const [mergeTarget, setMergeTarget] = useState(0);
  const [crop, setCrop] = useState<{ image: string; name: string } | null>(null);
  const [recognition, setRecognition] = useState<{
    image: string;
    name: string;
    sizeMm: [number, number];
    validMask?: number[];
    replacing: boolean;
  } | null>(null);
  const [pending, setPending] = useState<null | (() => void)>(null);
  const [colorDraft, setColorDraft] = useState('#808080');
  const file = useRef<HTMLInputElement>(null);
  const dirty = !!project && project !== saved.current;
  const counts = useMemo(
    () => (project ? projectStats(project) : new Map<number, number>()),
    [project],
  );
  const region = project?.regions.find((item) => item.id === selected);
  const maxLayer = Math.max(
    0,
    ...(project?.regions
      .filter((item) => (counts.get(item.id) || 0) > 0)
      .map((item) => item.layers) || []),
  );
  const selectedCount = useMemo(
    () =>
      project ? selection.reduce((n, i) => n + (project.labels[i] === selected ? 1 : 0), 0) : 0,
    [project, selected, selection],
  );
  const currentLayer = Math.min(layer, Math.max(1, maxLayer));
  useEffect(() => setColorDraft(region?.color || '#808080'), [region?.id, region?.color]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  function edit(next: Project) {
    if (!project) return;
    const limit = Math.max(
      1,
      Math.min(20, Math.floor(32_000_000 / (project.width * project.height * 8))),
    );
    setPast((previous) => [...previous, project].slice(-limit));
    setFuture([]);
    setProject(next);
  }
  function updateRegion(change: Partial<Region>) {
    if (project && region)
      edit({
        ...project,
        regions: project.regions.map((item) =>
          item.id === selected ? { ...item, ...change } : item,
        ),
      });
  }
  function replace(next: Project, isNew = false) {
    saved.current = isNew ? null : next;
    setProject(next);
    setPast([]);
    setFuture([]);
    setSelection([]);
    setSelected(next.regions[0].id);
    setTarget(0);
    setMergeTarget(0);
    setView('edit');
    setZoom(1);
    setLayer(1);
    setTool('smart');
    setAdvanced(false);
    setOperation('replace');
  }
  async function run(label: string, action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(label);
    setError('');
    try {
      await action();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      running.current = false;
      setBusy('');
    }
  }
  function requestReplace(action: () => void) {
    if (dirty) setPending(() => action);
    else action();
  }
  function sample() {
    requestReplace(() => {
      void run('打开示例', async () => {
        const next: Project = window.relief
          ? await window.relief.sample()
          : await fetch('./sample-project.json').then((response) => {
              if (!response.ok) throw new Error('示例文件不存在。');
              return response.json();
            });
        replace(next);
        setNotice('示例已打开');
      });
    });
  }
  async function save() {
    if (!project) return;
    await run('保存工程', async () => {
      const result = await bridge().save(project);
      if (result) {
        saved.current = project;
        setNotice(`工程已保存：${result.path}`);
      }
    });
  }
  function open() {
    requestReplace(() => {
      void run('打开工程', async () => {
        const next = await bridge().open();
        if (next) {
          replace(next);
          setNotice('工程已恢复');
        }
      });
    });
  }
  function importFile(value: File) {
    requestReplace(() => {
      void run('读取图片', async () => {
        const result = await readRaster(value);
        setCrop({ image: result.image, name: value.name.replace(/\.[^.]+$/, '') });
        if (result.resized) setNotice('工作图已等比例缩至最长边 2048 px');
      });
    });
  }
  function finishCrop(image: string) {
    setRecognition({ image, name: crop?.name || '未命名', sizeMm: [55, 55], replacing: false });
    setCrop(null);
  }
  function undo() {
    if (!project || !past.length) return;
    const previous = past.at(-1)!;
    setFuture((items) => [project, ...items]);
    setProject(previous);
    setPast(past.slice(0, -1));
    setSelection([]);
    setSelectionReset((value) => value + 1);
    if (!previous.regions.some((item) => item.id === selected)) setSelected(previous.regions[0].id);
  }
  function redo() {
    if (!project || !future.length) return;
    setPast((items) => [...items, project]);
    setProject(future[0]);
    setFuture(future.slice(1));
    setSelection([]);
    setSelectionReset((value) => value + 1);
    if (!future[0].regions.some((item) => item.id === selected))
      setSelected(future[0].regions[0].id);
  }
  function selectRegion(id: number) {
    setSelectionReset((value) => value + 1);
    setSelected(id);
    setMode('regions');
    setView('edit');
    setTarget(0);
    setMergeTarget(0);
    if (project) setSelection(advanced ? regionSelection(project.labels, id) : []);
    if (!advanced) setOperation('replace');
  }
  function assign(targetId: number, newRegion = false) {
    if (!project || !selection.length) return;
    const labels = project.labels.slice();
    for (const index of selection) labels[index] = targetId;
    const regions = newRegion
      ? [
          ...project.regions,
          {
            id: targetId,
            name: `区域 ${targetId}`,
            color: region?.color || '#808080',
            layers: region?.layers || 0,
          },
        ]
      : project.regions;
    edit({ ...project, labels, regions });
    setSelected(targetId);
    setSelection([]);
    setTarget(0);
    setNotice('选区已分配');
  }
  function trimSelection(action: 'clear' | 'keep') {
    if (!project || !selectedCount || selecting) return;
    const next = trimRegion(project, selected, selection, action);
    if (next === project) {
      setNotice('当前层没有需要清除的像素');
      return;
    }
    edit(next);
    setSelection([]);
    setNotice(
      action === 'clear' ? '已清除当前层圈内部分 · 可撤销' : '当前层已只保留圈内部分 · 可撤销',
    );
  }
  function excludeSelection() {
    if (!project || !selection.length) return;
    const labels = project.labels.slice();
    for (const index of selection) labels[index] = 0;
    edit({ ...project, labels });
    setSelection([]);
    setNotice('已从打印范围排除选区');
  }
  async function recolor() {
    if (!project || !region) return;
    await run('应用颜色', async () => {
      const image = await loadImage(project.image),
        canvas = document.createElement('canvas');
      canvas.width = project.width;
      canvas.height = project.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rgb = [1, 3, 5].map((start) => parseInt(colorDraft.slice(start, start + 2), 16));
      project.labels.forEach((id, index) => {
        if (id === selected)
          rgb.forEach((value, c) => {
            pixels.data[index * 4 + c] = value;
          });
      });
      ctx.putImageData(pixels, 0, 0);
      edit({
        ...project,
        image: canvas.toDataURL('image/png'),
        regions: project.regions.map((item) =>
          item.id === selected ? { ...item, color: colorDraft } : item,
        ),
      });
      setNotice('区域颜色已更新');
    });
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (busy || crop || pending || recognition || stl) return;
      const element = event.target as HTMLElement;
      if (element.closest('input,select,textarea,[contenteditable="true"]')) return;
      const key = event.key.toLowerCase(),
        ctrl = event.ctrlKey || event.metaKey;
      if (ctrl && key === 's') {
        event.preventDefault();
        void save();
      } else if (ctrl && key === 'o') {
        event.preventDefault();
        open();
      } else if (ctrl && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (ctrl && key === 'y') {
        event.preventDefault();
        redo();
      } else if ((ctrl && key === 'd') || key === 'escape') {
        event.preventDefault();
        setSelection([]);
      } else if (key === 'delete') {
        event.preventDefault();
        if (advanced) excludeSelection();
        else trimSelection('clear');
      } else if (!ctrl) {
        const found = tools.find((item) => item.key.toLowerCase() === key);
        if (found) {
          setTool(found.id);
          if (!['smart', 'rectangle', 'lasso', 'hand'].includes(found.id)) setAdvanced(true);
          setMode('regions');
          setView('edit');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  const disabled = !!busy;
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-symbol" aria-hidden="true">
            ▱
          </span>
          <strong>Relief Studio</strong>
          <span className="brand-subtitle">浮雕制版</span>
        </div>
        <div className="header-actions">
          <button onClick={open} disabled={disabled} title="打开工程 Ctrl+O">
            打开工程
          </button>
          <button onClick={save} disabled={!project || disabled} title="保存工程 Ctrl+S">
            保存工程
          </button>
          <button
            disabled={!project || disabled}
            onClick={() => {
              setError('');
              setStl(true);
            }}
          >
            导出 STL
          </button>
          <button
            className="primary"
            disabled={!project || disabled}
            onClick={() =>
              run('导出文件', async () => {
                const result = await bridge().export(project!);
                if (result) setNotice(`分层文件已导出：${result.path}`);
              })
            }
          >
            导出分层
          </button>
        </div>
      </header>
      <div className="document-bar">
        <div className="document-name">
          <span className="file-icon">▤</span>
          <h1>{project?.name || '未打开工程'}</h1>
          <span className={`save-state ${dirty ? 'modified' : ''}`}>
            {project ? (dirty ? '未保存' : '已保存') : ''}
          </span>
        </div>
        {project && (
          <span className="document-meta">
            {project.width} × {project.height} px<span>·</span>
            {project.sizeMm.join(' × ')} mm
          </span>
        )}
      </div>
      <main className="workspace">
        <aside className="left-panel sidebar">
          <section className="sidebar-section">
            <h2>源图像</h2>
            <button
              className="full-button"
              disabled={disabled}
              onClick={() => file.current?.click()}
            >
              ＋ 导入图片
            </button>
            <input
              type="file"
              ref={file}
              accept="image/png,image/jpeg"
              hidden
              onChange={(event) => {
                const value = event.target.files?.[0];
                event.target.value = '';
                if (value) importFile(value);
              }}
            />
            <button
              className="full-button"
              disabled={disabled || !project}
              onClick={() =>
                project &&
                setRecognition({
                  image: project.image,
                  name: project.name,
                  sizeMm: project.sizeMm,
                  validMask: project.labels.map((id) => (id ? 1 : 0)),
                  replacing: true,
                })
              }
            >
              重新识别区域
            </button>
            <p className="empty-sidebar">导入后自动识别，可预览并调整</p>
            <button className="text-button" disabled={disabled} onClick={sample}>
              打开示例工程
            </button>
          </section>
          {project && (
            <section className="sidebar-section">
              <h2>
                成品尺寸 <small>mm</small>
              </h2>
              <div className="size-fields">
                {['宽度', '高度'].map((label, index) => (
                  <label key={label}>
                    {label}
                    <NumberField
                      label={label}
                      value={project.sizeMm[index]}
                      min={0.1}
                      max={10000}
                      step={0.1}
                      disabled={disabled}
                      onCommit={(value) => {
                        const size = [...project.sizeMm] as [number, number];
                        size[index] = value;
                        edit({ ...project, sizeMm: size });
                      }}
                    />
                  </label>
                ))}
              </div>
            </section>
          )}
          <section className="regions-section">
            <div className="section-heading">
              <h2>区域</h2>
              <span>{project?.regions.length || 0}</span>
            </div>
            <div className="region-list">
              {project ? (
                project.regions.map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={item.id === selected}
                    className={`region-card ${item.id === selected ? 'selected' : ''}`}
                    disabled={disabled}
                    onClick={() => selectRegion(item.id)}
                  >
                    <span className="swatch" style={{ background: item.color }} />
                    <span className="region-text">
                      <strong>{item.name}</strong>
                      <small>
                        {(((counts.get(item.id) || 0) / project.labels.length) * 100).toFixed(1)}%
                      </small>
                    </span>
                    <span className="region-height">
                      {item.layers}
                      <small> 层</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="empty-sidebar">导入图片后显示区域</p>
              )}
            </div>
            {project && (
              <div className="region-list-footer">
                <button
                  className="text-button"
                  disabled={disabled || project.regions.length >= 32}
                  onClick={() => {
                    const id = nextRegionId(project.regions);
                    edit({
                      ...project,
                      regions: [
                        ...project.regions,
                        { id, name: `区域 ${id}`, color: '#808080', layers: 0 },
                      ],
                    });
                    setSelected(id);
                    setSelection([]);
                  }}
                >
                  ＋ 新建区域
                </button>
                <span className="excluded-note">
                  非打印区 {(((counts.get(0) || 0) / project.labels.length) * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </section>
        </aside>
        <section className="center-panel">
          <div className="canvas-toolbar">
            <div className="view-tabs">
              <button
                className={view === 'edit' ? 'active' : ''}
                aria-pressed={view === 'edit'}
                onClick={() => setView('edit')}
              >
                平面编辑
              </button>
              <button
                className={view === 'preview' ? 'active' : ''}
                aria-pressed={view === 'preview'}
                disabled={!project}
                onClick={() => setView('preview')}
              >
                3D 浮雕
              </button>
            </div>
            <div className="history-buttons">
              <button
                aria-label="撤销"
                title="撤销 Ctrl+Z"
                disabled={!past.length || disabled}
                onClick={undo}
              >
                ↶
              </button>
              <button
                aria-label="重做"
                title="重做 Ctrl+Shift+Z"
                disabled={!future.length || disabled}
                onClick={redo}
              >
                ↷
              </button>
            </div>
          </div>
          {!project ? (
            <div className="empty-stage">
              <span className="empty-file-icon" aria-hidden="true">
                ▧
              </span>
              <h2>导入图片</h2>
              <p>选择 PNG 或 JPEG 文件开始制版</p>
              <button className="primary" onClick={() => file.current?.click()} disabled={disabled}>
                选择文件
              </button>
              <button className="text-button" onClick={sample} disabled={disabled}>
                打开 55 mm 徽标示例
              </button>
              <small>支持 PNG、JPEG · 最大 24 MB</small>
            </div>
          ) : view === 'preview' ? (
            <ReliefPreview project={project} />
          ) : (
            <>
              <div className="edit-tools">
                {tools
                  .filter(
                    (item) => advanced || ['smart', 'rectangle', 'lasso', 'hand'].includes(item.id),
                  )
                  .map((item) => (
                    <button
                      key={item.id}
                      aria-label={item.name}
                      aria-pressed={tool === item.id}
                      title={`${item.name} (${item.key})`}
                      className={tool === item.id ? 'active' : ''}
                      disabled={disabled}
                      onClick={() => {
                        setTool(item.id);
                        setMode('regions');
                      }}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      {item.name}
                    </button>
                  ))}
                <button
                  className="more-tools"
                  aria-pressed={advanced}
                  onClick={() => {
                    setAdvanced(!advanced);
                    setTool('smart');
                    setSelection([]);
                  }}
                >
                  更多工具
                </button>
              </div>
              <div className="tool-options">
                {['smart', 'lasso', 'rectangle', 'color', 'connected'].includes(tool) ? (
                  <>
                    {tool === 'lasso' && (
                      <label>
                        <input
                          type="checkbox"
                          checked={snapEdges}
                          onChange={(event) => setSnapEdges(event.target.checked)}
                        />
                        自动贴边
                      </label>
                    )}
                    {tool === 'smart' && (
                      <label>
                        选取宽容度
                        <input
                          aria-label="选取宽容度"
                          type="range"
                          min={1}
                          max={80}
                          value={tolerance}
                          onChange={(event) => setTolerance(Number(event.target.value))}
                        />
                        <span>{tolerance}</span>
                      </label>
                    )}
                    <label>
                      选取方式
                      <select
                        aria-label="选取方式"
                        value={operation}
                        disabled={disabled}
                        onChange={(event) => setOperation(event.target.value as SelectionOperation)}
                      >
                        <option value="replace">新选区</option>
                        <option value="add">添加到选区</option>
                        <option value="subtract">从选区减去</option>
                      </select>
                    </label>
                    <span className="tool-description">
                      {tool === 'smart'
                        ? '点击当前层图案，自动沿相近颜色选取'
                        : tool === 'rectangle'
                          ? '拖出矩形范围'
                          : tool === 'lasso'
                            ? '沿轮廓附近圈选，松开后自动贴边'
                            : tool === 'color'
                              ? '选取同一分区的所有像素'
                              : '仅选取相邻的同区像素'}
                    </span>
                  </>
                ) : tool === 'hand' ? (
                  <span>拖动画布平移；滚动查看放大后的图像</span>
                ) : (
                  <>
                    {tool === 'brush' && (
                      <label>
                        绘入区域
                        <select
                          aria-label="绘入区域"
                          value={selected}
                          onChange={(event) => setSelected(Number(event.target.value))}
                        >
                          {project.regions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      笔刷半径{' '}
                      <input
                        aria-label="笔刷半径"
                        type="range"
                        min={1}
                        max={40}
                        value={radius}
                        onChange={(event) => setRadius(Number(event.target.value))}
                      />
                      <span>{radius} px</span>
                    </label>
                    <span className="tool-description">
                      {selection.length
                        ? '仅作用于选区'
                        : tool === 'brush'
                          ? `绘入「${region?.name}」`
                          : '从打印范围擦除'}
                    </span>
                  </>
                )}
              </div>
              <div className="art-stage" style={{ pointerEvents: disabled ? 'none' : 'auto' }}>
                <EditorCanvas
                  project={project}
                  simple={!advanced}
                  snapEdges={snapEdges}
                  tolerance={tolerance}
                  onSelecting={setSelecting}
                  selectionReset={selectionReset}
                  selected={selected}
                  tool={tool}
                  radius={radius}
                  mode={mode}
                  layer={currentLayer}
                  zoom={zoom}
                  operation={operation}
                  selection={selection}
                  onSelect={setSelected}
                  onSelection={(indices) => {
                    setError('');
                    setSelection(indices);
                    setMode('regions');
                    setTarget(0);
                  }}
                  onPaint={(labels) => {
                    edit({ ...project, labels });
                    setNotice('区域已更新');
                  }}
                  onError={setError}
                />
              </div>
              <div className="selection-bar">
                <span data-testid="selection-count" data-count={selection.length}>
                  {selection.length
                    ? `已选 ${selection.length.toLocaleString()} 像素`
                    : '未选择像素'}
                </span>
                <button
                  disabled={(!selection.length && !selecting) || disabled}
                  onClick={() => {
                    setSelection([]);
                    setSelectionReset((value) => value + 1);
                  }}
                  title="Ctrl+D / Esc"
                >
                  取消选区
                </button>
              </div>
              <div className="canvas-bottom">
                <div className="segmented">
                  {(
                    [
                      ['color', '原图'],
                      ['regions', '选区'],
                      ['layer', '逐层'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      className={mode === id ? 'active' : ''}
                      aria-pressed={mode === id}
                      onClick={() => setMode(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="zoom-controls">
                  <button
                    aria-label="缩小"
                    disabled={zoom <= 0.5}
                    onClick={() => setZoom(Math.max(0.5, zoom / 1.25))}
                  >
                    −
                  </button>
                  <button onClick={() => setZoom(1)} title="恢复适合窗口">
                    {zoom === 1 ? '适合窗口' : `${Math.round(zoom * 100)}%`}
                  </button>
                  <button
                    aria-label="放大"
                    disabled={zoom >= 8}
                    onClick={() => setZoom(Math.min(8, zoom * 1.25))}
                  >
                    ＋
                  </button>
                </div>
              </div>
              {mode === 'layer' && (
                <div className="layer-control">
                  {maxLayer ? (
                    <>
                      <span>
                        第 {currentLayer} / {maxLayer} 层
                      </span>
                      <input
                        aria-label="查看层"
                        type="range"
                        min={1}
                        max={maxLayer}
                        value={currentLayer}
                        onChange={(event) => setLayer(Number(event.target.value))}
                      />
                    </>
                  ) : (
                    <span>当前工程没有堆叠层</span>
                  )}
                </div>
              )}
            </>
          )}
        </section>
        <aside className="right-panel sidebar">
          <div className="properties-scroll">
            {project && (
              <section className="sidebar-section trim-panel">
                <h2>修整当前层</h2>
                <p className="current-layer-name">
                  {region?.name} · {region?.layers} 层
                </p>
                <ol className="simple-steps">
                  <li>左侧选择要修整的层</li>
                  <li>点选图案，或圈出范围</li>
                  <li>选择清除或保留</li>
                </ol>
                <div className="trim-actions">
                  <button
                    disabled={disabled || selecting || !selectedCount}
                    onClick={() => trimSelection('clear')}
                  >
                    清除
                  </button>
                  <button
                    className="primary"
                    disabled={disabled || selecting || !selectedCount}
                    onClick={() => trimSelection('keep')}
                  >
                    保留
                  </button>
                </div>
                <p>
                  <b>清除：</b>去掉当前层选中部分。
                  <br />
                  <b>保留：</b>只留下当前层选中部分。
                </p>
                <small aria-live="polite">
                  {selecting
                    ? '正在识别选区…'
                    : selectedCount
                      ? `当前层选中 ${selectedCount.toLocaleString()} 像素`
                      : '选中范围会高亮，确认后再操作'}
                </small>
                <small>其他层不变 · 操作后可撤销</small>
              </section>
            )}
            <details className="advanced-properties" open={advanced || undefined}>
              <summary>层属性与更多设置</summary>
              <section className="sidebar-section">
                <h2>区域属性</h2>
                {project && region ? (
                  <>
                    <label className="stack-field">
                      名称
                      <NameField
                        value={region.name}
                        disabled={disabled}
                        onCommit={(name) => updateRegion({ name })}
                      />
                    </label>
                    <div className="field-row">
                      <label>堆叠层数</label>
                      <div className="stepper">
                        <button
                          aria-label="减少层数"
                          disabled={disabled || region.layers === 0}
                          onClick={() => updateRegion({ layers: region.layers - 1 })}
                        >
                          −
                        </button>
                        <NumberField
                          label="区域层数"
                          value={region.layers}
                          disabled={disabled}
                          onCommit={(layers) => updateRegion({ layers })}
                        />
                        <button
                          aria-label="增加层数"
                          disabled={disabled || region.layers === 256}
                          onClick={() => updateRegion({ layers: region.layers + 1 })}
                        >
                          ＋
                        </button>
                      </div>
                    </div>
                    <div className="height-presets">
                      {[0, 5, 10, 20].map((value) => (
                        <button
                          key={value}
                          disabled={disabled}
                          onClick={() => updateRegion({ layers: value })}
                        >
                          {value} 层
                        </button>
                      ))}
                    </div>
                    <div className="field-row">
                      <label htmlFor="region-color">图案颜色</label>
                      <div className="color-control">
                        <input
                          id="region-color"
                          aria-label="区域颜色"
                          type="color"
                          value={colorDraft}
                          disabled={disabled}
                          onChange={(event) => setColorDraft(event.target.value)}
                        />
                        <span>{colorDraft.toUpperCase()}</span>
                      </div>
                    </div>
                    <button
                      className="full-button"
                      disabled={disabled || colorDraft === region.color}
                      onClick={recolor}
                    >
                      应用颜色到区域
                    </button>
                  </>
                ) : (
                  <p className="empty-sidebar">选择区域以编辑属性</p>
                )}
              </section>
              {project && (
                <section className="sidebar-section selection-properties">
                  <h2>
                    选区操作{' '}
                    <small>
                      {selection.length ? `${selection.length.toLocaleString()} px` : '无选区'}
                    </small>
                  </h2>
                  <label className="stack-field">
                    分配到区域
                    <select
                      aria-label="分配目标"
                      disabled={disabled || !selection.length}
                      value={target}
                      onChange={(event) => setTarget(Number(event.target.value))}
                    >
                      <option value={0}>选择目标区域</option>
                      {project.regions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.layers} 层
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="full-button"
                    disabled={disabled || !selection.length || !target}
                    onClick={() => assign(target)}
                  >
                    应用分配
                  </button>
                  <button
                    className="full-button"
                    disabled={disabled || !selection.length || project.regions.length >= 32}
                    onClick={() => assign(nextRegionId(project.regions), true)}
                  >
                    选区建立新区域
                  </button>
                  <button
                    className="text-button danger"
                    disabled={disabled || !selection.length}
                    onClick={excludeSelection}
                  >
                    排除选区 <kbd>Delete</kbd>
                  </button>
                </section>
              )}
              {project && region && (
                <section className="sidebar-section">
                  <h2>合并区域</h2>
                  <label className="stack-field">
                    将「{region.name}」合并到
                    <select
                      aria-label="合并目标"
                      value={mergeTarget}
                      disabled={disabled}
                      onChange={(event) => setMergeTarget(Number(event.target.value))}
                    >
                      <option value={0}>选择目标区域</option>
                      {project.regions
                        .filter((item) => item.id !== selected)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.layers} 层
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="full-button"
                    disabled={
                      disabled ||
                      !mergeTarget ||
                      mergeTarget === selected ||
                      !project.regions.some((item) => item.id === mergeTarget)
                    }
                    onClick={() => {
                      edit({
                        ...project,
                        labels: mergeRegions(project.labels, selected, mergeTarget),
                        regions: project.regions.filter((item) => item.id !== selected),
                      });
                      setSelected(mergeTarget);
                      setSelection([]);
                      setTarget(0);
                      setMergeTarget(0);
                      setNotice('区域已合并');
                    }}
                  >
                    合并整个区域
                  </button>
                </section>
              )}
            </details>
          </div>
          <section className="output-summary">
            <h2>输出</h2>
            <div>
              <span>分层数量</span>
              <strong>{maxLayer} 层</strong>
            </div>
            <div>
              <span>高度图</span>
              <strong>16 位 PNG</strong>
            </div>
            <div>
              <span>成品尺寸</span>
              <strong>{project ? project.sizeMm.join(' × ') + ' mm' : '—'}</strong>
            </div>
          </section>
        </aside>
      </main>
      <footer className={`statusbar ${error ? 'has-error' : ''}`} role={error ? 'alert' : 'status'}>
        <span title={error || notice}>{busy ? `${busy}…` : error || notice}</span>
        <span>
          {view === 'edit' && project
            ? `${tools.find((item) => item.id === tool)?.name} · ${tool === 'color' || tool === 'connected' ? 'Shift 追加 / Alt 减选' : 'Ctrl+Z 撤销'}`
            : 'Relief Studio'}
        </span>
        {error && (
          <button aria-label="关闭错误提示" onClick={() => setError('')}>
            ×
          </button>
        )}
      </footer>
      {stl && project && (
        <StlDialog
          project={project}
          busy={!!busy}
          error={error}
          onCancel={() => setStl(false)}
          onExport={(options) => {
            void run('导出 STL', async () => {
              const result = await bridge().exportStl({ project, options });
              if (result) {
                setNotice(
                  `STL 已导出：${result.path}${result.repairedPixels ? ` · 已修复 ${result.repairedPixels} 个像素连接（原工程不变）` : ''}`,
                );
                setStl(false);
              }
            });
          }}
        />
      )}
      {recognition && (
        <RecognitionDialog
          {...recognition}
          onCancel={() => setRecognition(null)}
          onApply={(next) => {
            if (recognition.replacing && project) {
              edit(next);
              setSelection([]);
              setSelected(next.regions[0].id);
              setTarget(0);
              setMergeTarget(0);
            } else replace(next, true);
            setRecognition(null);
            setTool('smart');
            setAdvanced(false);
            setOperation('replace');
            setView('edit');
            setNotice('分区已完成 · 选择一层，选范围后清除或保留');
          }}
        />
      )}
      {crop && (
        <CropDialog
          image={crop.image}
          onCancel={() => {
            if (!busy) setCrop(null);
          }}
          onConfirm={(image) => {
            if (!busy) void finishCrop(image);
          }}
        />
      )}
      {pending && (
        <div className="modal-backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="未保存更改"
          >
            <h2>当前工程尚未保存</h2>
            <p>继续打开其他文件将放弃当前更改。</p>
            <div>
              <button autoFocus onClick={() => setPending(null)}>
                继续编辑
              </button>
              <button
                className="primary"
                onClick={() => {
                  const action = pending;
                  setPending(null);
                  action();
                }}
              >
                放弃更改并继续
              </button>
            </div>
          </section>
        </div>
      )}
      {busy && (
        <div className="busy-indicator" aria-live="polite">
          {busy}…
        </div>
      )}
    </div>
  );
}
