import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeProject, encodeProject } from '../src/project-codec';
import { decodePatch } from '../src/capability-service';
import { applyCandidate } from '../src/contracts/patch';
import type { HeightOperation, ProjectSnapshot } from '../src/contracts';

test('真实徽标倒角和平滑参数独立，细字层高与撤销重开保持一致', async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const directory = path.join(process.cwd(), 'artifacts', `height-edges-${Date.now()}`);
  await fs.mkdir(directory, { recursive: true });
  const app = await electron.launch(env.RELIEF_TEST_PACKAGED === '1'
    ? { executablePath: env.RELIEF_TEST_EXECUTABLE, env: { ...env, PATH: process.platform === 'win32' ? `${process.env.SystemRoot}\\System32` : '/usr/bin:/bin', PYTHONHOME: undefined, PYTHONPATH: undefined } }
    : { args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开示例工程', exact: true }).click();
    await expect(page.getByLabel('图案编辑画布')).toHaveAttribute('data-ready', 'true');
    let saveNumber = 0;
    const save = async () => {
      const file = path.join(directory, `save-${++saveNumber}.json`);
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, file);
      await page.getByRole('button', { name: '保存工程', exact: true }).click();
      await expect.poll(() => fs.stat(file).then(() => true, () => false)).toBe(true);
      await expect(page.locator('.statusbar')).toContainText('工程已保存');
      return { file, snapshot: decodeProject(JSON.parse(await fs.readFile(file, 'utf8'))) };
    };
    const before = (await save()).snapshot;
    const expectedHeight = async (snapshot: ProjectSnapshot, operation: HeightOperation) => {
      const response = await page.evaluate(async (payload) => window.reliefV2!.height({
        requestId: crypto.randomUUID(), payload,
      }), { snapshot: encodeProject(snapshot), operation });
      if (response.result.status !== 'success') throw new Error(JSON.stringify(response.result));
      return applyCandidate(snapshot, decodePatch(response.result.value)).heights;
    };
    await page.getByText('像素高度', { exact: true }).click();
    await page.getByText('高级处理', { exact: true }).click();
    await page.getByLabel('倒角单位', { exact: true }).selectOption('px');
    const width = page.getByLabel('倒角宽度（像素）', { exact: true });
    const passes = page.getByLabel('平滑次数', { exact: true });
    await expect(width).toBeVisible();
    await expect(passes).toHaveValue('2');
    await width.fill('4');
    await expect(passes).toHaveValue('2');
    const bevel = page.getByRole('button', { name: '内部倒角', exact: true });
    const smooth = page.getByRole('button', { name: '区域平滑', exact: true });
    // 两种参数独立校验：一项无效不应禁止另一项。
    await passes.fill('0');
    await expect(smooth).toBeDisabled();
    await expect(bevel).toBeEnabled();
    await passes.fill('3');
    await width.fill('');
    await expect(bevel).toBeDisabled();
    await expect(smooth).toBeEnabled();
    await width.fill('4');
    const expectedBevel = await expectedHeight(before, { kind: 'bevel', radiusPx: 4 });
    await bevel.click();
    await expect(page.locator('.statusbar')).toContainText('高度已应用');
    const beveled = (await save()).snapshot;
    expect(beveled.heights).toEqual(expectedBevel);
    const expectedSmooth = await expectedHeight(beveled, { kind: 'smooth', radiusPx: 3 });
    await smooth.click();
    await expect(page.locator('.statusbar')).toContainText('高度已应用');
    const processed = await save();
    expect(processed.snapshot.heights).toEqual(expectedSmooth);
    const white = before.heights.reduce<number[]>((indices, height, index) => {
      if (height === 10) indices.push(index);
      return indices;
    }, []);
    for (const candidate of [beveled, processed.snapshot]) {
      expect(candidate.labels).toEqual(before.labels);
      expect(candidate.colors).toEqual(before.colors);
      expect(candidate.protection).toEqual(before.protection);
      const raisedText = white.map(index => candidate.heights[index]);
      expect(Math.min(...raisedText)).toBeGreaterThanOrEqual(5);
      expect(Math.max(...raisedText)).toBe(10);
      expect(candidate.heights.every((height, index) => before.heights[index] > 0 || height === 0)).toBe(true);
    }
    expect(beveled.heights).not.toEqual(before.heights);
    expect(processed.snapshot.heights).not.toEqual(beveled.heights);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    expect((await save()).snapshot.heights).toEqual(beveled.heights);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    expect((await save()).snapshot.heights).toEqual(before.heights);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await page.getByRole('button', { name: '重做', exact: true }).click();
    expect((await save()).snapshot.heights).toEqual(processed.snapshot.heights);
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, processed.file);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已恢复');
    const reopened = (await save()).snapshot;
    for (const field of ['heights', 'labels', 'colors', 'protection'] as const)
      expect(reopened[field]).toEqual(processed.snapshot[field]);
    await page.getByRole('button', { name: '3D 浮雕', exact: true }).click();
    await expect(page.locator('.preview-host canvas')).toBeVisible();
    await page.screenshot({ path: path.join(directory, 'height-edges-desktop.png') });
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify({
      source: 'samples/sample-project.json', bevelRadiusPx: 4, smoothIterations: 3,
      whiteTextMinLayers: Math.min(...white.map(index => processed.snapshot.heights[index])),
      exactUndoRedoReopen: true, scope: 'source Electron and real CPU engine; no device validation',
    }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
