/**
 * Agent 场景测试（Task 27）
 * 
 * 测试边界 case 覆盖：
 * 1. 库存不足时的决策
 * 2. 设备全满时的调度
 * 3. 照片质量差的订单处理
 * 4. 参数异常的边界情况
 */

process.env.QINIU_AI_API_KEY = 'sk-ade295a43028dab39ad35d7fd61956ef5fc7ebf10b7e1c357bd55ce92f79c5e0';
process.env.QINIU_AI_BASE_URL = 'https://api.qnaigc.com/v1';
process.env.QINIU_AI_MODEL = 'deepseek/deepseek-v3.2-251201';
process.env.LLM_TIMEOUT = '15000';
process.env.MOCK_DB = 'true';

const { DecisionEngine } = require('./src/agents/DecisionEngine');

const testResults = {
  passed: 0,
  failed: 0,
  scenarios: []
};

async function testLowStockDecision() {
  console.log('\n===========================================');
  console.log('测试场景 1: 库存不足时的决策');
  console.log('===========================================');
  
  const engine = new DecisionEngine({ enableLogging: true, enableLLM: true });
  
  const order = {
    _id: 'test_low_stock_001',
    customerName: '张三',
    modelName: '大型花瓶',
    material: '白色 PLA',
    volume: 500,
    status: 'pending_review'
  };
  
  const context = {
    stock: { white_pla: 50 },
    devices: [{ id: 'printer_1', status: 'idle' }]
  };
  
  try {
    const decision = await engine.makeDecision(order, context);
    
    const result = {
      scenario: '库存不足',
      orderId: order._id,
      decision: decision.result,
      confidence: decision.confidence,
      rationale: decision.rationale,
      source: decision.metadata?.source,
      passed: decision.result === 'MANUAL_REVIEW' || decision.result === 'REJECT'
    };
    
    testResults.scenarios.push(result);
    if (result.passed) testResults.passed++;
    else testResults.failed++;
    
    console.log('✓ 决策结果:', result);
    return result.passed;
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    testResults.failed++;
    testResults.scenarios.push({
      scenario: '库存不足',
      error: error.message,
      passed: false
    });
    return false;
  }
}

/**
 * 测试场景 2: 设备全满时的调度
 */
async function testAllDevicesBusy() {
  console.log('\n===========================================');
  console.log('测试场景 2: 设备全满时的调度');
  console.log('===========================================');
  
  const engine = new DecisionEngine({ enableLogging: true, enableLLM: true });
  
  const order = {
    _id: 'test_all_busy_001',
    customerName: '李四',
    modelName: '手机支架',
    material: '黑色 PLA',
    volume: 50,
    status: 'pending_review',
    metadata: {
      urgent: true,
      deadline: '2026-03-08'
    }
  };
  
  const context = {
    stock: { black_pla: 1000 },
    devices: [
      { id: 'printer_1', status: 'busy', currentTask: 'order_001', estimatedCompletion: '2026-03-08 18:00' },
      { id: 'printer_2', status: 'busy', currentTask: 'order_002', estimatedCompletion: '2026-03-08 20:00' },
      { id: 'printer_3', status: 'maintenance' }
    ]
  };
  
  try {
    const decision = await engine.makeDecision(order, context);
    
    const result = {
      scenario: '设备全满',
      orderId: order._id,
      decision: decision.result,
      confidence: decision.confidence,
      rationale: decision.rationale,
      source: decision.metadata?.source,
      passed: decision.result === 'MANUAL_REVIEW' || decision.result === 'REJECT'
    };
    
    testResults.scenarios.push(result);
    if (result.passed) testResults.passed++;
    else testResults.failed++;
    
    console.log('✓ 决策结果:', result);
    return result.passed;
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    testResults.failed++;
    testResults.scenarios.push({
      scenario: '设备全满',
      error: error.message,
      passed: false
    });
    return false;
  }
}

/**
 * 测试场景 3: 照片质量差的订单处理
 */
async function testPoorPhotoQuality() {
  console.log('\n===========================================');
  console.log('测试场景 3: 照片质量差的订单处理');
  console.log('===========================================');
  
  const engine = new DecisionEngine({ enableLogging: true, enableLLM: true });
  
  const order = {
    _id: 'test_poor_photo_001',
    customerName: '王五',
    modelName: '人像雕塑',
    material: '全彩树脂',
    volume: 200,
    status: 'pending_review',
    metadata: {
      photoQuality: 'poor',
      photoIssues: ['模糊', '光线不足', '角度不全'],
      uploadAttempts: 3
    }
  };
  
  const context = {
    stock: { color_resin: 800 },
    devices: [{ id: 'sla_1', status: 'idle' }]
  };
  
  try {
    const decision = await engine.makeDecision(order, context);
    
    const result = {
      scenario: '照片质量差',
      orderId: order._id,
      decision: decision.result,
      confidence: decision.confidence,
      rationale: decision.rationale,
      source: decision.metadata?.source,
      passed: decision.result === 'MANUAL_REVIEW'
    };
    
    testResults.scenarios.push(result);
    if (result.passed) testResults.passed++;
    else testResults.failed++;
    
    console.log('✓ 决策结果:', result);
    return result.passed;
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    testResults.failed++;
    testResults.scenarios.push({
      scenario: '照片质量差',
      error: error.message,
      passed: false
    });
    return false;
  }
}

/**
 * 测试场景 4: 参数异常的边界情况
 */
async function testAbnormalParameters() {
  console.log('\n===========================================');
  console.log('测试场景 4: 参数异常的边界情况');
  console.log('===========================================');
  
  const engine = new DecisionEngine({ enableLogging: true, enableLLM: true });
  
  const order = {
    _id: 'test_abnormal_params_001',
    customerName: '赵六',
    modelName: '超大雕塑',
    material: 'ABS',
    volume: 5000,
    status: 'pending_review',
    metadata: {
      unusualSize: true,
      requiresSpecialPrinter: true,
      estimatedPrintTime: '72 小时'
    }
  };
  
  const context = {
    stock: { abs: 6000 },
    devices: [
      { id: 'fdm_large_1', status: 'idle', type: 'fdm', buildVolume: '500x500x500' },
      { id: 'fdm_small_1', status: 'idle', type: 'fdm', buildVolume: '200x200x200' }
    ]
  };
  
  try {
    const decision = await engine.makeDecision(order, context);
    
    const result = {
      scenario: '参数异常',
      orderId: order._id,
      decision: decision.result,
      confidence: decision.confidence,
      rationale: decision.rationale,
      source: decision.metadata?.source,
      passed: decision.result === 'MANUAL_REVIEW' || decision.result === 'REJECT'
    };
    
    testResults.scenarios.push(result);
    if (result.passed) testResults.passed++;
    else testResults.failed++;
    
    console.log('✓ 决策结果:', result);
    return result.passed;
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    testResults.failed++;
    testResults.scenarios.push({
      scenario: '参数异常',
      error: error.message,
      passed: false
    });
    return false;
  }
}

/**
 * 测试场景 5: 标准订单自动通过
 */
async function testStandardOrderAutoApprove() {
  console.log('\n===========================================');
  console.log('测试场景 5: 标准订单自动通过');
  console.log('===========================================');
  
  const engine = new DecisionEngine({ enableLogging: true, enableLLM: true });
  
  const order = {
    _id: 'test_standard_001',
    customerName: '标准客户',
    modelName: '手机支架',
    material: '白色 PLA',
    volume: 50,
    status: 'pending_review',
    deviceType: 'fdm',
    metadata: {
      photoQuality: 'good',
      completeParams: true,
      hasModelFile: true,
      validDimensions: true
    }
  };
  
  const context = {
    stock: { white_pla: 1000 },
    devices: [
      { id: 'printer_1', status: 'idle' },
      { id: 'printer_2', status: 'idle' }
    ]
  };
  
  try {
    const decision = await engine.makeDecision(order, context);
    
    const result = {
      scenario: '标准订单',
      orderId: order._id,
      decision: decision.result,
      confidence: decision.confidence,
      rationale: decision.rationale,
      source: decision.metadata?.source,
      passed: decision.result === 'AUTO_APPROVE' || decision.result === 'MANUAL_REVIEW'
    };
    
    testResults.scenarios.push(result);
    if (result.passed) testResults.passed++;
    else testResults.failed++;
    
    console.log('✓ 决策结果:', result);
    return result.passed;
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    testResults.failed++;
    testResults.scenarios.push({
      scenario: '标准订单',
      error: error.message,
      passed: false
    });
    return false;
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  Agent 场景测试 (Task 27) - 边界 case 覆盖        ║');
  console.log('╚════════════════════════════════════════════════╝');
  
  await testLowStockDecision();
  await testAllDevicesBusy();
  await testPoorPhotoQuality();
  await testAbnormalParameters();
  await testStandardOrderAutoApprove();
  
  console.log('\n');
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  测试报告                                      ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`总测试数：${testResults.scenarios.length}`);
  console.log(`✓ 通过：${testResults.passed}`);
  console.log(`✗ 失败：${testResults.failed}`);
  console.log(`通过率：${(testResults.passed / testResults.scenarios.length * 100).toFixed(1)}%`);
  
  console.log('\n详细结果:');
  testResults.scenarios.forEach((scenario, idx) => {
    const icon = scenario.passed ? '✓' : '✗';
    console.log(`  ${idx + 1}. ${icon} ${scenario.scenario}: ${scenario.decision || scenario.error}`);
  });
  
  const fs = require('fs');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: testResults.scenarios.length,
      passed: testResults.passed,
      failed: testResults.failed,
      passRate: (testResults.passed / testResults.scenarios.length * 100).toFixed(1) + '%'
    },
    scenarios: testResults.scenarios
  };
  
  fs.writeFileSync(
    './test-results/agent-scenario-test-report.json',
    JSON.stringify(report, null, 2)
  );
  console.log('\n✓ 测试报告已保存到：./test-results/agent-scenario-test-report.json');
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('测试执行失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
