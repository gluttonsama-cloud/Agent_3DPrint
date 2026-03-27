const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const requestIdMiddleware = require('./middleware/requestId');
const { errorHandler } = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

const http = require('http');
const { Server } = require('socket.io');
const { agentEventEmitter } = require('./utils/AgentEventEmitter');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Socket.IO event mapping
io.on('connection', (socket) => {
  console.log('[Socket.io] Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('[Socket.io] Client disconnected:', socket.id);
  });
});

agentEventEmitter.on('agent_event', (event) => {
  // Generic agent event
  io.emit('agent-event', event);

  // Map backend event types to frontend expected formats
  if (event.type === 'agent_state_changed') {
    io.emit('agent-state-change', event.data);
  } else if (event.type === 'tool_call_started') {
    io.emit('agent-tool-start', event.data);
  } else if (event.type === 'tool_call_completed') {
    io.emit('agent-tool-complete', event.data);
  }
});

app.use(cors());
app.use(requestIdMiddleware);
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(requestLogger);

/**
 * @openapi
 * /health:
 *   get:
 *     summary: 健康检查
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 服务状态正常
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 time:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    version: '2.0.0',
    api: 'hunyuan-qiniu'
  });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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
const healthRoutes = require('./routes/health');
const agentDecisionsRoutes = require('./routes/agentDecisions');
const agentsRoutes = require('./routes/agents');
const ordersRoutes = require('./routes/orders');
const devicesRoutes = require('./routes/devices');
const materialsRoutes = require('./routes/materials');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api/upload', uploadRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/remove-background', backgroundRemovalRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/agent-decisions', agentDecisionsRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 处理
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    requestId: req.requestId
  });
});

app.use(errorHandler);

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║  3D Head Modeling API - v2.0.0 (混元 + 七牛云版)        ║
╠════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                          ║
║  Socket.io WebSocket Server Running                    ║
║  Environment: ${process.env.NODE_ENV || 'development'}
║  Health: http://localhost:${PORT}/health                 ║
╚════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
