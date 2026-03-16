/**
 * API 测试脚本
 * 测试所有 API 端点的功能和响应格式
 * 
 * 使用方法：
 * 1. 确保后端服务运行：npm run dev
 * 2. 运行测试：node scripts/test-api.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// 测试结果统计
let passed = 0;
let failed = 0;
let total = 0;

/**
 * 发送 HTTP 请求
 */
function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: json
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: body
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * 测试断言
 */
function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ${colors.green}✓${colors.reset} ${message}`);
    return true;
  } else {
    failed++;
    console.log(`  ${colors.red}✗${colors.reset} ${message}`);
    return false;
  }
}

/**
 * 测试组
 */
async function testGroup(name, tests) {
  console.log(`\n${colors.cyan}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.blue}测试组：${name}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}`);
  
  for (const test of tests) {
    try {
      await test();
    } catch (error) {
      console.log(`  ${colors.red}✗${colors.reset} ${test.name || '匿名测试'}`);
      console.log(`    错误：${error.message}`);
      failed++;
      total++;
    }
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log(`${colors.yellow}开始 API 测试...${colors.reset}\n`);
  
  // 健康检查测试
  await testGroup('健康检查', [
    async function testHealthEndpoint() {
      const res = await request('GET', '/health');
      assert(res.statusCode === 200, '返回状态码 200');
      assert(res.data.success === true, '响应 success 为 true');
      assert(res.data.data.status === 'ok', '服务状态为 ok');
      assert(res.data.data.version === '2.0.0', '版本号正确');
      assert(typeof res.data.timestamp === 'string', '包含时间戳');
    }
  ]);
  
  // 订单 API 测试
  await testGroup('订单 API', [
    async function testCreateOrder() {
      const res = await request('POST', '/api/orders', {
        userId: '65e1234567890abcdef12345',
        items: [{
          deviceId: '65e1234567890abcdef12346',
          quantity: 1,
          unitPrice: 299.00
        }],
        totalPrice: 299.00
      });
      
      assert(res.statusCode === 201, '创建成功返回 201');
      assert(res.data.success === true, '响应 success 为 true');
      assert(res.data.data._id !== undefined, '返回订单 ID');
      assert(res.data.data.status === 'pending', '初始状态为 pending');
      
      return res.data.data._id;
    },
    
    async function testGetOrders() {
      const res = await request('GET', '/api/orders?page=1&limit=10');
      assert(res.statusCode === 200, '返回状态码 200');
      assert(res.data.success === true, '响应 success 为 true');
      assert(res.data.data.items !== undefined, '返回 items 数组');
      assert(res.data.data.pagination !== undefined, '返回分页信息');
    },
    
    async function testGetOrderById() {
      const createRes = await request('POST', '/api/orders', {
        userId: '65e1234567890abcdef12345',
        items: [{ deviceId: '65e1234567890abcdef12346', quantity: 1, unitPrice: 299 }],
        totalPrice: 299
      });
      const orderId = createRes.data.data._id;
      
      const res = await request('GET', `/api/orders/${orderId}`);
      assert(res.statusCode === 200, '返回状态码 200');
      assert(res.data.data._id === orderId, '返回正确的订单 ID');
    },
    
    async function testUpdateOrderStatus() {
      const createRes = await request('POST', '/api/orders', {
        userId: '65e1234567890abcdef12345',
        items: [{ deviceId: '65e1234567890abcdef12346', quantity: 1, unitPrice: 299 }],
        totalPrice: 299
      });
      const orderId = createRes.data.data._id;
      
      const res = await request('PATCH', `/api/orders/${orderId}/status`, {
        status: 'processing',
        reason: '测试状态变更'
      });
      
      assert(res.statusCode === 200, '返回状态码 200');
      assert(res.data.data.status === 'processing', '状态已更新为 processing');
    },
    
    async function testCancelOrder() {
      const createRes = await request('POST', '/api/orders', {
        userId: '65e1234567890abcdef12345',
        items: [{ deviceId: '65e1234567890abcdef12346', quantity: 1, unitPrice: 299 }],
        totalPrice: 299
      });
      const orderId = createRes.data.data._id;
      
      const res = await request('DELETE', `/api/orders/${orderId}`);
      assert(res.statusCode === 200, '返回状态码 200');
      assert(res.data.data.status === 'cancelled', '订单已取消');
    },
    
    async function testInvalidOrderId() {
      const res = await request('GET', '/api/orders/invalid-id');
      assert(res.statusCode === 400, '无效 ID 返回 400');
      assert(res.data.success === false, '响应 success 为 false');
    },
    
    async function testCreateOrderValidation() {
      const res = await request('POST', '/api/orders', {});
      assert(res.statusCode === 400, '缺少必填字段返回 400');
      assert(res.data.error.code === 'VALIDATION_ERROR', '返回验证错误码');
    }
  ]);
  
  // 设备 API 测试
  await testGroup('设备 API', [
    async function testGetDevices() {
      const res = await request('GET', '/api/devices?page=1&limit=10');
      assert(res.statusCode === 200, '返回状态码 200');
      assert(res.data.success === true, '响应 success 为 true');
      assert(res.data.data.items !== undefined, '返回 items 数组');
    },
    
    async function testCreateDevice() {
      const res = await request('POST', '/api/devices', {
        deviceId: `TEST-DEVICE-${Date.now()}`,
        type: 'sla',
        status: 'idle',
        capacity: { maxVolume: 100, currentLoad: 0 }
      });
      
      assert(res.statusCode === 201, '创建成功返回 201');
      assert(res.data.data.deviceId !== undefined, '返回设备 ID');
      
      return res.data.data._id;
    },
    
    async function testCreateDeviceValidation() {
      const res = await request('POST', '/api/devices', { type: 'sla' });
      assert(res.statusCode === 400, '缺少 deviceId 返回 400');
    }
  ]);
  
  // 材料 API 测试
  await testGroup('材料 API', [
    async function testGetMaterials() {
      const res = await request('GET', '/api/materials?page=1&limit=10');
      assert(res.statusCode === 200, '返回状态码 200');
      assert(res.data.success === true, '响应 success 为 true');
      assert(res.data.data.items !== undefined, '返回 items 数组');
    },
    
    async function testGetLowStockMaterials() {
      const res = await request('GET', '/api/materials/low-stock');
      assert(res.statusCode === 200, '返回状态码 200');
      assert(res.data.success === true, '响应 success 为 true');
      assert(Array.isArray(res.data.data), '返回数组');
    }
  ]);
  
  // Agent API 测试
  await testGroup('Agent API', [
    async function testGetAgentStatus() {
      const res = await request('GET', '/api/agents/status');
      assert(res.statusCode === 200, '返回状态码 200');
      assert(res.data.success === true, '响应 success 为 true');
      assert(res.data.data.totalDecisions !== undefined, '返回决策统计');
    },
    
    async function testCreateAgentDecision() {
      const orderRes = await request('POST', '/api/orders', {
        userId: '65e1234567890abcdef12345',
        items: [{ deviceId: '65e1234567890abcdef12346', quantity: 1, unitPrice: 299 }],
        totalPrice: 299
      });
      const orderId = orderRes.data.data._id;
      
      const res = await request('POST', '/api/agents/decide', {
        orderId,
        agentId: 'test-agent',
        decisionType: 'device_selection',
        decisionResult: '选择设备 A',
        rationale: '设备 A 性能更好',
        inputSnapshot: { availableDevices: ['A', 'B'] }
      });
      
      assert(res.statusCode === 201, '创建成功返回 201');
      assert(res.data.data.decisionType === 'device_selection', '决策类型正确');
    },
    
    async function testGetDecisionHistory() {
      const orderRes = await request('POST', '/api/orders', {
        userId: '65e1234567890abcdef12345',
        items: [{ deviceId: '65e1234567890abcdef12346', quantity: 1, unitPrice: 299 }],
        totalPrice: 299
      });
      const orderId = orderRes.data.data._id;
      
      const res = await request('GET', `/api/agents/decisions/${orderId}`);
      assert(res.statusCode === 200, '返回状态码 200');
      assert(Array.isArray(res.data.data), '返回决策数组');
    },
    
    async function testCreateDecisionValidation() {
      const res = await request('POST', '/api/agents/decide', {});
      assert(res.statusCode === 400, '缺少必填字段返回 400');
    }
  ]);
  
  // 错误处理测试
  await testGroup('错误处理', [
    async function test404() {
      const res = await request('GET', '/api/nonexistent');
      assert(res.statusCode === 404, '不存在路由返回 404');
      assert(res.data.success === false, '响应 success 为 false');
    },
    
    async function testInvalidMethod() {
      const res = await request('PUT', '/api/orders');
      assert(res.statusCode === 404 || res.statusCode === 405, '无效方法返回错误');
    }
  ]);
  
  // 统一响应格式测试
  await testGroup('统一响应格式', [
    async function testSuccessResponseFormat() {
      const res = await request('GET', '/health');
      assert(res.data.hasOwnProperty('success'), '包含 success 字段');
      assert(res.data.hasOwnProperty('data'), '包含 data 字段');
      assert(res.data.hasOwnProperty('message'), '包含 message 字段');
      assert(res.data.hasOwnProperty('timestamp'), '包含 timestamp 字段');
    },
    
    async function testErrorResponseFormat() {
      const res = await request('GET', '/api/orders/invalid');
      assert(res.data.hasOwnProperty('success'), '包含 success 字段');
      assert(res.data.hasOwnProperty('error'), '包含 error 字段');
      assert(res.data.error.hasOwnProperty('code'), '错误包含 code 字段');
      assert(res.data.error.hasOwnProperty('message'), '错误包含 message 字段');
    }
  ]);
  
  // 打印测试结果
  console.log(`\n${colors.cyan}${'='.repeat(50)}${colors.reset}`);
  console.log(`${colors.blue}测试结果${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(50)}${colors.reset}`);
  
  console.log(`\n总计：${total} 个测试`);
  console.log(`${colors.green}通过：${passed}${colors.reset}`);
  console.log(`${colors.red}失败：${failed}${colors.reset}`);
  console.log(`成功率：${((passed / total) * 100).toFixed(1)}%\n`);
  
  if (failed > 0) {
    console.log(`${colors.red}部分测试失败，请检查上述错误信息${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.green}所有测试通过！✓${colors.reset}\n`);
    process.exit(0);
  }
}

// 运行测试
runTests().catch(error => {
  console.error(`${colors.red}测试执行失败：${error.message}${colors.reset}`);
  console.error(error.stack);
  process.exit(1);
});
