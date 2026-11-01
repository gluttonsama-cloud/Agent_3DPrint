const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const engineCommand = require('../electron/engine-command.cjs');

test('纯分色与显式主体蒙版在开发和安装版均使用 CPU，引擎缺省识别仍使用 GPU', () => {
  const packaged = { isPackaged: true, getPath: () => path.resolve('installed/Relief Studio.exe') };
  const source = { isPackaged: false };
  for (const app of [packaged, source]) {
    const command = engineCommand(app, 'source', 'resources', () => true);
    const cpu = app.isPackaged ? [path.join('resources', 'engine', 'relief-engine.exe'), []]
      : [path.join('source', '.venv', 'Scripts', 'python.exe'), [path.join('source', 'engine', 'main.py')]];
    for (const payload of [{ mode: 'color' }, { mode: 'subject', subjectMask: { width: 1, height: 1 } }, { subjectMask: {} }])
      assert.deepEqual(command('recognition', payload), cpu, '显式蒙版交由 CPU 验证，不应加载 GPU');
    for (const subjectMask of [NaN, Infinity, false, [], new Date(NaN)])
      assert.throws(() => command('recognition', { subjectMask }), /主体蒙版/);
    for (const payload of [{}, { mode: 'subject' }, { subjectMask: null }, { subjectMask: undefined }])
      assert.notDeepEqual(command('recognition', payload), cpu, '未提供主体结果时仍需要 GPU');
    assert.notDeepEqual(command('import', { mode: 'color' }), cpu, '导入保持原交接语义');
  }
});

test('安装版识别使用完整 GPU 运行时，编辑和导出保持 CPU 引擎', () => {
  const app = { isPackaged: true, getPath: () => path.resolve('installed/Relief Studio.exe') };
  const gpu = path.resolve('installed/model-runtime/subject-engine.exe');
  const command = engineCommand(app, 'source', 'resources', file => file === gpu);
  for (const action of ['recognition', 'import']) assert.deepEqual(command(action), [gpu, []]);
  for (const action of ['height', 'export', 'save'])
    assert.deepEqual(command(action), [path.join('resources', 'engine', 'relief-engine.exe'), []]);
  assert.deepEqual(engineCommand(app, 'source', 'resources', () => false)('recognition'),
    [path.join('resources', 'engine', 'relief-engine.exe'), []]);
});

test('安装版优先使用独立用户目录，重装应用不改变模型位置', () => {
  const app = { isPackaged: true, getPath: () => path.resolve('installed/Relief Studio.exe') };
  const persistent = path.join(process.env.LOCALAPPDATA, 'ReliefStudio', 'model-runtime', 'subject-engine.exe');
  const command = engineCommand(app, 'source', 'resources', file => file === persistent);
  assert.deepEqual(command('recognition'), [persistent, []]);
});
