import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeProject } from '../src/project-codec';

test('真实徽标的歧义轮廓建议保持层高、颜色与历史不变', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const packaged = env.RELIEF_TEST_PACKAGED === '1';
  if (packaged) { env.PATH = `${process.env.SystemRoot}\\System32`; delete env.PYTHONHOME; delete env.PYTHONPATH; }
  const app = await electron.launch(packaged ? { executablePath: env.RELIEF_TEST_EXECUTABLE, env } : { args: [process.cwd()], env });
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(packaged);
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开示例工程', exact: true }).click();
    await expect(page.getByLabel('图案编辑画布')).toHaveAttribute('data-ready', 'true');
    const filename = path.join(process.cwd(), 'artifacts', 'structure-suggestion-verified.json');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, filename);
    const save = page.getByRole('button', { name: '保存工程', exact: true });
    await save.click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const before = decodeProject(JSON.parse(await fs.readFile(filename, 'utf8')));
    await page.getByText('像素高度', { exact: true }).click();
    await page.getByText('高级处理', { exact: true }).click();
    await page.getByLabel('自动处理', { exact: true }).selectOption('suggest');
    await page.getByRole('button', { name: '应用结构建议', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('已保留现有高度');
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
    await save.click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const after = decodeProject(JSON.parse(await fs.readFile(filename, 'utf8')));
    expect(after.heights).toEqual(before.heights);
    expect(after.labels).toEqual(before.labels);
    expect(after.colors).toEqual(before.colors);
    expect(after.protection).toEqual(before.protection);
    await page.getByRole('button', { name: '3D 浮雕', exact: true }).click();
    await expect(page.locator('.preview-host canvas')).toBeVisible();
    // 等待 Three.js 的首次绘制与下一帧合成，避免只截到背景。
    await page.evaluate(() => new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.screenshot({ path: 'artifacts/workbench/structure-suggestion-fixed.png' });
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
