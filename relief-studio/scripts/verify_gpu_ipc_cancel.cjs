// 复用真实 v2 管理器和真实 GPU，引擎只附加前向开始/结束标记。
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const register = require('../electron/v2.cjs');

async function main() {
  const root = path.resolve(__dirname, '..');
  if (!process.argv[2]) throw new Error('需要一个尚不存在的证据目录');
  const directory = path.resolve(process.argv[2]);
  await fs.mkdir(directory);
  const handlers = {};
  const runtime = register({ handle: (name, fn) => { handlers[name] = fn; }, engineCommand: action => action === 'height'
    ? [path.join(root, '.venv/Scripts/python.exe'), [path.join(root, 'engine/main.py')]] : [
    path.join(root, '.gpu-venv/Scripts/python.exe'),
    [path.join(__dirname, 'verify_gpu_cancel.py'), '--worker', '--output', directory],
  ] });
  const snapshot = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/v2/normal-v2.json'), 'utf8'));
  snapshot.original.data = Buffer.from(Array.from({ length: 12 }, () => [180, 80, 40, 255]).flat()).toString('base64');
  let complete = false;
  const pending = handlers['v2:recognition']({ requestId: 'gpu-cancel', payload: {
    snapshot, keepBackground: false, protectionPolicy: 'preserve',
  } }).finally(() => { complete = true; });
  try {
    let marker;
    for (let attempt = 0; attempt < 2400 && !complete; attempt++) {
      try { marker = JSON.parse(await fs.readFile(path.join(directory, 'forward-start.json'), 'utf8')); break; }
      catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
      await delay(50);
    }
    assert.ok(marker?.allocatedBytes > 0, '必须实际加载 CUDA 并进入模型前向');
    await assert.rejects(fs.stat(path.join(directory, 'forward-finished')), { code: 'ENOENT' });
    const started = performance.now();
    await handlers['v2:cancel']({ requestId: 'gpu-cancel' });
    const result = await pending;
    const cancelMs = performance.now() - started;
    assert.equal(result.result.status, 'cancelled');
    assert.ok(cancelMs < 15000, `10 秒宽限后须及时结束，实际 ${cancelMs}ms`);
    assert.throws(() => process.kill(marker.pid, 0));
    await assert.rejects(fs.stat(marker.jobDirectory), { code: 'ENOENT' });
    const recovered = await handlers['v2:height']({ requestId: 'gpu-cancel-recover', payload: {
      snapshot, operation: { kind: 'set', layers: 11 },
    } });
    assert.equal(recovered.result.status, 'success');
    const heights = Buffer.from(snapshot.heights.data, 'base64');
    const labels = Buffer.from(snapshot.labels.data, 'base64');
    for (const block of recovered.result.value.blocks) {
      if (block.field === 'heights') Buffer.from(block.after.data, 'base64').copy(heights, block.offset * 2);
    }
    for (let index = 0; index < 12; index++)
      assert.equal(heights.readUInt16LE(index * 2), labels.readUInt16LE(index * 2) ? 11 : 0);
    const forwardCompleted = await fs.stat(path.join(directory, 'forward-finished')).then(() => true, error => {
      if (error.code === 'ENOENT') return false; throw error;
    });
    const report = { ...marker, cancelMs, status: result.result.status, processExited: true,
      temporaryRemoved: true, cpuRecoveryExact: true, forwardCompleted,
      scope: 'real BiRefNet CUDA forward through v2 manager; not SAM or packaged GPU' };
    await fs.writeFile(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await runtime.shutdown();
    await pending;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
