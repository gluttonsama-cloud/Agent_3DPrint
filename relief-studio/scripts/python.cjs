const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const executable = path.join(
  root,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);
const result = spawnSync(executable, process.argv.slice(2), {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
