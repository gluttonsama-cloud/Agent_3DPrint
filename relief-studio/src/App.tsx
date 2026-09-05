import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Region } from './types';
import { CropDialog } from './CropDialog';
import { assignSelection, EditorCanvas, type Tool } from './EditorCanvas';
import { ReliefPreview } from './ReliefPreview';
import { mergeRegions, projectStats, nextRegionId } from './model';
import { loadImage, readRaster } from './image';

function bridge() {
  if (!window.relief)
    throw new Error('请在桌面版中使用此功能（npm run desktop）。网页预览仅支持示例编辑。');
  return window.relief;
}

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<Project[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('从一张平面图，开始构建有层次的图案。');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(1);
  const [tool, setTool] = useState<Tool>('color');
  const [radius, setRadius] = useState(5);
  const [selection, setSelection] = useState<number[]>([]);
  const [mode, setMode] = useState<'color' | 'regions' | 'layer'>('regions');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [layer, setLayer] = useState(1);
  const [colors, setColors] = useState(3);
  const [mergeTarget, setMergeTarget] = useState(0);
  const [crop, setCrop] = useState<{ image: string; name: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  function edit(next: Project) {
    if (!project) return;
    // 按像素量限制撤销缓存，避免大图累积占用大量内存。
    const maxHistory = Math.max(
      1,
      Math.min(20, Math.floor(32_000_000 / (project.width * project.height * 8))),
    );
    setHistory((previous) => [...previous, project].slice(-maxHistory));
    setProject(next);
    setDirty(true);
  }
  function updateRegion(change: Partial<Region>) {
    if (project)
      edit({
        ...project,
        regions: project.regions.map((item) =>
          item.id === selected ? { ...item, ...change } : item,
        ),
      });
  }
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await action();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setBusy('');
    }
  }
  function mayReplace() {
    return !dirty || confirm('工程有未保存的修改，是否放弃并继续？');
  }
  function replace(next: Project, edited = false) {
    setProject(next);
    setHistory([]);
    setDirty(edited);
    setSelection([]);
    setSelected(next.regions[0].id);
    setView('edit');
    setLayer(1);
  }
  async function sample() {
    if (!mayReplace()) return;
    await run('加载样例', async () => {
      const next: Project = window.relief
        ? await window.relief.sample()
        : await fetch('./sample-project.json').then((response) => {
            if (!response.ok) throw new Error('未找到样例，请先运行样例生成脚本');
            return response.json();
          });
      replace(next);
      setNotice('55 × 55 mm 徽标样例已载入。白字 10 层、金色 5 层、黑色 0 层。');
    });
  }
  async function save() {
    if (!project) return;
    await run('保存工程', async () => {
      const result = await bridge().save(project);
      if (result) {
        setDirty(false);
        setNotice(`工程已保存：${result.path}`);
      }
    });
  }
  async function open() {
    if (!mayReplace()) return;
    await run('打开工程', async () => {
      const next = await bridge().open();
      if (next) {
        replace(next);
        setNotice('工程已恢复，分区、原图及高度设置均已载入。');
      }
    });
  }
  async function importFile(value: File) {
    await run('读取图像', async () => {
      const result = await readRaster(value);
      setCrop({ image: result.image, name: value.name.replace(/\.[^.]+$/, '') });
      if (result.resized) setNotice('原图较大，已等比例缩至最长边 2048 px；请确认细字清晰度。');
    });
  }
  async function finishCrop(image: string) {
    const name = crop?.name || '未命名图案';
    await run('自动分区', async () => {
      const next = await bridge().segment({ image, colors, sizeMm: [55, 55], name });
      replace(next, true);
      setCrop(null);
      setNotice('分区已完成。自动高度仅为建议，请逐区域确认。');
    });
  }
  async function recolor() {
    if (!project || !region) return;
    await run('替换图案色', async () => {
      const image = await loadImage(project.image);
      const canvas = document.createElement('canvas');
      canvas.width = project.width;
      canvas.height = project.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rgb = [1, 3, 5].map((start) => parseInt(region.color.slice(start, start + 2), 16));
      project.labels.forEach((id, index) => {
        if (id === selected)
          rgb.forEach((value, channel) => {
            pixels.data[index * 4 + channel] = value;
          });
      });
      ctx.putImageData(pixels, 0, 0);
      edit({ ...project, image: canvas.toDataURL('image/png') });
      setNotice('已替换当前区域图案色，堆叠高度保持不变。');
    });
  }
  function undo() {
    const previous = history.at(-1);
    if (previous) {
      setProject(previous);
      setHistory(history.slice(0, -1));
      setDirty(true);
      setSelection([]);
      if (!previous.regions.some((item) => item.id === selected))
        setSelected(previous.regions[0].id);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-symbol">▱</span>
          <div>
            <strong>
              RELIEF <span>STUDIO</span>
            </strong>
            <small>浮雕工坊 / 0.1</small>
          </div>
        </div>
        <div className="header-caption">图案的另一种维度</div>
        <div className="header-actions">
          <span className="offline-dot">本地运行</span>
          <button disabled={!!busy} onClick={open}>
            打开工程
          </button>
          <button disabled={!project || !!busy} onClick={save}>
            保存{dirty ? ' ●' : ''}
          </button>
          <button
            className="primary"
            disabled={!project || !!busy}
            onClick={() =>
              run('导出分层文件', async () => {
                const result = await bridge().export(project!);
                if (result) setNotice(`分层文件已导出：${result.path}（未校准的通用中间文件）`);
              })
            }
          >
            导出分层 ↗
          </button>
        </div>
      </header>

      <div className="workspace-title">
        <div>
          <small>YOUR RELIEF WORKSPACE</small>
          <h1>{project ? project.name : '让平面，生长出层次。'}</h1>
          <p>
            {project
              ? `${project.width} × ${project.height} px · ${project.sizeMm.join(' × ')} mm · ${project.regions.length} 个区域`
              : '选取图案，定义高度。以可控的分层，制作每一处凹凸。'}
          </p>
        </div>
        <div className="workflow">
          <span className={project ? 'complete' : 'active'}>01 导入图案</span>
          <i>—</i>
          <span className={project && view === 'edit' ? 'active' : ''}>02 定义层次</span>
          <i>—</i>
          <span className={view === 'preview' ? 'active' : ''}>03 预览与导出</span>
        </div>
      </div>

      <main className="workspace">
        <aside className="left-panel panel">
          <div className="section-heading">
            <h2>图案与分区</h2>
            <small>01</small>
          </div>
          <button
            className="import-button"
            disabled={!!busy}
            onClick={() => {
              if (mayReplace()) file.current?.click();
            }}
          >
            <span>＋</span>
            <strong>导入新图案</strong>
            <small>PNG / JPEG · 最大 24 MB</small>
          </button>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(event) => {
              const value = event.target.files?.[0];
              event.target.value = '';
              if (value) void importFile(value);
            }}
          />
          <div className="field-row">
            <label htmlFor="colors">自动分区色数</label>
            <input
              id="colors"
              type="number"
              min="2"
              max="12"
              value={colors}
              onChange={(event) => setColors(Math.max(2, Math.min(12, Number(event.target.value))))}
            />
          </div>
          <button className="text-button sample-button" disabled={!!busy} onClick={sample}>
            试用 55 mm 徽标样例 →
          </button>
          {project && (
            <>
              <div className="divider" />
              <div className="section-heading">
                <h3>成品尺寸</h3>
                <small>mm</small>
              </div>
              <div className="size-fields">
                {['宽度', '高度'].map((name, index) => (
                  <label key={name}>
                    {name}
                    <input
                      aria-label={name}
                      type="number"
                      min="0.1"
                      max="10000"
                      step="0.1"
                      value={project.sizeMm[index]}
                      disabled={!!busy}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value) && value > 0 && value <= 10000) {
                          const size = [...project.sizeMm] as [number, number];
                          size[index] = value;
                          edit({ ...project, sizeMm: size });
                        }
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="divider" />
              <div className="section-heading">
                <h3>区域列表</h3>
                <small>{project.regions.length} REGIONS</small>
              </div>
              <div className="region-list">
                {project.regions.map((item) => (
                  <button
                    key={item.id}
                    className={`region-card ${selected === item.id ? 'selected' : ''}`}
                    disabled={!!busy}
                    onClick={() => {
                      setSelected(item.id);
                      setMode('regions');
                    }}
                  >
                    <span className="swatch" style={{ background: item.color }} />
                    <span className="region-text">
                      <strong>{item.name}</strong>
                      <small>
                        {(((counts.get(item.id) || 0) / project.labels.length) * 100).toFixed(1)}%
                        画布
                      </small>
                    </span>
                    <span className="region-height">
                      {item.layers}
                      <small>层</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="excluded-note">
                <span className="checker mini" />
                不打印区域 · {(((counts.get(0) || 0) / project.labels.length) * 100).toFixed(1)}%
              </div>
              <button
                className="text-button"
                disabled={!!busy || project.regions.length >= 32}
                onClick={() => {
                  const id = nextRegionId(project.regions);
                  edit({
                    ...project,
                    regions: [
                      ...project.regions,
                      { id, name: `新区域 ${id}`, color: '#bf9463', layers: 5 },
                    ],
                  });
                  setSelected(id);
                }}
              >
                ＋ 新建区域
              </button>
            </>
          )}
          <div className="panel-bottom">
            <span>●</span> 颜色与高度分别设置
            <br />
            <small>图案色不决定实际凹凸。</small>
          </div>
        </aside>

        <section className="center-panel panel">
          <div className="canvas-toolbar">
            <div className="segmented">
              <button className={view === 'edit' ? 'active' : ''} onClick={() => setView('edit')}>
                平面编辑
              </button>
              <button
                className={view === 'preview' ? 'active' : ''}
                disabled={!project}
                onClick={() => setView('preview')}
              >
                3D 浮雕
              </button>
            </div>
            <button className="undo-button" disabled={!history.length || !!busy} onClick={undo}>
              ↶ 撤销
            </button>
          </div>
          {!project ? (
            <div className="empty-stage">
              <div className="relief-illustration">
                <div />
                <div />
                <div />
                <div>R</div>
              </div>
              <small>FROM IMAGE TO RELIEF</small>
              <h2>一张图案，多层可能</h2>
              <p>
                先从标志、文字或清晰的色块图开始。
                <br />
                每个区域的高度，都由你决定。
              </p>
              <button className="primary" disabled={!!busy} onClick={sample}>
                载入演示图案 →
              </button>
              <span className="empty-caption">离线处理 / 人工可控 / 分层导出</span>
            </div>
          ) : view === 'preview' ? (
            <ReliefPreview project={project} />
          ) : (
            <>
              <div className="edit-tools">
                {(
                  [
                    ['color', '◉', '同色选区'],
                    ['connected', '⌘', '连通选区'],
                    ['brush', '╱', '画笔'],
                    ['erase', '▱', '擦除'],
                  ] as const
                ).map(([id, icon, label]) => (
                  <button
                    key={id}
                    disabled={!!busy}
                    title={label}
                    aria-label={label}
                    className={tool === id ? 'active' : ''}
                    onClick={() => setTool(id)}
                  >
                    <span aria-hidden="true">{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
                {(tool === 'brush' || tool === 'erase') && (
                  <label className="brush-size">
                    半径{' '}
                    <input
                      type="range"
                      min="1"
                      max="30"
                      value={radius}
                      onChange={(event) => setRadius(Number(event.target.value))}
                    />
                    {radius}px
                  </label>
                )}
              </div>
              <div className="art-stage checker" style={{ pointerEvents: busy ? 'none' : 'auto' }}>
                <EditorCanvas
                  project={project}
                  selected={selected}
                  tool={tool}
                  radius={radius}
                  mode={mode}
                  layer={Math.min(layer, Math.max(1, maxLayer))}
                  selection={selection}
                  onSelect={setSelected}
                  onSelection={setSelection}
                  onPaint={(labels) => edit({ ...project, labels })}
                />
                <span className="dimension dimension-x">{project.sizeMm[0]} mm</span>
              </div>
              <div className="canvas-bottom">
                <div className="segmented small">
                  {(
                    [
                      ['color', '原图'],
                      ['regions', '分区'],
                      ['layer', '逐层'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      className={mode === id ? 'active' : ''}
                      onClick={() => setMode(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {mode === 'layer' ? (
                  <label className="layer-slider">
                    第{' '}
                    <input
                      type="range"
                      min="1"
                      max={Math.max(1, maxLayer)}
                      value={Math.min(layer, Math.max(1, maxLayer))}
                      onChange={(event) => setLayer(Number(event.target.value))}
                    />
                    {Math.min(layer, Math.max(1, maxLayer))} / {maxLayer} 层
                  </label>
                ) : (
                  <small>棋盘格 = 不打印 · 选区高亮不改变图案</small>
                )}
              </div>
            </>
          )}
          <div className="canvas-caption">
            <span>◈</span> 高度未校准 · 预览不代表实际毫米厚度或金属效果
          </div>
        </section>

        <aside className="right-panel panel">
          <div className="section-heading">
            <h2>定义高度</h2>
            <small>02</small>
          </div>
          {region && project ? (
            <>
              <div className="current-region">
                <span className="swatch large" style={{ background: region.color }} />
                <div>
                  <small>CURRENT REGION</small>
                  <input
                    aria-label="区域名称"
                    value={region.name}
                    maxLength={100}
                    disabled={!!busy}
                    onChange={(event) => updateRegion({ name: event.target.value })}
                  />
                </div>
              </div>
              <label className="height-label" htmlFor="height">
                白墨堆叠示意
              </label>
              <div className="height-number">
                <input
                  id="height"
                  aria-label="区域层数"
                  type="number"
                  min="0"
                  max="256"
                  value={region.layers}
                  disabled={!!busy}
                  onChange={(event) => {
                    const layers = Number(event.target.value);
                    if (Number.isInteger(layers) && layers >= 0 && layers <= 256)
                      updateRegion({ layers });
                  }}
                />
                <span>层</span>
              </div>
              <input
                className="height-range"
                aria-label="层数滑块"
                type="range"
                min="0"
                max="30"
                value={Math.min(30, region.layers)}
                disabled={!!busy}
                onChange={(event) => updateRegion({ layers: Number(event.target.value) })}
              />
              <div className="range-labels">
                <span>平整 / 0</span>
                <span>凸起 / 30</span>
              </div>
              <div className="height-presets">
                {[0, 5, 10].map((value) => (
                  <button
                    key={value}
                    disabled={!!busy}
                    onClick={() => updateRegion({ layers: value })}
                  >
                    {value} 层
                  </button>
                ))}
              </div>
              <p className="hint">层数代表累计沉积次数。0 层保留图案颜色，仅不生成堆叠掩膜。</p>
              <div className="divider" />
              <h3>区域操作</h3>
              <label className="field-row">
                区域颜色
                <input
                  aria-label="区域颜色"
                  type="color"
                  value={region.color}
                  disabled={!!busy}
                  onChange={(event) => updateRegion({ color: event.target.value })}
                />
              </label>
              <button className="full-button" disabled={!!busy} onClick={recolor}>
                将此颜色应用到图案
              </button>
              <p className="hint">更改色标后点击应用，才会替换原图颜色。</p>
              {selection.length > 0 && (
                <div className="selection-box">
                  <strong>已选 {selection.length} 个像素</strong>
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      run('应用选区', async () => {
                        const labels = await assignSelection(project, selection, selected);
                        edit({ ...project, labels });
                        setSelection([]);
                      })
                    }
                  >
                    划入当前区域
                  </button>
                  <button onClick={() => setSelection([])}>取消选择</button>
                </div>
              )}
              <label className="stack-field">
                将当前区域合并到
                <select
                  aria-label="合并目标"
                  disabled={!!busy}
                  value={mergeTarget}
                  onChange={(event) => setMergeTarget(Number(event.target.value))}
                >
                  <option value="0">选择目标区域</option>
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
                  !!busy ||
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
                  setMergeTarget(0);
                  setSelection([]);
                }}
              >
                合并区域
              </button>
            </>
          ) : (
            <div className="right-empty">
              <span>↖</span>
              <p>
                导入图案后，
                <br />
                选择区域来设置高度。
              </p>
            </div>
          )}
          <div className="export-summary">
            <small>OUTPUT SUMMARY</small>
            <h3>为每一层，准备就绪</h3>
            <div>
              <span>累计堆叠掩膜</span>
              <strong>
                {maxLayer}
                <small> 层</small>
              </strong>
            </div>
            <div>
              <span>高度数据</span>
              <strong>16 bit</strong>
            </div>
            <div>
              <span>工艺状态</span>
              <span className="badge">待实机校准</span>
            </div>
            <p>输出工程、彩色图、高度图、区域掩膜和分层说明。须完成 RIP 适配后再用于打印。</p>
          </div>
        </aside>
      </main>
      <footer className={`statusbar ${error ? 'has-error' : ''}`} role={error ? 'alert' : 'status'}>
        <span>{busy ? `◌ ${busy}…` : error ? `! ${error}` : `✓ ${notice}`}</span>
        <small>LOGO / TYPE / COLOR BLOCKS</small>
      </footer>
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
      {busy && (
        <div className="busy-indicator" aria-live="polite">
          {busy}…
        </div>
      )}
    </div>
  );
}
