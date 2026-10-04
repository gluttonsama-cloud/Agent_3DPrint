import { decodeProject } from '../src/project-codec';
import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
test.beforeAll(async () => {
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
});

test('区域属性不再显示独立修整入口', async () => {
  const app = await launchDesktop(),
    page = await app.firstWindow();
  try {
    await page.getByRole('button', { name: '打开 55 mm 徽标示例' }).click();
    await expect(page.getByRole('button', { name: '小幅修整', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '精确提取', exact: true })).toHaveCount(0);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
  }
});

test('框选补选传递原图坐标，保留框外画笔并支持撤销', async () => {
  const app = await launchDesktop(),
    page = await app.firstWindow();
  try {
    const images = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 100, 100);
      const source = canvas.toDataURL();
      ctx.clearRect(0, 0, 100, 100);
      ctx.fillRect(30, 30, 10, 10);
      return { source, mask: canvas.toDataURL() };
    });
    // 替换模型 IPC，仅验证交互契约；真实 GPU 结果另做样本对照。
    await app.evaluate(({ ipcMain }, mask) => {
      ipcMain.removeHandler('relief:subject-status');
      ipcMain.handle('relief:subject-status', () => ({ installed: true, directory: 'test' }));
      ipcMain.removeHandler('relief:subject');
      ipcMain.handle('relief:subject', (_, job) => {
        if (job.action !== 'predict' || JSON.stringify(job.box) !== '[20,20,81,81]')
          throw new Error('框坐标错误：' + JSON.stringify(job.box));
        return { id: job.id, mask, elapsedSeconds: 0, peakVramMB: 0 };
      });
    }, images.mask);
    await page.locator('input[type=file]').setInputFiles({
      name: 'box.png',
      mimeType: 'image/png',
      buffer: Buffer.from(images.source.split(',')[1], 'base64'),
    });
    await page.getByRole('button', { name: '应用裁剪' }).click();
    const dialog = page.getByRole('dialog', { name: '识别区域' });
    await dialog.getByRole('button', { name: '主体提取', exact: true }).click();
    const canvas = dialog.getByLabel('识别预览画布');
    const box = (await canvas.boundingBox())!;
    const position = (x: number, y: number) => ({
      x: ((x + 0.5) / 100) * box.width,
      y: ((y + 0.5) / 100) * box.height,
    });
    await dialog.getByRole('button', { name: '画笔修边', exact: true }).click();
    await canvas.click({ position: position(5, 5) });
    const brushOnly = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
    await dialog.getByRole('button', { name: '框选补选', exact: true }).click();
    await dialog.getByRole('button', { name: '对照原图', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '查看主体', exact: true })).toBeVisible();
    await canvas.click({ position: position(50, 50) });
    await expect(dialog.getByRole('status')).toContainText('至少 8 × 8');
    await expect(dialog.getByRole('button', { name: '对照原图', exact: true })).toBeVisible();
    const drag = async () => {
      await expect(dialog.getByRole('button', { name: '框选补选', exact: true })).toBeEnabled();
      const start = position(80, 80),
        end = position(20, 20);
      await page.mouse.move(box.x + start.x, box.y + start.y);
      await page.mouse.down();
      await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 5 });
      await page.mouse.up();
      await expect(dialog.getByRole('status')).toContainText('已补选框内图案');
    };
    await drag();
    await dialog.getByRole('button', { name: '撤销主体修改', exact: true }).click();
    await expect
      .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
      .toBe(brushOnly);
    await drag();
    await dialog.getByRole('button', { name: '应用识别结果' }).click();
    const filename = path.join(root, 'artifacts', `local-box-v2-${Date.now()}.relief.json`);
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, filename);
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const saved = decodeProject(JSON.parse(await fs.readFile(filename, 'utf8')));
    expect(saved.labels[505]).toBe(2);
    expect(saved.labels[3535]).toBe(2);
    expect(saved.labels[9090]).toBe(1);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
  }
});

test('分色背景逐块排除、恢复，保留主体中的同色白字', async () => {
  const app = await launchDesktop(),
    page = await app.firstWindow();
  try {
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = 'black';
      ctx.fillRect(20, 20, 60, 60);
      ctx.fillStyle = 'white';
      ctx.fillRect(40, 40, 20, 20);
      return canvas.toDataURL();
    });
    await page.locator('input[type=file]').setInputFiles({
      name: 'white-letter.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image.split(',')[1], 'base64'),
    });
    await page.getByRole('button', { name: '应用裁剪' }).click();
    const dialog = page.getByRole('dialog', { name: '识别区域' });
    await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('已识别 2 个区域');
    await dialog.getByRole('button', { name: '标记背景', exact: true }).click();
    const canvas = dialog.getByLabel('识别预览画布');
    const box = (await canvas.boundingBox())!;
    const clickOutside = () =>
      canvas.click({ position: { x: box.width * 0.05, y: box.height * 0.05 } });
    const alphas = () =>
      canvas.evaluate((element) => {
        const ctx = (element as HTMLCanvasElement).getContext('2d')!;
        return [ctx.getImageData(5, 5, 1, 1).data[3], ctx.getImageData(50, 50, 1, 1).data[3]];
      });
    await clickOutside();
    await expect.poll(alphas).toEqual([0, 255]);
    await clickOutside();
    await expect.poll(alphas).toEqual([255, 255]);
    await clickOutside();
    await dialog.getByRole('button', { name: '恢复全部背景' }).click();
    await expect.poll(alphas).toEqual([255, 255]);
    await clickOutside();
    await expect.poll(alphas).toEqual([0, 255]);
    await page.screenshot({ path: path.join(root, 'artifacts', 'background-confirmation.png') });
    await dialog.getByRole('button', { name: '应用识别结果' }).click();
    const savePath = path.join(root, 'artifacts', `background-confirmation-v2-${Date.now()}.relief.json`);
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
    }, savePath);
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const saved = decodeProject(JSON.parse(await fs.readFile(savePath, 'utf8')));
    expect(saved.labels[505]).toBe(0);
    expect(saved.labels[5050]).toBeGreaterThan(0);
    expect(saved.labels[3030]).toBeGreaterThan(0);
    expect(saved.labels[5050]).not.toBe(saved.labels[3030]);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
  }
});

test('GPU 整体主体、直接补选排除撤销、背景零层', async () => {
  // 打包版首次加载模型有额外开销；此项验证正确性，耗时另行记录。
  test.setTimeout(180000);
  test.skip(process.env.RELIEF_TEST_GPU !== '1', '显式启用本机 GPU 测试');
  const app = await launchDesktop(),
    page = await app.firstWindow();
  try {
    await page
      .locator('input[type=file]')
      .setInputFiles('C:/Users/arthur/Downloads/微信图片_20260821172229_5_113.jpg');
    await expect(page.locator('.crop-stage canvas')).toHaveAttribute('width', '1280');
    await page.getByRole('button', { name: '应用裁剪' }).click();
    const dialog = page.getByRole('dialog', { name: '识别区域' });
    await dialog.getByRole('button', { name: '主体提取', exact: true }).click();
    await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
    await dialog.getByRole('button', { name: '停止识别', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('识别已取消');
    await dialog.getByRole('button', { name: '生成预览', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('主体已提取', { timeout: 150000 });
    await page.screenshot({ path: path.join(root, 'artifacts', 'subject-dialog.png') });
    await expect(dialog.locator('.candidate-list')).toHaveCount(0);
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    const canvas = dialog.getByLabel('识别预览画布');
    const click = async (x: number, y: number) => {
      const box = (await canvas.boundingBox())!;
      await canvas.click({ position: { x: (x / 1280) * box.width, y: (y / 1280) * box.height } });
      await expect(dialog.getByRole('status')).toContainText('可撤销', { timeout: 30000 });
    };
    await dialog.getByRole('button', { name: '画笔修边', exact: true }).click();
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: (100 / 1280) * box.width, y: (100 / 1280) * box.height } });
    await dialog.getByRole('button', { name: '点击补选', exact: true }).click();
    await click(505, 790);
    await dialog.getByRole('button', { name: '点击排除', exact: true }).click();
    await click(876, 663);
    await dialog.getByRole('button', { name: '撤销主体修改', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('已撤销');
    await dialog.getByRole('button', { name: '应用识别结果' }).click();
    await expect(page.locator('.region-height')).toHaveText(['0 层', '10 层']);
    const savePath = path.join(root, 'artifacts', 'gpu-subject.relief.json');
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
    }, savePath);
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const saved = decodeProject(JSON.parse(await fs.readFile(savePath, 'utf8')));
    expect(saved.labels[653 * 1280 + 627]).toBe(2);
    expect(saved.labels[663 * 1280 + 876]).toBe(2);
    expect(saved.labels[790 * 1280 + 505]).toBe(2);
    expect(saved.labels[100 * 1280 + 100]).toBe(2);
    expect(saved.labels[780 * 1280 + 340]).toBe(1);
    expect(saved.labels[50 * 1280 + 50]).toBe(1);
    expect(saved.labels[1225 * 1280 + 1150]).toBe(1);
    expect(saved.labels.every((id: number) => id === 1 || id === 2)).toBe(true);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
  }
});

test('重新识别先预览，取消不修改，应用后整步撤销', async () => {
  const app = await launchDesktop(),
    page = await app.firstWindow();
  try {
    await page.getByRole('button', { name: '打开 55 mm 徽标示例' }).click();
    await expect(page.locator('.region-height')).toHaveText(['0 层', '5 层', '10 层']);
    await expect(page.locator('.statusbar')).toContainText('示例已打开');
    const recovery = await page.evaluate(async () => {
      const bridge = window.relief!;
      const sample = await bridge.sample();
      void bridge
        .segment({ image: sample.image, name: sample.name, sizeMm: sample.sizeMm, colors: 'auto' })
        .catch(() => null);
      await bridge.cancelSegment();
      const next = await bridge.segment({
        image: sample.image,
        name: sample.name,
        sizeMm: sample.sizeMm,
        colors: 'auto',
      });
      return next.regions.length;
    });
    expect(recovery).toBe(3);
    await page.getByRole('button', { name: '重新识别区域' }).click();
    const dialog = page.getByRole('dialog', { name: '识别区域' });
    await dialog.getByRole('button', { name: '生成预览' }).click();
    await expect(dialog.getByRole('status')).toContainText('已识别 3 个区域');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '重新识别区域' }).click();
    await dialog.getByRole('button', { name: '生成预览' }).click();
    await expect(dialog.getByRole('status')).toContainText('已识别 3 个区域');
    await dialog.getByRole('button', { name: '应用识别结果' }).click();
    await expect(page.locator('.region-height')).toHaveText(['0 层', '0 层', '0 层']);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.locator('.region-height')).toHaveText(['0 层', '5 层', '10 层']);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect(page.locator('.region-height')).toHaveText(['0 层', '0 层', '0 层']);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
  }
});

test('选区保持原色、追加减选、分配撤销与紧凑窗口', async () => {
  const app = await launchDesktop();
  const page = await app.firstWindow();
  try {
    await page.setViewportSize({ width: 1100, height: 720 });
    await page.getByRole('button', { name: '打开 55 mm 徽标示例' }).click();
    await page.getByRole('button', { name: '更多工具', exact: true }).click();
    await page.getByRole('button', { name: '同色选区', exact: true }).click();
    const art = page.getByLabel('图案编辑画布');
    await expect(art).toHaveAttribute('data-ready', 'true');
    const sample = JSON.parse(
      await fs.readFile(path.join(root, 'samples', 'sample-project.json'), 'utf8'),
    );
    const gold = sample.regions.find((region: { name: string }) => region.name.includes('金色')).id;
    const white = sample.regions.find((region: { name: string }) =>
      region.name.includes('白字'),
    ).id;
    const goldIndices = sample.labels.flatMap((id: number, index: number) =>
      id === gold ? [index] : [],
    );
    const whiteIndices = sample.labels.flatMap((id: number, index: number) =>
      id === white ? [index] : [],
    );
    const before = await art.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    for (const region of sample.regions) {
      await page.locator('.region-card').filter({ hasText: region.name }).click();
      await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '0');
      expect(await art.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
    }
    const clickPixel = async (index: number, modifiers?: ('Shift' | 'Alt')[]) => {
      const box = (await art.boundingBox())!;
      await art.click({
        position: {
          x: (((index % sample.width) + 0.5) * box.width) / sample.width,
          y: ((Math.floor(index / sample.width) + 0.5) * box.height) / sample.height,
        },
        modifiers,
      });
    };
    await clickPixel(goldIndices[Math.floor(goldIndices.length / 2)]);
    await expect(page.getByTestId('selection-count')).toHaveAttribute(
      'data-count',
      String(goldIndices.length),
    );
    expect(await art.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
    const boundary = await page.getByLabel('选区边界').evaluate((canvas: HTMLCanvasElement) => {
      const bytes = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let index = 3; index < bytes.length; index += 4) if (bytes[index]) count++;
      return count;
    });
    expect(boundary).toBeGreaterThan(100);
    expect(boundary).toBeLessThan(goldIndices.length);
    await page.screenshot({ path: path.join(root, 'artifacts', 'selection-workbench.png') });
    await clickPixel(whiteIndices[Math.floor(whiteIndices.length / 2)], ['Shift']);
    await expect(page.getByTestId('selection-count')).toHaveAttribute(
      'data-count',
      String(goldIndices.length + whiteIndices.length),
    );
    await clickPixel(whiteIndices[Math.floor(whiteIndices.length / 2)], ['Alt']);
    await expect(page.getByTestId('selection-count')).toHaveAttribute(
      'data-count',
      String(goldIndices.length),
    );
    await page.getByRole('button', { name: '选区建立新区域' }).click();
    await expect(page.locator('.region-card')).toHaveCount(4);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '0');
    expect(await art.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.locator('.region-card')).toHaveCount(3);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect(page.locator('.region-card')).toHaveCount(4);
    await page.getByRole('button', { name: /区域 4/ }).click();
    await page.getByLabel('区域层数', { exact: true }).fill('128');
    await page.getByLabel('区域层数', { exact: true }).press('Escape');
    await expect(page.getByLabel('区域层数', { exact: true })).toHaveValue('5');
    const layout = await page.evaluate(() => ({
      overflow:
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight,
      footer: document.querySelector('.canvas-bottom')!.getBoundingClientRect().bottom,
      canvas: document.querySelector('.art-canvas')!.getBoundingClientRect().height,
      height: innerHeight,
    }));
    expect(layout.overflow).toBe(false);
    expect(layout.footer).toBeLessThan(layout.height);
    expect(layout.canvas).toBeGreaterThan(250);
    await page.getByRole('button', { name: '画笔', exact: true }).click();
    await page.getByLabel('绘入区域').selectOption(String(white));
    await clickPixel(goldIndices[Math.floor(goldIndices.length / 2)]);
    const savePath = path.join(root, 'artifacts', `selection-assignment-v2-${Date.now()}.relief.json`);
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
    }, savePath);
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const saved = decodeProject(JSON.parse(await fs.readFile(savePath, 'utf8')));
    const changes = Array.from(saved.labels).flatMap((id: number, index: number) =>
      id !== sample.labels[index] ? [index] : [],
    );
    expect(changes.length).toBe(goldIndices.length);
    expect(changes.every((index: number) => sample.labels[index] === gold)).toBe(true);
    expect(saved.labels[goldIndices[Math.floor(goldIndices.length / 2)]]).toBe(white);
    expect(saved.labels.filter((id: number) => id === 4).length).toBeGreaterThan(0);
    expect(saved.colors).toEqual(saved.original);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
  }
});

async function launchDesktop() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (process.env.RELIEF_TEST_PACKAGED === '1') {
    env.PATH = `${process.env.SystemRoot}\\System32`;
    delete env.PYTHONHOME;
    delete env.PYTHONPATH;
    return electron.launch({
      executablePath:
        process.env.RELIEF_TEST_EXECUTABLE ||
        path.join(root, 'release', 'win-unpacked', 'Relief Studio.exe'),
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
    await expect(page.getByRole('heading', { name: '导入图片' })).toBeVisible();
    await page.screenshot({ path: path.join(root, 'artifacts', 'welcome.png') });
    await page.context().setOffline(true);
    await page.getByRole('button', { name: '打开 55 mm 徽标示例' }).click();
    await expect(page.getByRole('heading', { name: '科尔沁 · 55 mm 徽标' })).toBeVisible();
    await page.getByRole('button', { name: /白字 · 凸起/ }).click();
    await page.locator('.advanced-properties > summary').click();
    await expect(page.getByLabel('区域层数', { exact: true })).toHaveValue('10');
    await page.getByLabel('区域层数', { exact: true }).fill('15');
    await page.getByLabel('区域层数', { exact: true }).press('Enter');
    await page.getByRole('button', { name: '撤销', exact: true }).click();
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
    await page.getByLabel('宽度', { exact: true }).press('Enter');
    const savePath = path.join(output, '测试工程.relief.json');
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
    }, savePath);
    await page.getByRole('button', { name: /^保存/ }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const saved = decodeProject(JSON.parse(await fs.readFile(savePath, 'utf8')));
    expect(saved.sizeMm).toEqual([60, 55]);
    await app.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, savePath);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已恢复');
    await expect(page.getByLabel('宽度', { exact: true })).toHaveValue('60');
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, output);
    await page.getByRole('button', { name: '导出分层' }).click();
    await page.getByLabel('新输出目录').fill(path.join(output, 'relief-v2'));
    await page.getByRole('button', { name: '导出', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('分层文件已导出');
    const dir = (await fs.readdir(output)).find((name) => name.startsWith('relief-'))!;
    const manifest = JSON.parse(await fs.readFile(path.join(output, dir, 'manifest.json'), 'utf8'));
    expect(manifest.whiteLayerCount).toBe(10);
    expect(manifest.sizeMm).toEqual([60, 55]);
    expect(manifest.heightCalibrationStatus).toBe('design-unverified');
    expect(await fs.readdir(path.join(output, dir, 'white'))).toHaveLength(10);
    const restored = decodeProject(JSON.parse(await fs.readFile(path.join(output, dir, 'project.json'), 'utf8')));
    expect({ ...restored, sessionId: saved.sessionId, revision: saved.revision }).toEqual(saved);
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
    await page.getByRole('button', { name: '应用裁剪' }).click();
    await expect(page.getByRole('dialog', { name: '识别区域' })).toBeVisible();
    await page.getByRole('button', { name: '生成预览', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '识别区域' }).getByRole('status')).toContainText(
      '已识别',
    );
    await page.getByRole('button', { name: '应用识别结果', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('分区已完成');
    await expect(page.locator('.region-card')).toHaveCount(3);
    await page.getByRole('button', { name: '更多工具', exact: true }).click();
    await page.getByRole('button', { name: '擦除', exact: true }).click();
    const art = page.getByLabel('图案编辑画布');
    const artBox = (await art.boundingBox())!;
    await page.mouse.click(artBox.x + artBox.width / 2, artBox.y + artBox.height / 2);
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((window) => window.destroy()),
    );
    await app.close();
  }
});
