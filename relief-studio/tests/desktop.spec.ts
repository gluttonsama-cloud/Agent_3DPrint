import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function launchDesktop() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (process.env.RELIEF_TEST_PACKAGED === '1') {
    env.PATH = `${process.env.SystemRoot}\\System32`;
    delete env.PYTHONHOME;
    delete env.PYTHONPATH;
    return electron.launch({
      executablePath: path.join(root, 'release', 'win-unpacked', 'Relief Studio.exe'),
      args: [],
      env,
    });
  }
  return electron.launch({ args: [root], env });
}

test('离线桌面：样例编辑、3D、撤销、保存重开、导出', async () => {
  const app = await launchDesktop();
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const output = path.join(root, 'artifacts', `desktop-${Date.now()}`);
  await fs.mkdir(output, { recursive: true });
  try {
    await expect(page.getByRole('heading', { name: '让平面，生长出层次。' })).toBeVisible();
    await page.screenshot({ path: path.join(root, 'artifacts', 'welcome.png') });
    await page.context().setOffline(true);
    await page.getByRole('button', { name: '载入演示图案 →' }).click();
    await expect(page.getByRole('heading', { name: '科尔沁 · 55 mm 徽标' })).toBeVisible();
    await page.getByRole('button', { name: /白字 · 凸起/ }).click();
    await expect(page.getByLabel('区域层数', { exact: true })).toHaveValue('10');
    await page.getByLabel('区域层数', { exact: true }).fill('15');
    await page.getByRole('button', { name: '↶ 撤销' }).click();
    await expect(page.getByLabel('区域层数', { exact: true })).toHaveValue('10');
    await page.screenshot({ path: path.join(root, 'artifacts', 'editor.png') });
    await page.getByRole('button', { name: '3D 浮雕', exact: true }).click();
    await expect(page.locator('.preview-host canvas')).toBeVisible();
    await expect(page.getByText('当前环境无法启用 WebGL', { exact: false })).toHaveCount(0);
    // 等待 Three.js 首次纹理完成 GPU 绘制，再保存截图。
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(root, 'artifacts', 'preview.png') });
    await page.getByRole('button', { name: '平面编辑', exact: true }).click();
    await page.getByLabel('宽度', { exact: true }).fill('60');
    const savePath = path.join(output, '测试工程.relief.json');
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
    }, savePath);
    await page.getByRole('button', { name: /^保存/ }).click();
    await expect(page.getByRole('status')).toContainText('工程已保存');
    const saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
    expect(saved.sizeMm).toEqual([60, 55]);
    await app.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, savePath);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('工程已恢复');
    await expect(page.getByLabel('宽度', { exact: true })).toHaveValue('60');
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, output);
    await page.getByRole('button', { name: '导出分层 ↗' }).click();
    await expect(page.getByRole('status')).toContainText('分层文件已导出');
    const dir = (await fs.readdir(output)).find((name) => name.startsWith('relief-'))!;
    const manifest = JSON.parse(await fs.readFile(path.join(output, dir, 'manifest.json'), 'utf8'));
    expect(manifest.layerCount).toBe(10);
    expect(manifest.sizeMm).toEqual([60, 55]);
    expect(manifest.calibrated).toBe(false);
    expect(await fs.readdir(path.join(output, dir, 'layers'))).toHaveLength(10);
    const restored = JSON.parse(await fs.readFile(path.join(output, dir, 'project.json'), 'utf8'));
    expect(restored).toEqual(saved);
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
  }
});

test('导入、圆形裁剪、分区、画笔擦除与撤销', async () => {
  const app = await launchDesktop();
  const page = await app.firstWindow();
  try {
    await page
      .locator('input[type=file]')
      .setInputFiles(path.join(root, 'samples', 'source-logo.jpg'));
    await expect(page.getByRole('dialog', { name: '裁剪图片' })).toBeVisible();
    const canvas = page.locator('.crop-stage canvas');
    await expect(canvas).toHaveAttribute('width', '619');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + (105 / 619) * box.width, box.y + (24 / 619) * box.height);
    await page.mouse.down();
    await page.mouse.move(box.x + (515 / 619) * box.width, box.y + (434 / 619) * box.height, {
      steps: 5,
    });
    await page.mouse.up();
    await page.getByLabel('椭圆裁切，外部不打印').check();
    await page.getByRole('button', { name: '确认裁剪并分区 →' }).click();
    await expect(page.getByRole('status')).toContainText('分区已完成');
    await expect(page.locator('.region-card')).toHaveCount(3);
    await page.getByRole('button', { name: '擦除', exact: true }).click();
    const art = page.getByLabel('图案编辑画布');
    const artBox = (await art.boundingBox())!;
    await page.mouse.click(artBox.x + artBox.width / 2, artBox.y + artBox.height / 2);
    await expect(page.getByRole('button', { name: '↶ 撤销' })).toBeEnabled();
    await page.getByRole('button', { name: '↶ 撤销' }).click();
    await expect(page.getByRole('button', { name: '↶ 撤销' })).toBeDisabled();
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
  }
});
