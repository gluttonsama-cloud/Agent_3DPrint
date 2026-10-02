import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

async function launchCapabilities() {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  if (env.RELIEF_TEST_PACKAGED === '1') {
    env.PATH = `${process.env.SystemRoot}\\System32`;
    delete env.PYTHONHOME; delete env.PYTHONPATH;
    return electron.launch({ executablePath: path.join(process.cwd(), 'release/win-unpacked/Relief Studio.exe'),
      args: ['--capabilities-demo'], env });
  }
  return electron.launch({ args: [process.cwd(), '--capabilities-demo'], env });
}

test('A 后台边界：导出取消清理、损坏导入失败', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const root = process.cwd();
  const app = await launchCapabilities();
  const page = await app.firstWindow();
  const directory = path.join(root, 'artifacts', `cancel-${Date.now()}`);
  const fixture = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/v2/normal-v2.json'), 'utf8'));
  try {
    await expect(page.getByRole('heading', { name: 'A 能力独立验证台' })).toBeVisible();
    const result = await page.evaluate(async ({ fixture, directory }) => {
      const side = 512, count = side * side;
      const encode = (bytes: Uint8Array, type: string) => {
        let data = '';
        for (let i = 0; i < bytes.length; i += 8192) data += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return { type, encoding: 'base64-le', data: btoa(data) };
      };
      const snapshot = { ...fixture, width: side, height: side,
        original: encode(new Uint8Array(count * 4).fill(255), 'uint8'),
        colors: encode(new Uint8Array(count * 4).fill(255), 'uint8'),
        labels: encode(new Uint8Array(new Uint16Array(count).fill(1).buffer), 'uint16'),
        heights: encode(new Uint8Array(new Uint16Array(count).fill(256).buffer), 'uint16'),
        protection: encode(new Uint8Array(count), 'uint8') };
      const native = window.reliefV2!;
      let complete = false;
      const pending = native.export({ requestId: 'cancel-export', payload: { snapshot,
        device: snapshot.device, formats: ['png'], obj: false, outputDirectory: directory } })
        .finally(() => { complete = true; });
      while (!complete) {
        const progress = await native.progress({ requestId: 'cancel-export' });
        if (progress) { await native.cancel({ requestId: 'cancel-export' }); break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return await pending;
    }, { fixture, directory });
    expect(result.result.status).toBe('cancelled');
    await expect(fs.stat(directory)).rejects.toThrow();
    const failed = await page.evaluate(() => window.reliefV2!.import({ requestId: 'broken-import',
      payload: { imageDataUrl: 'not-an-image', sizeMm: [10, 10], keepBackground: false } }));
    expect(failed.result.status).toBe('error');
    await expect(page.getByLabel('像素高度')).toHaveText('0,0,3,6,10,0,3,6,10,0,3,6');
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});

test('A 独立能力：真实调高、跨区擦除撤销、保存重开及 JPG/OBJ 输出', async () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const root = process.cwd();
  const app = await launchCapabilities();
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const directory = path.join(root, 'artifacts', `capabilities-${Date.now()}`);
  await fs.mkdir(directory, { recursive: true });
  try {
    await expect(page.getByRole('heading', { name: 'A 能力独立验证台' })).toBeVisible();
    const original = '0,0,3,6,10,0,3,6,10,0,3,6';
    await expect(page.getByLabel('像素高度')).toHaveText(original);
    await page.getByRole('button', { name: '跨区擦除示例' }).click();
    await expect(page.getByLabel('像素高度')).toHaveText('0,0,0,0,0,0,3,6,10,0,3,6');
    await page.getByRole('button', { name: '撤销候选' }).click();
    await expect(page.getByLabel('像素高度')).toHaveText(original);
    await page.getByLabel('白墨层数', { exact: true }).fill('6');
    await page.getByRole('button', { name: '应用选区高度' }).click();
    await expect(page.getByLabel('任务状态')).toHaveText('候选已原子提交', { timeout: 30000 });
    await expect(page.getByLabel('像素高度')).toHaveText('0,6,6,6,6,0,6,6,6,6,6,6');
    await page.getByRole('button', { name: '撤销候选' }).click();
    await expect(page.getByLabel('像素高度')).toHaveText(original);
    const snapshot = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/v2/normal-v2.json'), 'utf8'));
    const saved = path.join(directory, 'saved.json');
    const io = await page.evaluate(async ({ snapshot, saved }) => {
      const native = window.reliefV2!;
      const save = await native.save({ requestId: 'e2e-save', payload: { snapshot, path: saved } });
      const open = await native.open({ requestId: 'e2e-open', payload: { path: saved } });
      return { save, open };
    }, { snapshot, saved });
    expect(io.save.result.status).toBe('success');
    expect(io.open.result.status).toBe('success');
    if (io.open.result.status === 'success') {
      const reopened = io.open.result.value as { snapshot: typeof snapshot };
      expect(reopened.snapshot.heights).toEqual(snapshot.heights);
      expect(reopened.snapshot.sessionId).not.toBe(snapshot.sessionId);
    }
    await page.getByLabel('附加 JPG', { exact: true }).check();
    await page.getByLabel('附加 OBJ 查看模型', { exact: true }).check();
    await page.getByLabel('新输出目录').fill(path.join(directory, 'bundle'));
    await page.getByRole('button', { name: '导出', exact: true }).click();
    await expect(page.getByLabel('任务状态')).toContainText('导出成功', { timeout: 30000 });
    const files = await fs.readdir(path.join(directory, 'bundle'));
    expect(files).toContain('manifest.json'); expect(files).toContain('relief.obj');
    await page.getByText('从输出文件独立检查 OBJ', { exact: true }).click();
    await page.getByLabel('OBJ 检查文件').setInputFiles(['relief.obj', 'relief.mtl', 'texture.png']
      .map(name => path.join(directory, 'bundle', name)));
    await expect(page.getByLabel('OBJ 尺寸')).toContainText('4.000 × 3.000 × 1.000');
    await page.screenshot({ path: path.join(directory, 'capabilities.png'), fullPage: true });
    await page.getByLabel('OBJ 检查文件').setInputFiles({ name: 'empty.obj', mimeType: 'text/plain', buffer: Buffer.from('# empty') });
    await expect(page.getByLabel('OBJ 尺寸')).toContainText('没有可查看的网格');
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
