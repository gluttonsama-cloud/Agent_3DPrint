import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeProject, encodeProject } from '../src/project-codec';
import { EditorStore, diffSnapshot } from '../src/editor/store';
import { decodePatch } from '../src/capability-service';

test('重新识别默认保护人工结果，局部覆盖、撤销重做与重开保持四栅格', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const directory = path.join(process.cwd(), 'artifacts', `recognition-protection-${Date.now()}`);
  await fs.mkdir(directory, { recursive: true });
  const value = decodeProject(JSON.parse(await fs.readFile('tests/fixtures/v2/normal-v2.json', 'utf8')));
  value.width = 32; value.height = 16;
  value.original = new Uint8Array(512 * 4);
  value.labels = new Uint16Array(512); value.heights = new Uint16Array(512);
  value.protection = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    const left = i % 32 < 16;
    value.original.set(left ? [210, 30, 20, 255] : [20, 40, 220, 255], i * 4);
    value.labels[i] = left ? 1 : 2; value.heights[i] = left ? 12 : 8;
  }
  value.colors = value.original.slice();
  value.regions = [{ id: 1, name: '左侧人工区域', color: '#d21e14', defaultLayers: 12 },
    { id: 2, name: '右侧保留区域', color: '#1428dc', defaultLayers: 8 }];
  value.labels[0] = value.heights[0] = 0; value.protection[0] = 5;
  value.colors.set([10, 240, 10, 255], 4); value.protection[1] = 2;
  value.heights[2] = 47; value.protection[2] = 4;
  const input = path.join(directory, 'input.json');
  await fs.writeFile(input, JSON.stringify(encodeProject(value)));
  const app = await electron.launch(env.RELIEF_TEST_PACKAGED === '1'
    ? { executablePath: env.RELIEF_TEST_EXECUTABLE, env: { ...env, PATH: process.platform === 'win32' ? `${process.env.SystemRoot}\\System32` : '/usr/bin:/bin', PYTHONHOME: undefined, PYTHONPATH: undefined } }
    : { args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, input);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已恢复');
    let sequence = 0;
    const save = async () => {
      const file = path.join(directory, `saved-${++sequence}.json`);
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, file);
      await page.getByRole('button', { name: '保存工程', exact: true }).click();
      await expect.poll(() => fs.stat(file).then(() => true, () => false)).toBe(true);
      await expect(page.locator('.statusbar')).toContainText('工程已保存');
      return { file, snapshot: decodeProject(JSON.parse(await fs.readFile(file, 'utf8'))) };
    };
    const before = (await save()).snapshot;
    await page.getByRole('button', { name: '重新识别区域', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '识别区域' });
    await expect(dialog.getByLabel('保留人工修改', { exact: true })).toBeChecked({ timeout: 3000 });
    await expect(dialog.getByLabel('重新识别范围', { exact: true })).toHaveValue('all');
    await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('已识别');
    const previewPixels = await dialog.getByLabel('识别预览画布').evaluate((canvas: HTMLCanvasElement) =>
      Array.from(canvas.getContext('2d')!.getImageData(0, 0, 3, 1).data));
    expect(previewPixels[3]).toBe(0);
    expect(previewPixels.slice(4, 8)).toEqual([10, 240, 10, 255]);
    await dialog.getByRole('button', { name: '标记背景', exact: true }).click();
    const canvas = dialog.getByLabel('识别预览画布');
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.click(bounds.x + bounds.width * 10.5 / 32, bounds.y + bounds.height * .5 / 16);
    await expect(dialog.getByRole('status')).toContainText('已更新背景候选');
    const backgroundPixels = await canvas.evaluate((element: HTMLCanvasElement) =>
      Array.from(element.getContext('2d')!.getImageData(0, 0, 11, 1).data));
    expect(backgroundPixels[2 * 4 + 3]).toBe(255);
    expect(backgroundPixels[10 * 4 + 3]).toBe(0);
    await dialog.getByRole('button', { name: '恢复全部背景', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('已恢复全部背景');
    await dialog.getByRole('button', { name: '应用识别结果', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const preserved = (await save()).snapshot;
    expect(preserved.labels[0]).toBe(0);
    expect(preserved.heights[2]).toBe(47);
    expect(preserved.colors.slice(4, 8)).toEqual(before.colors.slice(4, 8));
    expect(preserved.protection).toEqual(before.protection);
    const selectedId = preserved.labels[1];
    const selectedName = preserved.regions.find(region => region.id === selectedId)!.name;
    await page.locator('.region-card').filter({ hasText: selectedName }).first().click();
    await page.getByRole('button', { name: '选择整个区域', exact: true }).click();
    await page.getByRole('button', { name: '重新识别区域', exact: true }).click();
    await expect(dialog.getByLabel('重新识别范围', { exact: true })).toHaveValue('selection');
    await dialog.getByLabel('保留人工修改', { exact: true }).uncheck();
    await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('已识别');
    await dialog.getByRole('button', { name: '应用识别结果', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const overwritten = await save();
    for (let i = 0; i < 512; i++) {
      if (preserved.labels[i] === selectedId) {
        expect(overwritten.snapshot.heights[i]).toBe(0);
        expect(overwritten.snapshot.protection[i]).toBe(0);
        expect(overwritten.snapshot.colors.slice(i * 4, i * 4 + 4)).toEqual(before.original.slice(i * 4, i * 4 + 4));
      } else {
        for (const field of ['labels', 'heights', 'protection'] as const)
          expect(overwritten.snapshot[field][i]).toBe(preserved[field][i]);
        expect(overwritten.snapshot.colors.slice(i * 4, i * 4 + 4)).toEqual(preserved.colors.slice(i * 4, i * 4 + 4));
      }
    }
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    const undone = (await save()).snapshot;
    for (const field of ['labels', 'heights', 'colors', 'protection'] as const) expect(undone[field]).toEqual(preserved[field]);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    const redone = (await save()).snapshot;
    for (const field of ['labels', 'heights', 'colors', 'protection'] as const) expect(redone[field]).toEqual(overwritten.snapshot[field]);
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, overwritten.file);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已恢复');
    const reopened = (await save()).snapshot;
    for (const field of ['labels', 'heights', 'colors', 'protection'] as const) expect(reopened[field]).toEqual(overwritten.snapshot[field]);
    // 固定模型可见掩膜，真实 v2 分色与保护仍走 CPU；此段不代表 GPU 验收。
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('relief:subject-status');
      ipcMain.handle('relief:subject-status', () => ({ installed: true }));
      ipcMain.removeHandler('relief:subject');
      ipcMain.handle('relief:subject', (_event, input) => ({
        mask: input.image, elapsedSeconds: 0, peakVramMB: 0,
      }));
    });
    await page.getByRole('button', { name: '选择整个区域', exact: true }).click();
    await page.getByRole('button', { name: '重新识别区域', exact: true }).click();
    await dialog.getByRole('button', { name: '主体提取', exact: true }).click();
    await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
    const applyButton = dialog.getByRole('button', { name: '应用识别结果', exact: true });
    await expect(applyButton).toBeEnabled();
    await dialog.getByLabel('重新识别范围', { exact: true }).selectOption('all');
    await expect(applyButton).toBeDisabled();
    await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
    await expect(applyButton).toBeEnabled();
    await dialog.getByLabel('主体堆叠层数', { exact: true }).fill('6');
    await dialog.getByLabel('主体堆叠层数', { exact: true }).blur();
    await expect(applyButton).toBeDisabled();
    await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
    await expect(applyButton).toBeEnabled();
    await dialog.getByRole('button', { name: '擦除修边', exact: true }).click();
    await dialog.getByLabel('主体画笔半径', { exact: true }).fill('40');
    const subjectBounds = (await canvas.boundingBox())!;
    await page.mouse.click(subjectBounds.x + subjectBounds.width / 2, subjectBounds.y + subjectBounds.height / 2);
    await expect(dialog.getByRole('status')).toContainText('已修边');
    await expect(applyButton).toBeDisabled();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    const cancelledSubject = (await save()).snapshot;
    for (const field of ['labels', 'heights', 'colors', 'protection'] as const) expect(cancelledSubject[field]).toEqual(reopened[field]);
    // 保留真实 CPU 返回，只延迟 IPC 投递，复现取消后的成功候选迟到。
    await app.evaluate(({ ipcMain }) => {
      type Gate = { ready: boolean; release?: () => void; delivered: boolean };
      const host = globalThis as typeof globalThis & { recognitionGate?: Gate };
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => Promise<unknown>> })._invokeHandlers;
      const original = handlers.get('v2:recognition')!;
      const gate: Gate = { ready: false, delivered: false }; host.recognitionGate = gate;
      ipcMain.removeHandler('v2:recognition');
      ipcMain.handle('v2:recognition', async (...args) => {
        const result = await original(...args);
        await new Promise<void>(resolve => { gate.release = resolve; gate.ready = true; });
        gate.delivered = true;
        return result;
      });
    });
    await page.getByRole('button', { name: '重新识别区域', exact: true }).click();
    await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
    await expect.poll(() => app.evaluate(() =>
      (globalThis as typeof globalThis & { recognitionGate: { ready: boolean } }).recognitionGate.ready)).toBe(true);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await app.evaluate(() => (globalThis as typeof globalThis & {
      recognitionGate: { release: () => void } }).recognitionGate.release());
    await expect.poll(() => app.evaluate(() =>
      (globalThis as typeof globalThis & { recognitionGate: { delivered: boolean } }).recognitionGate.delivered)).toBe(true);
    const afterLate = (await save()).snapshot;
    for (const field of ['labels', 'heights', 'colors', 'protection'] as const) expect(afterLate[field]).toEqual(reopened[field]);
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify({
      preserve: true, localOverwrite: true, exactUndoRedoReopen: true, discardedLateSuccess: true,
      invalidatesOnScopeAndHeight: true, emptySubjectBlocked: true,
      source: 'real Electron IPC and CPU color partition; no GPU or device validation',
    }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});

test('真实识别候选在后续编辑、撤销和更换工程后均被版本检查拒绝', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch(env.RELIEF_TEST_PACKAGED === '1'
    ? { executablePath: env.RELIEF_TEST_EXECUTABLE, env: { ...env, PATH: process.platform === 'win32' ? `${process.env.SystemRoot}\\System32` : '/usr/bin:/bin', PYTHONHOME: undefined, PYTHONPATH: undefined } }
    : { args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    const value = decodeProject(JSON.parse(await fs.readFile('tests/fixtures/v2/normal-v2.json', 'utf8')));
    const store = new EditorStore(value);
    const wire = await page.evaluate(snapshot => window.reliefV2!.recognition({
      requestId: 'stale-recognition', payload: { snapshot, mode: 'color', keepBackground: false, protectionPolicy: 'preserve' },
    }), encodeProject(store.snapshot));
    if (wire.result.status !== 'success') throw new Error(JSON.stringify(wire.result));
    const candidate = { ...wire.result, value: decodePatch(wire.result.value) };
    const manual = structuredClone(store.snapshot); manual.heights[2] = 22;
    store.commitPatch(diffSnapshot(store.snapshot, manual, '后续人工调高'));
    expect(store.accept(candidate)).toBe('stale');
    expect(store.snapshot.heights[2]).toBe(22);
    store.undo(); expect(store.accept(candidate)).toBe('stale');
    store.replace(value); expect(store.accept(candidate)).toBe('stale');
    expect(store.undoCount).toBe(0);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
