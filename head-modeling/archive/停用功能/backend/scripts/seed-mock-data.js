/**
 * Mock 数据种子脚本
 * 在服务启动时自动创建测试数据
 */

const Device = require('../src/models/Device');
const Material = require('../src/models/Material');
const Order = require('../src/models/Order');
const AgentDecision = require('../src/models/AgentDecision');

async function seedMockData() {
  try {
    // 检查是否已有数据
    const deviceCount = await Device.countDocuments({});
    if (deviceCount > 0) {
      console.log('[Seed] 数据已存在，跳过初始化');
      return;
    }

    console.log('[Seed] 开始初始化 Mock 数据...');

    // 创建设备
    const devices = await Device.insertMany([
      {
        deviceId: 'PRINTER-001',
        type: 'sla',
        status: 'idle',
        capacity: { maxVolume: 100, currentLoad: 0 },
        specifications: { buildVolume: { x: 200, y: 200, z: 250 }, supportedMaterials: ['resin'] },
        location: '车间 A 区 -01'
      },
      {
        deviceId: 'PRINTER-002',
        type: 'fdm',
        status: 'busy',
        capacity: { maxVolume: 100, currentLoad: 75 },
        specifications: { buildVolume: { x: 300, y: 300, z: 400 }, supportedMaterials: ['pla', 'abs', 'petg'] },
        location: '车间 A 区 -02'
      },
      {
        deviceId: 'PRINTER-003',
        type: 'sls',
        status: 'idle',
        capacity: { maxVolume: 100, currentLoad: 0 },
        specifications: { buildVolume: { x: 350, y: 350, z: 450 }, supportedMaterials: ['powder'] },
        location: '车间 B 区 -01'
      },
      {
        deviceId: 'PRINTER-004',
        type: 'mjf',
        status: 'maintenance',
        capacity: { maxVolume: 100, currentLoad: 0 },
        specifications: { buildVolume: { x: 380, y: 284, z: 380 }, supportedMaterials: ['powder'] },
        location: '车间 B 区 -02'
      }
    ]);

    // 创建材料
    const materials = await Material.insertMany([
      {
        name: '透明光敏树脂',
        type: 'resin',
        color: '透明',
        supplier: '供应商 A',
        stock: { quantity: 50, unit: 'kg', lastRestocked: new Date() },
        threshold: 20,
        location: '仓库 A-01-01'
      },
      {
        name: '黑色 PLA 线材',
        type: 'filament',
        color: '黑色',
        supplier: '供应商 B',
        stock: { quantity: 15, unit: 'kg', lastRestocked: new Date() },
        threshold: 20,
        location: '仓库 A-02-01'
      },
      {
        name: '白色 ABS 线材',
        type: 'filament',
        color: '白色',
        supplier: '供应商 B',
        stock: { quantity: 100, unit: 'kg', lastRestocked: new Date() },
        threshold: 30,
        location: '仓库 A-02-02'
      },
      {
        name: '尼龙粉末',
        type: 'powder',
        color: '自然色',
        supplier: '供应商 C',
        stock: { quantity: 200, unit: 'kg', lastRestocked: new Date() },
        threshold: 50,
        location: '仓库 B-01-01'
      },
      {
        name: 'PETG 线材 - 红色',
        type: 'filament',
        color: '红色',
        supplier: '供应商 B',
        stock: { quantity: 8, unit: 'kg', lastRestocked: new Date() },
        threshold: 15,
        location: '仓库 A-02-03'
      }
    ]);

    // 创建订单
    const orders = await Order.insertMany([
      {
        orderId: 'ORD-2026-001',
        customer: { name: '张三', email: 'zhangsan@example.com', phone: '13800138001' },
        status: 'completed',
        model: { name: '手机支架', volume: 45.5, dimensions: { x: 80, y: 70, z: 100 }, material: '黑色 PLA 线材' },
        device: devices[1]._id,
        estimatedCompletion: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        actualCompletion: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      },
      {
        orderId: 'ORD-2026-002',
        customer: { name: '李四', email: 'lisi@example.com', phone: '13800138002' },
        status: 'processing',
        model: { name: '花瓶', volume: 120.3, dimensions: { x: 100, y: 100, z: 200 }, material: '透明光敏树脂' },
        device: devices[0]._id,
        estimatedCompletion: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      },
      {
        orderId: 'ORD-2026-003',
        customer: { name: '王五', email: 'wangwu@example.com', phone: '13800138003' },
        status: 'pending',
        model: { name: '齿轮组', volume: 85.7, dimensions: { x: 150, y: 150, z: 50 }, material: '尼龙粉末' },
        device: null,
        estimatedCompletion: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      },
      {
        orderId: 'ORD-2026-004',
        customer: { name: '赵六', email: 'zhaoliu@example.com', phone: '13800138004' },
        status: 'pending',
        model: { name: '机械臂零件', volume: 230.5, dimensions: { x: 300, y: 100, z: 150 }, material: '白色 ABS 线材' },
        device: null,
        estimatedCompletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    ]);

    // 创建 Agent 决策
    await AgentDecision.insertMany([
      {
        orderId: orders[0]._id,
        agentId: 'coordinator_agent',
        decisionType: 'device_selection',
        decisionResult: 'auto_approve',
        confidence: 0.95,
        inputSnapshot: { orderId: 'ORD-2026-001', priority: 'normal', materialAvailable: true },
        rationale: '订单参数正常，材料充足，自动审核通过'
      },
      {
        orderId: orders[0]._id,
        agentId: 'scheduler_agent',
        decisionType: 'scheduling',
        decisionResult: 'assign_to_device',
        confidence: 0.88,
        inputSnapshot: { orderId: 'ORD-2026-001', availableDevices: ['PRINTER-001', 'PRINTER-002'], urgency: 'normal' },
        rationale: 'PRINTER-002 当前负载适中，优先分配'
      },
      {
        orderId: orders[1]._id,
        agentId: 'coordinator_agent',
        decisionType: 'device_selection',
        decisionResult: 'auto_approve',
        confidence: 0.92,
        inputSnapshot: { orderId: 'ORD-2026-002', priority: 'normal', materialAvailable: true },
        rationale: '订单审核通过，树脂材料充足'
      },
      {
        orderId: orders[2]._id,
        agentId: 'inventory_agent',
        decisionType: 'quality_check',
        decisionResult: 'material_sufficient',
        confidence: 0.75,
        inputSnapshot: { orderId: 'ORD-2026-003', requiredMaterial: '尼龙粉末', availableStock: 200 },
        rationale: '材料充足，可以开始生产'
      }
    ]);

    console.log(`[Seed] ✅ 初始化完成：${devices.length}设备，${materials.length}材料，${orders.length}订单，4 条决策`);
  } catch (error) {
    console.error('[Seed] 初始化失败:', error.message);
  }
}

module.exports = seedMockData;
