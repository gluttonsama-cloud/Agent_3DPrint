import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('导入竖图保持比例，尺寸联动可撤销、解锁并保存重开', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const dir = path.join(process.cwd(), 'artifacts', `aspect-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 500; c.height = 658;
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#ff8800'; ctx.fillRect(0, 0, 500, 658);
      return c.toDataURL().split(',')[1];
    });
    const input = path.join(dir, 'portrait.png');
    await fs.writeFile(input, Buffer.from(png, 'base64'));
    await page.locator('input[type=file]').setInputFiles(input);
    await page.getByRole('button', { name: '应用裁剪', exact: true }).click();
    await page.getByRole('button', { name: '生成预览', exact: true }).click();
    await page.getByRole('button', { name: '应用识别结果', exact: true }).click();
    const width = page.getByRole('spinbutton', { name: '宽度', exact: true });
    const height = page.getByRole('spinbutton', { name: '高度', exact: true });
    await expect(height).toHaveValue('55');
    expect(Number(await width.inputValue())).toBeCloseTo(55 * 500 / 658, 8);
    await height.fill('110'); await height.press('Enter');
    expect(Number(await width.inputValue())).toBeCloseTo(110 * 500 / 658, 8);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(height).toHaveValue('55');
    await page.getByRole('button', { name: '比例已锁定', exact: true }).click();
    await width.fill('40'); await width.press('Enter');
    await expect(height).toHaveValue('55');
    const saved = path.join(dir, 'saved.json');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, saved);
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已恢复');
    await expect(width).toHaveValue('40'); await expect(height).toHaveValue('55');
    await expect(page.getByRole('button', { name: '比例已锁定' })).toHaveAttribute('aria-pressed', 'true');
    await width.fill('10000'); await width.press('Enter');
    await expect(width).toHaveValue('40'); await expect(height).toHaveValue('55');
    await expect(page.getByText(/联动后的宽高均需/)).toBeVisible();
    await page.screenshot({ path: path.join(dir, 'desktop.png') });
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy()));
    await app.close();
  }
});
