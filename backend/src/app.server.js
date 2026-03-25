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

// Socket.IO 连接处理
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

// 已有的路由
const uploadRoutes = require('./routes/upload');
const statusRoutes = require('./routes/status');
const downloadRoutes = require('./routes/download');
const backgroundRemovalRoutes = require('./routes/backgroundRemoval');

app.use('/api/upload', uploadRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/remove-background', backgroundRemovalRoutes);

// ===== 设备管理 API =====
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

// ===== 材料/库存管理 API =====
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
app.post('/api/inventory', (req, res) => {
  res.json({ success: true, message: '材料已添加', id: 'mat-' + Date.now() });
});

app.patch('/api/materials/:id/stock', (req, res) => {
  res.json({ success: true, message: '库存已更新' });
});
app.put('/api/materials/:id', (req, res) => {
  res.json({ success: true, message: '材料已更新' });
});
app.put('/api/inventory/:id', (req, res) => {
  res.json({ success: true, message: '材料已更新' });
});

app.delete('/api/materials/:id', (req, res) => {
  res.json({ success: true, message: '材料已删除' });
});
app.delete('/api/inventory/:id', (req, res) => {
  res.json({ success: true, message: '材料已删除' });
});

// ===== 订单管理 API =====
app.get('/api/orders', (req, res) => {
  res.json({ success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0 } } });
});

app.post('/api/orders', (req, res) => {
  res.json({ success: true, message: '订单已创建', data: { _id: 'ord-' + Date.now(), ...req.body } });
});

app.get('/api/orders/:id', (req, res) => {
  res.json({ success: true, data: { _id: req.params.id, status: 'pending' } });
});

// ===== Dashboard 数据 API =====
app.get('/api/dashboard/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalOrders: 12,
      completedOrders: 8,
      pendingOrders: 4,
      deviceUtilization: 75
    }
  });
});

// 设备利用率
app.get('/api/dashboard/devices/utilization', (req, res) => {
  res.json({
    success: true,
    data: {
      devices: [
        { id: 'device-001', name: '3D打印机 A', utilization: 75, status: 'idle' },
        { id: 'device-002', name: '3D打印机 B', utilization: 90, status: 'printing' },
        { id: 'device-003', name: '3D打印机 C', utilization: 0, status: 'idle' }
      ]
    }
  });
});

// 设备时间线（甘特图数据）
app.get('/api/dashboard/devices/timeline', (req, res) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  res.json({
    success: true,
    data: {
      timeline: [
        {
          deviceId: 'device-001',
          deviceName: '3D打印机 A',
          events: [
            { start: today + 'T08:00:00', end: today + 'T12:00:00', status: 'printing', order: 'ORD-001' },
            { start: today + 'T13:00:00', end: today + 'T17:00:00', status: 'printing', order: 'ORD-002' }
          ]
        },
        {
          deviceId: 'device-002',
          deviceName: '3D打印机 B',
          events: [
            { start: today + 'T09:00:00', end: today + 'T15:00:00', status: 'printing', order: 'ORD-003' }
          ]
        },
        {
          deviceId: 'device-003',
          deviceName: '3D打印机 C',
          events: []
        }
      ]
    }
  });
});

// 库存预测
app.get('/api/dashboard/inventory/prediction', (req, res) => {
  res.json({
    success: true,
    data: {
      predictions: [
        { materialId: 'mat-001', name: 'PLA 白色', current: 500, predicted: 350, unit: 'g', daysUntilReorder: 14 },
        { materialId: 'mat-002', name: 'PLA 黑色', current: 300, predicted: 100, unit: 'g', daysUntilReorder: 7, warning: true },
        { materialId: 'mat-003', name: 'PLA 红色', current: 200, predicted: 50, unit: 'g', daysUntilReorder: 5, critical: true }
      ],
      summary: {
        totalMaterials: 3,
        needsReorder: 2,
        criticalCount: 1
      }
    }
  });
});

// 404 处理（必须在所有路由之后）
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