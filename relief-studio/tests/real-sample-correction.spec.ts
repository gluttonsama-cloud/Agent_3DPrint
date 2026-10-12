import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeProject } from '../src/project-codec';

test('真实水滴尖端：画笔补回、撤销、保存重开', async () => {
  test.skip(process.env.RELIEF_REAL_SAMPLE !== '1', '显式启用本机历史样图');
  const root = process.cwd();
  const source = path.join(root, 'artifacts/real-sample-review/kyocera-reviewed/drop.relief.json');
  const original = JSON.parse(await fs.readFile(source, 'utf8'));
  const output = path.join(root, 'artifacts', `tip-correction-${Date.now()}`);
  await fs.mkdir(output);
  let savedPath = path.join(output, 'corrected.json');
  let saveNumber = 0;
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.PATH = `${process.env.SystemRoot}\\System32`;
  delete env.PYTHONHOME; delete env.PYTHONPATH;
  const app = await electron.launch({ executablePath: path.join(root, 'release/win-unpacked/Relief Studio.exe'), env });
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect(await app.evaluate(({ app }) => app.getVersion())).toBe('0.4.2-d2.3');
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, { source, savedPath }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: savedPath });
    }, { source, savedPath });
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已恢复');
    const canvas = page.getByLabel('图案编辑画布');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    const save = async () => {
      savedPath = path.join(output, `save-${++saveNumber}.json`);
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      }, savedPath);
      await page.getByRole('button', { name: '保存工程', exact: true }).click();
      await expect.poll(() => fs.stat(savedPath).then(() => true, () => false)).toBe(true);
      await expect(page.locator('.statusbar')).toContainText('工程已保存');
      return decodeProject(JSON.parse(await fs.readFile(savedPath, 'utf8')));
    };
    const before = await save();
    const index = 759 * original.width + 505;
    expect(before.labels[index]).toBe(1);
    await page.locator('.region-card').nth(1).click();
    await page.getByRole('button', { name: '更多工具', exact: true }).click();
    await page.getByTitle('画笔 (B)', { exact: true }).click();
    await page.getByLabel('笔刷半径').fill('1');
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: 505.1 / original.width * box.width, y: 759.1 / original.height * box.height } });
    const corrected = await save();
    const correctedPath = path.join(output, 'corrected-copy.json');
    await fs.copyFile(savedPath, correctedPath);
    expect(corrected.labels[index]).toBe(2);
    expect(corrected.heights[index]).toBe(10);
    let changed = 0;
    for (let pixel = 0; pixel < before.labels.length; pixel++) {
      if (before.labels[pixel] === corrected.labels[pixel] && before.heights[pixel] === corrected.heights[pixel]) continue;
      changed++;
      const x = pixel % original.width, y = Math.floor(pixel / original.width);
      expect(Math.abs(x - 505)).toBeLessThanOrEqual(2);
      expect(Math.abs(y - 759)).toBeLessThanOrEqual(2);
    }
    expect(changed).toBeGreaterThan(0);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    const undone = await save();
    expect(Array.from(undone.labels)).toEqual(Array.from(before.labels));
    expect(Array.from(undone.heights)).toEqual(Array.from(before.heights));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, correctedPath);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已恢复');
    const reopened = await save();
    expect(Array.from(reopened.labels)).toEqual(Array.from(corrected.labels));
    expect(Array.from(reopened.heights)).toEqual(Array.from(corrected.heights));
    await page.screenshot({ path: path.join(output, 'reopened.png') });
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ packagedVersion: '0.4.2-d2.3', tip: [505, 759], changedPixels: changed, undoExact: true, reopenExact: true, scope: 'manual brush correction; not automatic recognition' }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
