/**
 * Agent 决策 API 和 Socket.IO 集成测试脚本
 * 
 * 测试内容：
 * 1. Agent 决策 API 调用
 * 2. Socket.IO 事件推送
 * 3. LLM 决策集成
 */

require('dotenv').config();
const axios = require('axios');
const { io } = require('socket.io-client');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TEST_ORDER_ID = `TEST_${Date.now()}`;

// 测试结果统计
const testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// Socket.IO 连接
let socket = null;
const receivedEvents = [];

/**
 * 初始化 Socket.IO 连接
 */
async function initSocketConnection() {
  console.log('\n🔌 测试 1: Socket.IO 连接测试\n');
  
  return new Promise((resolve, reject) => {
    try {
      socket = io(BASE_URL, {
        path: '/socket.io',
        transports: ['websocket', 'polling']
      });
      
      socket.on('connect', () => {
        console.log('✅ Socket.IO 连接成功');
        console.log(`   连接 ID: ${socket.id}`);
        testResults.passed++;
        testResults.total++;
        resolve();
      });
      
      socket.on('connect_error', (error) => {
        console.error('❌ Socket.IO 连接失败');
        console.error('   错误:', error.message);
        testResults.failed++;
        testResults.total++;
        reject(error);
      });
      
      // 监听 Agent 事件
      socket.on('agent-event', (event) => {
        console.log('\n📨 收到 Agent 事件:', event.type || 'decision');
        console.log('   Agent:', event.agent);
        console.log('   订单:', event.orderId);
        console.log('   决策:', event.decision);
        receivedEvents.push(event);
      });
      
      socket.on('agent-state-change', (event) => {
        console.log('\n📊 Agent 状态变化:');
        console.log('   Agent:', event.agentId);
        console.log('   状态:', event.currentState);
        receivedEvents.push(event);
      });
      
      // 设置超时
      setTimeout(() => {
        if (!socket.connected) {
          reject(new Error('Socket.IO 连接超时'));
        }
      }, 5000);
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 测试健康检查 API
 */
async function testHealthCheck() {
  console.log('\n🏥 测试 2: 健康检查 API\n');
  
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    
    console.log('✅ 健康检查通过');
    console.log('   状态:', response.data.status);
    console.log('   版本:', response.data.version);
    console.log('   时间:', response.data.time);
    
    testResults.passed++;
    testResults.total++;
    
    return true;
  } catch (error) {
    console.error('❌ 健康检查失败');
    console.error('   错误:', error.message);
    testResults.failed++;
    testResults.total++;
    return false;
  }
}

/**
 * 测试 Agent 决策 API
 */
async function testAgentDecision() {
  console.log(`\n🤖 测试 3: Agent 决策 API (${TEST_ORDER_ID})\n`);
  
  try {
    console.log('📤 发送协调 Agent 决策请求...');
    
    const response = await axios.post(
      `${BASE_URL}/api/agent-decisions/decide`,
      {
        agentType: 'coordinator',
        action: 'review_order',
        data: {
          orderId: TEST_ORDER_ID,
          context: {
            priority: 'normal',
            orderValue: 1000
          }
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('\n✅ 决策 API 调用成功');
    console.log('   响应状态:', response.status);
    console.log('   决策 ID:', response.data.data?.decisionId || 'N/A');
    console.log('   决策结果:', response.data.data?.decisionResult || 'N/A');
    console.log('   置信度:', response.data.data?.confidence || 'N/A');
    
    testResults.passed++;
    testResults.total++;
    
    // 等待事件推送
    console.log('\n⏳ 等待 Socket.IO 事件推送 (3 秒)...');
    await sleep(3000);
    
    return response.data;
  } catch (error) {
    console.error('\n❌ 决策 API 调用失败');
    if (error.response) {
      console.error('   状态码:', error.response.status);
      console.error('   错误:', error.response.data);
    } else {
      console.error('   错误:', error.message);
    }
    testResults.failed++;
    testResults.total++;
    return null;
  }
}

/**
 * 测试查询决策历史
 */
async function testDecisionHistory() {
  console.log(`\n📜 测试 4: 查询决策历史 (${TEST_ORDER_ID})\n`);
  
  try {
    const response = await axios.get(
      `${BASE_URL}/api/agent-decisions/order/${TEST_ORDER_ID}`
    );
    
    console.log('✅ 决策历史查询成功');
    console.log('   决策数量:', response.data.data?.decisions?.length || 0);
    
    if (response.data.data?.decisions?.length > 0) {
      console.log('\n   最近决策:');
      response.data.data.decisions.slice(0, 3).forEach((decision, index) => {
        console.log(`   ${index + 1}. [${decision.decisionType}] ${decision.decisionResult}`);
        console.log(`      置信度：${decision.confidence}`);
      });
    }
    
    testResults.passed++;
    testResults.total++;
    
    return true;
  } catch (error) {
    console.error('❌ 决策历史查询失败');
    console.error('   错误:', error.message);
    testResults.failed++;
    testResults.total++;
    return false;
  }
}

/**
 * 测试查询 Agent 状态
 */
async function testAgentStatus() {
  console.log('\n📊 测试 5: Agent 状态查询\n');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/api/agent-decisions/coordinator/status`
    );
    
    console.log('✅ Agent 状态查询成功');
    console.log('   Agent ID:', response.data.data?.id);
    console.log('   状态:', response.data.data?.state);
    console.log('   工具数量:', response.data.data?.tools?.length || 0);
    
    if (response.data.data?.coordinationTasks) {
      console.log('   协调任务统计:');
      console.log('     - 总计:', response.data.data.coordinationTasks.total);
      console.log('     - 处理中:', response.data.data.coordinationTasks.processing);
      console.log('     - 已完成:', response.data.data.coordinationTasks.completed);
    }
    
    testResults.passed++;
    testResults.total++;
    
    return true;
  } catch (error) {
    console.error('❌ Agent 状态查询失败');
    console.error('   错误:', error.message);
    testResults.failed++;
    testResults.total++;
    return false;
  }
}

/**
 * 打印测试结果统计
 */
function printTestSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果统计');
  console.log('='.repeat(60));
  console.log(`✅ 通过：${testResults.passed}`);
  console.log(`❌ 失败：${testResults.failed}`);
  console.log(`📝 总计：${testResults.total}`);
  console.log('='.repeat(60));
  
  if (testResults.failed === 0) {
    console.log('\n🎉 所有测试通过！\n');
  } else {
    console.log(`\n⚠️  有 ${testResults.failed} 个测试失败，请检查错误信息。\n`);
  }
}

/**
 * 辅助函数：延迟执行
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 主测试流程
 */
async function runTests() {
  console.log('='.repeat(60));
  console.log('🧪 Agent 决策 API 和 Socket.IO 集成测试');
  console.log('='.repeat(60));
  console.log(`后端地址：${BASE_URL}`);
  console.log(`测试订单 ID: ${TEST_ORDER_ID}`);
  
  try {
    // 测试 1: Socket.IO 连接
    await initSocketConnection();
    
    // 等待 Socket.IO 完全连接
    await sleep(1000);
    
    // 测试 2: 健康检查
    await testHealthCheck();
    
    // 测试 3: Agent 决策
    await testAgentDecision();
    
    // 测试 4: 决策历史
    await testDecisionHistory();
    
    // 测试 5: Agent 状态
    await testAgentStatus();
    
    // 打印统计
    printTestSummary();
    
  } catch (error) {
    console.error('\n❌ 测试过程中发生错误:', error.message);
    printTestSummary();
  } finally {
    // 关闭 Socket.IO 连接
    if (socket) {
      socket.disconnect();
      console.log('\n🔌 Socket.IO 连接已关闭\n');
    }
    
    // 退出进程
    process.exit(testResults.failed > 0 ? 1 : 0);
  }
}

// 运行测试
runTests();
