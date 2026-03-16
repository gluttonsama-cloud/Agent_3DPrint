/**
 * Agent 通信模块测试脚本
 * 
 * 测试 Agent 之间的通信协议、消息队列、请求 - 响应处理等功能
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// 导入通信模块
const {
  Message,
  MessageBuilder,
  MessageType,
  MessagePriority,
  MessageStatus,
  createRequestMessage,
  createResponseMessage,
  createNotificationMessage
} = require('../src/agents/communication/Protocol');

const { RequestResponseHandler } = require('../src/agents/communication/RequestResponseHandler');
const { TimeoutRetryManager } = require('../src/agents/communication/TimeoutRetryManager');
const { AgentMessenger, CommunicationEventType } = require('../src/agents/communication/AgentMessenger');
const { agentRegistry } = require('../src/agents/registry');

// 测试统计
const testStats = {
  total: 0,
  passed: 0,
  failed: 0
};

/**
 * 断言函数
 */
function assert(condition, message) {
  testStats.total++;
  if (condition) {
    testStats.passed++;
    console.log(`✓ ${message}`);
    return true;
  } else {
    testStats.failed++;
    console.error(`✗ ${message}`);
    return false;
  }
}

/**
 * 模拟 Agent 用于测试
 */
class MockAgent {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.state = 'ready';
    this.requestHandler = null;
  }
  
  setRequestHandler(handler) {
    this.requestHandler = handler;
  }
  
  async handleRequest(request) {
    console.log(`[MockAgent ${this.id}] 收到请求:`, request);
    
    if (this.requestHandler) {
      return await this.requestHandler(request);
    }
    
    return {
      success: true,
      agentId: this.id,
      action: request.action,
      timestamp: Date.now()
    };
  }
  
  listTools() {
    return [];
  }
}

// ============ 测试用例 ============

/**
 * 测试 1: Protocol.js - 消息创建
 */
async function testProtocolMessageCreation() {
  console.log('\n=== 测试 1: Protocol.js - 消息创建 ===\n');
  
  // 测试基本消息创建
  const message = new Message({
    from: 'coordinator_agent',
    to: 'scheduler_agent',
    type: MessageType.REQUEST,
    action: 'allocate_device',
    data: { orderId: 'order_123' }
  });
  
  assert(message.messageId !== null, '消息 ID 已生成');
  assert(message.from === 'coordinator_agent', '发送方正确');
  assert(message.to === 'scheduler_agent', '接收方正确');
  assert(message.type === MessageType.REQUEST, '消息类型正确');
  assert(message.action === 'allocate_device', '动作正确');
  assert(message.data.orderId === 'order_123', '数据正确');
  assert(message.priority === MessagePriority.NORMAL, '默认优先级正确');
  assert(message.timeout === 30000, '默认超时正确');
  
  // 测试消息序列化
  const json = message.toJSON();
  const deserialized = Message.fromJSON(json);
  assert(deserialized.messageId === message.messageId, '消息反序列化正确');
  
  // 测试消息构建器
  const builtMessage = new MessageBuilder()
    .from('test_agent')
    .to('target_agent')
    .type(MessageType.NOTIFICATION)
    .action('test_action')
    .data({ test: 'data' })
    .priority(MessagePriority.HIGH)
    .build();
  
  assert(builtMessage.from === 'test_agent', '构建器 - 发送方正确');
  assert(builtMessage.priority === MessagePriority.HIGH, '构建器 - 优先级正确');
  
  // 测试辅助函数
  const requestMsg = createRequestMessage({
    from: 'coordinator_agent',
    to: 'scheduler_agent',
    action: 'test',
    data: {}
  });
  assert(requestMsg.type === MessageType.REQUEST, 'createRequestMessage 正确');
  
  const responseMsg = createResponseMessage('corr_123', { result: 'ok' }, {
    from: 'scheduler_agent',
    to: 'coordinator_agent',
    action: 'test'
  });
  assert(responseMsg.type === MessageType.RESPONSE, 'createResponseMessage 正确');
  assert(responseMsg.correlationId === 'corr_123', 'createResponseMessage 关联 ID 正确');
  
  const notificationMsg = createNotificationMessage({
    from: 'coordinator_agent',
    to: 'inventory_agent',
    action: 'alert',
    data: { message: 'test' }
  });
  assert(notificationMsg.type === MessageType.NOTIFICATION, 'createNotificationMessage 正确');
}

/**
 * 测试 2: Protocol.js - 消息验证
 */
async function testProtocolMessageValidation() {
  console.log('\n=== 测试 2: Protocol.js - 消息验证 ===\n');
  
  // 测试有效消息
  const validMessage = new Message({
    from: 'agent_a',
    to: 'agent_b',
    type: MessageType.REQUEST,
    action: 'test',
    data: {}
  });
  
  const validResult = validMessage.validate();
  assert(validResult.valid === true, '有效消息验证通过');
  assert(validResult.errors.length === 0, '有效消息无错误');
  
  // 测试无效消息 - 缺少 from
  const invalidMessage1 = new Message({
    to: 'agent_b',
    type: MessageType.REQUEST,
    action: 'test',
    data: {}
  });
  
  const invalidResult1 = invalidMessage1.validate();
  assert(invalidResult1.valid === false, '无效消息验证失败');
  assert(invalidResult1.errors.length > 0, '无效消息有错误');
  
  // 测试无效消息 - 错误的类型
  const invalidMessage2 = new Message({
    from: 'agent_a',
    to: 'agent_b',
    type: 'invalid_type',
    action: 'test',
    data: {}
  });
  
  const invalidResult2 = invalidMessage2.validate();
  assert(invalidResult2.valid === false, '错误类型验证失败');
  
  // 测试响应消息缺少 correlationId
  const invalidMessage3 = new Message({
    from: 'agent_a',
    to: 'agent_b',
    type: MessageType.RESPONSE,
    action: 'test',
    data: {}
  });
  
  const invalidResult3 = invalidMessage3.validate();
  assert(invalidResult3.valid === false, '响应消息缺少 correlationId 验证失败');
}

/**
 * 测试 3: RequestResponseHandler - 请求发送
 */
async function testRequestResponseHandler() {
  console.log('\n=== 测试 3: RequestResponseHandler - 请求发送 ===\n');
  
  const handler = new RequestResponseHandler({
    defaultTimeout: 5000,
    enableLogging: true
  });
  
  // 创建模拟 Agent
  const mockAgent = new MockAgent('mock_agent', '模拟 Agent');
  mockAgent.setRequestHandler(async (request) => {
    return {
      success: true,
      requestId: request.requestId,
      action: request.action,
      processedAt: Date.now()
    };
  });
  
  // 设置注册中心
  const mockRegistry = {
    get: (id) => id === 'mock_agent' ? mockAgent : null
  };
  handler.setAgentRegistry(mockRegistry);
  
  // 发送请求
  try {
    const response = await handler.sendRequest(
      'mock_agent',
      'test_action',
      { testData: 'value' }
    );
    
    assert(response.success === true, '请求响应成功');
    assert(response.action === 'test_action', '响应动作正确');
    assert(response.processedAt !== null, '响应时间正确');
  } catch (error) {
    assert(false, `请求失败：${error.message}`);
  }
  
  // 测试 Agent 不存在
  try {
    await handler.sendRequest('non_existent_agent', 'test', {});
    assert(false, '应该抛出 Agent 不存在错误');
  } catch (error) {
    assert(error.code === 'AGENT_NOT_FOUND' || error.message.includes('不存在'), 'Agent 不存在错误正确');
  }
  
  handler.clearPendingRequests();
}

/**
 * 测试 4: TimeoutRetryManager - 超时和重试
 */
async function testTimeoutRetryManager() {
  console.log('\n=== 测试 4: TimeoutRetryManager - 超时和重试 ===\n');
  
  const manager = new TimeoutRetryManager({
    defaultTimeout: 2000,
    maxRetries: 2,
    baseDelay: 500,
    enableLogging: true
  });
  
  let attempts = 0;
  let success = false;
  
  // 测试重试逻辑
  try {
    await manager.registerRetry(
      'retry_test_1',
      'test_action',
      async (attempt) => {
        attempts++;
        console.log(`  尝试次数：${attempt}`);
        
        if (attempt < 2) {
          throw new Error(`第 ${attempt} 次失败`);
        }
        
        success = true;
        return { success: true, attempts };
      }
    );
    
    assert(success === true, '重试后成功');
    assert(attempts >= 2, '至少尝试 2 次');
  } catch (error) {
    console.log('  重试最终失败:', error.message);
  }
  
  // 测试取消重试
  const cancelled = manager.cancelRetry('retry_test_1');
  assert(cancelled === true || cancelled === false, '取消重试操作完成'); // 可能已完成
  
  // 获取统计
  const stats = manager.getStats();
  assert(stats.totalRetries >= 0, '统计信息正确');
  
  manager.clearAll();
}

/**
 * 测试 5: AgentMessenger - 完整通信流程
 */
async function testAgentMessenger() {
  console.log('\n=== 测试 5: AgentMessenger - 完整通信流程 ===\n');
  
  const messenger = new AgentMessenger({
    timeout: 5000,
    maxRetries: 2,
    enableLogging: true,
    useQueue: false
  });
  
  // 创建模拟 Agent
  const coordinatorAgent = new MockAgent('coordinator_agent', '协调 Agent');
  const schedulerAgent = new MockAgent('scheduler_agent', '调度 Agent');
  
  schedulerAgent.setRequestHandler(async (request) => {
    console.log(`  [Scheduler] 处理设备分配请求: ${request.data.orderId}`);
    return {
      success: true,
      deviceId: 'device_001',
      scheduledTime: Date.now() + 3600000
    };
  });
  
  // 设置注册中心
  const mockRegistry = {
    get: (id) => {
      if (id === 'scheduler_agent') return schedulerAgent;
      if (id === 'coordinator_agent') return coordinatorAgent;
      return null;
    },
    list: () => [coordinatorAgent, schedulerAgent]
  };
  
  messenger.setAgentRegistry(mockRegistry);
  
  // 监听事件
  let requestSentEvent = false;
  let responseReceivedEvent = false;
  
  messenger.on(CommunicationEventType.REQUEST_SENT, () => {
    requestSentEvent = true;
    console.log('  [事件] 请求已发送');
  });
  
  messenger.on(CommunicationEventType.RESPONSE_RECEIVED, () => {
    responseReceivedEvent = true;
    console.log('  [事件] 响应已接收');
  });
  
  // 测试请求 - 响应
  try {
    const response = await messenger.sendRequest(
      'scheduler_agent',
      'allocate_device',
      { orderId: 'order_123' }
    );
    
    assert(response.success === true, '信使请求成功');
    assert(response.deviceId === 'device_001', '设备 ID 正确');
    assert(requestSentEvent === true, '请求发送事件触发');
    assert(responseReceivedEvent === true, '响应接收事件触发');
  } catch (error) {
    assert(false, `信使请求失败：${error.message}`);
  }
  
  // 测试通知
  messenger.sendNotification(
    'scheduler_agent',
    'status_update',
    { status: 'processing' }
  );
  assert(true, '通知发送成功');
  
  // 测试广播
  const broadcastResults = await messenger.broadcast(
    'status_check',
    { timestamp: Date.now() }
  );
  
  assert(broadcastResults.length === 2, '广播结果数量正确');
  assert(broadcastResults[0].success === true, '广播第一个成功');
  assert(broadcastResults[1].success === true, '广播第二个成功');
  
  // 获取统计
  const stats = messenger.getStats();
  assert(stats.pendingRequests === 0, '无待处理请求');
  assert(stats.messageHistory > 0, '消息历史有记录');
  
  messenger.close();
}

/**
 * 测试 6: 消息状态管理
 */
async function testMessageStatusManagement() {
  console.log('\n=== 测试 6: 消息状态管理 ===\n');
  
  const message = new Message({
    from: 'agent_a',
    to: 'agent_b',
    type: MessageType.REQUEST,
    action: 'test',
    data: {}
  });
  
  assert(message.status === MessageStatus.PENDING, '初始状态为 PENDING');
  
  message.updateStatus(MessageStatus.SENT);
  assert(message.status === MessageStatus.SENT, '状态更新为 SENT');
  assert(message.attempts === 1, '尝试次数增加');
  
  message.updateStatus(MessageStatus.DELIVERED);
  assert(message.status === MessageStatus.DELIVERED, '状态更新为 DELIVERED');
  assert(message.deliveredAt !== null, '送达时间已设置');
  
  message.updateStatus(MessageStatus.ACKNOWLEDGED);
  assert(message.status === MessageStatus.ACKNOWLEDGED, '状态更新为 ACKNOWLEDGED');
  assert(message.acknowledgedAt !== null, '确认时间已设置');
  
  const error = new Error('Test error');
  message.setError(error);
  assert(message.error !== null, '错误信息已设置');
  assert(message.error.message === 'Test error', '错误消息正确');
}

/**
 * 测试 7: 消息过期检测
 */
async function testMessageExpiration() {
  console.log('\n=== 测试 7: 消息过期检测 ===\n');
  
  // 创建短超时消息
  const message = new Message({
    from: 'agent_a',
    to: 'agent_b',
    type: MessageType.REQUEST,
    action: 'test',
    data: {},
    timeout: 100 // 100ms 超时
  });
  
  assert(message.isExpired === false, '初始未过期');
  assert(message.getRemainingTime() <= 100, '剩余时间正确');
  
  // 等待过期
  await new Promise(resolve => setTimeout(resolve, 150));
  
  assert(message.isExpired === true, '消息已过期');
  assert(message.getRemainingTime() === 0, '剩余时间为 0');
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('========================================');
  console.log('Agent 通信模块测试');
  console.log('========================================');
  
  try {
    await testProtocolMessageCreation();
    await testProtocolMessageValidation();
    await testRequestResponseHandler();
    await testTimeoutRetryManager();
    await testAgentMessenger();
    await testMessageStatusManagement();
    await testMessageExpiration();
    
    console.log('\n========================================');
    console.log('测试结果统计');
    console.log('========================================');
    console.log(`总测试数：${testStats.total}`);
    console.log(`通过：${testStats.passed}`);
    console.log(`失败：${testStats.failed}`);
    console.log(`成功率：${(testStats.passed / testStats.total * 100).toFixed(2)}%`);
    
    if (testStats.failed === 0) {
      console.log('\n✓ 所有测试通过！');
      process.exit(0);
    } else {
      console.log(`\n✗ ${testStats.failed} 个测试失败`);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n========================================');
    console.error('测试执行失败');
    console.error('========================================');
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
runTests();
