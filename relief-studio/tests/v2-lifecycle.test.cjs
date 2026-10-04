const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const registerV2 = require('../electron/v2.cjs');

function harness(options = {}) {
  const handlers = {};
  registerV2({ handle: (name, fn) => { handlers[name] = fn; },
    engineCommand: () => [process.execPath, [path.join(__dirname, 'fixtures/v2/task-engine.cjs')]],
    cancelGraceMs: 50, ...options });
  return handlers;
}

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
