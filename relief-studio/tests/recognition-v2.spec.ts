import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCapabilityService, decodePatch, type NativeV2 } from '../src/capability-service';
import { EditorStore, diffSnapshot } from '../src/editor/store';
import { decodeRaster, encodeRaster } from '../src/contracts/raster-codec';
import { decodeProject, encodeProject } from '../src/project-codec';

test('A7 真实 IPC：透明导入、人工保护、候选撤销及缺失模型后继续输出', async () => {
  const directory = path.join(process.cwd(), 'artifacts', `recognition-v2-${Date.now()}`);
  await fs.mkdir(directory, { recursive: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // 用确定不存在的模型目录验证错误路径，不依赖测试机是否已安装模型。
  env.RELIEF_BIREFNET_DIRECTORY = path.join(directory, 'missing-model');
  const packaged = env.RELIEF_TEST_PACKAGED === '1';
  if (packaged) {
    env.PATH = `${process.env.SystemRoot}\\System32`;
    delete env.PYTHONHOME; delete env.PYTHONPATH;
  }
  const app = await electron.launch(packaged ? {
    executablePath: path.join(process.cwd(), 'release/win-unpacked/Relief Studio.exe'), env,
  } : { args: [process.cwd()], env });
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(packaged);
    const page = await app.firstWindow();
    const native = Object.fromEntries(['height', 'recognition', 'export', 'save', 'open', 'migrate', 'import', 'cancel', 'progress']
      .map(action => [action, (request: unknown) => page.evaluate(async ({ action, request }) => {
        const bridge = window.reliefV2!;
        return (bridge[action as keyof NativeV2] as (request: unknown) => Promise<unknown>)(request);
      }, { action, request })])) as NativeV2;
    const service = createCapabilityService(native);
    const images = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#c03020'; ctx.fillRect(2, 2, 28, 28);
      ctx.clearRect(12, 12, 8, 8);
      const transparent = canvas.toDataURL();
      ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 32, 32);
      return { transparent, opaque: canvas.toDataURL() };
    });
    const imported = await service.import(images.transparent, [32, 32]);
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') throw new Error(JSON.stringify(imported));
    const store = new EditorStore(imported.value);
    const hole = 14 * 32 + 14, erased = 5 * 32 + 5, recolored = 5 * 32 + 6, raised = 5 * 32 + 7;
    expect(store.snapshot.labels[hole]).toBe(0);
    expect(store.snapshot.heights[raised]).toBe(10);
    const manual = structuredClone(store.snapshot);
    manual.labels[erased] = 0; manual.heights[erased] = 0; manual.protection[erased] = 5;
    manual.colors.set([20, 60, 180, 255], recolored * 4); manual.protection[recolored] = 2;
    manual.heights[raised] = 17; manual.protection[raised] = 4;
    store.commitPatch(diffSnapshot(store.snapshot, manual, '人工擦除、改色和调高'));
    const beforeRecognition = structuredClone(store.snapshot);
    const recognize = (protectionPolicy: 'preserve' | 'overwrite') => service.recognition({
      snapshot: store.snapshot, keepBackground: false, protectionPolicy,
    });
    const preserved = await recognize('preserve');
    expect(preserved.status).toBe('success');
    expect(store.accept(preserved)).toBe('applied');
    for (const field of ['labels', 'colors', 'heights', 'protection'] as const)
      expect(store.snapshot[field]).toEqual(beforeRecognition[field]);
    expect(store.undoCount).toBe(1);

    const overwritten = await recognize('overwrite');
    expect(overwritten.status).toBe('success');
    if (overwritten.status !== 'success') throw new Error(JSON.stringify(overwritten));
    const added = decodeRaster(overwritten.value.diagnostics!.added, 32 * 32);
    expect(added[erased]).toBe(1);
    // 真实候选的预览、取消不进入历史；统一历史应用后可整步恢复。
    store.preview(overwritten.value);
    expect(store.previewSnapshot!.labels[erased]).not.toBe(0);
    expect(store.snapshot.labels[erased]).toBe(0);
    store.preview(null);
    expect(store.undoCount).toBe(1);
    expect(store.accept(overwritten)).toBe('applied');
    expect(store.snapshot.colors.slice(recolored * 4, recolored * 4 + 4)).toEqual(
      store.snapshot.original.slice(recolored * 4, recolored * 4 + 4));
    expect(store.undoCount).toBe(2);
    store.undo();
    for (const field of ['labels', 'colors', 'heights', 'protection'] as const)
      expect(store.snapshot[field]).toEqual(beforeRecognition[field]);
    for (const field of ['regions', 'name', 'sizeMm', 'device', 'heightMapping'] as const)
      expect(store.snapshot[field]).toEqual(beforeRecognition[field]);
    expect(store.accept(overwritten)).toBe('stale');

    const failed = await service.import(images.opaque, [32, 32]);
    expect(failed.status).toBe('error');
    if (failed.status === 'error') expect(failed.message).toContain('缺少 BiRefNet');
    const height = await service.height({ snapshot: store.snapshot, operation: { kind: 'add', delta: 1 } });
    expect(store.accept(height)).toBe('applied');
    const filename = path.join(directory, 'saved.json');
    expect((await service.save(store.snapshot, filename)).status).toBe('success');
    const reopened = await service.open(filename);
    expect(reopened.status).toBe('success');
    if (reopened.status !== 'success') throw new Error(JSON.stringify(reopened));
    for (const field of ['labels', 'colors', 'heights', 'protection'] as const)
      expect(reopened.value.snapshot[field]).toEqual(store.snapshot[field]);
    const outputDirectory = path.join(directory, 'output');
    expect((await service.export({ snapshot: store.snapshot, device: store.snapshot.device,
      formats: ['png', 'jpg'], obj: true, outputDirectory })).status).toBe('success');
    const whiteFiles = (await fs.readdir(path.join(outputDirectory, 'white')))
      .map(file => path.join(outputDirectory, 'white', file));
    const actual = await app.evaluate(({ nativeImage }, files) => {
      const coverage = nativeImage.createFromPath(files.coverage).toBitmap();
      const sum = new Array(32 * 32).fill(0);
      for (const file of files.white) {
        const bitmap = nativeImage.createFromPath(file).toBitmap();
        for (let i = 0; i < sum.length; i++) if (bitmap[i * 4] === 255) sum[i]++;
      }
      return { sum, coverage: Array.from({ length: sum.length }, (_, i) => coverage[i * 4] > 0) };
    }, { coverage: path.join(outputDirectory, 'coverage.png'), white: whiteFiles });
    expect(actual.sum).toEqual(Array.from(store.snapshot.heights));
    expect(actual.coverage).toEqual(Array.from(store.snapshot.labels, id => id !== 0));
    expect(actual.sum[hole]).toBe(0); expect(actual.coverage[erased]).toBe(false);
    const jpgFiles = (await fs.readdir(path.join(outputDirectory, 'adapted')))
      .filter(file => file.endsWith('.jpg')).map(file => path.join(outputDirectory, 'adapted', file));
    expect(jpgFiles.length).toBe(whiteFiles.length + 1);
    const sizes = await app.evaluate(({ nativeImage }, files) => files.map(file =>
      nativeImage.createFromPath(file).getSize()), jpgFiles);
    expect(sizes.every(size => size.width === 32 && size.height === 32)).toBe(true);
    const obj = await fs.readFile(path.join(outputDirectory, 'relief.obj'), 'utf8');
    expect(obj).toMatch(/^v /m); expect(obj).toMatch(/^f /m);
    expect(await fs.readFile(path.join(outputDirectory, 'relief.mtl'), 'utf8')).toContain('texture.png');
    expect(await fs.stat(path.join(outputDirectory, 'texture.png')).then(stat => stat.size)).toBeGreaterThan(0);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});

test('A7 2048 像素真实局部识别：诊断工作坐标、范围外不变及一次撤销', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const packaged = env.RELIEF_TEST_PACKAGED === '1';
  if (packaged) {
    env.PATH = `${process.env.SystemRoot}\\System32`;
    delete env.PYTHONHOME; delete env.PYTHONPATH;
  }
  const app = await electron.launch(packaged ? {
    executablePath: path.join(process.cwd(), 'release/win-unpacked/Relief Studio.exe'), env,
  } : { args: [process.cwd()], env });
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(packaged);
    const page = await app.firstWindow();
    const snapshot = decodeProject(JSON.parse(await fs.readFile('tests/fixtures/v2/normal-v2.json', 'utf8')));
    const side = 2048, count = side * side;
    snapshot.width = snapshot.height = side; snapshot.sizeMm = [204.8, 204.8];
    snapshot.original = new Uint8Array(count * 4).fill(255);
    snapshot.original[(count - 1) * 4 + 3] = 0;
    snapshot.colors = snapshot.original.slice();
    snapshot.labels = new Uint16Array(count).fill(1);
    snapshot.heights = new Uint16Array(count).fill(3);
    snapshot.protection = new Uint8Array(count);
    const selection = new Uint8Array(count);
    for (let y = side - 8; y < side; y++) for (let x = side - 8; x < side; x++) {
      const i = y * side + x;
      selection[i] = 1; snapshot.labels[i] = 0; snapshot.heights[i] = 0;
    }
    const store = new EditorStore(snapshot);
    const before = structuredClone(store.snapshot);
    const started = Date.now();
    const wire = await page.evaluate(payload => window.reliefV2!.recognition({
      requestId: 'recognition-2048', payload,
    }), { snapshot: encodeProject(store.snapshot),
      selection: { width: side, height: side, data: encodeRaster(selection) },
      keepBackground: false, protectionPolicy: 'preserve' });
    expect(wire.result.status).toBe('success');
    if (wire.result.status !== 'success') throw new Error(JSON.stringify(wire.result));
    const patch = decodePatch(wire.result.value);
    const added = decodeRaster(patch.diagnostics!.added, count);
    expect(added.every((value, i) => value === (selection[i] && i !== count - 1 ? 1 : 0))).toBe(true);
    expect(decodeRaster(patch.diagnostics!.removed, count).every(value => value === 0)).toBe(true);
    expect(store.accept({ ...wire.result, value: patch })).toBe('applied');
    for (const field of ['labels', 'heights', 'protection'] as const)
      expect(store.snapshot[field].every((value, i) => selection[i] || value === before[field][i])).toBe(true);
    expect(store.snapshot.colors.every((value, i) => selection[Math.floor(i / 4)] || value === before.colors[i])).toBe(true);
    expect(store.snapshot.labels[count - 1]).toBe(0);
    expect(store.undoCount).toBe(1);
    const appliedMs = Date.now() - started;
    store.undo();
    for (const field of ['labels', 'colors', 'heights', 'protection'] as const)
      expect(store.snapshot[field].every((value, i) => value === before[field][i])).toBe(true);
    for (const field of ['regions', 'name', 'sizeMm', 'device', 'heightMapping'] as const)
      expect(store.snapshot[field]).toEqual(before[field]);
    await fs.mkdir('artifacts/a7', { recursive: true });
    // 在真正工作台渲染进程重开大图，防止只修好了测试进程中的解码。
    const filename = path.join(process.cwd(), 'artifacts/a7/recognition-2048.json.project');
    const saved = await page.evaluate(payload => window.reliefV2!.save({ requestId: 'save-2048', payload }),
      { snapshot: encodeProject(store.snapshot), path: filename });
    expect(saved.result.status).toBe('success');
    await app.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, filename);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已恢复', { timeout: 30000 });
    await fs.writeFile('artifacts/a7/recognition-2048.json', JSON.stringify({ side, selectedPixels: 64,
      addedPixels: 63, packaged, appliedMs, timingScope: 'single IPC encode/recognize/decode/apply, not P95',
      outsideUnchanged: true, exactUndo: true, workbenchReopened: true, source: 'alpha', gpu: false }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
