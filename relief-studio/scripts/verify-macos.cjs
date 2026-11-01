const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('只能在 macOS arm64 验证此包');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'release/mac-trial');
const app = path.join(directory, 'mac-arm64/Relief Studio.app');
const resources = path.join(app, 'Contents/Resources');
const engine = path.join(resources, 'engine/relief-engine');
for (const file of ['app.asar', 'samples/sample-project.json', 'licenses/react-LICENSE.txt']) {
  if (!fs.existsSync(path.join(resources, file))) throw new Error(`包内缺少 ${file}`);
}
fs.accessSync(engine, fs.constants.X_OK);
function run(command, args) { return execFileSync(command, args, { encoding: 'utf8' }).trim(); }
// 检查所有实际 Mach-O，包括 Python、扩展和动态库，不能仅看 DMG 文件名。
let binaries = 0;
function inspect(directory) {
  for (const name of fs.readdirSync(directory)) {
    const filename = path.join(directory, name), stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) inspect(filename);
    else if (run('/usr/bin/file', ['-b', filename]).includes('Mach-O')) {
      run('/usr/bin/lipo', [filename, '-verify_arch', 'arm64']);
      binaries++;
    }
  }
}
inspect(app);
if (!binaries) throw new Error('包内未发现 Mach-O 可执行内容');
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'relief-mac-smoke-'));
try {
  const job = path.join(temp, 'job.json');
  fs.writeFileSync(job, JSON.stringify({ action: 'validate', project: JSON.parse(fs.readFileSync(path.join(resources, 'samples/sample-project.json'), 'utf8')) }));
  const result = JSON.parse(run(engine, ['--job', job, '--out', path.join(temp, 'output')]));
  if (!result.ok) throw new Error('包内 Python 引擎验证失败');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
const dmgs = fs.readdirSync(directory).filter(name => name.endsWith('-arm64.dmg'));
if (dmgs.length !== 1) throw new Error('应只生成一个本轮 arm64 DMG，请先清理旧输出');
run('/usr/bin/hdiutil', ['verify', path.join(directory, dmgs[0])]);
// 只读挂载实际 DMG，确认交付镜像内应用与通过测试的应用相同。
const mount = fs.mkdtempSync(path.join(os.tmpdir(), 'relief-dmg-'));
let mounted = false;
try {
  run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, path.join(directory, dmgs[0])]);
  mounted = true;
  const imageApp = path.join(mount, 'Relief Studio.app');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', imageApp]);
  for (const relative of ['Contents/MacOS/Relief Studio', 'Contents/Resources/app.asar', 'Contents/Resources/engine/relief-engine']) {
    const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (hash(path.join(app, relative)) !== hash(path.join(imageApp, relative))) throw new Error(`DMG 内容不一致：${relative}`);
  }
} finally {
  if (mounted) run('/usr/bin/hdiutil', ['detach', mount]);
  fs.rmSync(mount, { recursive: true, force: true });
}
console.log(`已验证 ${binaries} 个支持 arm64 的 Mach-O、ad-hoc 签名完整性、CPU 引擎和 DMG 完整性；未公证。`);
