import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (env.RELIEF_TEST_PACKAGED === '1') {
    env.PATH = `${process.env.SystemRoot}\\System32`;
    delete env.PYTHONHOME;
    delete env.PYTHONPATH;
    return electron.launch({
      executablePath:
        env.RELIEF_TEST_EXECUTABLE || path.join(root, 'release/win-unpacked/Relief Studio.exe'),
      args: [],
      env,
    });
  }
  return electron.launch({ args: [root], env });
}

test('智能点选、圈选、清除保留、保存重开、分层和 STL 导出', async () => {
  const app = await launch(),
    page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const output = path.join(root, 'artifacts', `handable-${Date.now()}`);
  await fs.mkdir(output, { recursive: true });
  try {
    const original = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 100;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#202020';
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = '#787878';
      ctx.fillRect(10, 10, 30, 70);
      ctx.fillStyle = '#929292';
      ctx.fillRect(40, 10, 30, 70);
      ctx.fillStyle = '#eeeeee';
      ctx.fillRect(70, 10, 20, 70);
      return {
        version: 1,
        name: '手工修整测试',
        width: 100,
        height: 100,
        sizeMm: [50, 40],
        image: canvas.toDataURL(),
        labels: Array.from({ length: 10000 }, (_, i) => {
          const x = i % 100,
            y = Math.floor(i / 100);
          return x >= 10 && x < 70 && y >= 10 && y < 80 ? 1 : 2;
        }),
        regions: [
          { id: 1, name: '文字', color: '#787878', layers: 10 },
          { id: 2, name: '背景', color: '#202020', layers: 0 },
        ],
      };
    });
    const savedPath = path.join(output, 'test.relief.json');
    await fs.writeFile(savedPath, JSON.stringify(original));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, savedPath);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('工程已恢复');
    const canvas = page.getByLabel('图案编辑画布');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.trim-panel button')).toHaveText(['清除', '保留']);
    await expect(page.getByLabel('区域层数', { exact: true })).not.toBeVisible();
    const box = (await canvas.boundingBox())!;
    const click = (x: number, y: number) =>
      canvas.click({ position: { x: (x / 100) * box.width, y: (y / 100) * box.height } });
    const tolerance = async (value: number) => {
      await page.getByLabel('选取宽容度').fill(String(value));
    };
    await tolerance(5);
    await click(20, 20);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '2100');
    await tolerance(35);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '4200');
    await tolerance(5);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '2100');
    const save = async () => {
      await page.getByRole('button', { name: '保存工程', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('工程已保存');
      return JSON.parse(await fs.readFile(savedPath, 'utf8'));
    };
    expect((await save()).labels).toEqual(original.labels);
    await page.getByRole('button', { name: '清除', exact: true }).click();
    const cleared = await save();
    expect(cleared.labels.filter((i: number) => i === 1)).toHaveLength(2100);
    expect(cleared.labels.filter((i: number) => i === 2)).toHaveLength(5800);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await click(20, 20);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '2100');
    await page.getByRole('button', { name: '保留', exact: true }).click();
    const kept = await save();
    expect(
      kept.labels.every((id: number, i: number) =>
        original.labels[i] === 1
          ? id === (cleared.labels[i] === 1 ? 0 : 1)
          : id === original.labels[i],
      ),
    ).toBe(true);
    expect(kept.image).toBe(original.image);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    expect((await save()).labels).toEqual(original.labels);
    await page.getByRole('button', { name: '重做', exact: true }).click();
    expect((await save()).labels).toEqual(kept.labels);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('工程已恢复');
    expect((await save()).labels).toEqual(kept.labels);
    // 异步点选取消后不能冒出过期选区。
    await click(20, 20);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '0');
    await page.getByRole('button', { name: '圈选', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '自动贴边' })).toBeChecked();
    await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.08);
    await page.mouse.down();
    for (const [x, y] of [
      [0.42, 0.08],
      [0.42, 0.82],
      [0.08, 0.82],
      [0.08, 0.08],
    ])
      await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: '清除', exact: true })).toBeEnabled();
    await page.screenshot({ path: path.join(output, 'smart-selection.png') });
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, output);
    await page.getByRole('button', { name: '导出分层' }).click();
    await expect(page.getByRole('status')).toContainText('分层文件已导出');
    const dir = (await fs.readdir(output)).find((name) => name.startsWith('relief-'))!;
    expect(JSON.parse(await fs.readFile(path.join(output, dir, 'project.json'), 'utf8'))).toEqual(
      kept,
    );
    const stlPath = path.join(output, 'test.stl');
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, stlPath);
    await page.getByRole('button', { name: '导出 STL', exact: true }).click();
    const stl = page.getByRole('dialog', { name: '导出 STL', exact: true });
    await stl.getByLabel('STL 每层厚度').fill('0');
    await expect(stl.getByRole('button', { name: '选择位置并导出' })).toBeDisabled();
    await stl.getByLabel('STL 每层厚度').fill('0.2');
    await stl.getByLabel('STL 底板厚度').fill('1.5');
    await stl.getByRole('button', { name: '选择位置并导出' }).click();
    await expect(page.getByRole('status')).toContainText('STL 已导出', { timeout: 30000 });
    const binary = await fs.readFile(stlPath);
    const triangles = binary.readUInt32LE(80);
    expect(binary.length).toBe(84 + triangles * 50);
    const maxima = [0, 0, 0];
    for (let i = 0; i < triangles; i++)
      for (let vertex = 0; vertex < 3; vertex++)
        for (let axis = 0; axis < 3; axis++)
          maxima[axis] = Math.max(
            maxima[axis],
            binary.readFloatLE(84 + i * 50 + 12 + vertex * 12 + axis * 4),
          );
    expect(maxima).toEqual([50, 40, 3.5]);
    await page.setViewportSize({ width: 1100, height: 720 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: path.join(output, 'compact.png') });
    // 画幅边缘像素必须能完整框选；角点连接失败不能覆盖已有文件。
    const diagonal = {
      ...original,
      labels: original.labels.map((_, i) => ([0, 101, 9999].includes(i) ? 1 : 2)),
    };
    await fs.writeFile(savedPath, JSON.stringify(diagonal));
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, savedPath);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('工程已恢复');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await page.getByRole('button', { name: '框选', exact: true }).click();
    const boundary = (await canvas.boundingBox())!;
    await page.mouse.move(boundary.x + 0.1, boundary.y + 0.1);
    await page.mouse.down();
    await page.mouse.move(boundary.x + boundary.width + 2, boundary.y + boundary.height + 2);
    await page.mouse.up();
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '3');
    await fs.writeFile(stlPath, 'previous model');
    await page.getByRole('button', { name: '导出 STL', exact: true }).click();
    await stl.getByRole('button', { name: '选择位置并导出' }).click();
    await expect(stl.getByRole('alert')).toContainText('对角接触', { timeout: 30000 });
    expect(await fs.readFile(stlPath, 'utf8')).toBe('previous model');
    await stl.getByText('模型修复选项', { exact: true }).click();
    await stl.getByRole('checkbox', { name: '修复像素角点连接' }).check();
    await stl.getByRole('button', { name: '选择位置并导出' }).click();
    await expect(page.getByRole('status')).toContainText('已修复', { timeout: 30000 });
    expect((await fs.readFile(stlPath)).readUInt32LE(80)).toBeGreaterThan(0);
    expect(JSON.parse(await fs.readFile(savedPath, 'utf8'))).toEqual(diagonal);
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.destroy()),
    );
    await app.close();
  }
});
