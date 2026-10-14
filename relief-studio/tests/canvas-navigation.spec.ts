import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeProject } from '../src/project-codec';

test('真实画布定点缩放、空白处平移、缩放后笔刷与撤销', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const packaged = env.RELIEF_TEST_PACKAGED === '1';
  if (packaged) { env.PATH = `${process.env.SystemRoot}\\System32`; delete env.PYTHONHOME; delete env.PYTHONPATH; }
  const app = await electron.launch(packaged ? { executablePath: env.RELIEF_TEST_EXECUTABLE, env } : { args: [process.cwd()], env });
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(packaged);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开示例工程', exact: true }).click();
    const canvas = page.getByLabel('图案编辑画布');
    const viewport = page.locator('.canvas-viewport');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    const dimensions = await canvas.evaluate((node: HTMLCanvasElement) => ({ width: node.width, height: node.height }));
    const before = (await canvas.boundingBox())!;
    const anchor = { x: before.x + before.width * 0.6, y: before.y + before.height * 0.4 };
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(before.width);
    const after = (await canvas.boundingBox())!;
    expect((anchor.x - after.x) / after.width).toBeCloseTo(0.6, 3);
    expect((anchor.y - after.y) / after.height).toBeCloseTo(0.4, 3);
    await page.keyboard.press('Control+1');
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(dimensions.width, 0);
    await expect(page.getByLabel('缩放比例')).toHaveText('100%');
    await page.keyboard.press('Control+0');
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(before.width, 0);
    const fitted = (await canvas.boundingBox())!;
    const host = (await viewport.boundingBox())!;
    // 从图片外的工作区起拖；导航不得留下笔画或选区。
    await page.mouse.move(host.x + 8, host.y + 8);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(host.x + 38, host.y + 28, { steps: 4 });
    await page.mouse.up(); await page.keyboard.up('Space');
    const moved = (await canvas.boundingBox())!;
    expect(moved.x).toBeCloseTo(fitted.x + 30, 0);
    expect(moved.y).toBeCloseTo(fitted.y + 20, 0);
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '适合', exact: true }).click();
    await page.getByRole('button', { name: '放大', exact: true }).click();
    await page.getByRole('button', { name: '修补', exact: true }).click();
    await page.getByLabel('修补方式').selectOption('erase');
    await page.getByLabel('笔刷半径').fill('3');
    const box = (await canvas.boundingBox())!;
    const sample = JSON.parse(await fs.readFile('samples/sample-project.json', 'utf8'));
    const px = Math.floor(sample.width / 2), py = Math.floor(sample.height / 2);
    expect(sample.labels[py * sample.width + px]).toBeGreaterThan(0);
    await page.mouse.click(box.x + (px + 0.5) * box.width / sample.width, box.y + (py + 0.5) * box.height / sample.height);
    const filename = path.join(process.cwd(), 'artifacts', 'zoom-brush-verification.json');
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, filename);
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const saved = decodeProject(JSON.parse(await fs.readFile(filename, 'utf8')));
    expect(saved.labels[py * sample.width + px]).toBe(0);
    expect(saved.labels[py * sample.width + px + 10]).toBe(sample.labels[py * sample.width + px + 10]);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    await expect.poll(async () => Array.from(decodeProject(JSON.parse(await fs.readFile(filename, 'utf8'))).labels)).toEqual(sample.labels);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});

test('中央对照与独立 3D、紧凑高度面板在三种窗口尺寸下可用', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const packaged = env.RELIEF_TEST_PACKAGED === '1';
  if (packaged) { env.PATH = `${process.env.SystemRoot}\\System32`; delete env.PYTHONHOME; delete env.PYTHONPATH; }
  const app = await electron.launch(packaged ? { executablePath: env.RELIEF_TEST_EXECUTABLE, args: ['--d1'], env } : { args: [process.cwd(), '--d1'], env });
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(packaged);
    const page = await app.firstWindow();
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('button', { name: '打开示例工程', exact: true }).click();
    await expect(page.getByLabel('图案编辑画布')).toHaveAttribute('data-ready', 'true');
    await page.getByText('像素高度', { exact: true }).click();
    await page.getByRole('button', { name: '对照', exact: true }).click();
    for (const size of [{ width: 1600, height: 1000 }, { width: 1280, height: 800 }, { width: 960, height: 760 }]) {
      await page.setViewportSize(size);
      await expect(page.locator('.preview-host canvas')).toBeVisible();
      const edit = (await page.locator('.editor-pane').boundingBox())!;
      const preview = (await page.locator('.preview-pane').boundingBox())!;
      if (size.width >= 1280) {
        expect(preview.x).toBeGreaterThan(edit.x + edit.width - 2);
        expect(preview.width).toBeGreaterThan(350);
      } else {
        expect(preview.y).toBeGreaterThan(edit.y + edit.height - 2);
        expect(preview.height).toBeGreaterThan(180);
      }
      const scroll = page.locator('.properties-scroll');
      expect(await scroll.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const panel = page.getByLabel('高度面板');
      expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.getByLabel('临时高度预览').fill(String(Math.round(size.width / 100)));
      await expect(page.getByLabel('D1 状态')).toHaveAttribute('data-preview', 'true');
      await expect(page.getByLabel('D1 状态')).toHaveAttribute('data-history', '0');
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await expect(page.getByLabel('D1 状态')).toHaveAttribute('data-preview', 'false');
      await page.screenshot({ path: `artifacts/workbench/redesign-${size.width}.png` });
    }
    await page.getByRole('button', { name: '展开画布', exact: true }).click();
    await expect(page.locator('.left-panel')).toBeHidden();
    await expect(page.locator('.right-panel')).toBeHidden();
    expect((await page.locator('.preview-pane').boundingBox())!.width).toBeGreaterThan(450);
    await page.screenshot({ path: 'artifacts/workbench/redesign-focused.png' });
    await page.getByRole('button', { name: '显示面板', exact: true }).click();
    await page.getByText('高级处理', { exact: true }).click();
    await page.getByRole('button', { name: '区域平滑', exact: true }).scrollIntoViewIfNeeded();
    expect(await page.locator('.properties-scroll').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '3D 浮雕', exact: true }).click();
    await expect(page.getByLabel('图案编辑画布')).toBeHidden();
    const large = (await page.locator('.preview-host').boundingBox())!;
    expect(large.height).toBeGreaterThan(450);
    await page.getByRole('button', { name: '复位视角', exact: true }).click();
    await page.getByRole('button', { name: '平面编辑', exact: true }).click();
    await expect(page.getByLabel('图案编辑画布')).toBeVisible();
    await page.getByLabel('白墨层数', { exact: true }).fill('');
    await expect(page.getByRole('button', { name: '应用选区高度', exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
