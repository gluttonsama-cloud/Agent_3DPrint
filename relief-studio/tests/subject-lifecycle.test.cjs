const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const childProcess = require('node:child_process');
const path = require('node:path');

function runtime(context, exists = () => true) {
  const children = [];
  context.mock.method(fs, 'existsSync', exists);
  context.mock.method(childProcess, 'spawn', () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stdin.write = line => {
      const job = JSON.parse(line);
      if (!job.hang) setImmediate(() => child.stdout.emit('data', JSON.stringify({ id: job.id, ok: true }) + '\n'));
    };
    child.kill = () => {
      setTimeout(() => { child.closed = true; child.emit('exit', null); child.emit('close', null); }, 30);
      return true;
    };
    children.push(child); return child;
  });
  delete require.cache[require.resolve('../electron/subject.cjs')];
  return { service: require('../electron/subject.cjs')({ isPackaged: false }, path.resolve('fixture')), children };
}

test('开发入口使用 model-runtime 模型，也支持历史 artifacts', async context => {
  const modern = runtime(context, filename => filename.includes('.gpu-venv') || filename.includes('model-runtime'));
  assert.equal(modern.service.status().installed, true);
  context.mock.restoreAll();
  const legacy = runtime(context, filename => filename.includes('.gpu-venv') || filename.includes('artifacts'));
  assert.equal(legacy.service.status().installed, true);
});

test('取消等待 close，退出期间不重叠启动，结束后可恢复', async context => {
  const { service, children } = runtime(context);
  const pending = service.request({ id: 'cancel', action: 'predict', hang: true });
  const rejected = assert.rejects(pending, /取消/);
  const stopping = service.stop();
  assert.equal(typeof stopping?.then, 'function');
  await assert.rejects(service.request({ id: 'too-soon', action: 'predict' }), /退出/);
  await stopping; await rejected;
  assert.equal(children[0].closed, true);
  assert.equal((await service.request({ id: 'recovered', action: 'predict' })).ok, true);
  await service.shutdown();
  assert.equal(children[1].closed, true);
  await assert.rejects(service.request({ id: 'after-shutdown', action: 'predict' }), /退出/);
});
