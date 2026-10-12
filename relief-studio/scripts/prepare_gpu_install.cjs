// 从本次分卷生成固定版本的安装清单，构建目录不进入 Git。
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');

async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = path.resolve(process.argv[2]);
  const archive = process.argv[3];
  if (!archive || path.basename(archive) !== archive) throw new Error('需要分卷目录和归档文件名');
  const version = require('../package.json').version;
  const files = (await fs.readdir(directory)).filter(name => name.startsWith(archive + '.') && /^\d{3}$/.test(name.slice(archive.length + 1))).sort();
  if (!files.length) throw new Error('未找到模型分卷');
  const parts = [];
  for (let index = 0; index < files.length; index++) {
    const name = files[index];
    if (name !== `${archive}.${String(index + 1).padStart(3, '0')}`) throw new Error('模型分卷必须连续编号');
    const target = path.join(directory, name);
    const bytes = (await fs.stat(target)).size;
    if (!bytes || bytes >= 2 * 1024 ** 3) throw new Error('模型分卷大小不适合 GitHub Release');
    const hash = crypto.createHash('sha256');
    for await (const chunk of createReadStream(target)) hash.update(chunk);
    parts.push({ name, bytes, sha256: hash.digest('hex') });
  }
  const runtimeFiles = [];
  const runtimeDirectory = path.join(root, 'artifacts/gpu-dist/model-runtime');
  async function total(target) {
    let sum = 0;
    for (const item of await fs.readdir(target, { withFileTypes: true })) {
      const file = path.join(target, item.name);
      if (item.isDirectory()) sum += await total(file);
      else {
        const bytes = (await fs.stat(file)).size;
        const hash = crypto.createHash('sha256');
        for await (const chunk of createReadStream(file)) hash.update(chunk);
        runtimeFiles.push({ path: path.relative(runtimeDirectory, file).split(path.sep).join('/'), bytes, sha256: hash.digest('hex') });
        sum += bytes;
      }
    }
    return sum;
  }
  const manifest = { version, tag: `relief-studio-v${version}`, archiveBytes: parts.reduce((sum, part) => sum + part.bytes, 0),
    unpackedBytes: await total(runtimeDirectory), parts, files: runtimeFiles };
  const staging = path.join(root, 'build/gpu-setup');
  await fs.mkdir(staging, { recursive: true });
  for (const name of ['Install-Gpu.ps1', 'GpuSetup.Core.ps1']) {
    const source = await fs.readFile(path.join(root, 'installer', name), 'utf8');
    await fs.writeFile(path.join(staging, name), '\uFEFF' + source.replace(/^\uFEFF/, ''), 'utf8');
  }
  const sevenZip = process.env.RELIEF_7ZA || path.join(os.homedir(), 'AppData/Local/electron-builder/Cache/7zip@1.0.0/7zip-win-x64-a34pt/bin/7za.exe');
  await fs.copyFile(sevenZip, path.join(staging, '7za.exe'));
  for (const name of ['LICENSE.txt', 'COPYING']) await fs.copyFile(path.join(path.dirname(sevenZip), '..', name), path.join(staging, '7zip-' + name));
  await fs.writeFile(path.join(staging, 'gpu-manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(directory, 'gpu-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ version, archiveBytes: manifest.archiveBytes, unpackedBytes: manifest.unpackedBytes, parts, runtimeFileCount: runtimeFiles.length }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
