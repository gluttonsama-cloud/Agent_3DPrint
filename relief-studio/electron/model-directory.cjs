const path = require('node:path');
const fs = require('node:fs');

module.exports = (app, exists = fs.existsSync) => {
  const persistent = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'ReliefStudio', 'model-runtime');
  if (exists(path.join(persistent, 'subject-engine.exe'))) return persistent;
  return path.join(path.dirname(app.getPath('exe')), 'model-runtime');
};
