const path = require('node:path');
const fs = require('node:fs');

module.exports = (app, root, resources, exists = fs.existsSync, platform = process.platform) => action => {
  // 独立 GPU 模型包当前仅提供 Windows 版本，Mac 试用使用 CPU 引擎。
  if (platform === 'win32' && ['recognition', 'import'].includes(action)) {
    if (app.isPackaged) {
      const runtime = path.join(require('./model-directory.cjs')(app, exists), 'subject-engine.exe');
      if (exists(runtime)) return [runtime, []];
    } else {
      const python = path.join(root, '.gpu-venv', 'Scripts', 'python.exe');
      if (exists(python)) return [python, [path.join(root, 'engine', 'main.py')]];
    }
  }
  return app.isPackaged
    ? [path.join(resources, 'engine', platform === 'win32' ? 'relief-engine.exe' : 'relief-engine'), []]
    : [path.join(root, '.venv', ...(platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'])), [path.join(root, 'engine', 'main.py')]];
};
