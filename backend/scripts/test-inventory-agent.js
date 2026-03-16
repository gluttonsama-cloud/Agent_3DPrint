/**
 * 库存 Agent 测试脚本
 * 
 * 测试库存 Agent 的各项功能
 * 运行：node backend/scripts/test-inventory-agent.js
 */

const mongoose = require('mongoose');
const { agentRegistry } = require('../src/agents/registry');
const Material = require('../src/models/Material');
const Order = require('../src/models/Order');

// 测试配置
const CONFIG = {
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/3dprint_test',
  enableLogging: true
};

// 测试结果统计
const testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

/**
 * 日志输出
 */
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = {
    info: 'ℹ',
    success: '✓',
    error: '✗',
    warn: '⚠'
  };
  
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    reset: '\x1b[0m'
  };
  
  console.log(`${colors[type]}[${timestamp}] ${prefix[type]} ${message}${colors.reset}`);
}

/**
 * 断言函数
 */
function assert(condition, message) {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    log(message, 'success');
    return true;
  } else {
    testResults.failed++;
    log(message, 'error');
    throw new Error(`断言失败：${message}`);
  }
}

/**
 * 测试 1: 库存 Agent 初始化
 */
async function testInitialization() {
  log('\n=== 测试 1: 库存 Agent 初始化 ===', 'info');
  
  try {
    const inventoryAgent = await agentRegistry.createInventoryAgent({
      enableNotifications: false,
      enableLogging: CONFIG.enableLogging
    });
    
    assert(inventoryAgent !== null, '库存 Agent 已创建');
    assert(inventoryAgent.id === 'inventory_agent', 'Agent ID 正确');
    assert(inventoryAgent.state === 'ready', 'Agent 状态为就绪');
    
    const tools = inventoryAgent.listTools();
    assert(tools.length === 5, `已注册 5 个工具，实际：${tools.length}`);
    assert(tools.includes('checkInventory'), '包含 checkInventory 工具');
    assert(tools.includes('getForecast'), '包含 getForecast 工具');
    
    log('库存 Agent 初始化测试通过', 'success');
    return inventoryAgent;
  } catch (error) {
    log(`初始化失败：${error.message}`, 'error');
    throw error;
  }
}

/**
 * 测试 2: 创建测试数据
 */
async function testCreateTestData() {
  log('\n=== 测试 2: 创建测试数据 ===', 'info');
  
  try {
    // 清理旧数据
    await Material.deleteMany({ name: { $regex: /^测试材料/ } });
    await Order.deleteMany({ materialName: { $regex: /^测试材料/ } });
    
    // 创建测试材料
    const materials = await Material.create([
      {
        name: '测试材料 - 光敏树脂',
        type: 'resin',
        stock: {
          quantity: 5000,
          unit: 'g'
        },
        threshold: 1000,
        costPerUnit: 0.05,
        properties: {
          color: '白色',
          density: 1.1,
          printTemperature: {
            min: 20,
            max: 30
          }
        },
        supplier: {
          name: '测试供应商',
          contactInfo: 'test@example.com'
        }
      },
      {
        name: '测试材料 - 低库存',
        type: 'resin',
        stock: {
          quantity: 500,
          unit: 'g'
        },
        threshold: 1000,
        costPerUnit: 0.05
      },
      {
        name: '测试材料 - 缺货',
        type: 'filament',
        stock: {
          quantity: 0,
          unit: 'g'
        },
        threshold: 500,
        costPerUnit: 0.03
      }
    ]);
    
    assert(materials.length === 3, `创建了 3 个测试材料，实际：${materials.length}`);
    
    // 创建测试订单（过去 30 天）
    const orders = [];
    const now = new Date();
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      orders.push({
        materialId: materials[0]._id,
        materialType: 'resin',
        materialName: materials[0].name,
        weight: 100 + Math.random() * 50, // 100-150g
        supportRate: 0.3,
        wasteRate: 0.1,
        status: 'completed',
        createdAt: date
      });
    }
    
    await Order.insertMany(orders);
    assert(orders.length === 30, `创建了 30 个测试订单，实际：${orders.length}`);
    
    log('测试数据创建完成', 'success');
    return materials;
  } catch (error) {
    log(`创建测试数据失败：${error.message}`, 'error');
    throw error;
  }
}

/**
 * 测试 3: 库存检查
 */
async function testInventoryCheck(inventoryAgent) {
  log('\n=== 测试 3: 库存检查 ===', 'info');
  
  try {
    // 检查所有材料
    const result = await inventoryAgent.execute({
      type: 'check_inventory'
    });
    
    assert(result.success === true, '库存检查成功');
    assert(result.summary.total >= 3, `检查了至少 3 个材料，实际：${result.summary.total}`);
    assert(result.summary.lowStock >= 1, '检测到至少 1 个低库存材料');
    assert(result.summary.outOfStock >= 1, '检测到至少 1 个缺货材料');
    
    log(`库存检查完成：充足=${result.summary.sufficient}, 低库存=${result.summary.lowStock}, 严重不足=${result.summary.critical}, 缺货=${result.summary.outOfStock}`, 'success');
    
    return result;
  } catch (error) {
    log(`库存检查失败：${error.message}`, 'error');
    throw error;
  }
}

/**
 * 测试 4: 消耗预测
 */
async function testConsumptionForecast(inventoryAgent) {
  log('\n=== 测试 4: 消耗预测 ===', 'info');
  
  try {
    // 测试简单移动平均
    const smaResult = await inventoryAgent.execute({
      type: 'forecast_consumption',
      forecastDays: 7,
      method: 'simple_moving_average'
    });
    
    assert(smaResult.success === true, '简单移动平均预测成功');
    assert(smaResult.forecast.method === 'simple_moving_average', '预测方法正确');
    assert(smaResult.forecast.predictedConsumption > 0, '预测消耗量大于 0');
    
    log(`简单移动平均预测：未来 7 天消耗 ${smaResult.forecast.predictedConsumption.toFixed(2)}g`, 'success');
    
    // 测试加权移动平均
    const wmaResult = await inventoryAgent.execute({
      type: 'forecast_consumption',
      forecastDays: 7,
      method: 'weighted_moving_average'
    });
    
    assert(wmaResult.success === true, '加权移动平均预测成功');
    log(`加权移动平均预测：未来 7 天消耗 ${wmaResult.forecast.predictedConsumption.toFixed(2)}g`, 'success');
    
    // 测试线性回归
    const lrResult = await inventoryAgent.execute({
      type: 'forecast_consumption',
      forecastDays: 7,
      method: 'linear_regression'
    });
    
    assert(lrResult.success === true, '线性回归预测成功');
    log(`线性回归预测：未来 7 天消耗 ${lrResult.forecast.predictedConsumption.toFixed(2)}g, 趋势=${lrResult.forecast.trend}`, 'success');
    
    return { sma: smaResult, wma: wmaResult, lr: lrResult };
  } catch (error) {
    log(`消耗预测失败：${error.message}`, 'error');
    throw error;
  }
}

/**
 * 测试 5: 补货建议
 */
async function testReorderSuggestion(inventoryAgent) {
  log('\n=== 测试 5: 补货建议 ===', 'info');
  
  try {
    const result = await inventoryAgent.execute({
      type: 'reorder_suggestion'
    });
    
    assert(result.success === true, '补货建议生成成功');
    assert(result.totalMaterials >= 3, `分析了至少 3 个材料，实际：${result.totalMaterials}`);
    assert(result.needReorder >= 1, `至少 1 个材料需要补货，实际：${result.needReorder}`);
    
    if (result.suggestions.length > 0) {
      const firstSuggestion = result.suggestions[0];
      log(`补货建议：${firstSuggestion.materialName}, 建议补货量=${firstSuggestion.reorderAmount}${firstSuggestion.unit}, 优先级=${firstSuggestion.priority}`, 'success');
    }
    
    return result;
  } catch (error) {
    log(`补货建议失败：${error.message}`, 'error');
    throw error;
  }
}

/**
 * 测试 6: 低库存材料列表
 */
async function testLowStockMaterials(inventoryAgent) {
  log('\n=== 测试 6: 低库存材料列表 ===', 'info');
  
  try {
    const result = await inventoryAgent.execute({
      type: 'low_stock_check',
      includeCritical: true
    });
    
    assert(result.success === true, '低库存列表获取成功');
    assert(result.count >= 2, `检测到至少 2 个低库存材料，实际：${result.count}`);
    
    if (result.materials.length > 0) {
      const first = result.materials[0];
      log(`最低库存材料：${first.materialName}, 库存=${first.currentStock}${first.unit}, 状态=${first.status}`, 'success');
    }
    
    return result;
  } catch (error) {
    log(`低库存列表获取失败：${error.message}`, 'error');
    throw error;
  }
}

/**
 * 测试 7: Agent 状态
 */
async function testAgentStats(inventoryAgent) {
  log('\n=== 测试 7: Agent 状态 ===', 'info');
  
  try {
    const stats = inventoryAgent.getStats();
    
    assert(stats.id === 'inventory_agent', 'Agent ID 正确');
    assert(stats.state === 'ready', 'Agent 状态为就绪');
    assert(stats.inventoryTasks !== undefined, '包含任务统计');
    
    log(`Agent 状态：${stats.state}, 任务总数=${stats.inventoryTasks.total}, 已完成=${stats.inventoryTasks.completed}`, 'success');
    
    return stats;
  } catch (error) {
    log(`Agent 状态获取失败：${error.message}`, 'error');
    throw error;
  }
}

/**
 * 主测试流程
 */
async function runTests() {
  log('\n========================================', 'info');
  log('   库存 Agent 测试开始', 'info');
  log('========================================\n', 'info');
  
  let inventoryAgent;
  
  try {
    // 连接数据库
    log('连接数据库...', 'info');
    await mongoose.connect(CONFIG.mongoUri);
    log('数据库连接成功', 'success');
    
    // 运行测试
    inventoryAgent = await testInitialization();
    await testCreateTestData();
    await testInventoryCheck(inventoryAgent);
    await testConsumptionForecast(inventoryAgent);
    await testReorderSuggestion(inventoryAgent);
    await testLowStockMaterials(inventoryAgent);
    await testAgentStats(inventoryAgent);
    
    // 输出测试结果
    log('\n========================================', 'info');
    log('   测试结果', 'info');
    log('========================================', 'info');
    log(`总测试数：${testResults.total}`, 'info');
    log(`通过：${testResults.passed}`, 'success');
    log(`失败：${testResults.failed}`, testResults.failed > 0 ? 'error' : 'success');
    log('========================================\n', 'info');
    
    if (testResults.failed === 0) {
      log('🎉 所有测试通过！', 'success');
    } else {
      log(`⚠ ${testResults.failed} 个测试失败`, 'error');
    }
    
  } catch (error) {
    log(`测试执行失败：${error.message}`, 'error');
    console.error(error.stack);
    process.exit(1);
  } finally {
    // 清理
    try {
      if (inventoryAgent) {
        await inventoryAgent.shutdown();
      }
      await mongoose.connection.close();
      log('数据库连接已关闭', 'info');
    } catch (error) {
      log(`清理失败：${error.message}`, 'error');
    }
    
    // 退出进程
    process.exit(testResults.failed > 0 ? 1 : 0);
  }
}

// 运行测试
runTests();
