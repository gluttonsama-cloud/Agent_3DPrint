/**
 * 调度 Agent 测试脚本
 * 
 * 测试 SchedulerAgent 的各项功能
 * 包括设备分配算法、调度规则、API 端点等
 */

const mongoose = require('mongoose');
const { SchedulerAgent } = require('../src/agents/SchedulerAgent');
const { AllocationStrategy } = require('../src/agents/algorithms/DeviceAllocationAlgorithm');
const Device = require('../src/models/Device');
const Order = require('../src/models/Order');

// 测试配置
const TEST_CONFIG = {
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/scheduler-test',
  timeout: 30000
};

// 测试统计
const testStats = {
  total: 0,
  passed: 0,
  failed: 0,
  results: []
};

/**
 * 测试断言
 */
function assert(condition, message) {
  testStats.total++;
  
  if (condition) {
    testStats.passed++;
    console.log(`  ✓ ${message}`);
    testStats.results.push({ name: message, passed: true });
  } else {
    testStats.failed++;
    console.error(`  ✗ ${message}`);
    testStats.results.push({ name: message, passed: false });
    throw new Error(`断言失败：${message}`);
  }
}

/**
 * 测试组
 */
const tests = {
  /**
   * 测试调度 Agent 初始化
   */
  async testSchedulerAgentInitialization() {
    console.log('\n[测试组 1] 调度 Agent 初始化');
    
    const scheduler = new SchedulerAgent({
      id: 'test_scheduler',
      name: '测试调度 Agent',
      enableRules: true,
      enableLogging: false
    });
    
    assert(scheduler !== null, 'SchedulerAgent 实例已创建');
    assert(scheduler.id === 'test_scheduler', 'Agent ID 正确');
    assert(scheduler.name === '测试调度 Agent', 'Agent 名称正确');
    
    await scheduler.initialize();
    
    assert(scheduler.allocationAlgorithm !== null, '分配算法已初始化');
    assert(scheduler.ruleManager !== null, '规则管理器已初始化');
    
    await scheduler.shutdown();
    
    console.log('[测试组 1] 完成\n');
  },
  
  /**
   * 测试设备分配算法
   */
  async testDeviceAllocationAlgorithm() {
    console.log('[测试组 2] 设备分配算法');
    
    const scheduler = new SchedulerAgent({ enableLogging: false });
    await scheduler.initialize();
    
    // 创建测试订单
    const testOrder = {
      _id: new mongoose.Types.ObjectId(),
      deviceType: 'sla',
      material: 'resin_standard',
      metadata: {
        estimatedPrintTime: 60,
        orderType: 'high_detail'
      }
    };
    
    // 创建测试设备
    const testDevices = [
      {
        deviceId: 'SLA-001',
        type: 'sla',
        status: 'idle',
        capacity: { currentLoad: 30, maxLoad: 100 },
        specifications: {
          resolution: '0.05mm',
          supportedMaterials: ['resin_standard', 'resin_tough']
        },
        location: '车间 A'
      },
      {
        deviceId: 'SLA-002',
        type: 'sla',
        status: 'idle',
        capacity: { currentLoad: 60, maxLoad: 100 },
        specifications: {
          resolution: '0.1mm',
          supportedMaterials: ['resin_standard']
        },
        location: '车间 B'
      }
    ];
    
    // 测试设备筛选
    const compatible = scheduler.allocationAlgorithm.filterCompatibleDevices(
      testDevices,
      testOrder
    );
    
    assert(compatible.length === 2, '筛选出 2 台兼容设备');
    
    // 测试设备评分
    const scored = await scheduler.allocationAlgorithm.scoreDevices(
      compatible,
      testOrder
    );
    
    assert(scored.length === 2, '所有设备都已评分');
    assert(scored[0].totalScore > 0, '设备评分大于 0');
    assert(scored[0].scores.load > 0, '负载评分已计算');
    assert(scored[0].scores.time > 0, '时间评分已计算');
    assert(scored[0].scores.quality > 0, '质量评分已计算');
    assert(scored[0].scores.cost > 0, '成本评分已计算');
    
    // 测试排序
    const sorted = scheduler.allocationAlgorithm.sortByStrategy(
      scored,
      AllocationStrategy.OPTIMAL,
      testOrder
    );
    
    assert(sorted[0].totalScore >= sorted[1].totalScore, '设备按评分降序排序');
    
    await scheduler.shutdown();
    
    console.log('[测试组 2] 完成\n');
  },
  
  /**
   * 测试分配策略
   */
  async testAllocationStrategies() {
    console.log('[测试组 3] 分配策略测试');
    
    const scheduler = new SchedulerAgent({ enableLogging: false });
    await scheduler.initialize();
    
    const testOrder = {
      _id: new mongoose.Types.ObjectId(),
      deviceType: 'sla',
      material: 'resin_standard'
    };
    
    const testDevices = [
      {
        deviceId: 'SLA-FAST',
        type: 'sla',
        status: 'idle',
        capacity: { currentLoad: 50, maxLoad: 100 },
        specifications: { resolution: '0.1mm', supportedMaterials: ['resin_standard'] },
        costPerHour: 150
      },
      {
        deviceId: 'SLA-CHEAP',
        type: 'sla',
        status: 'idle',
        capacity: { currentLoad: 40, maxLoad: 100 },
        specifications: { resolution: '0.1mm', supportedMaterials: ['resin_standard'] },
        costPerHour: 80
      },
      {
        deviceId: 'SLA-QUALITY',
        type: 'sla',
        status: 'idle',
        capacity: { currentLoad: 30, maxLoad: 100 },
        specifications: { resolution: '0.05mm', supportedMaterials: ['resin_standard'] },
        costPerHour: 200
      }
    ];
    
    // 测试最快完成策略
    const fastestSorted = scheduler.allocationAlgorithm.sortByStrategy(
      await scheduler.allocationAlgorithm.scoreDevices(testDevices, testOrder),
      AllocationStrategy.FASTEST,
      testOrder
    );
    assert(fastestSorted.length === 3, '最快完成策略排序完成');
    
    // 测试最低成本策略
    const cheapestSorted = scheduler.allocationAlgorithm.sortByStrategy(
      await scheduler.allocationAlgorithm.scoreDevices(testDevices, testOrder),
      AllocationStrategy.LOWEST_COST,
      testOrder
    );
    assert(cheapestSorted.length === 3, '最低成本策略排序完成');
    
    // 测试最优质量策略
    const qualitySorted = scheduler.allocationAlgorithm.sortByStrategy(
      await scheduler.allocationAlgorithm.scoreDevices(testDevices, testOrder),
      AllocationStrategy.BEST_QUALITY,
      testOrder
    );
    assert(qualitySorted.length === 3, '最优质量策略排序完成');
    
    // 测试负载均衡策略
    const loadSorted = scheduler.allocationAlgorithm.sortByStrategy(
      await scheduler.allocationAlgorithm.scoreDevices(testDevices, testOrder),
      AllocationStrategy.BALANCED_LOAD,
      testOrder
    );
    assert(loadSorted.length === 3, '负载均衡策略排序完成');
    
    await scheduler.shutdown();
    
    console.log('[测试组 3] 完成\n');
  },
  
  /**
   * 测试调度规则
   */
  async testSchedulingRules() {
    console.log('[测试组 4] 调度规则测试');
    
    const scheduler = new SchedulerAgent({
      enableRules: true,
      enableLogging: false
    });
    await scheduler.initialize();
    
    assert(scheduler.ruleManager.getRules().length > 0, '规则已注册');
    
    const rules = scheduler.ruleManager.getRules();
    const ruleIds = rules.map(r => r.id);
    
    assert(ruleIds.includes('urgent_order'), '紧急订单规则已注册');
    assert(ruleIds.includes('maintenance'), '设备维护规则已注册');
    assert(ruleIds.includes('material_batching'), '材料批量规则已注册');
    assert(ruleIds.includes('load_balancing'), '负载均衡规则已注册');
    assert(ruleIds.includes('device_type_preference'), '设备类型偏好规则已注册');
    
    // 测试规则应用
    const testOrder = {
      _id: new mongoose.Types.ObjectId(),
      deviceType: 'sla',
      material: 'resin_standard',
      priority: 1, // 紧急订单
      expedited: true
    };
    
    const testDevices = [
      {
        _id: new mongoose.Types.ObjectId(),
        deviceId: 'SLA-001',
        type: 'sla',
        status: 'idle',
        capacity: { currentLoad: 30, maxLoad: 100 }
      }
    ];
    
    const ruleResult = await scheduler.ruleManager.applyAllRules({
      order: testOrder,
      devices: testDevices
    });
    
    assert(ruleResult.appliedRules.length > 0, '规则已成功应用');
    
    await scheduler.shutdown();
    
    console.log('[测试组 4] 完成\n');
  },
  
  /**
   * 测试负载计算工具
   */
  async testLoadCalculator() {
    console.log('[测试组 5] 负载计算工具测试');
    
    const loadCalculator = require('../src/utils/loadCalculator');
    
    // 测试负载评分
    const device1 = { capacity: { currentLoad: 30, maxLoad: 100 } };
    const loadScore = loadCalculator.calculateLoadScore(device1);
    assert(Math.abs(loadScore - 0.7) < 0.01, `负载评分正确 (${loadScore})`);
    
    // 测试时间评分
    const timeScore = loadCalculator.calculateTimeScore(60, 480);
    assert(Math.abs(timeScore - 0.875) < 0.01, `时间评分正确 (${timeScore})`);
    
    // 测试质量评分
    const device2 = { specifications: { resolution: '0.05mm' } };
    const qualityScore = loadCalculator.calculateQualityScore(device2);
    assert(qualityScore > 0.9, `质量评分正确 (${qualityScore})`);
    
    // 测试成本评分
    const costScore = loadCalculator.calculateCostScore(100, 500);
    assert(Math.abs(costScore - 0.8) < 0.01, `成本评分正确 (${costScore})`);
    
    // 测试综合评分
    const order = { metadata: { estimatedPrintTime: 60 } };
    const deviceScore = loadCalculator.calculateDeviceScore(device1, order);
    assert(deviceScore.totalScore > 0, '综合评分已计算');
    assert(deviceScore.scores.load !== undefined, '包含负载评分');
    assert(deviceScore.scores.time !== undefined, '包含时间评分');
    assert(deviceScore.scores.quality !== undefined, '包含质量评分');
    assert(deviceScore.scores.cost !== undefined, '包含成本评分');
    
    console.log('[测试组 5] 完成\n');
  },
  
  /**
   * 测试统计功能
   */
  async testStatistics() {
    console.log('[测试组 6] 统计功能测试');
    
    const scheduler = new SchedulerAgent({ enableLogging: false });
    await scheduler.initialize();
    
    const stats = scheduler.getStats();
    
    assert(stats.id === 'scheduler_agent', 'Agent ID 正确');
    assert(stats.schedulingTasks !== undefined, '包含任务统计');
    assert(stats.allocationAlgorithm !== undefined, '包含算法配置');
    assert(stats.rules !== undefined, '包含规则配置');
    assert(typeof stats.rules.count === 'number', '规则数量正确');
    
    await scheduler.shutdown();
    
    console.log('[测试组 6] 完成\n');
  }
};

/**
 * 运行所有测试
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('调度 Agent 测试套件');
  console.log('='.repeat(60));
  
  try {
    // 连接测试数据库
    console.log('\n正在连接测试数据库...');
    await mongoose.connect(TEST_CONFIG.mongodbUri);
    console.log('数据库连接成功\n');
    
    // 运行测试
    await tests.testSchedulerAgentInitialization();
    await tests.testDeviceAllocationAlgorithm();
    await tests.testAllocationStrategies();
    await tests.testSchedulingRules();
    await tests.testLoadCalculator();
    await tests.testStatistics();
    
    // 打印统计
    console.log('='.repeat(60));
    console.log('测试统计');
    console.log('='.repeat(60));
    console.log(`总测试数：${testStats.total}`);
    console.log(`通过：${testStats.passed}`);
    console.log(`失败：${testStats.failed}`);
    console.log(`通过率：${((testStats.passed / testStats.total) * 100).toFixed(2)}%`);
    
    if (testStats.failed > 0) {
      console.log('\n失败的测试:');
      testStats.results
        .filter(r => !r.passed)
        .forEach(r => console.log(`  - ${r.name}`));
    }
    
    console.log('='.repeat(60));
    
    // 退出
    await mongoose.disconnect();
    process.exit(testStats.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n测试执行失败:', error.message);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// 运行测试
runTests();
