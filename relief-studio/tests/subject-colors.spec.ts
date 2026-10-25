import { decodeProject } from '../src/project-codec';
import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

for (const mergeShades of [false, true]) {
  test(`主体明暗合并=${mergeShades}：切换预览、设高与保存重开保持轮廓`, async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const packaged = env.RELIEF_TEST_PACKAGED === '1';
    if (packaged) {
      env.PATH = `${process.env.SystemRoot}\\System32`;
      delete env.PYTHONHOME;
      delete env.PYTHONPATH;
    }
    const app = await electron.launch(
      packaged
        ? {
            executablePath:
              env.RELIEF_TEST_EXECUTABLE ||
              path.join(process.cwd(), 'release/win-unpacked/Relief Studio.exe'),
            args: [],
            env,
          }
        : { args: [process.cwd()], env },
    );
    const page = await app.firstWindow();
    try {
      const fixture = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 100;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, 100, 100);
        for (const [x, color] of [
          [10, '#080808'],
          [30, '#f8f8f8'],
          [50, '#d2a046'],
          [70, '#785a26'],
        ] as const) {
          ctx.fillStyle = color;
          ctx.fillRect(x, 10, 20, 80);
        }
        const image = canvas.toDataURL();
        ctx.clearRect(0, 0, 100, 100);
        ctx.fillStyle = 'white';
        ctx.fillRect(10, 10, 80, 80);
        return { image, mask: canvas.toDataURL() };
      });
      // 只固定模型选区；分色与工程保存走真实桌面 IPC 和 Python。
      await app.evaluate(({ ipcMain }, mask) => {
        let calls = 0;
        ipcMain.removeHandler('relief:subject-status');
        ipcMain.handle('relief:subject-status', () => ({ installed: true }));
        ipcMain.removeHandler('relief:subject');
        ipcMain.handle('relief:subject', () => {
          if (++calls > 1) throw new Error('切换分色策略不应重新提取主体');
          return { mask, elapsedSeconds: 0, peakVramMB: 0 };
        });
      }, fixture.mask);
      await page.locator('input[type=file]').setInputFiles({
        name: '多色主体.png',
        mimeType: 'image/png',
        buffer: Buffer.from(fixture.image.split(',')[1], 'base64'),
      });
      await page.getByRole('button', { name: '应用裁剪' }).click();
      const dialog = page.getByRole('dialog', { name: '识别区域' });
      await dialog.getByRole('button', { name: '主体提取', exact: true }).click();
      await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('4 个主体色区');
      const colors = dialog.locator('.recognition-colors button');
      const merge = dialog.getByRole('checkbox', { name: '合并同色系明暗', exact: true });
      await expect(merge).not.toBeChecked();
      await expect(colors).toHaveCount(4);
      await merge.check();
      await expect(colors).toHaveCount(3);
      await merge.uncheck();
      await expect(colors).toHaveCount(4);
      if (mergeShades) {
        await merge.check();
        await expect(colors).toHaveCount(3);
      }
      const subjectCount = mergeShades ? 3 : 4;
      await dialog.getByRole('button', { name: '对照原图', exact: true }).click();
      await colors.nth(0).click();
      await expect(colors.nth(0)).toHaveAttribute('aria-pressed', 'true');
      const canvas = dialog.getByLabel('识别预览画布');
      const first = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
      await colors.nth(1).click();
      await expect
        .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
        .not.toBe(first);
      await dialog.getByLabel('主体堆叠层数', { exact: true }).fill('6');
      await dialog.getByRole('button', { name: '应用识别结果', exact: true }).click();
      await expect(page.locator('.region-card')).toHaveCount(subjectCount + 1);
      const filename = path.join(
        process.cwd(),
        `artifacts/subject-colors-v2-${Date.now()}.relief.json`,
      );
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, filename);
      await page.getByRole('button', { name: '保存工程', exact: true }).click();
      await expect(page.locator('.statusbar')).toContainText('工程已保存');
      const saved = decodeProject(JSON.parse(await fs.readFile(filename, 'utf8')));
      expect(saved.regions.map((r) => r.defaultLayers)).toEqual([
        0,
        ...Array(subjectCount).fill(6),
      ]);
      expect(saved.labels[0]).toBe(1);
      expect(new Set([saved.labels[2020], saved.labels[2040], saved.labels[2060]]).size).toBe(3);
      expect(saved.labels[2060] === saved.labels[2080]).toBe(mergeShades);
      expect(saved.labels.filter((label: number) => label > 1)).toHaveLength(6400);
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, filename);
      await page.getByRole('button', { name: '打开工程', exact: true }).click();
      await expect(page.locator('.statusbar')).toContainText('工程已恢复');
      await expect(page.locator('.region-card')).toHaveCount(subjectCount + 1);
      await expect
        .poll(() =>
          page
            .getByLabel('图案编辑画布')
            .evaluate(
              (c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(20, 20, 1, 1).data[3],
            ),
        )
        .toBe(255);
      await page.screenshot({ path: `artifacts/subject-colors-merge-${mergeShades}-desktop.png` });
    } finally {
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
      );
      await app.close();
    }
  });
}
