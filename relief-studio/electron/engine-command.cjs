const path = require('node:path');
const fs = require('node:fs');

function requiresGpu(action, payload) {
  // 显式主体结果只需 CPU 合并；普通对象内的蒙版数据仍交给 Python 严格校验。
  const suppliedMask = payload && Object.hasOwn(payload, 'subjectMask') && payload.subjectMask != null;
  if (action === 'recognition' && suppliedMask) {
    const mask = payload.subjectMask;
    if (typeof mask !== 'object' || (Object.getPrototypeOf(mask) !== Object.prototype && Object.getPrototypeOf(mask) !== null))
      throw new TypeError('主体蒙版必须为普通对象或 null');
    // NaN、无效 Date 等可被 JSON 隐式转成 null；不得把非法蒙版转成缺省预测请求。
    if (typeof mask.toJSON === 'function') throw new TypeError('主体蒙版不允许自定义 JSON 转换');
  }
  return action === 'import' || (action === 'recognition' && payload?.mode !== 'color' && !suppliedMask);
}

module.exports = (app, root, resources, exists = fs.existsSync) => (action, payload) => {
  if (requiresGpu(action, payload)) {
    if (app.isPackaged) {
      const runtime = path.join(require('./model-directory.cjs')(app, exists), 'subject-engine.exe');
      if (exists(runtime)) return [runtime, []];
    } else {
      const python = path.join(root, '.gpu-venv', 'Scripts', 'python.exe');
      if (exists(python)) return [python, [path.join(root, 'engine', 'main.py')]];
    }
  }
  return app.isPackaged
    ? [path.join(resources, 'engine', 'relief-engine.exe'), []]
    : [path.join(root, '.venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'])), [path.join(root, 'engine', 'main.py')]];
};

module.exports.requiresGpu = requiresGpu;
