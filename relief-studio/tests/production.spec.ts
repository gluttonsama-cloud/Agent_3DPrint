import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('生产窗口：白墨预览、拼版检查、批次交付与按记录重印', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  const page = await app.firstWindow();
  const directory = await fs.mkdtemp(path.join(process.cwd(), 'artifacts/production-'));
  const fixture = path.join(process.cwd(), 'tests/fixtures/v2/normal-v2.json');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, fixture);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await page.getByRole('button', { name: '输出与生产', exact: true }).click();
    const panel = page.getByRole('dialog', { name: '输出与生产' });
    await panel.getByLabel('输出父目录').fill(directory);
    await panel.getByLabel('附加 JPG 参考副本（不改变打印清单）', { exact: true }).check();
    await panel.getByRole('button', { name: '预览实际白墨层' }).click();
    await expect(panel.getByAltText('第 1 层白墨，已应用补偿、方向及极性')).toBeVisible();
    await panel.getByText('拼版、批量与试印', { exact: true }).click();
    await panel.getByRole('button', { name: '加入当前工程' }).click();
    await panel.getByLabel('工作台宽 (mm)').fill('20');
    await panel.getByLabel('工作台高 (mm)').fill('20');
    await panel.getByLabel('采样 (px/mm)').fill('2');
    await panel.getByRole('button', { name: '生成并检查拼版' }).click();
    await expect(panel.getByRole('img', { name: '拼版位置预览' })).toBeVisible();
    await panel.getByRole('button', { name: '导出整版', exact: true }).click();
    await expect(panel.getByText(/批次处理完成：/)).toBeVisible();
    const first = (await fs.readdir(directory)).find(name => name.startsWith('生产批次_'))!;
    const manifest = JSON.parse(await fs.readFile(path.join(directory, first, '001/manifest.json'), 'utf8'));
    expect(manifest.sizeMm).toEqual([20,20]);
    expect(manifest.tasks.every((task: { file: string }) => task.file.endsWith('.png'))).toBe(true);
    expect(await fs.readFile(path.join(directory, first, '001/PRINT-ORDER.txt'), 'utf8')).toContain('20');
    await panel.getByText('补打与失败重试', { exact: true }).click();
    await panel.getByRole('button', { name: '按原参数补打', exact: true }).click();
    await expect(panel.getByRole('button', { name: '按原参数补打', exact: true })).toBeEnabled();
    expect((await fs.readdir(directory)).filter(name => name.startsWith('生产批次_'))).toHaveLength(2);
    await page.screenshot({ path: path.join(directory, 'production.png'), fullPage: true });
    await panel.evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: path.join(directory, 'output-top.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
