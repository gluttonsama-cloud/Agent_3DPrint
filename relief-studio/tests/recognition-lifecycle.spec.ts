import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

test('A7 真实 IPC 重复识别与取消后可继续，任务临时目录清空', async () => {
  const directory = path.join(process.cwd(), 'artifacts', `recognition-lifecycle-${Date.now()}`);
  const temporary = path.join(directory, 'tmp');
  await fs.mkdir(temporary, { recursive: true });
  const env = { ...process.env, TMP: temporary, TEMP: temporary,
    RELIEF_BIREFNET_DIRECTORY: path.join(directory, 'missing-model') };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  const samples: unknown[] = [];
  try {
    const page = await app.firstWindow();
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'red'; context.fillRect(8, 8, 112, 112);
      context.clearRect(48, 48, 32, 32);
      return canvas.toDataURL();
    });
    const imported = await page.evaluate(imageDataUrl => window.reliefV2!.import({ requestId: 'initial-import',
      payload: { imageDataUrl, sizeMm: [32, 32], keepBackground: false } }), image);
    expect(imported.result.status).toBe('success');
    if (imported.result.status !== 'success') throw new Error(JSON.stringify(imported));
    const snapshot = imported.result.value;
    for (let index = 0; index < 3; index++) {
      const started = Date.now();
      const result = await page.evaluate(async ({ snapshot, index }) => {
        const bridge = window.reliefV2!;
        const payload = { snapshot, keepBackground: false, protectionPolicy: 'preserve' };
        const recognized = await bridge.recognition({ requestId: `recognize-${index}`, payload });
        const pending = bridge.recognition({ requestId: `cancel-${index}`, payload });
        await bridge.cancel({ requestId: `cancel-${index}` });
        const cancelled = await pending;
        const recovered = await bridge.height({ requestId: `recover-${index}`,
          payload: { snapshot, operation: { kind: 'set', layers: 11 } } });
        return { recognized, cancelled, recovered };
      }, { snapshot, index });
      expect(result.recognized.result.status).toBe('success');
      expect(result.cancelled.result.status).toBe('cancelled');
      expect(result.recovered.result.status).toBe('success');
      expect((await fs.readdir(temporary)).filter(name => name.startsWith('relief-v2-'))).toEqual([]);
      const metrics = await app.evaluate(({ app }) => app.getAppMetrics().map(metric => ({
        type: metric.type, workingSetKB: metric.memory.workingSetSize,
      })));
      samples.push({ index, elapsedMs: Date.now() - started, metrics });
    }
    await fs.writeFile(path.join(directory, 'ipc-resources.json'), JSON.stringify({
      scope: '128px Electron IPC lifecycle; immediate cancellation; memory samples only, not leak proof',
      taskDirectoriesRemaining: 0, samples,
    }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
