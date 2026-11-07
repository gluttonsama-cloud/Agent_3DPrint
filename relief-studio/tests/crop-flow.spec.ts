import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('原图裁剪保留细节，拖动缩放和返回裁剪保留草稿，取消保留旧工程', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const dir = path.join(process.cwd(), 'artifacts', `crop-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开 55 mm 徽标示例' }).click();
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 4000; c.height = 4000;
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 4000, 4000);
      ctx.fillStyle = '#000000'; ctx.fillRect(100, 100, 500, 658);
      return c.toDataURL().split(',')[1];
    });
    const file = path.join(dir, 'large.png'); await fs.writeFile(file, Buffer.from(png, 'base64'));
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByTestId('crop-size')).toContainText('原图 4000 × 4000 px');
    const canvas = page.locator('.crop-stage canvas');
    const box = (await canvas.boundingBox())!;
    const handle = (await page.getByLabel('裁剪角点 se', { exact: true }).boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 500 / 4000, box.y + box.height * 658 / 4000);
    await page.mouse.up();
    await expect(page.getByTestId('crop-size')).toContainText('裁剪 500 × 658 px · 工作图 500 × 658 px');
    await page.mouse.move(box.x + box.width * 250 / 4000, box.y + box.height * 300 / 4000);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 350 / 4000, box.y + box.height * 400 / 4000);
    await page.mouse.up();
    const before = await page.locator('.crop-outline').getAttribute('style');
    await page.getByLabel('锁定裁剪比例').check();
    await page.getByLabel('椭圆裁切，外部不打印').check();
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: '应用裁剪', exact: true }).click();
      await page.getByRole('button', { name: '返回裁剪', exact: true }).click();
      await expect(page.getByTestId('crop-size')).toContainText('工作图 500 × 658 px');
      await expect(page.getByLabel('锁定裁剪比例')).toBeChecked();
      await expect(page.getByLabel('椭圆裁切，外部不打印')).toBeChecked();
    }
    await page.getByLabel('椭圆裁切，外部不打印').uncheck();
    await expect(page.locator('.crop-outline')).toHaveAttribute('style', before!);
    await page.screenshot({ path: path.join(dir, 'crop.png') });
    await page.getByRole('button', { name: '应用裁剪', exact: true }).click();
    await page.getByRole('button', { name: '生成预览', exact: true }).click();
    await expect(page.getByRole('button', { name: '应用识别结果', exact: true })).toBeEnabled();
    await expect(page.locator('.recognition-stage canvas')).toHaveAttribute('width', '500');
    await expect(page.locator('.recognition-stage canvas')).toHaveAttribute('height', '658');
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('relief:segment-cancel');
      ipcMain.handle('relief:segment-cancel', () => new Promise(resolve => setTimeout(resolve, 1200)));
    });
    await page.getByRole('button', { name: '返回裁剪', exact: true }).click();
    await expect(page.locator('.recognition-dialog')).toHaveAttribute('inert', '');
    await expect(page.getByRole('button', { name: '应用识别结果', exact: true, includeHidden: true })).toBeDisabled();
    await page.getByRole('button', { name: '使用整图', exact: true }).click();
    await expect(page.getByTestId('crop-size')).toContainText('工作图 2048 × 2048 px');
    await page.getByRole('button', { name: '取消裁剪' }).click();
    await expect(page.getByRole('spinbutton', { name: '宽度', exact: true })).toHaveValue('55');
    await expect(page.getByRole('heading', { name: /科尔沁/ })).toBeVisible();
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy()));
    await app.close();
  }
});
