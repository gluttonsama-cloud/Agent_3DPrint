const { app, BrowserWindow, dialog, ipcMain, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'dist', 'index.html');
let mainWindow;
let busy = false;
let segmentChild, segmentTask;
let segmentCanceled = false;
const subject = require('./subject.cjs')(app, root);
app.on('before-quit', () => subject.stop());

function engineCommand() {
  return app.isPackaged
    ? [path.join(process.resourcesPath, 'engine', 'relief-engine.exe'), []]
    : [path.join(root, '.venv', 'Scripts', 'python.exe'), [path.join(root, 'engine', 'main.py')]];
}

async function runEngine(job, destination) {
  const serialized = JSON.stringify(job);
  if (Buffer.byteLength(serialized) > 64_000_000) throw new Error('工程超过 64 MB 限制');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'relief-job-'));
  try {
    const jobPath = path.join(temp, 'job.json');
    const output = destination || path.join(temp, 'result');
    await fs.writeFile(jobPath, serialized, 'utf8');
    const [command, args] = engineCommand();
    if (job.action === 'segment' && segmentCanceled) throw new Error('识别已取消');
    const result = await new Promise((resolve, reject) => {
      const child = spawn(command, [...args, '--job', jobPath, '--out', output], {
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (job.action === 'segment') segmentChild = child;
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('算法处理超过 120 秒，请减小图片或层数后重试'));
      }, 120000);
      child.stdout.on('data', (chunk) => {
        stdout = (stdout + chunk.toString()).slice(-1_000_000);
      });
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-4000);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        if (segmentChild === child) segmentChild = null;
        clearTimeout(timer);
        try {
          const response = JSON.parse(stdout.trim());
          if (code !== 0 || !response.ok) throw new Error(response.error?.message || stderr);
          resolve(response);
        } catch (error) {
          reject(new Error(`算法失败：${error.message || stderr || code}`));
        }
      });
    });
    if (job.action === 'segment') {
      return JSON.parse(await fs.readFile(path.join(output, 'project.json'), 'utf8'));
    }
    return result;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

function handle(name, action, concurrent = false) {
  ipcMain.handle(name, async (event, value) => {
    if (
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      event.senderFrame.url !== pathToFileURL(indexPath).href
    ) {
      throw new Error('不允许的调用来源');
    }
    if (concurrent) return action(value);
    if (busy) throw new Error('正在处理上一项任务');
    busy = true;
    try {
      return await action(value);
    } finally {
      busy = false;
    }
  });
}

async function chooseSave(defaultPath, filters) {
  return dialog.showSaveDialog(mainWindow, { defaultPath, filters });
}

function registerHandlers() {
  handle(
    'relief:segment-cancel',
    async () => {
      segmentCanceled = true;
      segmentChild?.kill();
      await segmentTask?.catch(() => {});
    },
    true,
  );
  handle('relief:subject', (input) => subject.request(input));
  handle('relief:subject-status', () => subject.status(), true);
  handle('relief:subject-cancel', () => subject.stop(), true);
  handle('relief:info', () => ({ version: app.getVersion(), platform: process.platform }));
  handle('relief:sample', async () => {
    const samples = app.isPackaged
      ? path.join(process.resourcesPath, 'samples')
      : path.join(root, 'samples');
    return JSON.parse(await fs.readFile(path.join(samples, 'sample-project.json'), 'utf8'));
  });
  handle('relief:segment', async (input) => {
    segmentCanceled = false;
    segmentTask = runEngine({ ...input, action: 'segment' });
    try {
      return await segmentTask;
    } finally {
      segmentTask = null;
      segmentChild = null;
    }
  });
  handle('relief:save', async (project) => {
    await runEngine({ action: 'validate', project });
    const result = await chooseSave('浮雕工程.relief.json', [
      { name: '浮雕工程', extensions: ['json'] },
    ]);
    if (result.canceled || !result.filePath) return null;
    const tempPath = result.filePath + `.tmp-${Date.now()}`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(project), 'utf8');
      await fs.rename(tempPath, result.filePath);
    } finally {
      await fs.rm(tempPath, { force: true });
    }
    return { path: result.filePath };
  });
  handle('relief:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: '浮雕工程', extensions: ['json'] }],
    });
    if (result.canceled) return null;
    const filename = result.filePaths[0];
    if ((await fs.stat(filename)).size > 64_000_000) throw new Error('工程文件过大');
    const project = JSON.parse(await fs.readFile(filename, 'utf8'));
    await runEngine({ action: 'validate', project });
    return project;
  });
  handle('relief:export', async (project) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(result.filePaths[0], `relief-${stamp}`);
    await runEngine({ action: 'export', project }, destination);
    return { path: destination };
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'",
        ],
      },
    }),
  );
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#f4f2ed',
    title: 'Relief Studio · 浮雕制版',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['继续编辑', '放弃更改并关闭'],
      defaultId: 0,
      cancelId: 0,
      message: '工程有未保存的更改',
      detail: '关闭后将丢失这些更改。',
    });
    if (choice === 1) event.preventDefault();
  });
  registerHandlers();
  mainWindow.loadFile(indexPath);
});
app.on('window-all-closed', () => app.quit());
