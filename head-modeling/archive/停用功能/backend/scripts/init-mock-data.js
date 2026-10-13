/**
 * 初始化 Mock 数据脚本
 * 用于在 Mock 模式下创建测试数据，让前端页面可以显示内容
 */

const mongoose = require('../src/db/mongoose');
const Device = require('../src/models/Device');
const Material = require('../src/models/Material');
const Order = require('../src/models/Order');
const AgentDecision = require('../src/models/AgentDecision');

async function initializeMockData() {
  console.log('🚀 开始初始化 Mock 数据...\n');

  try {
    // 连接数据库
    await mongoose.connect('mongodb://localhost:27017/3d-printing-system');
    console.log('✅ 数据库连接成功\n');

    // 1. 创建测试设备
    console.log('📦 创建设备数据...');
    const devices = await Device.insertMany([
      {
        deviceId: 'PRINTER-001',
        type: 'sla',
        status: 'idle',
        capacity: {
          maxVolume: 100,
          currentLoad: 0
        },
        specifications: {
          buildVolume: { x: 200, y: 200, z: 250 },
          supportedMaterials: ['resin']
        },
        location: '车间 A 区 -01'
      },
      {
        deviceId: 'PRINTER-002',
        type: 'fdm',
        status: 'busy',
        capacity: {
          maxVolume: 100,
          currentLoad: 75
        },
        specifications: {
          buildVolume: { x: 300, y: 300, z: 400 },
          supportedMaterials: ['pla', 'abs', 'petg']
        },
        location: '车间 A 区 -02'
      },
      {
        deviceId: 'PRINTER-003',
        type: 'sls',
        status: 'idle',
        capacity: {
          maxVolume: 100,
          currentLoad: 0
        },
        specifications: {
          buildVolume: { x: 350, y: 350, z: 450 },
          supportedMaterials: ['powder']
        },
        location: '车间 B 区 -01'
      },
      {
        deviceId: 'PRINTER-004',
        type: 'mjf',
        status: 'maintenance',
        capacity: {
          maxVolume: 100,
          currentLoad: 0
        },
        specifications: {
          buildVolume: { x: 380, y: 284, z: 380 },
          supportedMaterials: ['powder']
        },
        location: '车间 B 区 -02'
      }
    ]);
    console.log(`✅ 成功创建 ${devices.length} 台设备\n`);

    // 2. 创建测试材料
    console.log('📦 创建材料数据...');
    const materials = await Material.insertMany([
      {
        name: '透明光敏树脂',
        type: 'resin',
        color: '透明',
        supplier: '供应商 A',
        specifications: {
          density: 1.1,
          tensileStrength: 60,
          shelfLife: 12
        },
        stock: {
          quantity: 50,
          unit: 'kg',
          lastRestocked: new Date()
        },
        threshold: 20,
        location: '仓库 A-01-01'
      },
      {
        name: '黑色 PLA 线材',
        type: 'filament',
        color: '黑色',
        supplier: '供应商 B',
        specifications: {
          diameter: 1.75,
          density: 1.24,
          printTemp: 200
        },
        stock: {
          quantity: 15,
          unit: 'kg',
          lastRestocked: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        },
        threshold: 20,
        location: '仓库 A-02-01'
      },
      {
        name: '白色 ABS 线材',
        type: 'filament',
        color: '白色',
        supplier: '供应商 B',
        specifications: {
          diameter: 1.75,
          density: 1.04,
          printTemp: 240
        },
        stock: {
          quantity: 100,
          unit: 'kg',
          lastRestocked: new Date()
        },
        threshold: 30,
        location: '仓库 A-02-02'
      },
      {
        name: '尼龙粉末',
        type: 'powder',
        color: '自然色',
        supplier: '供应商 C',
        specifications: {
          particleSize: 60,
          density: 0.45,
          meltTemp: 180
        },
        stock: {
          quantity: 200,
          unit: 'kg',
          lastRestocked: new Date()
        },
        threshold: 50,
        location: '仓库 B-01-01'
      },
      {
        name: 'PETG 线材 - 红色',
        type: 'filament',
        color: '红色',
        supplier: '供应商 B',
        specifications: {
          diameter: 1.75,
          density: 1.27,
          printTemp: 230
        },
        stock: {
          quantity: 8,
          unit: 'kg',
          lastRestocked: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        },
        threshold: 15,
        location: '仓库 A-02-03'
      }
    ]);
    console.log(`✅ 成功创建 ${materials.length} 种材料\n`);

    // 3. 创建测试订单
    console.log('📦 创建订单数据...');
    const orders = await Order.insertMany([
      {
        orderId: 'ORD-2026-001',
        customer: {
          name: '张三',
          email: 'zhangsan@example.com',
          phone: '13800138001'
        },
        status: 'completed',
        model: {
          name: '手机支架',
          fileUrl: '/models/phone-stand.stl',
          volume: 45.5,
          dimensions: { x: 80, y: 70, z: 100 },
          material: '黑色 PLA 线材'
        },
        device: devices[1]._id,
        agentDecisions: [],
        estimatedCompletion: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        actualCompletion: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      },
      {
        orderId: 'ORD-2026-002',
        customer: {
          name: '李四',
          email: 'lisi@example.com',
          phone: '13800138002'
        },
        status: 'processing',
        model: {
          name: '花瓶',
          fileUrl: '/models/vase.stl',
          volume: 120.3,
          dimensions: { x: 100, y: 100, z: 200 },
          material: '透明光敏树脂'
        },
        device: devices[0]._id,
        agentDecisions: [],
        estimatedCompletion: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      },
      {
        orderId: 'ORD-2026-003',
        customer: {
          name: '王五',
          email: 'wangwu@example.com',
          phone: '13800138003'
        },
        status: 'pending',
        model: {
          name: '齿轮组',
          fileUrl: '/models/gears.stl',
          volume: 85.7,
          dimensions: { x: 150, y: 150, z: 50 },
          material: '尼龙粉末'
        },
        device: null,
        agentDecisions: [],
        estimatedCompletion: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      },
      {
        orderId: 'ORD-2026-004',
        customer: {
          name: '赵六',
          email: 'zhaoliu@example.com',
          phone: '13800138004'
        },
        status: 'pending',
        model: {
          name: '机械臂零件',
          fileUrl: '/models/robot-arm.stl',
          volume: 230.5,
          dimensions: { x: 300, y: 100, z: 150 },
          material: '白色 ABS 线材'
        },
        device: null,
        agentDecisions: [],
        estimatedCompletion: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    ]);
    console.log(`✅ 成功创建 ${orders.length} 个订单\n`);

    // 4. 创建 Agent 决策记录
    console.log('📦 创建 Agent 决策数据...');
    const decisions = await AgentDecision.insertMany([
      {
        orderId: orders[0]._id,
        agentId: 'coordinator_agent',
        decisionType: 'device_selection',
        decisionResult: 'auto_approve',
        confidence: 0.95,
        inputSnapshot: {
          orderId: 'ORD-2026-001',
          priority: 'normal',
          materialAvailable: true
        },
        rationale: '订单参数正常，材料充足，自动审核通过',
        alternatives: [
          { option: 'manual_review', score: 0.3, reason: '订单金额较小，无需人工审核' }
        ],
        impact: {
          estimatedTime: 48,
          estimatedCost: 150,
          qualityScore: 0.9
        }
      },
      {
        orderId: orders[0]._id,
        agentId: 'scheduler_agent',
        decisionType: 'scheduling',
        decisionResult: 'assign_to_device',
        confidence: 0.88,
        inputSnapshot: {
          orderId: 'ORD-2026-001',
          availableDevices: ['PRINTER-001', 'PRINTER-002'],
          urgency: 'normal'
        },
        rationale: 'PRINTER-002 当前负载适中，优先分配',
        alternatives: [
          { option: 'assign_to_printer_001', score: 0.7, reason: '设备空闲但材料不匹配' }
        ],
        impact: {
          estimatedTime: 36,
          estimatedCost: 0,
          qualityScore: 0.85
        }
      },
      {
        orderId: orders[1]._id,
        agentId: 'coordinator_agent',
        decisionType: 'device_selection',
        decisionResult: 'auto_approve',
        confidence: 0.92,
        inputSnapshot: {
          orderId: 'ORD-2026-002',
          priority: 'normal',
          materialAvailable: true
        },
        rationale: '订单审核通过，树脂材料充足',
        alternatives: [],
        impact: {
          estimatedTime: 72,
          estimatedCost: 280,
          qualityScore: 0.88
        }
      },
      {
        orderId: orders[2]._id,
        agentId: 'inventory_agent',
        decisionType: 'quality_check',
        decisionResult: 'material_insufficient',
        confidence: 0.75,
        inputSnapshot: {
          orderId: 'ORD-2026-003',
          requiredMaterial: '尼龙粉末',
          availableStock: 200
        },
        rationale: '材料充足，但建议检查库存预警',
        alternatives: [],
        impact: {
          estimatedTime: 0,
          estimatedCost: 0,
          qualityScore: 0.7
        }
      }
    ]);
    console.log(`✅ 成功创建 ${decisions.length} 条 Agent 决策\n`);

    console.log('===========================================');
    console.log('✅ Mock 数据初始化完成！');
    console.log('===========================================');
    console.log('\n数据总览:');
    console.log(`  - 设备：${devices.length} 台`);
    console.log(`  - 材料：${materials.length} 种`);
    console.log(`  - 订单：${orders.length} 个`);
    console.log(`  - Agent 决策：${decisions.length} 条`);
    console.log('\n现在可以访问前端页面查看数据了！');
    console.log('===========================================\n');

  } catch (error) {
    console.error('❌ 初始化失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// 运行初始化
initializeMockData();
