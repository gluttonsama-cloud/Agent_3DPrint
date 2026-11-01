const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('必须在 Windows x64 runner 原生打包');
const run = (script, args = []) => execFileSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
run('node_modules/typescript/bin/tsc', ['--noEmit']);
run('node_modules/vite/bin/vite.js', ['build']);
run('scripts/python.cjs', ['-c', 'import platform,struct; assert platform.system()=="Windows" and struct.calcsize("P")==8']);
run('scripts/python.cjs', ['-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--name', 'relief-engine', '--distpath', 'engine-dist', '--workpath', 'build/engine', 'engine/main.py']);
run('scripts/collect_licenses.cjs');
run('node_modules/electron-builder/cli.js', ['--win', 'nsis', '--x64', '--publish', 'never',
  '-c.artifactName=Relief-Studio-${version}-integrated-80392e2-${arch}-Setup.${ext}']);
// NSIS 外壳可为 32 位，实际应用和 Python 原生依赖必须全部为 x64。
let checked = 0;
function inspect(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) inspect(filename);
    else if (/\.(exe|dll|pyd)$/i.test(item.name)) {
      const bytes = fs.readFileSync(filename), offset = bytes.readUInt32LE(0x3c);
      if (bytes.toString('ascii', 0, 2) !== 'MZ' || bytes.toString('ascii', offset, offset + 4) !== 'PE\0\0' || bytes.readUInt16LE(offset + 4) !== 0x8664)
        throw new Error(`非 Windows x64 原生依赖：${filename}`);
      checked++;
    }
  }
}
inspect(path.join(root, 'release/win-unpacked'));
const engine = path.join(root, 'release/win-unpacked/resources/engine/relief-engine.exe');
if (!fs.existsSync(engine) || !checked) throw new Error('缺少 Windows 后端');
console.log(`已检查 ${checked} 个 Windows x64 PE 文件；安装包签名及安装后工作流由 runner 验证。`);
