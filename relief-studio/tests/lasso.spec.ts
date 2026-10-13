import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeProject } from '../src/project-codec';

async function launch() {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ args: [process.cwd()], env });
}
async function close(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
  await app.close();
}
async function fixture(app: ElectronApplication, page: Page) {
  const data = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#eeeeee'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#202020'; ctx.fillRect(32, 32, 64, 64);
    return { version: 1, name: '套索边界验证', width: 128, height: 128, sizeMm: [55, 55], image: c.toDataURL(),
      labels: Array.from({ length: 128*128 }, (_, i) => i % 128 < 112 ? 1 : 2),
      regions: [{ id: 1, name: '绘图区', color: '#eeeeee', layers: 5 }, { id: 2, name: '右侧', color: '#aaaaaa', layers: 10 }] };
  });
  const file = path.join(process.cwd(), 'artifacts', 'lasso-fixture.json');
  await fs.writeFile(file, JSON.stringify(data));
  await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, file);
  await page.getByRole('button', { name: '打开工程', exact: true }).click();
  await expect(page.getByLabel('图案编辑画布')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: '选区', exact: true }).click();
  return data;
}
async function at(page: Page, x: number, y: number, click = true) {
  const b = (await page.getByLabel('图案编辑画布').boundingBox())!;
  const px = b.x + (x + 0.2) / 128 * b.width, py = b.y + (y + 0.2) / 128 * b.height;
  if (click) await page.mouse.click(px, py); else await page.mouse.move(px, py, { steps: 8 });
}

test('逐点套索闭合、退点、取消与加减选，不留下编辑历史', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow(); await fixture(app, page);
    await page.getByLabel('选区形状').selectOption('polygon');
    const count = page.getByTestId('selection-count');
    await at(page, 20, 20); await at(page, 60, 20); await at(page, 60, 60); await at(page, 70, 70);
    await expect(count).toHaveAttribute('data-count', '0');
    await page.keyboard.press('Backspace'); await at(page, 20, 60); await page.keyboard.press('Enter');
    await expect(count).toHaveAttribute('data-count', '1600');
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
    await page.getByLabel('选取方式').selectOption('add');
    await at(page, 70, 20); await at(page, 80, 20); await at(page, 80, 30); await at(page, 70, 30);
    await at(page, 70, 20);
    await expect(count).toHaveAttribute('data-count', '1700');
    await page.getByLabel('选取方式').selectOption('subtract');
    await at(page, 20, 20); await at(page, 30, 20); await at(page, 30, 30); await at(page, 20, 30);
    await page.keyboard.press('Enter');
    await expect(count).toHaveAttribute('data-count', '1600');
    // Esc 只取消正在绘制的路径，保留之前已经完成的选区。
    await page.getByLabel('选取方式').selectOption('replace');
    await at(page, 85, 40); await at(page, 95, 40); await page.keyboard.press('Escape');
    await expect(count).toHaveAttribute('data-count', '1600');
    await expect(page.locator('.canvas-viewport')).toHaveAttribute('data-lasso-points', '0');
    await page.getByRole('button', { name: '放大', exact: true }).click();
    await at(page, 40, 40); await at(page, 60, 40); await at(page, 60, 60); await at(page, 40, 60);
    const b = (await page.getByLabel('图案编辑画布').boundingBox())!;
    await page.mouse.dblclick(b.x + 40.2 / 128 * b.width, b.y + 60.2 / 128 * b.height);
    await expect(count).toHaveAttribute('data-count', '400');
    await expect(page.locator('.canvas-viewport')).toHaveAttribute('data-lasso-points', '0');
  } finally { await close(app); }
});

test('磁性套索实时吸附轮廓，闭合后实际清除及撤销像素正确', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow(); const original = await fixture(app, page);
    await page.getByLabel('选区形状').selectOption('magnetic');
    await at(page, 28, 28);
    await at(page, 100, 28, false); await at(page, 100, 100, false);
    await at(page, 28, 100, false); await at(page, 28, 28, false);
    await expect(page.getByTestId('selection-count')).toHaveAttribute('data-count', '0');
    expect(Number(await page.locator('.canvas-viewport').getAttribute('data-lasso-points'))).toBeGreaterThan(30);
    await page.screenshot({ path: 'artifacts/workbench/magnetic-tracing.png' });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('selection-count')).not.toHaveAttribute('data-count', '0');
    const count = Number(await page.getByTestId('selection-count').getAttribute('data-count'));
    expect(count).toBeGreaterThan(3900); expect(count).toBeLessThan(4500);
    await page.getByRole('button', { name: '清除', exact: true }).click();
    const filename = path.join(process.cwd(), 'artifacts', 'magnetic-cleared.json');
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, filename);
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const saved = decodeProject(JSON.parse(await fs.readFile(filename, 'utf8')));
    expect(saved.labels[64*128+64]).toBe(0); expect(saved.labels[10*128+10]).toBe(1);
    expect(saved.labels[64*128+120]).toBe(2);
    expect(Array.from(saved.labels).filter(id => id === 0)).toHaveLength(count);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    expect(Array.from(decodeProject(JSON.parse(await fs.readFile(filename, 'utf8'))).labels)).toEqual(original.labels);
  } finally { await close(app); }
});

test('平面、对照与 3D 切换区域或全选时保持视图', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开示例工程', exact: true }).click();
    for (const name of ['平面编辑', '对照', '3D 浮雕']) {
      const tab = page.getByRole('button', { name, exact: true }); await tab.click();
      await page.locator('.region-card').nth(1).click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: '选择整个区域', exact: true }).click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      await page.locator('.region-card').nth(2).click();
      await expect(tab).toHaveAttribute('aria-pressed', 'true');
      if (name !== '平面编辑') await expect(page.locator('.preview-host canvas')).toBeVisible();
    }
  } finally { await close(app); }
});

test('磁性套索按住拖动、退点、缩放平移和按钮确认，不选中页面文字', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow(); await fixture(app, page);
    await page.getByLabel('选区形状').selectOption('magnetic');
    await at(page, 28, 28, false); await page.mouse.down();
    await at(page, 100, 28, false); await at(page, 100, 100, false);
    await page.mouse.up();
    const before = Number(await page.locator('.canvas-viewport').getAttribute('data-lasso-points'));
    await page.keyboard.press('Delete');
    expect(Number(await page.locator('.canvas-viewport').getAttribute('data-lasso-points'))).toBeLessThan(before);
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '放大', exact: true }).click();
    await at(page, 100, 100, false); await at(page, 28, 100, false); await at(page, 28, 28, false);
    await page.keyboard.down('Space'); await page.mouse.down();
    await page.mouse.move(850, 450, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Space');
    await expect(page.getByRole('button', { name: '完成选区', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '完成选区', exact: true }).click();
    await expect(page.locator('.canvas-viewport')).toHaveAttribute('data-lasso-points', '0');
    await expect(page.getByTestId('selection-count')).not.toHaveAttribute('data-count', '0');
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
  } finally { await close(app); }
});

test('科尔沁真实徽标放大后描牛头轮廓，可以确认且仅选择黑色主体', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: '打开示例工程', exact: true }).click();
    await expect(page.getByLabel('图案编辑画布')).toHaveAttribute('data-ready', 'true');
    await page.locator('.region-card').nth(0).click();
    await page.getByRole('button', { name: '选区', exact: true }).click();
    await page.getByLabel('选区形状').selectOption('magnetic');
    await page.keyboard.press('Control+1');
    await page.getByRole('button', { name: '放大', exact: true }).click();
    const b = (await page.getByLabel('图案编辑画布').boundingBox())!;
    const outline = [[195,132],[177,138],[151,135],[126,131],[148,139],[174,145],[168,166],
      [171,188],[181,210],[194,210],[211,214],[219,203],[220,181],[216,160],[212,145],
      [244,139],[274,131],[239,136],[211,138],[203,133],[195,132]];
    for (let i = 0; i < outline.length; i++) {
      const [x,y] = outline[i];
      await page.mouse.move(b.x + x / 410 * b.width, b.y + y / 410 * b.height, { steps: 4 });
      if (i === 0) await page.mouse.down();
    }
    await page.mouse.up();
    await page.screenshot({ path: 'artifacts/workbench/magnetic-logo-draft.png' });
    await page.getByRole('button', { name: '完成选区', exact: true }).click();
    await expect(page.locator('.canvas-viewport')).toHaveAttribute('data-lasso-points', '0');
    await expect.poll(async () => Number(await page.getByTestId('selection-count').getAttribute('data-count'))).toBeGreaterThan(500);
    expect(Number(await page.getByTestId('selection-count').getAttribute('data-count'))).toBeLessThan(5000);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
    await page.screenshot({ path: 'artifacts/workbench/magnetic-logo-confirmed.png' });
    await page.getByRole('button', { name: '清除', exact: true }).click();
    const filename = path.join(process.cwd(), 'artifacts', 'magnetic-logo-cleared.json');
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, filename);
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const saved = decodeProject(JSON.parse(await fs.readFile(filename, 'utf8')));
    const original = JSON.parse(await fs.readFile('samples/sample-project.json', 'utf8')) as { labels: number[] };
    const changed = original.labels.flatMap((label, i) => label !== saved.labels[i] ? [i] : []);
    expect(changed.length).toBeGreaterThan(500);
    expect(changed.every(i => original.labels[i] === 1 && saved.labels[i] === 0 &&
      i % 410 > 115 && i % 410 < 285 && Math.floor(i / 410) > 120 && Math.floor(i / 410) < 225)).toBe(true);
  } finally { await close(app); }
});

test('小轮廓绕回起点仍可确认，拖出画布不选中文字', async () => {
  const app = await launch();
  try {
    const page = await app.firstWindow(); await fixture(app, page);
    await page.getByLabel('选区形状').selectOption('magnetic');
    await page.getByRole('button', { name: '100%', exact: true }).click();
    await at(page, 65, 65); await at(page, 89, 65, false); await at(page, 89, 89, false);
    await at(page, 65, 89, false); await at(page, 65, 65, false);
    await expect(page.getByRole('button', { name: '完成选区', exact: true })).toBeEnabled();
    await page.keyboard.press('Enter');
    await expect.poll(async () => Number(await page.getByTestId('selection-count').getAttribute('data-count'))).toBeGreaterThan(200);
    await at(page, 35, 35, false); await page.mouse.down();
    const b = (await page.getByLabel('图案编辑画布').boundingBox())!;
    await page.mouse.move(b.x + b.width + 150, b.y + b.height + 120, { steps: 6 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
    await page.keyboard.press('Escape');
    await expect(page.locator('.canvas-viewport')).toHaveAttribute('data-lasso-points', '0');
    await expect(page.getByTestId('selection-count')).not.toHaveAttribute('data-count', '0');
  } finally { await close(app); }
});
