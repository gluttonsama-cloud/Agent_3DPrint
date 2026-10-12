// 生命周期测试专用引擎：真实子进程，支持模拟不响应合作取消的计算。
const fs = require('node:fs');
const path = require('node:path');
const job = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--job') + 1], 'utf8'));
const output = process.argv[process.argv.indexOf('--out') + 1];
fs.writeFileSync(job.progressPath, JSON.stringify({ pid: process.pid, directory: path.dirname(job.progressPath) }));
if (job.payload.hang) {
  setInterval(() => {}, 1000);
} else if (job.payload.fail) {
  process.exitCode = 2;
} else {
  setTimeout(() => {
    fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ status: 'success', base: job.base, value: {} }));
  }, job.payload.delayMs || 0);
}
