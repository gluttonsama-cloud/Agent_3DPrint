const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function subjectRuntime(app, root) {
  let child,
    pending,
    buffer = '',
    stderr = '';
  const retiring = new Set();
  const closed = new WeakMap();
  let stopping = false;
  const modern = path.join(root, 'model-runtime');
  const directory = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'model-runtime')
    : fs.existsSync(path.join(modern, 'sam2.1_hiera_tiny.pt')) &&
        fs.existsSync(path.join(modern, 'birefnet-hr', 'model.safetensors'))
      ? modern
      : path.join(root, 'artifacts');
  const command = app.isPackaged
    ? path.join(directory, 'subject-engine.exe')
    : path.join(root, '.gpu-venv', 'Scripts', 'python.exe');
  const checkpoint = path.join(directory, 'sam2.1_hiera_tiny.pt');
  const foreground = path.join(path.dirname(checkpoint), 'birefnet-hr', 'model.safetensors');
  function stop(message = '识别已取消') {
    const current = child;
    child = null;
    if (current) {
      retiring.add(closed.get(current));
      current.kill();
    }
    buffer = '';
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
      pending = null;
    }
    return Promise.all([...retiring]);
  }
  return {
    stop,
    shutdown: () => {
      stopping = true;
      return stop('程序正在退出');
    },
    status: () => ({
      installed: fs.existsSync(command) && fs.existsSync(checkpoint) && fs.existsSync(foreground),
      directory,
    }),
    request(job) {
      if (stopping || retiring.size) return Promise.reject(new Error('模型进程正在退出，请稍后重试'));
      if (!fs.existsSync(command) || !fs.existsSync(checkpoint) || !fs.existsSync(foreground))
        return Promise.reject(
          new Error('尚未安装 GPU 主体模型包，请将 model-runtime 放在程序同目录。'),
        );
      if (!job || !['propose', 'predict', 'refine'].includes(job.action) || typeof job.id !== 'string')
        return Promise.reject(new Error('主体识别请求无效'));
      const line = JSON.stringify(job);
      if (Buffer.byteLength(line) > 64_000_000) return Promise.reject(new Error('识别图片过大'));
      if (pending) return Promise.reject(new Error('上一项主体识别尚未结束'));
      if (!child) {
        const args = app.isPackaged ? [] : [path.join(root, 'engine', 'subject_worker.py')];
        const current = spawn(command, [...args, '--checkpoint', checkpoint], {
          windowsHide: true,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        });
        child = current;
        const done = new Promise(resolve => current.once('close', () => {
          retiring.delete(done);
          resolve();
        }));
        closed.set(current, done);
        buffer = '';
        stderr = '';
        current.stdout.setEncoding('utf8');
        current.stdout.on('data', (data) => {
          if (child !== current) return;
          buffer += data;
          if (buffer.length > 128_000_000) {
            stop('模型返回数据过大');
            return;
          }
          let index;
          while ((index = buffer.indexOf('\n')) >= 0) {
            const text = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            try {
              const result = JSON.parse(text);
              if (!pending || result.id !== pending.id) continue;
              const done = pending;
              pending = null;
              clearTimeout(done.timer);
              if (result.ok) done.resolve(result);
              else done.reject(new Error(result.error));
            } catch {
              stop('模型响应格式错误');
            }
          }
        });
        current.stderr.on('data', (data) => {
          if (child !== current) return;
          stderr = (stderr + data.toString()).slice(-2000);
        });
        current.on('error', (error) => {
          if (child === current) stop(error.message);
        });
        current.stdin.on('error', (error) => {
          if (child === current) stop(error.message);
        });
        current.on('exit', () => {
          if (child === current) stop(`模型进程已退出：${stderr}`);
        });
      }
      return new Promise((resolve, reject) => {
        pending = {
          id: job.id,
          resolve,
          reject,
          timer: setTimeout(() => stop('主体识别超时，请减小图片后重试'), 180000),
        };
        child.stdin.write(line + '\n');
      });
    },
  };
};
