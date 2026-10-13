import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeProject } from '../src/project-codec';

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ args: [process.cwd()], env });
}

async function openScopeFixture(app: ElectronApplication, page: Page) {
  const fixture = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 40;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#eeeeee'; context.fillRect(0, 0, 80, 40);
    context.fillStyle = '#bc9b34'; context.fillRect(10, 10, 20, 20); context.fillRect(50, 10, 20, 20);
    return { version: 1, name: '两个独立金色块', width: 80, height: 40, sizeMm: [80, 40], image: canvas.toDataURL(),
      labels: Array.from({ length: 3200 }, (_, i) => {
        const x = i % 80, y = Math.floor(i / 80);
        return y >= 10 && y < 30 && ((x >= 10 && x < 30) || (x >= 50 && x < 70)) ? 1 : 2;
      }), regions: [{ id: 1, name: '金色', color: '#bc9b34', layers: 10 },
        { id: 2, name: '背景', color: '#eeeeee', layers: 0 }] };
  });
  const filename = path.join(process.cwd(), 'artifacts', `tool-scope-${Date.now()}.json`);
  await fs.writeFile(filename, JSON.stringify(fixture));
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, filename);
  await page.getByRole('button', { name: '打开工程', exact: true }).click();
  await expect(page.getByLabel('图案编辑画布')).toHaveAttribute('data-ready', 'true');
  return fixture;
}

test('三个入口切换模式，整个区域支持追加减去且不修改工程', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开 55 mm 徽标示例' }).click();
    const canvas = page.getByLabel('图案编辑画布');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.edit-tools button')).toHaveCount(4);
    expect(await page.locator('.edit-tools button').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))))
      .toEqual(['点选', '选区', '修补', '平移']);
    await page.getByLabel('点选方式').selectOption('connected');
    await page.getByRole('button', { name: '选区', exact: true }).click();
    await page.getByLabel('选区形状').selectOption('lasso');
    await page.getByRole('button', { name: '修补', exact: true }).click();
    await page.getByLabel('修补方式').selectOption('erase');
    await page.getByRole('button', { name: '点选', exact: true }).click();
    await expect(page.getByLabel('点选方式')).toHaveValue('connected');
    await page.getByRole('button', { name: '选区', exact: true }).click();
    await expect(page.getByLabel('选区形状')).toHaveValue('lasso');
    await page.getByRole('button', { name: '修补', exact: true }).click();
    await expect(page.getByLabel('修补方式')).toHaveValue('erase');
    const sample = JSON.parse(await fs.readFile('samples/sample-project.json', 'utf8'));
    const regions = sample.regions.filter((region: { layers: number }) => region.layers > 0);
    const count = (id: number) => sample.labels.filter((value: number) => value === id).length;
    const original = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
    await page.locator('.region-card').filter({ hasText: regions[0].name }).click();
    const whole = page.getByRole('button', { name: '选择整个区域', exact: true });
    await whole.click();
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', String(count(regions[0].id)));
    await page.locator('.region-card').filter({ hasText: regions[1].name }).click();
    await whole.click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', String(count(regions[0].id) + count(regions[1].id)));
    await whole.click({ modifiers: ['Alt'] });
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', String(count(regions[0].id)));
    await page.getByRole('button', { name: '取消选区', exact: true }).click();
    await page.keyboard.press('w');
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', String(count(regions[1].id)));
    await page.locator('.region-card').filter({ hasText: regions[0].name }).click();
    await page.keyboard.press('Shift+w');
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', String(count(regions[0].id) + count(regions[1].id)));
    await page.keyboard.press('Alt+w');
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', String(count(regions[1].id)));
    await page.keyboard.press('b');
    await expect(page.getByLabel('修补方式')).toHaveValue('brush');
    await page.getByRole('button', { name: '点选', exact: true }).click();
    await page.getByRole('button', { name: '修补', exact: true }).click();
    await expect(page.getByLabel('修补方式')).toHaveValue('brush');
    expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(original);
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '只留选中部分', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1100, height: 720 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.region-list').evaluate(node => node.clientHeight)).toBeGreaterThanOrEqual(180);
    const listBox = (await page.locator('.region-list').boundingBox())!;
    const lastRegionBox = (await page.locator('.region-card').last().boundingBox())!;
    expect(lastRegionBox.y + lastRegionBox.height).toBeLessThanOrEqual(listBox.y + listBox.height);
    await expect(page.getByLabel('区域层数', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'artifacts/tool-groups.png' });
    await page.setViewportSize({ width: 960, height: 760 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: '只留选中部分', exact: true })).toBeVisible();
    const toolbarBox = (await page.locator('.tool-options').boundingBox())!;
    const radiusBox = (await page.getByLabel('笔刷半径').boundingBox())!;
    expect(radiusBox.y + radiusBox.height).toBeLessThanOrEqual(toolbarBox.y + toolbarBox.height);
    await page.screenshot({ path: 'artifacts/tool-groups-compact.png' });
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});

test('跨区域范围只由显式设置控制，Delete 按当前区域或全部选区清除', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    const fixture = await openScopeFixture(app, page);
    await page.locator('.advanced-properties > summary').click();
    const scope = page.getByLabel('允许跨区域选取');
    await expect(scope).not.toBeChecked();
    await page.getByLabel('点选方式').selectOption('connected');
    await expect(scope).not.toBeChecked();
    const canvas = page.getByLabel('图案编辑画布');
    const box = (await canvas.boundingBox())!;
    const click = async (x: number, y: number, modifiers: ('Shift' | 'Alt')[] = []) => {
      await canvas.click({ position: { x: (x + 0.5) / 80 * box.width, y: (y + 0.5) / 40 * box.height }, modifiers });
    };
    await click(20, 20);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '400');
    await click(5, 5, ['Shift']);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '400');
    await scope.check();
    await click(5, 5, ['Shift']);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '2800');
    await scope.uncheck();
    await page.getByRole('button', { name: '修补', exact: true }).click();
    await expect(scope).not.toBeChecked();
    await page.getByRole('button', { name: '选择整个区域', exact: true }).click();
    await expect(scope).not.toBeChecked();
    await page.getByRole('button', { name: '选区', exact: true }).click();
    const rectangle = async () => {
      await page.getByRole('button', { name: '取消选区', exact: true }).click();
      const box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + 0.1, box.y + 0.1); await page.mouse.down();
      await page.mouse.move(box.x + box.width, box.y + box.height); await page.mouse.up();
    };
    let sequence = 0;
    const save = async () => {
      const file = path.join(process.cwd(), 'artifacts', `tool-delete-${Date.now()}-${sequence++}.json`);
      await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, file);
      await page.getByRole('button', { name: '保存工程', exact: true }).click();
      await expect.poll(() => fs.stat(file).then(() => true, () => false)).toBe(true);
      return decodeProject(JSON.parse(await fs.readFile(file, 'utf8')));
    };
    await rectangle();
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '800');
    await scope.check();
    await rectangle();
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '3200');
    await scope.uncheck();
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '3200');
    // 输入控件内不执行编辑快捷键，仅移动焦点，不改变选区。
    await page.getByRole('button', { name: '选择整个区域', exact: true }).focus();
    await page.keyboard.press('Delete');
    const currentOnly = await save();
    expect(Array.from(currentOnly.labels)).toEqual(fixture.labels.map(id => id === 1 ? 0 : id));
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await scope.check();
    // 高级设置切换只改变范围，不修改当前工程。
    await page.getByRole('button', { name: '选择整个区域', exact: true }).click();
    await rectangle();
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '3200');
    await page.keyboard.press('Delete');
    expect(Array.from((await save()).labels).every(id => id === 0)).toBe(true);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});

test('全选取消尚未返回的真实智能选区，迟到结果不能覆盖全选', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await page.evaluate(() => {
      const descriptor = Object.getOwnPropertyDescriptor(Worker.prototype, 'onmessage')!;
      const state = window as Window & { delayedSelectionCount: number; deliveredSelections: number };
      state.deliveredSelections = 0;
      Object.defineProperty(Worker.prototype, 'onmessage', {
        configurable: true, get: descriptor.get,
        set(this: Worker, listener: Worker['onmessage']) {
          const worker = this;
          descriptor.set!.call(worker, listener && ((event: MessageEvent) => {
            if (!event.data.indices) { listener.call(worker, event); return; }
            state.delayedSelectionCount = event.data.indices.length;
            setTimeout(() => { state.deliveredSelections++; listener.call(worker, event); }, 500);
          }));
        },
      });
    });
    await openScopeFixture(app, page);
    const canvas = page.getByLabel('图案编辑画布');
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width * 20 / 80, y: box.height * 20 / 40 } });
    await expect(page.getByText('正在识别选区…', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '选择整个区域', exact: true }).click();
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '800');
    await expect.poll(() => page.evaluate(() => (window as Window & { deliveredSelections: number }).deliveredSelections)).toBe(1);
    expect(await page.evaluate(() => (window as Window & { delayedSelectionCount: number }).delayedSelectionCount)).toBe(400);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '800');
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});

test('修补入口补画与擦除保留原色，撤销完整恢复工程', async () => {
  const app = await launch();
  const filename = path.join(process.cwd(), 'artifacts', `tool-repair-${Date.now()}.relief.json`);
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, filename);
    await page.getByRole('button', { name: '打开 55 mm 徽标示例' }).click();
    const canvas = page.getByLabel('图案编辑画布');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    const save = async () => {
      await page.getByRole('button', { name: '保存工程', exact: true }).click();
      await expect(page.locator('.statusbar')).toContainText('工程已保存');
      return decodeProject(JSON.parse(await fs.readFile(filename, 'utf8')));
    };
    const before = await save();
    const gold = before.regions.find(region => region.name.includes('金色'))!;
    const white = before.regions.find(region => region.name.includes('白字'))!;
    const pixels = Array.from(before.labels).flatMap((id, index) => id === gold.id ? [index] : []);
    const index = pixels[Math.floor(pixels.length / 2)];
    const click = async () => {
      const box = (await canvas.boundingBox())!;
      await canvas.click({ position: { x: ((index % before.width) + 0.5) / before.width * box.width,
        y: (Math.floor(index / before.width) + 0.5) / before.height * box.height } });
    };
    await page.getByRole('button', { name: '修补', exact: true }).click();
    await page.getByLabel('绘入区域').selectOption(String(white.id));
    await page.getByLabel('笔刷半径').fill('1');
    await click();
    const painted = await save();
    expect(painted.labels[index]).toBe(white.id);
    expect(painted.colors).toEqual(before.colors);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    const restored = await save();
    expect(restored.labels).toEqual(before.labels);
    expect(restored.heights).toEqual(before.heights);
    expect(restored.protection).toEqual(before.protection);
    await page.getByLabel('修补方式').selectOption('erase');
    await click();
    const erased = await save();
    expect(erased.labels[index]).toBe(0);
    expect(erased.colors).toEqual(before.colors);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    expect((await save()).labels).toEqual(before.labels);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
