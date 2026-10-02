const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

module.exports = function registerV2({ handle, engineCommand, chooseSave, chooseOpen }) {
  const tasks = new Map();
  const fail = (base, message) => ({ status: 'error', base, code: 'V2_IPC_FAILED', message });
  async function run(action, request) {
    const requestId = request?.requestId;
    const payload = request?.payload;
    const base = payload?.snapshot
      ? { sessionId: payload.snapshot.sessionId, revision: payload.snapshot.revision }
      : { sessionId: requestId, revision: 0 };
    if (typeof requestId !== 'string' || !/^[\w-]{1,100}$/.test(requestId) || !payload)
      return { requestId, result: fail(base, '请求编号或内容无效') };
    if (tasks.size) return { requestId, result: fail(base, '已有 v2 任务正在执行') };
    const task = { cancelled: false, directory: null };
    tasks.set(requestId, task);
    try {
      task.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'relief-v2-'));
      const cancelPath = path.join(task.directory, 'cancel');
      if (task.cancelled) await fs.writeFile(cancelPath, 'cancel');
      if (action === 'save' && !payload.path) {
        const chosen = await chooseSave('浮雕工程-v2.relief.json', [{ name: '浮雕工程', extensions: ['json'] }]);
        if (chosen.canceled || !chosen.filePath) return { requestId, result: { status: 'cancelled', base } };
        payload.path = chosen.filePath;
      }
      if (action === 'open' && !payload.path) {
        const chosen = await chooseOpen();
        if (chosen.canceled) return { requestId, result: { status: 'cancelled', base } };
        payload.path = chosen.filePaths[0];
      }
      const job = JSON.stringify({ action: `v2:${action}`, payload, requestId, base, cancelPath,
        progressPath: path.join(task.directory, 'progress.json') });
      if (Buffer.byteLength(job) > 144 * 1024 ** 2) throw new Error('任务超过 144 MiB');
      const jobPath = path.join(task.directory, 'job.json');
      const output = path.join(task.directory, 'result');
      await fs.writeFile(jobPath, job, 'utf8');
      if (task.cancelled) return { requestId, result: { status: 'cancelled', base } };
      const [command, args] = engineCommand(action);
      await new Promise((resolve, reject) => {
        const child = spawn(command, [...args, '--job', jobPath, '--out', output], {
          windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'],
          env: { ...process.env, PYTHONUTF8: '1' },
        });
        let stderr = '';
        // 先合作取消，使输出模块有机会清理；超时才结束进程。
        let killTimer;
        const timer = setTimeout(() => {
          task.cancelled = true;
          fs.writeFile(cancelPath, 'timeout').catch(() => {});
          killTimer = setTimeout(() => child.kill(), 10000);
        }, 600000);
        child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
        child.on('error', error => { clearTimeout(timer); clearTimeout(killTimer); reject(error); });
        child.on('close', code => {
          clearTimeout(timer); clearTimeout(killTimer);
          if (code === 0) resolve(); else reject(new Error(stderr || `引擎退出 ${code}`));
        });
      });
      const result = JSON.parse(await fs.readFile(path.join(output, 'result.json'), 'utf8'));
      return { requestId, result };
    } catch (error) {
      return { requestId, result: task.cancelled ? { status: 'cancelled', base } : fail(base, error.message) };
    } finally {
      if (task.directory) await fs.rm(task.directory, { recursive: true, force: true });
      tasks.delete(requestId);
    }
  }
  for (const action of ['height', 'recognition', 'export', 'save', 'open', 'migrate', 'import'])
    handle(`v2:${action}`, request => run(action, request), true);
  handle('v2:cancel', async ({ requestId }) => {
    const task = tasks.get(requestId);
    if (!task) return;
    task.cancelled = true;
    if (task.directory) await fs.writeFile(path.join(task.directory, 'cancel'), 'cancel');
  }, true);
  handle('v2:progress', async ({ requestId }) => {
    const task = tasks.get(requestId);
    if (!task?.directory) return null;
    try { return JSON.parse(await fs.readFile(path.join(task.directory, 'progress.json'), 'utf8')); }
    catch { return null; }
  }, true);
};
