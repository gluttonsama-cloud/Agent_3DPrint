// 验证真实分发 EXE 的 JSONL 与 v2 文件接口，禁止用开发 Python 替代。
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const cp = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

async function main() {
  const root = path.resolve(__dirname, '..');
  const appDirectory = path.resolve(process.argv[2]);
  const output = path.resolve(process.argv[3]);
  await fs.mkdir(output);
  const originalSpawn = cp.spawn;
  const children = [];
  cp.spawn = (...args) => { const child = originalSpawn(...args); children.push(child); return child; };
  const app = { isPackaged: true, getPath: () => path.join(appDirectory, 'Relief Studio.exe') };
  const subject = require('../electron/subject.cjs')(app, root);
  const resources = process.argv[4] ? path.resolve(process.argv[4]) : path.join(appDirectory, 'resources');
  const commands = require('../electron/engine-command.cjs')(app, root, resources);
  const handlers = {};
  const v2 = require('../electron/v2.cjs')({ handle: (name, fn) => { handlers[name] = fn; }, engineCommand: commands });
  cp.spawn = originalSpawn;
  const image = 'data:image/jpeg;base64,' + (await fs.readFile(path.join(root, 'samples/source-logo.jpg'))).toString('base64');
  try {
    assert.equal(subject.status().installed, true);
    const started = performance.now();
    const proposed = await subject.request({ id: 'propose', action: 'propose', image });
    assert.equal(proposed.ok, true);
    assert.match(proposed.mask, /^data:image\/png;base64,/);
    const predicted = await subject.request({ id: 'predict', action: 'predict', image,
      points: [{ x: 300, y: 210, label: 1 }] });
    assert.equal(predicted.ok, true);
    await subject.stop();
    const pending = subject.request({ id: 'cancel-load', action: 'predict', image,
      points: [{ x: 300, y: 210, label: 1 }] }).then(() => 'success', error => error.message);
    await delay(100);
    await subject.stop();
    assert.match(await pending, /取消/);
    const imported = await handlers['v2:import']({ requestId: 'gpu-import', payload: {
      imageDataUrl: image, sizeMm: [55, 55], keepBackground: false,
    } });
    assert.equal(imported.result.status, 'success', JSON.stringify(imported.result));
    const snapshot = imported.result.value;
    const recognized = await handlers['v2:recognition']({ requestId: 'gpu-recognize', payload: {
      snapshot, keepBackground: false, protectionPolicy: 'preserve',
    } });
    assert.equal(recognized.result.status, 'success', JSON.stringify(recognized.result));
    const recovered = await handlers['v2:height']({ requestId: 'cpu-height', payload: {
      snapshot, operation: { kind: 'set', layers: 11 },
    } });
    assert.equal(recovered.result.status, 'success');
    await subject.shutdown(); await v2.shutdown();
    for (const child of children) assert.throws(() => process.kill(child.pid, 0));
    const report = { executable: commands('recognition')[0], cpuExecutable: commands('height')[0], cudaModels: ['BiRefNet', 'SAM'],
      jsonlBothModels: true, v2OpaqueImport: true, v2Recognition: true,
      runningProcessCancel: true, cpuHeightRecovery: true, allProcessesExited: true,
      elapsedSeconds: (performance.now() - started) / 1000,
      scope: 'real packaged runtime protocols; cancellation during cold start; not image quality acceptance' };
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await subject.shutdown(); await v2.shutdown(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
