const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    version: '2.0.0',
    api: 'hunyuan-qiniu',
    socket: 'enabled'
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
      statusMessage: t.statusMessage
    }))
  });
});

// Agent API
app.get('/api/agent-decisions', (req, res) => {
  res.json({ success: true, data: [] });
});

app.get('/api/agents/:agentId/status', (req, res) => {
  res.json({
    success: true,
    data: {
      agentId: req.params.agentId,
      state: 'idle',
      name: req.params.agentId + ' Agent'
    }
  });
});

app.post('/api/agent-workflow/process-order', async (req, res) => {
  const { orderId } = req.body;
  setTimeout(() => {
    io.emit('agent-event', {
      type: 'workflow-started',
      orderId,
      timestamp: new Date().toISOString()
    });
  }, 500);
  res.json({
    success: true,
    message: 'Agent workflow started',
    orderId,
    workflowId: 'wf-' + Date.now(),
    steps: [
      { name: '审核订单', status: 'completed', agent: 'review-agent' },
      { name: '分配设备', status: 'in_progress', agent: 'scheduler-agent' },
      { name: '检查库存', status: 'pending', agent: 'inventory-agent' }
    ]
  });
});

app.post('/api/agent-decisions/decide', (req, res) => {
  res.json({
    success: true,
    decision: { id: 'dec-' + Date.now(), result: 'approved', confidence: 0.95 }
  });
});

app.post('/api/agent-decisions/batch-record', (req, res) => {
  res.json({ success: true, count: req.body.decisions?.length || 0 });
});

const uploadRoutes = require('./routes/upload');
const statusRoutes = require('./routes/status');
const downloadRoutes = require('./routes/download');
const backgroundRemovalRoutes = require('./routes/backgroundRemoval');

app.use('/api/upload', uploadRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/remove-background', backgroundRemovalRoutes);

// 设备管理 API
app.get('/api/devices', (req, res) => {
  res.json({
    success: true,
    data: [
      { id: 'device-001', name: '3D打印机 A', status: 'idle', model: 'Creality Ender 3' },
      { id: 'device-002', name: '3D打印机 B', status: 'printing', model: 'Prusa MK3' },
      { id: 'device-003', name: '3D打印机 C', status: 'idle', model: 'Anycubic Kobra' }
    ]
  });
});

app.post('/api/devices', (req, res) => {
  res.json({ success: true, message: '设备已添加', id: 'device-' + Date.now() });
});

app.put('/api/devices/:id', (req, res) => {
  res.json({ success: true, message: '设备已更新' });
});

app.delete('/api/devices/:id', (req, res) => {
  res.json({ success: true, message: '设备已删除' });
});

// 材料管理 API
const getMaterialsData = () => ({
  success: true,
  data: {
    items: [
      { _id: 'mat-001', name: 'PLA 白色', type: 'filament', stock: { quantity: 500, unit: 'g' }, threshold: 100, properties: { color: '白色' } },
      { _id: 'mat-002', name: 'PLA 黑色', type: 'filament', stock: { quantity: 300, unit: 'g' }, threshold: 100, properties: { color: '黑色' } },
      { _id: 'mat-003', name: 'PLA 红色', type: 'filament', stock: { quantity: 200, unit: 'g' }, threshold: 100, properties: { color: '红色' } }
    ],
    pagination: { page: 1, limit: 20, total: 3 }
  }
});

app.get('/api/materials', (req, res) => res.json(getMaterialsData()));
app.get('/api/inventory', (req, res) => res.json(getMaterialsData()));

app.post('/api/materials', (req, res) => {
  res.json({ success: true, message: '材料已添加', data: { _id: 'mat-' + Date.now(), ...req.body } });
});

app.patch('/api/materials/:id/stock', (req, res) => {
  res.json({ success: true, message: '库存已更新' });
});

app.put('/api/materials/:id', (req, res) => {
  res.json({ success: true, message: '材料已更新' });
});

app.delete('/api/materials/:id', (req, res) => {
  res.json({ success: true, message: '材料已删除' });
});

// 订单管理 API
app.get('/api/orders', (req, res) => {
  res.json({ success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0 } } });
});

app.post('/api/orders', (req, res) => {
  res.json({ success: true, message: '订单已创建', data: { _id: 'ord-' + Date.now(), ...req.body } });
});

// Dashboard API
app.get('/api/dashboard/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalOrders: 12,
      pendingOrders: 4,
      printingOrders: 3,
      completedToday: 8,
      totalDevices: 3,
      activeDevices: 2,
      lowStockMaterials: 1
    }
  });
});

app.get('/api/dashboard/devices/utilization', (req, res) => {
  res.json({
    success: true,
    data: {
      devices: ['3D打印机 A', '3D打印机 B', '3D打印机 C'],
      utilization: [75, 90, 0]
    }
  });
});

app.get('/api/dashboard/devices/timeline', (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  res.json({
    success: true,
    data: {
      devices: [
        {
          name: '3D打印机 A',
          timeline: [
            { type: 'printing', start: '2026-03-24T08:00:00', end: '2026-03-24T12:00:00' },
            { type: 'idle', start: '2026-03-24T12:00:00', end: '2026-03-24T13:00:00' },
            { type: 'printing', start: '2026-03-24T13:00:00', end: '2026-03-24T17:00:00' }
          ]
        },
        {
          name: '3D打印机 B',
          timeline: [
            { type: 'printing', start: '2026-03-24T09:00:00', end: '2026-03-24T15:00:00' },
            { type: 'maintenance', start: '2026-03-24T15:00:00', end: '2026-03-24T17:00:00' }
          ]
        },
        {
          name: '3D打印机 C',
          timeline: [
            { type: 'idle', start: '2026-03-24T08:00:00', end: '2026-03-24T17:00:00' }
          ]
        }
      ],
      timeRange: {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString()
      }
    }
  });
});

app.get('/api/dashboard/inventory/prediction', (req, res) => {
  res.json({
    success: true,
    data: {
      indicators: [
        { name: 'PLA 白色', max: 600 },
        { name: 'PLA 黑色', max: 400 },
        { name: 'PLA 红色', max: 300 }
      ],
      current: [500, 300, 200],
      predicted: [350, 100, 50]
    }
  });
});

app.get('/api/dashboard/orders/trend', (req, res) => {
  res.json({
    success: true,
    data: {
      dates: ['03-18', '03-19', '03-20', '03-21', '03-22', '03-23', '03-24'],
      values: [5, 8, 12, 7, 15, 10, 12]
    }
  });
});

app.get('/api/dashboard/agents/performance', (req, res) => {
  res.json({
    success: true,
    data: {
      indicators: [
        { name: '审核效率', max: 100 },
        { name: '调度准确率', max: 100 },
        { name: '库存预警', max: 100 },
        { name: '响应速度', max: 100 },
        { name: '决策质量', max: 100 }
      ],
      coordinator: [85, 90, 75, 95, 88],
      scheduler: [80, 95, 70, 90, 85],
      inventory: [75, 85, 95, 80, 90]
    }
  });
});

app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'Cannot ' + req.method + ' ' + req.path
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
  console.log('Socket.IO enabled');
});

module.exports = app;