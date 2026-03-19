const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// 请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    version: '2.0.0',
    api: 'hunyuan-qiniu'
  });
});

const taskStore = require('./services/taskStore');
app.get('/api/debug/tasks', (req, res) => {
  const tasks = taskStore.getAllTasks();
  res.json({
    count: tasks.length,
    tasks: tasks.map(t => ({
      id: t.id,
      status: t.status,
      progress: t.progress,
      provider: t.provider,
      providerJobId: t.providerJobId,
      photoUrls: t.photoUrls,
      statusMessage: t.statusMessage,
      schedulerStatus: t.schedulerStatus,
      schedulerMessage: t.schedulerMessage,
      hunyuanError: t.hunyuanError,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt
    }))
  });
});

// API 路由
const uploadRoutes = require('./routes/upload');
const statusRoutes = require('./routes/status');
const downloadRoutes = require('./routes/download');
const backgroundRemovalRoutes = require('./routes/backgroundRemoval');

app.use('/api/upload', uploadRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/remove-background', backgroundRemovalRoutes);

// 404 处理
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║  3D Head Modeling API - v2.0.0 (混元 + 七牛云版)        ║
╠════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                          ║
║  Environment: ${process.env.NODE_ENV || 'development'}
║  Health: http://localhost:${PORT}/health                 ║
╚════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
