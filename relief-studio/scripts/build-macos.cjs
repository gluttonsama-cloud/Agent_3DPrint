const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.error('此任务必须在 macOS arm64 runner 上运行，不能用 Linux 或 Intel 后端替代。');
  process.exit(1);
}
function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}
// Python 与 Electron 必须使用同一架构；禁止打进异平台 sidecar。
run(path.join(root, '.venv/bin/python'), ['-c',
  'import platform; assert platform.system() == "Darwin" and platform.machine() == "arm64", "Python must be macOS arm64"']);
run('npm', ['run', 'build']);
run('npm', ['run', 'build:engine']);
run(process.execPath, ['scripts/collect_licenses.cjs']);
run(process.execPath, ['node_modules/electron-builder/cli.js', '--mac', '--arm64', '--publish', 'never',
  '--config', 'installer/electron-builder.mac.cjs']);
run(process.execPath, ['scripts/verify-macos.cjs']);
