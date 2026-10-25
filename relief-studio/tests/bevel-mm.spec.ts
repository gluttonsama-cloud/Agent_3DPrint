import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeProject, encodeProject } from '../src/project-codec';

test('毫米倒角按非正方像素换算，真实 CPU 结果支持撤销重做和重开', async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const directory = path.join(process.cwd(), 'artifacts', `bevel-mm-${Date.now()}`);
  await fs.mkdir(directory, { recursive: true });
  const source = decodeProject(JSON.parse(await fs.readFile('tests/fixtures/v2/normal-v2.json', 'utf8')));
  Object.assign(source, {
    width: 32, height: 32, sizeMm: [8, 16], name: '毫米倒角非方像素验收',
    original: new Uint8Array(32 * 32 * 4).fill(255), colors: new Uint8Array(32 * 32 * 4).fill(255),
    labels: new Uint16Array(32 * 32).fill(1), heights: new Uint16Array(32 * 32).fill(200),
    protection: new Uint8Array(32 * 32), heightMapping: { kind: 'design', mmPerLayer: 0.1 },
  });
  source.protection[16 * 32] = 4;
  const inputFile = path.join(directory, 'input.json');
  await fs.writeFile(inputFile, JSON.stringify(encodeProject(source)));
  const app = await electron.launch({ args: [process.cwd()], env });
  try {
    const page = await app.firstWindow();
    const open = async (file: string) => {
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, file);
      await page.getByRole('button', { name: '打开工程', exact: true }).click();
      await expect(page.locator('.statusbar')).toContainText('工程已恢复');
    };
    let count = 0;
    const save = async () => {
      const file = path.join(directory, `save-${++count}.json`);
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, file);
      await page.getByRole('button', { name: '保存工程', exact: true }).click();
      await expect.poll(() => fs.stat(file).then(() => true, () => false)).toBe(true);
      await expect(page.locator('.statusbar')).toContainText('工程已保存');
      return { file, snapshot: decodeProject(JSON.parse(await fs.readFile(file, 'utf8'))) };
    };
    await open(inputFile);
    await page.getByText('像素高度', { exact: true }).click();
    await page.getByText('高级处理', { exact: true }).click();
    const unit = page.getByLabel('倒角单位', { exact: true });
    const mm = page.getByLabel('倒角宽度（mm）', { exact: true });
    const apply = page.getByRole('button', { name: '内部倒角', exact: true });
    await expect(unit).toHaveValue('mm');
    await expect(page.getByText(/毫米宽度依据工程设计尺寸 8 × 16 mm/)).toBeVisible();
    for (const invalid of ['', '0', '-1']) {
      await mm.fill(invalid);
      await expect(apply).toBeDisabled();
    }
    await mm.fill('1');
    await page.getByLabel('平滑次数', { exact: true }).fill('3');
    await unit.selectOption('px');
    await page.getByLabel('倒角宽度（像素）', { exact: true }).fill('4');
    await unit.selectOption('mm');
    await expect(mm).toHaveValue('1');
    await expect(page.getByLabel('平滑次数', { exact: true })).toHaveValue('3');
    await apply.click();
    await expect(page.locator('.statusbar')).toContainText('高度已应用');
    const processed = await save();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const index = y * 32 + x;
      const distance = Math.min((x + 1) * 0.25, (32 - x) * 0.25, (y + 1) * 0.5, (32 - y) * 0.5);
      expect(processed.snapshot.heights[index]).toBe(source.protection[index] ? 200 : Math.floor(200 * Math.min(1, distance) + 0.5));
    }
    for (const field of ['labels', 'colors', 'protection'] as const)
      expect(processed.snapshot[field]).toEqual(source[field]);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    expect((await save()).snapshot.heights).toEqual(source.heights);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    expect((await save()).snapshot.heights).toEqual(processed.snapshot.heights);
    await open(processed.file);
    expect((await save()).snapshot.heights).toEqual(processed.snapshot.heights);
    await page.screenshot({ path: path.join(directory, 'bevel-mm-desktop.png') });
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify({
      widthMm: 1, sizeMm: [8, 16], raster: [32, 32], pixelSpacingMm: [0.25, 0.5],
      all1024HeightsMatchAnalyticProfile: true, exactUndoRedoReopen: true,
      scope: 'source Electron and real CPU engine; no device validation',
    }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
