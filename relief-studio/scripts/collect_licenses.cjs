const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function main() {
  const root = path.resolve(__dirname, '..');
  const destination = path.join(root, 'licenses');
  await fs.mkdir(destination, { recursive: true });
  for (const name of ['react', 'react-dom', 'scheduler', 'three']) {
    const license = path.join(root, 'node_modules', name, 'LICENSE');
    await fs.copyFile(license, path.join(destination, `${name}-LICENSE.txt`));
  }
  const result = spawnSync(
    path.join(root, '.venv', 'Scripts', 'python.exe'),
    [path.join(root, 'scripts', 'collect_python_licenses.py')],
    { cwd: root, stdio: 'inherit', shell: false },
  );
  if (result.status !== 0) throw new Error('Python 许可收集失败');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
