/**
 * 协调 Agent 测试脚本
 * 
 * 测试 Coordinator Agent 的核心功能
 * 包含决策引擎、规则评估、Agent 通信等测试
 */

require('dotenv').config();
const mongoose = require('mongoose');

// 测试统计
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0
};

// 打印测试结果
function testResult(name, passed, error = null) {
  stats.total++;
  if (passed) {
    stats.passed++;
    console.log(`✅ ${name}`);
  } else {
    stats.failed++;
    console.log(`❌ ${name}`);
    if (error) {
      console.log(`   错误：${error.message}`);
    }
  }
}

// 跳过测试
function skipTest(name, reason) {
  stats.skipped++;
  console.log(`⏭️  ${name}`);
  if (reason) {
    console.log(`   原因：${reason}`);
  }
}

/**
 * 测试决策结果枚举
 */
function testDecisionResult() {
  console.log('\n📋 测试决策结果枚举...');
  
  try {
    const { DecisionResult, RulePriority } = require('../src/agents/DecisionEngine');
    
    testResult('AUTO_APPROVE 存在', DecisionResult.AUTO_APPROVE === 'auto_approve');
    testResult('MANUAL_REVIEW 存在', DecisionResult.MANUAL_REVIEW === 'manual_review');
    testResult('REJECT 存在', DecisionResult.REJECT === 'reject');
    
    testResult('CRITICAL 优先级', RulePriority.CRITICAL === 1);
    testResult('HIGH 优先级', RulePriority.HIGH === 2);
    testResult('MEDIUM 优先级', RulePriority.MEDIUM === 3);
    testResult('LOW 优先级', RulePriority.LOW === 4);
    
  } catch (error) {
    testResult('决策结果枚举测试', false, error);
  }
}

/**
 * 测试决策规则定义
 */
function testOrderRules() {
  console.log('\n📋 测试订单决策规则...');
  
  try {
    const { orderRules, DecisionResult, RulePriority } = require('../src/agents/rules/orderRules');
    
    testResult('规则数组存在', Array.isArray(orderRules));
    testResult('规则数量大于 0', orderRules.length > 0);
    console.log(`   规则数量：${orderRules.length}`);
    
    // 验证每个规则的结构
    let allRulesValid = true;
    for (const rule of orderRules) {
      if (!rule.id || !rule.name || !rule.condition || !rule.action) {
        allRulesValid = false;
        console.log(`   ❌ 规则 ${rule.id} 结构不完整`);
      }
    }
    testResult('所有规则结构完整', allRulesValid);
    
    // 验证特定规则存在
    const ruleIds = orderRules.map(r => r.id);
    testResult('包含照片质量检查规则', ruleIds.includes('photo_quality_check'));
    testResult('包含库存检查规则', ruleIds.includes('material_stock_check'));
    testResult('包含参数标准检查规则', ruleIds.includes('parameter_standard_check'));
    testResult('包含标准订单自动通过规则', ruleIds.includes('standard_order_auto_approve'));
    testResult('包含订单完整性检查规则', ruleIds.includes('order_completeness_check'));
    
    // 测试规则条件函数
    const testOrder = {
      metadata: { photoQuality: 0.5 },
      items: []
    };
    
    const photoQualityRule = orderRules.find(r => r.id === 'photo_quality_check');
    const conditionMet = photoQualityRule.condition(testOrder);
    testResult('照片质量规则条件评估', conditionMet === true);
    
  } catch (error) {
    testResult('订单决策规则测试', false, error);
  }
}

/**
 * 测试决策引擎
 */
function testDecisionEngine() {
  console.log('\n📋 测试决策引擎...');
  
  try {
    const { DecisionEngine, Decision, DecisionResult, RulePriority } = require('../src/agents/DecisionEngine');
    
    // 创建决策引擎实例
    const engine = new DecisionEngine();
    testResult('决策引擎创建', engine !== null);
    
    // 测试规则列表
    const rules = engine.getRules();
    testResult('获取规则列表', rules.length > 0);
    console.log(`   加载规则数：${rules.length}`);
    
    // 测试添加规则
    const customRule = {
      id: 'test_rule',
      name: '测试规则',
      description: '用于测试的规则',
      priority: RulePriority.LOW,
      condition: (order) => true,
      action: (order) => ({
        result: DecisionResult.AUTO_APPROVE,
        confidence: 0.9,
        reason: '测试规则匹配'
      }),
      rationale: (order) => '测试规则说明'
    };
    
    const added = engine.addRule(customRule);
    testResult('添加自定义规则', added);
    
    // 测试移除规则
    const removed = engine.removeRule('test_rule');
    testResult('移除自定义规则', removed);
    
    // 测试规则评估
    const testOrder = {
      _id: 'test_order_001',
      metadata: { photoQuality: 0.9 },
      items: [
        {
          deviceId: 'device_001',
          quantity: 1,
          unitPrice: 100
        }
      ]
    };
    
    const ruleResults = engine.evaluateAllRules(testOrder, { stockInfo: {} });
    testResult('评估所有规则', ruleResults.length > 0);
    console.log(`   匹配规则数：${ruleResults.length}`);
    
    // 测试冲突解决
    const mockResults = [
      { ruleId: 'rule1', result: DecisionResult.AUTO_APPROVE, priority: 3, confidence: 0.9 },
      { ruleId: 'rule2', result: DecisionResult.MANUAL_REVIEW, priority: 2, confidence: 0.8 }
    ];
    
    const resolved = engine.resolveConflict(mockResults);
    testResult('冲突解决', resolved.result === DecisionResult.MANUAL_REVIEW);
    
    // 清理引擎
    engine.removeRule('test_rule');
    
  } catch (error) {
    testResult('决策引擎测试', false, error);
  }
}

/**
 * 测试决策引擎异步决策
 */
async function testAsyncDecision() {
  console.log('\n📋 测试异步决策...');
  
  try {
    const { DecisionEngine, Decision, DecisionResult } = require('../src/agents/DecisionEngine');
    const engine = new DecisionEngine();
    
    // 测试标准订单（应该自动通过）
    const standardOrder = {
      _id: 'standard_order_001',
      userId: 'user_001',
      items: [
        {
          deviceId: 'device_001',
          quantity: 1,
          unitPrice: 100,
          specifications: {}
        }
      ],
      metadata: { photoQuality: 0.95 }
    };
    
    const decision = await engine.makeDecision(standardOrder, { stockInfo: {} });
    testResult('决策对象创建', decision instanceof Decision);
    console.log(`   决策结果：${decision.result}`);
    console.log(`   置信度：${decision.confidence}`);
    console.log(`   原因：${decision.reason}`);
    
    // 测试低质量照片订单（应该转人工）
    const lowQualityOrder = {
      _id: 'low_quality_order_001',
      userId: 'user_001',
      items: [
        {
          deviceId: 'device_001',
          quantity: 1,
          unitPrice: 100
        }
      ],
      metadata: { photoQuality: 0.5 }
    };
    
    const lowQualityDecision = await engine.makeDecision(lowQualityOrder, { stockInfo: {} });
    testResult('低质量照片决策', lowQualityDecision.result === DecisionResult.MANUAL_REVIEW);
    console.log(`   低质量决策结果：${lowQualityDecision.result}`);
    
  } catch (error) {
    testResult('异步决策测试', false, error);
  }
}

/**
 * 测试 Agent Messenger
 */
function testAgentMessenger() {
  console.log('\n📋 测试 Agent Messenger...');
  
  try {
    const { AgentMessenger, AgentCommunicationError } = require('../src/agents/communication/AgentMessenger');
    
    // 创建 Messenger 实例
    const messenger = new AgentMessenger({
      timeout: 5000,
      maxRetries: 2,
      enableLogging: false
    });
    
    testResult('Messenger 创建', messenger !== null);
    
    // 测试请求 ID 生成
    const reqId1 = messenger.generateRequestId();
    const reqId2 = messenger.generateRequestId();
    testResult('请求 ID 唯一性', reqId1 !== reqId2);
    
    // 测试统计信息
    const messengerStats = messenger.getStats();
    testResult('获取统计信息', messengerStats.pendingRequests === 0);
    console.log(`   待处理请求：${messengerStats.pendingRequests}`);
    
    // 测试事件监听
    let eventEmitted = false;
    messenger.on('request_sent', () => { eventEmitted = true; });
    messenger.emit('request_sent', { requestId: 'test' });
    testResult('事件发射和监听', eventEmitted);
    
    // 清理
    messenger.removeAllListeners();
    
  } catch (error) {
    testResult('Agent Messenger 测试', false, error);
  }
}

/**
 * 测试 Coordinator Agent 创建
 */
function testCoordinatorAgentCreation() {
  console.log('\n📋 测试 Coordinator Agent 创建...');
  
  try {
    const { CoordinatorAgent, CoordinationTaskType } = require('../src/agents/CoordinatorAgent');
    
    // 创建协调 Agent 实例
    const coordinator = new CoordinatorAgent({
      id: 'test_coordinator',
      name: '测试协调 Agent'
    });
    
    testResult('Coordinator 创建', coordinator !== null);
    testResult('Agent ID 正确', coordinator.id === 'test_coordinator');
    testResult('Agent 名称正确', coordinator.name === '测试协调 Agent');
    
    // 测试任务类型枚举
    testResult('PROCESS_ORDER 存在', CoordinationTaskType.PROCESS_ORDER === 'process_order');
    testResult('CHECK_STOCK 存在', CoordinationTaskType.CHECK_STOCK === 'check_stock');
    testResult('SCHEDULE_DEVICE 存在', CoordinationTaskType.SCHEDULE_DEVICE === 'schedule_device');
    
    // 测试工具列表（初始化前）
    const tools = coordinator.listTools();
    testResult('工具列表存在', Array.isArray(tools));
    
  } catch (error) {
    testResult('Coordinator Agent 创建测试', false, error);
  }
}

/**
 * 测试 Agent Registry 集成
 */
async function testAgentRegistryIntegration() {
  console.log('\n📋 测试 Agent Registry 集成...');
  
  try {
    const { agentRegistry } = require('../src/agents/registry');
    
    // 测试创建协调 Agent
    if (agentRegistry.createCoordinatorAgent) {
      const coordinator = await agentRegistry.createCoordinatorAgent({
        id: 'test_coordinator_registry'
      });
      
      testResult('通过 Registry 创建 Coordinator', coordinator !== null);
      testResult('Coordinator 已注册', agentRegistry.get('test_coordinator_registry') !== null);
      
      // 测试获取统计
      const stats = coordinator.getStats();
      testResult('获取 Coordinator 统计', stats !== null);
      console.log(`   决策引擎规则数：${stats.decisionEngine?.rulesCount || 0}`);
      
      // 清理：移除测试 Agent
      await agentRegistry.remove('test_coordinator_registry');
      testResult('清理测试 Agent', agentRegistry.get('test_coordinator_registry') === null);
      
    } else {
      skipTest('Registry 集成测试', 'createCoordinatorAgent 方法不存在');
    }
    
  } catch (error) {
    testResult('Agent Registry 集成测试', false, error);
  }
}

/**
 * 测试 Decision 类
 */
function testDecisionClass() {
  console.log('\n📋 测试 Decision 类...');
  
  try {
    const { Decision, DecisionResult } = require('../src/agents/DecisionEngine');
    
    const decision = new Decision({
      result: DecisionResult.AUTO_APPROVE,
      confidence: 0.95,
      reason: '标准订单',
      details: { test: true },
      rationale: '这是一个测试决策'
    });
    
    testResult('Decision 创建', decision !== null);
    testResult('结果正确', decision.result === DecisionResult.AUTO_APPROVE);
    testResult('置信度正确', decision.confidence === 0.95);
    testResult('原因正确', decision.reason === '标准订单');
    testResult('详情正确', decision.details.test === true);
    testResult('解释正确', decision.rationale === '这是一个测试决策');
    testResult('时间戳存在', decision.timestamp !== null);
    
    // 测试 toJSON
    const json = decision.toJSON();
    testResult('toJSON 转换', json.result === DecisionResult.AUTO_APPROVE);
    
  } catch (error) {
    testResult('Decision 类测试', false, error);
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('协调 Agent 测试脚本');
  console.log('='.repeat(60));
  
  // 连接数据库
  let dbConnected = false;
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      dbConnected = true;
      console.log('\n✅ 数据库已连接');
    } else {
      console.log('\n⚠️  未配置 MONGODB_URI，跳过数据库相关测试');
    }
  } catch (error) {
    console.log('\n⚠️  数据库连接失败:', error.message);
  }
  
  // 运行单元测试
  testDecisionResult();
  testOrderRules();
  testDecisionEngine();
  await testAsyncDecision();
  testAgentMessenger();
  testCoordinatorAgentCreation();
  testDecisionClass();
  
  // 运行集成测试（需要数据库）
  if (dbConnected) {
    await testAgentRegistryIntegration();
  } else {
    skipTest('Agent Registry 集成测试', '数据库未连接');
  }
  
  // 断开数据库
  if (dbConnected) {
    await mongoose.disconnect();
    console.log('\n数据库已断开');
  }
  
  // 打印统计
  console.log('\n' + '='.repeat(60));
  console.log('测试统计');
  console.log('='.repeat(60));
  console.log(`总计：${stats.total}`);
  console.log(`✅ 通过：${stats.passed}`);
  console.log(`❌ 失败：${stats.failed}`);
  console.log(`⏭️  跳过：${stats.skipped}`);
  console.log('='.repeat(60));
  
  // 退出码
  if (stats.failed > 0) {
    console.log('\n❌ 测试失败');
    process.exit(1);
  } else {
    console.log('\n✅ 所有测试通过');
    process.exit(0);
  }
}

// 运行测试
runTests().catch(error => {
  console.error('测试脚本执行失败:', error);
  process.exit(1);
});
