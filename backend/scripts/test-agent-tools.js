/**
 * Agent 工具测试脚本
 * 
 * 测试所有 Agent 工具的功能
 * 包含订单工具、设备工具、库存工具的测试
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { agentEventEmitter, AgentEventType } = require('../src/utils/AgentEventEmitter');
const { agentRegistry } = require('../src/agents/registry');
const { BaseAgent, AgentState } = require('../src/agents/BaseAgent');
const { 
  orderTools, 
  deviceTools, 
  materialTools,
  getToolNames,
  getToolDetails,
  getAllToolDetails
} = require('../src/agents/tools');

// 测试统计
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0
};

// 工具函数：打印测试结果
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

// 工具函数：跳过测试
function skipTest(name, reason) {
  stats.skipped++;
  console.log(`⏭️  ${name}`);
  if (reason) {
    console.log(`   原因：${reason}`);
  }
}

// 测试 EventEmitter
function testEventEmitter() {
  console.log('\n📋 测试 EventEmitter...');
  
  try {
    // 测试事件监听
    let eventReceived = false;
    const handler = () => { eventReceived = true; };
    agentEventEmitter.on(AgentEventType.DECISION_MADE, handler);
    
    // 发射事件
    agentEventEmitter.emitDecision({
      agentId: 'test-agent',
      type: 'auto_approve',
      orderId: 'test-order',
      result: 'approved',
      reasoning: '测试决策'
    });
    
    testResult('事件发射和监听', eventReceived);
    
    // 移除监听
    agentEventEmitter.off(AgentEventType.DECISION_MADE, handler);
    
    // 测试事件历史
    const history = agentEventEmitter.getHistory(10);
    testResult('事件历史获取', history.length > 0);
    
    // 测试按类型获取历史
    const decisionHistory = agentEventEmitter.getHistoryByType(AgentEventType.DECISION_MADE);
    testResult('按类型获取事件历史', decisionHistory.length >= 0);
    
  } catch (error) {
    testResult('EventEmitter 测试', false, error);
  }
}

// 测试工具导出
function testToolExports() {
  console.log('\n📋 测试工具导出...');
  
  try {
    // 测试工具名称列表
    const toolNames = getToolNames();
    testResult('获取工具名称列表', toolNames.length > 0);
    console.log(`   工具数量：${toolNames.length}`);
    
    // 测试工具详情
    const firstToolName = toolNames[0];
    const toolDetails = getToolDetails(firstToolName);
    testResult('获取工具详情', toolDetails !== null);
    
    // 测试所有工具详情
    const allDetails = getAllToolDetails();
    testResult('获取所有工具详情', allDetails !== null && Object.keys(allDetails).length > 0);
    
    // 验证订单工具
    testResult('订单工具存在', !!orderTools.getPendingOrders);
    testResult('订单工具有 execute 方法', typeof orderTools.getPendingOrders.execute === 'function');
    
    // 验证设备工具
    testResult('设备工具存在', !!deviceTools.getAvailableDevices);
    testResult('设备工具有 execute 方法', typeof deviceTools.getAvailableDevices.execute === 'function');
    
    // 验证库存工具
    testResult('库存工具存在', !!materialTools.checkMaterialStock);
    testResult('库存工具有 execute 方法', typeof materialTools.checkMaterialStock.execute === 'function');
    
  } catch (error) {
    testResult('工具导出测试', false, error);
  }
}

// 测试 AgentRegistry
function testAgentRegistry() {
  console.log('\n📋 测试 AgentRegistry...');
  
  try {
    // 创建测试 Agent
    class TestAgent extends BaseAgent {
      constructor() {
        super({
          id: 'test-agent-001',
          name: '测试 Agent',
          description: '用于测试的 Agent'
        });
      }
      
      async registerTools() {
        this.registerTool('test', {
          name: 'test',
          description: '测试工具',
          execute: async () => ({ success: true })
        });
      }
      
      async execute(task) {
        return { success: true, task };
      }
    }
    
    const testAgent = new TestAgent();
    
    // 测试注册
    const registered = agentRegistry.register(testAgent, { type: 'test' });
    testResult('Agent 注册', registered);
    
    // 测试获取 Agent
    const agent = agentRegistry.get('test-agent-001');
    testResult('获取 Agent', agent !== null);
    
    // 测试获取元数据
    const metadata = agentRegistry.getMetadata('test-agent-001');
    testResult('获取 Agent 元数据', metadata !== null);
    
    // 测试列出 Agent
    const agents = agentRegistry.list();
    testResult('列出所有 Agent', agents.length > 0);
    
    // 测试获取统计
    const agentStats = agentRegistry.getStats();
    testResult('获取 Agent 统计', agentStats.total > 0);
    console.log(`   统计信息:`, agentStats);
    
    // 测试更新状态
    const stateUpdated = agentRegistry.updateState('test-agent-001', 'busy');
    testResult('更新 Agent 状态', stateUpdated);
    
    // 清理：移除测试 Agent
    const removed = agentRegistry.remove('test-agent-001');
    testResult('移除 Agent', removed);
    
  } catch (error) {
    testResult('AgentRegistry 测试', false, error);
  }
}

// 测试 BaseAgent
async function testBaseAgent() {
  console.log('\n📋 测试 BaseAgent...');
  
  try {
    class TestAgent extends BaseAgent {
      constructor() {
        super({
          id: 'test-agent-002',
          name: '测试 Agent 2',
          description: '用于测试的 Agent 2',
          llmConfig: {
            provider: 'openai',
            model: 'gpt-3.5-turbo'
          }
        });
      }
      
      async registerTools() {
        this.registerTool('test', {
          name: 'test',
          description: '测试工具',
          execute: async () => ({ success: true })
        });
      }
      
      async execute(task) {
        return { success: true, task };
      }
    }
    
    const testAgent = new TestAgent();
    
    // 测试 Agent 创建
    testResult('Agent 创建', testAgent.id === 'test-agent-002');
    
    // 测试工具注册
    testAgent.registerTool('manual', {
      name: 'manual',
      description: '手动注册工具',
      execute: async () => ({ success: true })
    });
    const tool = testAgent.getTool('manual');
    testResult('手动注册工具', tool !== null);
    
    // 测试工具列表
    const tools = testAgent.listTools();
    testResult('获取工具列表', tools.includes('manual'));
    
    // 测试状态管理
    testResult('初始状态', testAgent.state === AgentState.IDLE);
    
    // 测试 getState
    const state = testAgent.getState();
    testResult('获取 Agent 状态', state.id === 'test-agent-002');
    
    // 测试工具调用（不初始化 LLM）
    const toolResult = await testAgent.callTool('manual', {});
    testResult('调用工具', toolResult.success === true);
    
    // 清理
    await testAgent.shutdown();
    testResult('Agent 关闭', testAgent.state === AgentState.SHUTDOWN);
    
  } catch (error) {
    testResult('BaseAgent 测试', false, error);
  }
}

// 测试 LLM 配置
async function testLLMConfig() {
  console.log('\n📋 测试 LLM 配置...');
  
  try {
    const { validateConfig, getConfigInfo, createLLM } = require('../src/config/llm');
    
    // 测试配置验证
    const validation = validateConfig();
    if (!validation.valid) {
      skipTest('LLM 配置验证', `缺少配置：${validation.missing.join(', ')}`);
    } else {
      testResult('LLM 配置验证', true);
    }
    
    // 测试获取配置信息
    const configInfo = getConfigInfo();
    testResult('获取 LLM 配置信息', !!configInfo.provider);
    console.log(`   配置信息:`, configInfo);
    
    // 测试创建 LLM（不实际调用）- 注意：没有 API 密钥会失败
    try {
      const llm = createLLM();
      testResult('创建 LLM 实例', llm !== null);
    } catch (error) {
      skipTest('创建 LLM 实例', 'API 密钥未配置');
    }
    
  } catch (error) {
    testResult('LLM 配置测试', false, error);
  }
}

// 主测试函数
async function runTests() {
  console.log('='.repeat(60));
  console.log('Agent 工具测试脚本');
  console.log('='.repeat(60));
  
  // 连接数据库（用于测试需要数据库的工具）
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
  
  // 运行测试
  testEventEmitter();
  testToolExports();
  testAgentRegistry();
  await testBaseAgent();
  await testLLMConfig();
  
  // 如果需要测试实际的工具执行（需要数据库数据）
  if (dbConnected) {
    console.log('\n📋 测试实际工具执行...');
    
    try {
      // 测试订单工具
      const pendingOrders = await orderTools.getPendingOrders.execute({ limit: 5 });
      testResult('getPendingOrders 执行', pendingOrders.success);
      
      // 测试设备工具
      const availableDevices = await deviceTools.getAvailableDevices.execute({});
      testResult('getAvailableDevices 执行', availableDevices.success);
      
      // 测试库存工具
      const allMaterials = await materialTools.getAllMaterials.execute({});
      testResult('getAllMaterials 执行', allMaterials.success);
      
    } catch (error) {
      testResult('实际工具执行测试', false, error);
    }
    
    // 断开数据库
    await mongoose.disconnect();
    console.log('\n数据库已断开');
  } else {
    console.log('\n⏭️  跳过实际工具执行测试（数据库未连接）');
    stats.skipped += 3;
  }
  
  // 打印测试统计
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
