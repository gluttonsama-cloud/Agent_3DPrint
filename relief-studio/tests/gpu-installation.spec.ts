import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('安装后的完整 GPU 配套：真实主体、SAM、v2 导入识别与 CPU 编辑', async () => {
  test.skip(process.env.RELIEF_TEST_GPU_PACKAGED !== '1', '显式启用安装后 GPU 验证');
  test.setTimeout(300000);
  if (!process.env.RELIEF_TEST_EXECUTABLE) throw new Error('需要已安装 EXE 路径');
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE; delete env.PYTHONPATH; delete env.PYTHONHOME;
  env.PATH = `${process.env.SystemRoot}\\System32`;
  const app = await electron.launch({ executablePath: process.env.RELIEF_TEST_EXECUTABLE, env });
  const directory = path.join(process.cwd(), 'artifacts', `gpu-installed-${Date.now()}`);
  await fs.mkdir(directory);
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    const version = await app.evaluate(({ app }) => app.getVersion());
    expect(version).toBe(JSON.parse(await fs.readFile('package.json', 'utf8')).version);
    const page = await app.firstWindow();
    const status = await page.evaluate(() => window.relief!.subjectStatus());
    expect(status.installed).toBe(true);
    const image = 'data:image/jpeg;base64,' + (await fs.readFile('samples/source-logo.jpg')).toString('base64');
    const result = await page.evaluate(async image => {
      const subject = await window.relief!.subject({ id: 'installed-propose', action: 'propose', image });
      const sam = await window.relief!.subject({ id: 'installed-sam', action: 'predict', image,
        points: [{ x: 300, y: 210, label: 1 }] });
      const imported = await window.reliefV2!.import({ requestId: 'installed-import', payload: {
        imageDataUrl: image, sizeMm: [55, 55], keepBackground: false,
      } });
      if (imported.result.status !== 'success') throw new Error(JSON.stringify(imported));
      const snapshot = imported.result.value;
      const recognition = await window.reliefV2!.recognition({ requestId: 'installed-recognition', payload: {
        snapshot, keepBackground: false, protectionPolicy: 'preserve',
      } });
      const height = await window.reliefV2!.height({ requestId: 'installed-height', payload: {
        snapshot, operation: { kind: 'set', layers: 11 },
      } });
      return { subjectOk: typeof subject.mask === 'string' && subject.mask.startsWith('data:image/png;base64,'),
        samOk: typeof sam.mask === 'string' && sam.mask.startsWith('data:image/png;base64,'), importStatus: imported.result.status,
        recognitionStatus: recognition.result.status, heightStatus: height.result.status };
    }, image);
    expect(result).toEqual({ subjectOk: true, samOk: true, importStatus: 'success', recognitionStatus: 'success', heightStatus: 'success' });
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify({ version, status, result, executable: process.env.RELIEF_TEST_EXECUTABLE }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
