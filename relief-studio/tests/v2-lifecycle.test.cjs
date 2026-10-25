const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const registerV2 = require('../electron/v2.cjs');
const engineCommand = require('../electron/engine-command.cjs');

function harness(options = {}) {
  const handlers = {};
  handlers.runtime = registerV2({ handle: (name, fn) => { handlers[name] = fn; },
    engineCommand: () => [process.execPath, [path.join(__dirname, 'fixtures/v2/task-engine.cjs')]],
    cancelGraceMs: 50, ...options });
  return handlers;
}

test('CPU 分色和已有主体结果不等待 GPU 交接，也不占用 GPU 任务标记', async () => {
  for (const payload of [{ mode: 'color' }, { mode: 'subject', subjectMask: { width: 1, height: 1 } }]) {
    let preparations = 0;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const commands = [];
    const handlers = harness({ prepareEngine: async () => { preparations++; await gate; },
      engineCommand: (action, body) => {
        commands.push({ action, body });
        return [process.execPath, [path.join(__dirname, 'fixtures/v2/task-engine.cjs')]];
      } });
    const pending = handlers['v2:recognition']({ requestId: 'cpu-recognition', payload });
    try {
      assert.equal(handlers.runtime.hasGpuTasks(), false);
      const completed = await Promise.race([pending, delay(1000).then(() => null)]);
      assert.equal(completed?.result.status, 'success', 'CPU 候选不能等待 GPU 资源释放');
      assert.equal(preparations, 0);
      assert.deepEqual(commands, [{ action: 'recognition', body: payload }]);
    } finally { release(); await pending; }
  }
});

test('序列化可能变成 null 的非法显式蒙版在启动引擎前拒绝', async () => {
  let starts = 0;
  let preparations = 0;
  const handlers = harness({ prepareEngine: () => { preparations++; }, engineCommand: () => {
    starts++;
    return [process.execPath, [path.join(__dirname, 'fixtures/v2/task-engine.cjs')]];
  } });
  for (const mode of ['color', 'subject']) {
    for (const subjectMask of [NaN, Infinity, -Infinity, new Date(NaN), new Date(), false, [], 0, 'mask']) {
      const result = await handlers['v2:recognition']({ requestId: 'invalid-mask-shape', payload: { mode, subjectMask } });
      assert.equal(result.result.status, 'error', '非法显式蒙版不能在 JSON 转 null 后变为预测请求');
      assert.equal(handlers.runtime.hasGpuTasks(), false);
    }
  }
  assert.equal(starts, 0);
  assert.equal(preparations, 0);
});

test('CPU 识别保留计算任务取消和清理语义，不冒用高度或文件操作 action', async () => {
  const handlers = harness({ prepareEngine: () => { throw new Error('CPU 不应交接 GPU'); } });
  const pending = handlers['v2:recognition']({ requestId: 'cancel-cpu', payload: { mode: 'color', hang: true } });
  let progress;
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      progress = await handlers['v2:progress']({ requestId: 'cancel-cpu' });
      if (progress) break;
      await delay(10);
    }
    assert.ok(progress?.pid, 'CPU 测试子进程必须启动');
    assert.equal(handlers.runtime.hasGpuTasks(), false);
    await handlers['v2:cancel']({ requestId: 'cancel-cpu' });
    assert.equal((await Promise.race([pending, delay(1000).then(() => null)]))?.result.status, 'cancelled');
    assert.throws(() => process.kill(progress.pid, 0));
    await assert.rejects(fs.stat(progress.directory), { code: 'ENOENT' });
  } finally {
    if (progress?.pid) { try { process.kill(progress.pid); } catch {} }
    await pending;
  }
});

test('显式主体蒙版仍经真实 CPU 后端验证，非法蒙版和快照不能绕过解码', {
  skip: !existsSync(path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe')),
}, async () => {
  const root = path.resolve(__dirname, '..');
  const command = engineCommand({ isPackaged: false }, root, 'unused');
  const snapshot = JSON.parse(await fs.readFile(path.join(__dirname, 'fixtures/v2/normal-v2.json'), 'utf8'));
  const mask = { width: snapshot.width, height: snapshot.height,
    data: { type: 'uint8', encoding: 'base64-le', data: Buffer.alloc(snapshot.width * snapshot.height, 1).toString('base64') } };
  const handlers = harness({ prepareEngine: () => { throw new Error('已提供蒙版不能启动 GPU 交接'); },
    engineCommand: (action, payload) => {
      const selected = command(action, payload);
      assert.equal(selected[0], path.join(root, '.venv', 'Scripts', 'python.exe'));
      return selected;
    } });
  const base = { snapshot, mode: 'subject', subjectMask: mask, keepBackground: false, protectionPolicy: 'preserve' };
  assert.equal((await handlers['v2:recognition']({ requestId: 'real-cpu-valid', payload: base })).result.status, 'success');
  const malformed = [
    { ...base, subjectMask: { ...mask, width: mask.width + 1 } },
    { ...base, subjectMask: { ...mask, data: { ...mask.data, data: Buffer.alloc(12, 2).toString('base64') } } },
    { ...base, subjectMask: {} },
    { ...base, snapshot: { ...snapshot, width: 0 } },
    { ...base, selection: { ...mask, width: mask.width + 1 } },
  ];
  for (const [index, payload] of malformed.entries()) {
    const result = await handlers['v2:recognition']({ requestId: `real-cpu-invalid-${index}`, payload });
    assert.equal(result.result.status, 'error');
    assert.equal(result.result.code, 'V2_OPERATION_FAILED', '应由真实后端拒绝，而非 GPU 交接失败');
    assert.equal(handlers.runtime.hasGpuTasks(), false);
  }
});

test('识别等待旧 GPU 资源释放，等待期间保留任务占用', async () => {
  let release;
  let engineCalls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  let preparing = false;
  const handlers = harness({ prepareEngine: async () => { preparing = true; await gate; },
    engineCommand: () => {
      engineCalls++;
      return [process.execPath, [path.join(__dirname, 'fixtures/v2/task-engine.cjs')]];
    } });
  const pending = handlers['v2:recognition']({ requestId: 'prepare-gpu', payload: {} });
  try {
    for (let attempt = 0; attempt < 100 && !preparing; attempt++) await delay(5);
    assert.equal(preparing, true, '必须先完成资源交接');
    assert.equal(handlers.runtime.hasGpuTasks(), true);
    assert.equal(engineCalls, 0, '资源交接完成前不得调用引擎入口');
    assert.equal(await handlers['v2:progress']({ requestId: 'prepare-gpu' }), null, '交接前不得启动新进程');
    release();
    assert.equal((await pending).result.status, 'success');
    assert.equal(engineCalls, 1);
    assert.equal(handlers.runtime.hasGpuTasks(), false);
  } finally { release(); await pending; }
});

test('资源交接时取消导入或实际主体识别，不启动新的 GPU 进程', async () => {
  for (const action of ['import', 'recognition']) {
    let release;
    let engineCalls = 0;
    const gate = new Promise(resolve => { release = resolve; });
    let preparing = false;
    const handlers = harness({ prepareEngine: async () => { preparing = true; await gate; },
      engineCommand: () => { engineCalls++; throw new Error('已取消时不应启动'); } });
    const pending = handlers[`v2:${action}`]({ requestId: 'cancel-prepare', payload: { subjectMask: null } });
    try {
      for (let attempt = 0; attempt < 100 && !preparing; attempt++) await delay(5);
      assert.equal(preparing, true);
      await handlers['v2:cancel']({ requestId: 'cancel-prepare' });
      release();
      assert.equal((await pending).result.status, 'cancelled');
      assert.equal(engineCalls, 0, '取消后不得调用引擎入口');
      assert.equal(handlers.runtime.hasGpuTasks(), false);
    } finally { release(); await pending; }
  }
});

test('取消无响应的识别进程后，清理目录并释放任务槽', async () => {
  const handlers = harness();
  const pending = handlers['v2:recognition']({ requestId: 'hang', payload: { hang: true } });
  let progress;
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      progress = await handlers['v2:progress']({ requestId: 'hang' });
      if (progress) break;
      await delay(10);
    }
    assert.ok(progress?.pid, '测试子进程必须实际启动');
    assert.equal((await handlers['v2:height']({ requestId: 'busy', payload: {} })).result.status, 'error');
    await handlers['v2:cancel']({ requestId: 'hang' });
    await handlers['v2:cancel']({ requestId: 'hang' });
    const result = await Promise.race([pending, delay(1000).then(() => null)]);
    assert.equal(result?.result.status, 'cancelled', '取消不能等待十分钟任务超时');
    assert.throws(() => process.kill(progress.pid, 0));
    await assert.rejects(fs.stat(progress.directory), { code: 'ENOENT' });
    assert.equal((await handlers['v2:height']({ requestId: 'next', payload: {} })).result.status, 'success');
  } finally {
    if (progress?.pid) { try { process.kill(progress.pid); } catch {} }
    await pending;
  }
});

test('退出等待计算进程和临时目录回收，并拒绝新任务', async () => {
  const handlers = harness();
  const pending = handlers['v2:recognition']({ requestId: 'shutdown-hang', payload: { hang: true } });
  let progress;
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      progress = await handlers['v2:progress']({ requestId: 'shutdown-hang' });
      if (progress) break;
      await delay(10);
    }
    assert.ok(progress?.pid);
    const shutdown = handlers.runtime.shutdown();
    assert.equal((await handlers['v2:height']({ requestId: 'after-shutdown', payload: {} })).result.status, 'cancelled');
    await Promise.all([shutdown, handlers.runtime.shutdown()]);
    assert.equal((await pending).result.status, 'cancelled');
    assert.throws(() => process.kill(progress.pid, 0));
    await assert.rejects(fs.stat(progress.directory), { code: 'ENOENT' });
  } finally {
    if (progress?.pid) { try { process.kill(progress.pid); } catch {} }
    await pending;
  }
});

test('退出等待已有保存结果，且启动前退出不启动引擎', async () => {
  const handlers = harness();
  const pending = handlers['v2:save']({ requestId: 'shutdown-save', payload: { path: 'fixture-only', delayMs: 150 } });
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await handlers['v2:progress']({ requestId: 'shutdown-save' })) break;
    await delay(10);
  }
  await handlers.runtime.shutdown();
  assert.equal((await pending).result.status, 'success');
  const early = harness({ engineCommand: () => { throw new Error('不应启动进程'); } });
  const initial = early['v2:recognition']({ requestId: 'early', payload: {} });
  await early.runtime.shutdown();
  assert.equal((await initial).result.status, 'cancelled');
});

test('保存收到迟到取消仍如实返回成功，不套用计算任务的强制终止', async () => {
  const handlers = harness();
  const pending = handlers['v2:save']({ requestId: 'save', payload: { path: 'fixture-only', delayMs: 250 } });
  let progress;
  for (let attempt = 0; attempt < 200; attempt++) {
    progress = await handlers['v2:progress']({ requestId: 'save' });
    if (progress) break;
    await delay(10);
  }
  assert.ok(progress?.pid);
  await handlers['v2:cancel']({ requestId: 'save' });
  assert.equal((await pending).result.status, 'success');
  await assert.rejects(fs.stat(progress.directory), { code: 'ENOENT' });
});

test('引擎退出失败与启动失败均不锁住后续任务', async () => {
  const handlers = harness();
  assert.equal((await handlers['v2:recognition']({ requestId: 'failed', payload: { fail: true } })).result.status, 'error');
  assert.equal((await handlers['v2:height']({ requestId: 'after-failed', payload: {} })).result.status, 'success');
  let first = true;
  const spawnHandlers = harness({ engineCommand: () => {
    if (first) { first = false; return [path.join(__dirname, 'missing-engine.exe'), []]; }
    return [process.execPath, [path.join(__dirname, 'fixtures/v2/task-engine.cjs')]];
  } });
  assert.equal((await spawnHandlers['v2:height']({ requestId: 'spawn-failed', payload: {} })).result.status, 'error');
  assert.equal((await spawnHandlers['v2:height']({ requestId: 'after-spawn-failed', payload: {} })).result.status, 'success');
});

test('清理目录异常也释放任务槽，后续操作可以恢复', async context => {
  const handlers = harness();
  const original = fs.rm;
  let failedDirectory;
  context.mock.method(fs, 'rm', async (directory, options) => {
    failedDirectory = directory;
    const error = new Error('模拟目录占用'); error.code = 'EBUSY'; throw error;
  });
  try {
    await assert.rejects(handlers['v2:height']({ requestId: 'cleanup-error', payload: {} }), /模拟目录占用/);
  } finally {
    context.mock.restoreAll();
    if (failedDirectory) await original(failedDirectory, { recursive: true, force: true });
  }
  assert.equal((await handlers['v2:height']({ requestId: 'recovered', payload: {} })).result.status, 'success');
});
