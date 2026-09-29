import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('真实 GPU 自动优化：无需框选、中文管道、暗面及零层背景', async () => {
  test.skip(process.env.RELIEF_TEST_GPU !== '1', '显式启用本机 GPU');
  test.setTimeout(180000);
  const root = process.cwd(),
    env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env }),
    page = await app.firstWindow();
  try {
    const input = path.join(root, 'artifacts/foreground-040/sample.relief.json');
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, input);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await page.getByRole('button', { name: '重新识别区域', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '主体提取', exact: true }).click();
    await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('主体提取与自动优化已完成', {
      timeout: 150000,
    });
    await page.screenshot({ path: path.join(root, 'artifacts/automatic-optimization/dialog.png') });
    await dialog.getByRole('button', { name: '应用识别结果', exact: true }).click();
    await expect(page.locator('.region-card').filter({ hasText: '平面背景' })).toBeVisible();
    const output = path.join(root, 'artifacts/automatic-optimization/ui.relief.json');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, output);
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('工程已保存');
    const project = JSON.parse(await fs.readFile(output, 'utf8'));
    expect(project.regions[0].name).toBe('平面背景');
    expect(project.regions[0].layers).toBe(0);
    expect(project.labels[788 * 1280 + 501]).toBeGreaterThan(1);
    expect(project.labels[950 * 1280 + 430]).toBe(1);
    expect(project.labels[980 * 1280 + 506]).toBe(1);
    // 原图横条下方暗影与左侧光晕不能形成凸起连接。
    expect(project.labels[296 * 1280 + 640]).toBe(1);
    expect(project.labels[559 * 1280 + 420]).toBe(1);
    expect(project.labels[559 * 1280 + 410]).toBe(1);
    expect(project.labels[919 * 1280 + 690]).toBeGreaterThan(1);
    await page.getByRole('button', { name: '3D 浮雕', exact: true }).click();
    await expect(page.locator('.preview-host canvas')).toHaveCount(1);
    await page.screenshot({ path: path.join(root, 'artifacts/automatic-optimization/ui-3d.png') });
    const refined = await page.evaluate(
      async (p) =>
        window.relief!.refine({
          id: '中文管道回归',
          project: p,
          target: 2,
          background: 1,
          box: [360, 895, 920, 1025],
          mode: 'text',
          hints: new Array(p.labels.length).fill(0),
        }),
      project,
    );
    expect(refined.project.name).toBe(project.name);
    expect(refined.project.regions).toEqual(project.regions);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
  }
});
