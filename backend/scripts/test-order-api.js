/**
 * 订单管理 API 测试脚本
 * 
 * 测试订单 CRUD 操作、状态流转、队列集成等功能
 * 使用方法：node scripts/test-order-api.js
 */

const axios = require('axios');

// 配置
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';
const TEST_USER_ID = process.env.TEST_USER_ID || '507f1f77bcf86cd799439011';

// 测试颜色
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// 测试工具函数
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n🧪 ${name}`, 'cyan');
  log('─'.repeat(50), 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// 测试状态
const testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// 测试断言
function assert(condition, message) {
  testResults.total++;
  if (condition) {
    testResults.passed++;
    logSuccess(message);
    return true;
  } else {
    testResults.failed++;
    logError(message);
    return false;
  }
}

// 存储测试数据
let createdOrderId = null;

/**
 * 测试 1: 创建订单
 */
async function testCreateOrder() {
  logTest('测试 1: 创建订单');
  
  try {
    const orderData = {
      userId: TEST_USER_ID,
      photos: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
      deviceType: 'sla',
      material: 'resin-standard',
      quantity: 1,
      specifications: {
        scale: 1.0,
        orientation: 'upright'
      },
      totalPrice: 299.00
    };
    
    logInfo('请求数据：' + JSON.stringify(orderData, null, 2));
    
    const response = await axios.post(`${BASE_URL}/orders`, orderData);
    
    assert(response.status === 201, `状态码应该是 201，实际：${response.status}`);
    assert(response.data.success === true, '响应应该成功');
    assert(response.data.data.orderId, '应该返回订单 ID');
    assert(response.data.data.status, '应该返回订单状态');
    
    // 保存订单 ID 供后续测试使用
    createdOrderId = response.data.data.orderId;
    logInfo(`创建的订单 ID: ${createdOrderId}`);
    logInfo(`订单状态：${response.data.data.statusLabel}`);
    
    return true;
  } catch (error) {
    logError(`创建订单失败：${error.message}`);
    if (error.response) {
      logError('响应：' + JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

/**
 * 测试 2: 查询订单列表
 */
async function testGetOrders() {
  logTest('测试 2: 查询订单列表');
  
  try {
    const response = await axios.get(`${BASE_URL}/orders`, {
      params: {
        page: 1,
        limit: 10
      }
    });
    
    assert(response.status === 200, `状态码应该是 200，实际：${response.status}`);
    assert(response.data.success === true, '响应应该成功');
    assert(Array.isArray(response.data.data), '数据应该是数组');
    assert(response.data.pagination, '应该返回分页信息');
    assert(typeof response.data.pagination.total === 'number', '分页信息应该包含总数');
    
    logInfo(`订单总数：${response.data.pagination.total}`);
    logInfo(`当前页：${response.data.pagination.page}`);
    logInfo(`每页数量：${response.data.pagination.limit}`);
    
    return true;
  } catch (error) {
    logError(`查询订单列表失败：${error.message}`);
    if (error.response) {
      logError('响应：' + JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

/**
 * 测试 3: 查询订单详情
 */
async function testGetOrderById() {
  logTest('测试 3: 查询订单详情');
  
  if (!createdOrderId) {
    logError('没有可用的订单 ID，跳过此测试');
    return false;
  }
  
  try {
    const response = await axios.get(`${BASE_URL}/orders/${createdOrderId}`);
    
    assert(response.status === 200, `状态码应该是 200，实际：${response.status}`);
    assert(response.data.success === true, '响应应该成功');
    assert(response.data.data._id === createdOrderId, '返回的订单 ID 应该匹配');
    assert(response.data.data.status, '订单应该包含状态');
    
    logInfo(`订单状态：${response.data.data.status}`);
    logInfo(`订单总价：${response.data.data.totalPrice}`);
    
    return true;
  } catch (error) {
    logError(`查询订单详情失败：${error.message}`);
    if (error.response) {
      logError('响应：' + JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

/**
 * 测试 4: 更新订单状态
 */
async function testUpdateOrderStatus() {
  logTest('测试 4: 更新订单状态');
  
  if (!createdOrderId) {
    logError('没有可用的订单 ID，跳过此测试');
    return false;
  }
  
  try {
    const updateData = {
      status: 'reviewing',
      reason: '开始审核',
      operator: 'test_user'
    };
    
    logInfo('更新数据：' + JSON.stringify(updateData, null, 2));
    
    const response = await axios.patch(
      `${BASE_URL}/orders/${createdOrderId}/status`,
      updateData
    );
    
    assert(response.status === 200, `状态码应该是 200，实际：${response.status}`);
    assert(response.data.success === true, '响应应该成功');
    assert(response.data.data.previousStatus, '应该返回之前的状态');
    assert(response.data.data.currentStatus === 'reviewing', '当前状态应该是 reviewing');
    
    logInfo(`状态变更：${response.data.data.previousStatusLabel} -> ${response.data.data.currentStatusLabel}`);
    
    return true;
  } catch (error) {
    logError(`更新订单状态失败：${error.message}`);
    if (error.response) {
      logError('响应：' + JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

/**
 * 测试 5: 触发订单处理（加入队列）
 */
async function testProcessOrder() {
  logTest('测试 5: 触发订单处理（加入队列）');
  
  if (!createdOrderId) {
    logError('没有可用的订单 ID，跳过此测试');
    return false;
  }
  
  try {
    const response = await axios.post(`${BASE_URL}/orders/${createdOrderId}/process`);
    
    assert(response.status === 200, `状态码应该是 200，实际：${response.status}`);
    assert(response.data.success === true, '响应应该成功');
    assert(response.data.data.jobId, '应该返回作业 ID');
    
    logInfo(`作业 ID: ${response.data.data.jobId}`);
    logInfo(`订单状态：${response.data.data.status}`);
    
    return true;
  } catch (error) {
    logError(`触发订单处理失败：${error.message}`);
    if (error.response) {
      logError('响应：' + JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

/**
 * 测试 6: 查询订单统计信息
 */
async function testGetOrderStats() {
  logTest('测试 6: 查询订单统计信息');
  
  try {
    const response = await axios.get(`${BASE_URL}/orders/stats`);
    
    assert(response.status === 200, `状态码应该是 200，实际：${response.status}`);
    assert(response.data.success === true, '响应应该成功');
    assert(response.data.data.totalOrders !== undefined, '应该返回订单总数');
    assert(response.data.data.byStatus, '应该返回按状态分类的统计');
    
    logInfo(`订单总数：${response.data.data.totalOrders}`);
    logInfo(`总收入：${response.data.data.totalRevenue}`);
    
    return true;
  } catch (error) {
    logError(`查询订单统计失败：${error.message}`);
    if (error.response) {
      logError('响应：' + JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

/**
 * 测试 7: 查询无效订单 ID（错误处理）
 */
async function testInvalidOrderId() {
  logTest('测试 7: 查询无效订单 ID（错误处理）');
  
  try {
    await axios.get(`${BASE_URL}/orders/invalid_id`);
    
    assert(false, '应该抛出错误');
    return false;
  } catch (error) {
    assert(error.response && error.response.status === 400, '应该返回 400 错误');
    assert(error.response.data.success === false, '响应应该标记为失败');
    
    logInfo(`错误消息：${error.response?.data?.error?.message}`);
    logInfo(`错误码：${error.response?.data?.error?.code}`);
    
    return true;
  }
}

/**
 * 测试 8: 取消订单
 */
async function testCancelOrder() {
  logTest('测试 8: 取消订单');
  
  if (!createdOrderId) {
    logError('没有可用的订单 ID，跳过此测试');
    return false;
  }
  
  try {
    const cancelData = {
      reason: '测试取消'
    };
    
    logInfo('取消数据：' + JSON.stringify(cancelData, null, 2));
    
    const response = await axios.delete(
      `${BASE_URL}/orders/${createdOrderId}`,
      { data: cancelData }
    );
    
    assert(response.status === 200, `状态码应该是 200，实际：${response.status}`);
    assert(response.data.success === true, '响应应该成功');
    assert(response.data.data.status === 'cancelled', '状态应该是 cancelled');
    
    logInfo(`订单已取消，原因：${response.data.data.reason}`);
    
    return true;
  } catch (error) {
    logError(`取消订单失败：${error.message}`);
    if (error.response) {
      logError('响应：' + JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

/**
 * 测试 9: 重复取消订单（错误处理）
 */
async function testDoubleCancel() {
  logTest('测试 9: 重复取消订单（错误处理）');
  
  if (!createdOrderId) {
    logError('没有可用的订单 ID，跳过此测试');
    return false;
  }
  
  try {
    await axios.delete(`${BASE_URL}/orders/${createdOrderId}`);
    
    assert(false, '应该抛出错误');
    return false;
  } catch (error) {
    assert(error.response && error.response.status === 400, '应该返回 400 错误');
    
    logInfo(`错误消息：${error.response?.data?.error?.message}`);
    
    return true;
  }
}

/**
 * 主测试流程
 */
async function runTests() {
  log('\n🚀 开始订单管理 API 测试', 'cyan');
  log('═'.repeat(50), 'cyan');
  logInfo(`API 地址：${BASE_URL}`);
  logInfo(`测试用户 ID: ${TEST_USER_ID}`);
  
  try {
    // 运行所有测试
    await testCreateOrder();
    await testGetOrders();
    await testGetOrderById();
    await testUpdateOrderStatus();
    await testProcessOrder();
    await testGetOrderStats();
    await testInvalidOrderId();
    await testCancelOrder();
    await testDoubleCancel();
    
    // 输出测试结果
    log('\n' + '═'.repeat(50), 'cyan');
    log('📊 测试结果', 'cyan');
    log('─'.repeat(50), 'cyan');
    logSuccess(`通过：${testResults.passed}`);
    logError(`失败：${testResults.failed}`);
    logInfo(`总计：${testResults.total}`);
    
    if (testResults.failed === 0) {
      log('\n🎉 所有测试通过！', 'green');
      process.exit(0);
    } else {
      log('\n⚠️  部分测试失败', 'yellow');
      process.exit(1);
    }
  } catch (error) {
    logError(`测试执行失败：${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
runTests();
