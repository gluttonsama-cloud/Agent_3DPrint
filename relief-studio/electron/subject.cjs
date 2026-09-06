const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function subjectRuntime(app, root) {
  let child,
    pending,
    buffer = '',
    stderr = '';
  const directory = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'model-runtime')
    : root;
  const command = app.isPackaged
    ? path.join(directory, 'subject-engine.exe')
    : path.join(root, '.gpu-venv', 'Scripts', 'python.exe');
  const checkpoint = app.isPackaged
    ? path.join(directory, 'sam2.1_hiera_tiny.pt')
    : path.join(root, 'artifacts', 'sam2.1_hiera_tiny.pt');
  function stop(message = '识别已取消') {
    const current = child;
    child = null;
    current?.kill();
    buffer = '';
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
      pending = null;
    }
  }
  return {
    stop,
    status: () => ({ installed: fs.existsSync(command) && fs.existsSync(checkpoint), directory }),
    request(job) {
      if (!fs.existsSync(command) || !fs.existsSync(checkpoint))
        return Promise.reject(
          new Error('尚未安装 GPU 主体模型包，请将 model-runtime 放在程序同目录。'),
        );
      if (!job || !['propose', 'predict'].includes(job.action) || typeof job.id !== 'string')
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
        });
        child = current;
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
