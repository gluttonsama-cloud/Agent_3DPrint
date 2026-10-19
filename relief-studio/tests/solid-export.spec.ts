import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeProject, encodeProject } from '../src/project-codec';

test('桌面完整快照导出混合高度 STL、封闭 OBJ 和标定 STL', async () => {
  const root = process.cwd(), output = path.join(root, 'artifacts', `solid-export-${Date.now()}`);
  await fs.mkdir(output, { recursive: true });
  const snapshot = decodeProject(JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/v2/normal-v2.json'), 'utf8')));
  Object.assign(snapshot, { width: 3, height: 2, sizeMm: [3, 2],
    original: new Uint8Array(24).fill(255), colors: new Uint8Array(24).fill(255),
    labels: new Uint16Array(6).fill(1), heights: new Uint16Array([0, 1, 3, 0, 1, 2]),
    protection: new Uint8Array(6) });
  const source = path.join(output, 'source.json');
  await fs.writeFile(source, JSON.stringify(encodeProject(snapshot)));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const page = await app.firstWindow();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  async function open() {
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, source);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已恢复');
  }
  async function exportStl(name: string) {
    const target = path.join(output, name);
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, target);
    await page.getByRole('dialog', { name: '导出 STL', exact: true })
      .getByRole('button', { name: '选择位置并导出' }).click();
    await expect(page.locator('.statusbar')).toContainText(target, { timeout: 30000 });
    const raw = await fs.readFile(target), top = new Set<number>();
    expect(raw.length).toBe(84 + raw.readUInt32LE(80) * 50);
    for (let i = 84; i < raw.length; i += 50) {
      if (raw.readFloatLE(i + 8) > 0)
        for (const offset of [20, 32, 44]) top.add(Number(raw.readFloatLE(i + offset).toFixed(6)));
    }
    return [...top].sort();
  }
  try {
    await open();
    await page.getByRole('button', { name: '导出 STL', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '导出 STL', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('STL 每层厚度').fill('0.2');
    await expect(dialog).toContainText('最高处：1.600 mm');
    expect(await exportStl('mixed.stl')).toEqual([1, 1.2, 1.4, 1.6]);
    await page.getByRole('button', { name: '导出分层', exact: true }).click();
    await page.getByLabel('附加 OBJ 查看模型', { exact: true }).check();
    await expect(page.getByLabel('OBJ 模型类型')).toHaveValue('solid');
    await page.getByLabel('OBJ 底板厚度').fill('-1');
    await page.getByLabel('新输出目录').fill(path.join(output, 'bundle'));
    await expect(page.getByRole('button', { name: '导出', exact: true })).toBeDisabled();
    await page.getByLabel('OBJ 底板厚度').fill('1');
    await page.getByRole('button', { name: '导出', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('分层文件已导出', { timeout: 30000 });
    const meta = JSON.parse(await fs.readFile(path.join(output, 'bundle/obj-meta.json'), 'utf8'));
    expect(meta.closedSolid).toBe(true); expect(meta.sizeMm).toEqual([3, 2, expect.closeTo(1.3, 5)]);
    expect(decodeProject(JSON.parse(await fs.readFile(path.join(output, 'bundle/project.json'), 'utf8'))).heights).toEqual(snapshot.heights);
    snapshot.heightMapping = { kind: 'calibrated', profileId: 'measured', mmByLayer: [0, .02, .09, .21] };
    await fs.writeFile(source, JSON.stringify(encodeProject(snapshot)));
    await open();
    await page.getByRole('button', { name: '导出 STL', exact: true }).click();
    await expect(dialog).toContainText('使用工程标定曲线');
    await expect(dialog.getByLabel('STL 每层厚度')).toHaveCount(0);
    await expect(dialog).toContainText('最高处：1.210 mm');
    expect(await exportStl('calibrated.stl')).toEqual([1, 1.02, 1.09, 1.21]);
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});

test('2048 完整高度快照超过旧 64 MB 限制仍可通过桌面导出 STL', async () => {
  const root = process.cwd(), output = path.join(root, 'artifacts', `solid-large-${Date.now()}.stl`);
  const fixture = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/v2/normal-v2.json'), 'utf8'));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [root], env });
  const page = await app.firstWindow();
  try {
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, output);
    const result = await page.evaluate(async fixture => {
      const side = 2048, count = side * side;
      const encode = (bytes: Uint8Array, type: string) => {
        let data = '';
        for (let i = 0; i < bytes.length; i += 8192) data += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return { type, encoding: 'base64-le', data: btoa(data) };
      };
      const snapshot = { ...fixture, width: side, height: side,
        original: encode(new Uint8Array(count * 4).fill(255), 'uint8'),
        colors: encode(new Uint8Array(count * 4).fill(255), 'uint8'),
        labels: encode(new Uint8Array(new Uint16Array(count).fill(1).buffer), 'uint16'),
        heights: encode(new Uint8Array(new Uint16Array(count).fill(3).buffer), 'uint16'),
        protection: encode(new Uint8Array(count), 'uint8') };
      const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
      const result = await window.relief!.exportStl({ project: snapshot,
        options: { baseThicknessMm: 1, layerHeightMm: .1 } });
      return { bytes, result };
    }, fixture);
    expect(result.bytes).toBeGreaterThan(64_000_000);
    expect(result.result?.path).toBe(output);
    const raw = await fs.readFile(output);
    expect(raw.readUInt32LE(80)).toBe(12);
    expect(raw.length).toBe(684);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
