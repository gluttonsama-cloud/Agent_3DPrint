const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const mongoose = require('./db/mongoose');

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

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/3d-head-modeling';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB 连接成功');
  } catch (err) {
    console.error('❌ MongoDB 连接失败:', err.message);
    console.log('⚠️ 使用模拟数据模式运行');
  }
};

const Device = require('./models/Device');
const Material = require('./models/Material');
const Order = require('./models/Order');
const AgentDecision = require('./models/AgentDecision');

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    version: '2.0.0',
    api: 'hunyuan-qiniu',
    socket: 'enabled',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

const taskStore = require('./services/taskStore');
app.get('/api/debug/tasks', (req, res) => {
  const tasks = taskStore.getAllTasks();
  res.json({ count: tasks.length, tasks });
});

// Agent API
app.get('/api/agent-decisions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const decisions = await AgentDecision.find().sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, data: decisions });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

app.get('/api/agents/:agentId/status', (req, res) => {
  res.json({
    success: true,
    data: { agentId: req.params.agentId, state: 'idle', name: req.params.agentId + ' Agent' }
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

// 设备管理 API - 使用真实数据
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await Device.find().sort({ createdAt: -1 });
    res.json({ success: true, data: devices });
  } catch (err) {
    res.json({ success: true, data: [] });
  }
});

app.post('/api/devices', async (req, res) => {
  try {
    const device = new Device(req.body);
    await device.save();
    res.json({ success: true, message: '设备已添加', data: device });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/devices/:id', async (req, res) => {
  try {
    const device = await Device.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, message: '设备已更新', data: device });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/devices/:id', async (req, res) => {
  try {
    await Device.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '设备已删除' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 材料管理 API - 使用真实数据
app.get('/api/materials', async (req, res) => {
  try {
    const materials = await Material.find().sort({ createdAt: -1 });
    res.json({ 
      success: true, 
      data: { 
        items: materials, 
        pagination: { page: 1, limit: 20, total: materials.length } 
      } 
    });
  } catch (err) {
    res.json({ success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0 } } });
  }
});

app.post('/api/materials', async (req, res) => {
  try {
    const material = new Material(req.body);
    await material.save();
    res.json({ success: true, message: '材料已添加', data: material });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.patch('/api/materials/:id/stock', async (req, res) => {
  try {
    const material = await Material.findById(req.params.id);
    if (material) {
      material.stock.quantity += req.body.quantityChange || 0;
      await material.save();
      res.json({ success: true, message: '库存已更新', data: material });
    } else {
      res.status(404).json({ success: false, error: '材料不存在' });
    }
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/materials/:id', async (req, res) => {
  try {
    const material = await Material.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, message: '材料已更新', data: material });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/materials/:id', async (req, res) => {
  try {
    await Material.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '材料已删除' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 订单管理 API - 使用真实数据
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ 
      success: true, 
      data: { 
        items: orders, 
        pagination: { page: 1, limit: 20, total: orders.length } 
      } 
    });
  } catch (err) {
    res.json({ success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0 } } });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    res.json({ success: true, message: '订单已创建', data: order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Dashboard API - 使用真实数据
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const [totalOrders, pendingOrders, printingOrders, completedToday, devices, materials] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'printing' }),
      Order.countDocuments({ status: 'completed', updatedAt: { $gte: todayStart } }),
      Device.find(),
      Material.find()
    ]);
    
    const lowStockMaterials = materials.filter(m => m.stock && m.stock.quantity <= m.threshold).length;
    const activeDevices = devices.filter(d => d.status === 'busy').length;
    const totalDevices = devices.length || 1;
    
    res.json({
      success: true,
      data: {
        totalOrders,
        pendingOrders,
        printingOrders,
        completedToday,
        totalDevices,
        activeDevices,
        lowStockMaterials,
        deviceUtilization: parseFloat(((activeDevices / totalDevices) * 100).toFixed(1))
      }
    });
  } catch (err) {
    res.json({ success: true, data: { totalOrders: 0, pendingOrders: 0, printingOrders: 0, completedToday: 0, totalDevices: 0, activeDevices: 0, lowStockMaterials: 0, deviceUtilization: 0 } });
  }
});

app.get('/api/dashboard/devices/utilization', async (req, res) => {
  try {
    const devices = await Device.find();
    res.json({
      success: true,
      data: {
        devices: devices.map(d => d.name || d.deviceId),
        utilization: devices.map(d => d.status === 'busy' ? 85 : d.status === 'idle' ? 0 : 50)
      }
    });
  } catch (err) {
    res.json({ success: true, data: { devices: [], utilization: [] } });
  }
});

app.get('/api/dashboard/devices/timeline', async (req, res) => {
  try {
    const devices = await Device.find();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    const timelineDevices = devices.map(d => ({
      name: d.name || d.deviceId,
      timeline: d.currentTask ? [
        { type: 'printing', start: startOfDay.toISOString(), end: endOfDay.toISOString() }
      ] : [
        { type: d.status === 'maintenance' ? 'maintenance' : 'idle', start: startOfDay.toISOString(), end: endOfDay.toISOString() }
      ]
    }));
    
    res.json({
      success: true,
      data: {
        devices: timelineDevices,
        timeRange: { start: startOfDay.toISOString(), end: endOfDay.toISOString() }
      }
    });
  } catch (err) {
    res.json({ success: true, data: { devices: [], timeRange: { start: '', end: '' } } });
  }
});

app.get('/api/dashboard/inventory/prediction', async (req, res) => {
  try {
    const materials = await Material.find().limit(5);
    res.json({
      success: true,
      data: {
        indicators: materials.map(m => ({ name: m.name, max: m.threshold * 2 })),
        current: materials.map(m => m.stock?.quantity || 0),
        predicted: materials.map(m => Math.max(0, (m.stock?.quantity || 0) - m.threshold * 0.3))
      }
    });
  } catch (err) {
    res.json({ success: true, data: { indicators: [], current: [], predicted: [] } });
  }
});

app.get('/api/dashboard/orders/trend', async (req, res) => {
  try {
    const days = 7;
    const now = new Date();
    const dates = [];
    const values = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      dates.push(date.toISOString().slice(5, 10));
      const count = await Order.countDocuments({ createdAt: { $gte: dayStart, $lt: dayEnd } });
      values.push(count);
    }
    
    res.json({ success: true, data: { dates, values } });
  } catch (err) {
    res.json({ success: true, data: { dates: [], values: [] } });
  }
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
  res.status(404).json({ error: 'Not Found', message: 'Cannot ' + req.method + ' ' + req.path });
});

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
    console.log('Socket.IO enabled');
  });
});

module.exports = app;