import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function inheritedEnv(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env)
    .filter((entry): entry is [string, string] => entry[1] !== undefined));
}

test('A7 真实 IPC 重复识别与取消后可继续，任务临时目录清空', async () => {
  const directory = path.join(process.cwd(), 'artifacts', `recognition-lifecycle-${Date.now()}`);
  const temporary = path.join(directory, 'tmp');
  await fs.mkdir(temporary, { recursive: true });
  const env: Record<string, string> = { ...inheritedEnv(), TMP: temporary, TEMP: temporary,
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

test('A7 真窗口关闭等待 v2 引擎与临时目录退出，取消关窗仍可操作', async () => {
  const directory = path.join(process.cwd(), 'artifacts', `shutdown-${Date.now()}`);
  await fs.mkdir(directory, { recursive: true });
  const env: Record<string, string> = { ...inheritedEnv(), TMP: directory, TEMP: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: [process.cwd()], env });
  let closed = false;
  try {
    const page = await app.firstWindow();
    // Electron 已由 will-prevent-unload 处理，避免 Playwright 再自动关闭同一提示。
    page.on('dialog', () => {});
    await page.evaluate(() => window.addEventListener('beforeunload', event => {
      event.preventDefault(); event.returnValue = '';
    }, { once: true }));
    await app.evaluate(({ dialog, app }) => {
      dialog.showMessageBoxSync = () => 0;
      app.quit();
    });
    await expect(page.getByRole('button', { name: '打开工程', exact: true })).toBeVisible();
    const fixture = JSON.parse(await fs.readFile('tests/fixtures/v2/normal-v2.json', 'utf8'));
    const afterCancelledClose = await page.evaluate(snapshot => window.reliefV2!.height({
      requestId: 'after-cancelled-close', payload: { snapshot, operation: { kind: 'set', layers: 8 } },
    }), fixture);
    expect(afterCancelledClose.result.status).toBe('success');
    const opaque = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      canvas.getContext('2d')!.fillRect(0, 0, 64, 64); return canvas.toDataURL();
    });
    const pending = page.evaluate(imageDataUrl => window.reliefV2!.import({ requestId: 'close-import',
      payload: { imageDataUrl, sizeMm: [10, 10], keepBackground: false } }), opaque).catch(() => null);
    const python = path.join(process.cwd(), '.venv/Scripts/python.exe');
    let enginePids: number[] = [];
    for (let attempt = 0; attempt < 40; attempt++) {
      enginePids = JSON.parse(execFileSync(python, ['-c',
        'import psutil,json,sys; print(json.dumps([p.pid for p in psutil.Process(int(sys.argv[1])).children(recursive=True) if "python" in p.name().lower()]))',
        String(app.process().pid)], { encoding: 'utf8' }));
      if (enginePids.length) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    expect(enginePids.length).toBeGreaterThan(0);
    const finished = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.close()));
    await finished; closed = true; await pending;
    const alive = JSON.parse(execFileSync(python, ['-c',
      'import psutil,json,sys; print(json.dumps([pid for pid in json.loads(sys.argv[1]) if psutil.pid_exists(pid)]))',
      JSON.stringify(enginePids)], { encoding: 'utf8' }));
    expect(alive).toEqual([]);
    expect((await fs.readdir(directory)).filter(name => name.startsWith('relief-v2-'))).toEqual([]);
  } finally {
    if (!closed) {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
      await app.close();
    }
  }
});
