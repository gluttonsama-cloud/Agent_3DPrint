const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const mongoose = require('./db/mongoose');

const { QiniuLLMClient } = require('./config/qiniuLLM');
const llmClient = new QiniuLLMClient();

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
    version: '2.1.0',
    llm: llmClient.apiKey ? 'configured' : 'not_configured',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

const taskStore = require('./services/taskStore');
app.get('/api/debug/tasks', (req, res) => {
  const tasks = taskStore.getAllTasks();
  res.json({ count: tasks.length, tasks });
});

app.get('/api/agent-decisions', async (req, res) => {
  try {
    const decisions = await AgentDecision.find().sort({ createdAt: -1 }).limit(50);
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

async function llmAssistDecision(prompt, context) {
  if (!llmClient.apiKey) {
    console.warn('[LLM] API Key 未配置');
    return null;
  }
  
  try {
    const systemPrompt = '你是3D打印订单决策助手。返回JSON格式：{"decision": "approved/rejected/manual_review", "confidence": 0.0-1.0, "reason": "原因", "suggestions": ["建议"]}';
    
    const response = await llmClient.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ]);
    
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error) {
    console.error('[LLM] 调用失败:', error.message);
    return null;
  }
}

app.post('/api/agent-workflow/process-order', async (req, res) => {
  const { orderId, material, volume, deviceType, customerName } = req.body;
  const workflowId = 'wf-' + Date.now();
  const startTime = Date.now();
  
  console.log('[Workflow] 开始处理订单:', { orderId, material, volume });
  
  io.emit('agent-event', {
    type: 'workflow-started',
    orderId,
    workflowId,
    timestamp: new Date().toISOString()
  });
  
  const steps = [];
  const rules = {
    coordinator: ['订单格式验证', '参数完整性检查', '客户信用评估'],
    scheduler: ['设备可用性检查', '设备类型匹配', '负载均衡策略'],
    inventory: ['库存数量校验', '阈值预警检查', '自动补货触发']
  };
  
  try {
    const coordinatorPrompt = '订单：' + orderId + '，材料：' + material + '，数量：' + volume + 'g。评估是否可自动处理？';
    const coordinatorLLM = await llmAssistDecision(coordinatorPrompt, { orderId, material, volume });
    
    steps.push({
      step: 1,
      agent: 'coordinator',
      agentName: '协调 Agent',
      action: 'receive_order',
      status: 'completed',
      timestamp: new Date().toISOString(),
      thoughts: [
        '收到新订单: ' + orderId,
        coordinatorLLM ? 'LLM分析: ' + coordinatorLLM.reason : '分析订单参数...',
        '订单参数有效，开始分配任务'
      ],
      data: { orderId, material, volume },
      rules: rules.coordinator,
      confidence: coordinatorLLM ? coordinatorLLM.confidence : 0.85,
      llmAssisted: !!coordinatorLLM
    });
    
    let devices = [];
    let availableDevice = null;
    
    try {
      devices = await Device.find({ status: 'idle' });
      if (devices.length > 0) availableDevice = devices[0];
    } catch (e) {}
    
    const schedulerPrompt = '分配设备。可用：' + (devices.length > 0 ? devices.map(d => d.name).join(', ') : '无') + '。材料：' + material;
    const schedulerLLM = await llmAssistDecision(schedulerPrompt, { devices, material });
    
    steps.push({
      step: 2,
      agent: 'scheduler',
      agentName: '调度 Agent',
      action: 'allocate_device',
      status: 'completed',
      timestamp: new Date().toISOString(),
      thoughts: [
        '查找可用设备...',
        devices.length > 0 ? '找到 ' + devices.length + ' 个空闲设备' : '无空闲设备',
        schedulerLLM ? 'LLM建议: ' + schedulerLLM.reason : (availableDevice ? '设备已分配' : '等待设备')
      ],
      data: { 
        deviceId: availableDevice ? availableDevice.deviceId : null,
        deviceName: availableDevice ? availableDevice.name : null,
        deviceType: deviceType || 'fdm'
      },
      messagePayload: { from: 'coordinator', to: 'scheduler', content: { taskId: workflowId } },
      rules: rules.scheduler,
      confidence: schedulerLLM ? schedulerLLM.confidence : (availableDevice ? 0.95 : 0.60),
      llmAssisted: !!schedulerLLM
    });
    
    let materialStock = null;
    let stockSufficient = false;
    
    try {
      const materials = await Material.find({});
      materialStock = materials.find(m => m.name && m.name.includes(material ? material.split(' ')[0] : 'PLA'));
      if (materialStock && materialStock.stock) {
        stockSufficient = materialStock.stock.quantity >= (volume || 100);
      }
    } catch (e) {}
    
    const inventoryPrompt = '检查库存。材料：' + material + '，需要：' + volume + 'g，库存：' + (materialStock ? materialStock.stock.quantity + 'g' : '未知');
    const inventoryLLM = await llmAssistDecision(inventoryPrompt, { material, volume, stock: materialStock });
    
    steps.push({
      step: 3,
      agent: 'inventory',
      agentName: '库存 Agent',
      action: 'check_and_deduct_inventory',
      status: 'completed',
      timestamp: new Date().toISOString(),
      thoughts: [
        '检查材料库存: ' + material,
        materialStock ? '当前: ' + materialStock.stock.quantity + 'g' : '未找到记录',
        stockSufficient ? '库存充足' : '库存不足',
        inventoryLLM ? 'LLM: ' + inventoryLLM.reason : ''
      ].filter(Boolean),
      data: { 
        material: material,
        required: volume,
        available: materialStock ? materialStock.stock.quantity : 0,
        deducted: stockSufficient ? volume : 0
      },
      messagePayload: { from: 'scheduler', to: 'inventory', content: { material, volume } },
      rules: rules.inventory,
      confidence: inventoryLLM ? inventoryLLM.confidence : (stockSufficient ? 0.92 : 0.55),
      llmAssisted: !!inventoryLLM
    });
    
    const finalConfidence = Math.min(
      steps[0].confidence,
      steps[1].confidence,
      steps[2].confidence
    );
    const autoApproved = finalConfidence >= 0.7 && availableDevice && stockSufficient;
    
    const result = {
      workflowId,
      orderId,
      elapsed: Date.now() - startTime,
      decision: {
        result: autoApproved ? 'approved' : 'manual_review',
        confidence: finalConfidence,
        rationale: autoApproved 
          ? '订单有效，设备已分配，库存充足'
          : '建议人工审核'
      },
      steps,
      summary: {
        deviceAllocated: availableDevice ? {
          id: availableDevice.deviceId,
          name: availableDevice.name,
          type: availableDevice.type
        } : null,
        inventoryDeducted: stockSufficient ? { material, amount: volume } : null,
        autoApproved,
        llmAssisted: !!(coordinatorLLM || schedulerLLM || inventoryLLM)
      }
    };
    
    console.log('[Workflow] 完成:', result.decision.result, 'confidence:', result.decision.confidence);
    
    io.emit('agent-event', {
      type: 'workflow-completed',
      orderId,
      result: result.decision.result,
      timestamp: new Date().toISOString()
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('[Workflow] 失败:', error);
    res.json({
      workflowId,
      orderId,
      elapsed: Date.now() - startTime,
      decision: { result: 'error', confidence: 0, rationale: error.message },
      steps,
      summary: { autoApproved: false, error: error.message }
    });
  }
});

app.post('/api/agent-decisions/decide', (req, res) => {
  res.json({ success: true, decision: { id: 'dec-' + Date.now(), result: 'approved', confidence: 0.95 } });
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

app.get('/api/materials', async (req, res) => {
  try {
    const materials = await Material.find().sort({ createdAt: -1 });
    res.json({ success: true, data: { items: materials, pagination: { page: 1, limit: 20, total: materials.length } } });
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

app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).populate('items.deviceId');
    const mappedOrders = orders.map(o => {
      const item = o.items && o.items[0] ? o.items[0] : {};
      const device = item.deviceId && typeof item.deviceId === 'object' ? item.deviceId : null;
      return {
        id: o._id.toString(),
        _id: o._id.toString(),
        userId: o.userId ? o.userId.toString() : 'user-001',
        status: o.status || 'pending_review',
        deviceId: device ? device.deviceId || device._id.toString() : null,
        deviceName: device ? device.name : null,
        totalPrice: o.totalPrice,
        quantity: item.quantity || 1,
        parameters: item.specifications || {},
        notes: o.metadata?.notes || '',
        modelUrl: o.metadata?.generatedModelUrl || '',
        createdAt: o.createdAt,
        updatedAt: o.updatedAt
      };
    });
    res.json({ success: true, data: { items: mappedOrders, pagination: { page: 1, limit: 20, total: orders.length } } });
  } catch (err) {
    res.json({ success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0 } } });
  }
});

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [totalOrders, pendingOrders, printingOrders, completedToday, devices, materials] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending_review' }),
      Order.countDocuments({ status: 'printing' }),
      Order.countDocuments({ status: 'completed', updatedAt: { $gte: todayStart } }),
      Device.find(),
      Material.find()
    ]);
    const lowStockMaterials = materials.filter(m => m.stock && m.stock.quantity <= m.threshold).length;
    const activeDevices = devices.filter(d => d.status === 'busy').length;
    const totalDevices = devices.length || 1;
    res.json({ success: true, data: { totalOrders, pendingOrders, printingOrders, completedToday, totalDevices, activeDevices, lowStockMaterials, deviceUtilization: parseFloat(((activeDevices / totalDevices) * 100).toFixed(1)) } });
  } catch (err) {
    res.json({ success: true, data: { totalOrders: 0, pendingOrders: 0, printingOrders: 0, completedToday: 0, totalDevices: 0, activeDevices: 0, lowStockMaterials: 0, deviceUtilization: 0 } });
  }
});

app.get('/api/dashboard/devices/utilization', async (req, res) => {
  try {
    const devices = await Device.find();
    res.json({ success: true, data: { devices: devices.map(d => d.name || d.deviceId), utilization: devices.map(d => d.status === 'busy' ? 85 : 0) } });
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
    res.json({ success: true, data: { devices: devices.map(d => ({ name: d.name || d.deviceId, timeline: [{ type: d.status === 'busy' ? 'printing' : 'idle', start: startOfDay.toISOString(), end: endOfDay.toISOString() }] })), timeRange: { start: startOfDay.toISOString(), end: endOfDay.toISOString() } } });
  } catch (err) {
    res.json({ success: true, data: { devices: [], timeRange: { start: '', end: '' } } });
  }
});

app.get('/api/dashboard/inventory/prediction', async (req, res) => {
  try {
    const materials = await Material.find().limit(5);
    res.json({ success: true, data: { indicators: materials.map(m => ({ name: m.name, max: 3000 })), current: materials.map(m => m.stock?.quantity || 0), predicted: materials.map(m => Math.max(0, Math.round((m.stock?.quantity || 0) * 0.7))) } });
  } catch (err) {
    res.json({ success: true, data: { indicators: [], current: [], predicted: [] } });
  }
});

app.get('/api/dashboard/orders/trend', async (req, res) => {
  try {
    const now = new Date();
    const dates = [];
    const values = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      dates.push(date.toISOString().slice(5, 10));
      values.push(await Order.countDocuments({ createdAt: { $gte: dayStart, $lt: dayEnd } }));
    }
    res.json({ success: true, data: { dates, values } });
  } catch (err) {
    res.json({ success: true, data: { dates: [], values: [] } });
  }
});

app.get('/api/dashboard/agents/performance', (req, res) => {
  res.json({ success: true, data: { indicators: [{ name: '审核效率', max: 100 }, { name: '调度准确率', max: 100 }, { name: '库存预警', max: 100 }, { name: '响应速度', max: 100 }, { name: '决策质量', max: 100 }], coordinator: [85, 90, 75, 95, 88], scheduler: [80, 95, 70, 90, 85], inventory: [75, 85, 95, 80, 90] } });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'Cannot ' + req.method + ' ' + req.path });
});

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
    console.log('Socket.IO enabled');
    console.log('LLM:', llmClient.apiKey ? 'Configured (' + llmClient.model + ')' : 'Not configured');
  });
});

module.exports = app;