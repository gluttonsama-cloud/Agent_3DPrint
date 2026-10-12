const path = require('node:path');
const fs = require('node:fs');

module.exports = (app, root, resources, exists = fs.existsSync) => action => {
  if (['recognition', 'import'].includes(action)) {
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
    : [path.join(root, '.venv', 'Scripts', 'python.exe'), [path.join(root, 'engine', 'main.py')]];
};
