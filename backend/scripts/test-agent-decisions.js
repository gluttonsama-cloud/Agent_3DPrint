/**
 * Agent 决策 API 测试脚本
 * 
 * 测试所有 Agent 决策相关的 API 端点
 */

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_PREFIX = '/api/agent-decisions';

// 测试用例
const testCases = [
  {
    name: '1. 触发协调 Agent 审核订单',
    method: 'POST',
    endpoint: `${API_PREFIX}/coordinator/review`,
    body: {
      orderId: '507f1f77bcf86cd799439011'
    },
    expectSuccess: true
  },
  {
    name: '2. 触发调度 Agent 分配设备',
    method: 'POST',
    endpoint: `${API_PREFIX}/scheduler/allocate`,
    body: {
      orderId: '507f1f77bcf86cd799439011',
      strategy: 'optimal'
    },
    expectSuccess: true
  },
  {
    name: '3. 触发库存 Agent 检查库存',
    method: 'POST',
    endpoint: `${API_PREFIX}/inventory/check`,
    body: {
      materialId: '507f191e810c19729de860ea',
      requiredAmount: 500
    },
    expectSuccess: true
  },
  {
    name: '4. 通用接口：触发 Agent 决策（协调 Agent）',
    method: 'POST',
    endpoint: `${API_PREFIX}/decide`,
    body: {
      agentType: 'coordinator',
      action: 'review_order',
      data: {
        orderId: '507f1f77bcf86cd799439011'
      }
    },
    expectSuccess: true
  },
  {
    name: '5. 通用接口：触发 Agent 决策（调度 Agent）',
    method: 'POST',
    endpoint: `${API_PREFIX}/decide`,
    body: {
      agentType: 'scheduler',
      action: 'schedule_device',
      data: {
        orderId: '507f1f77bcf86cd799439011',
        strategy: 'fastest'
      }
    },
    expectSuccess: true
  },
  {
    name: '6. 通用接口：触发 Agent 决策（库存 Agent）',
    method: 'POST',
    endpoint: `${API_PREFIX}/decide`,
    body: {
      agentType: 'inventory',
      action: 'check_inventory',
      data: {
        materialId: '507f191e810c19729de860ea',
        requiredAmount: 1000
      }
    },
    expectSuccess: true
  },
  {
    name: '7. 查询订单的决策历史',
    method: 'GET',
    endpoint: `${API_PREFIX}/order/507f1f77bcf86cd799439011`,
    body: null,
    expectSuccess: true
  },
  {
    name: '8. 查询特定 Agent 的决策',
    method: 'GET',
    endpoint: `${API_PREFIX}/agent/coordinator_agent?limit=10`,
    body: null,
    expectSuccess: true
  },
  {
    name: '9. 获取低置信度决策',
    method: 'GET',
    endpoint: `${API_PREFIX}/low-confidence?threshold=0.5&limit=20`,
    body: null,
    expectSuccess: true
  },
  {
    name: '10. 获取决策统计信息',
    method: 'GET',
    endpoint: `${API_PREFIX}/stats`,
    body: null,
    expectSuccess: true
  },
  {
    name: '11. 获取协调 Agent 状态',
    method: 'GET',
    endpoint: `${API_PREFIX}/coordinator/status`,
    body: null,
    expectSuccess: true
  },
  {
    name: '12. 验证错误：缺少必填字段',
    method: 'POST',
    endpoint: `${API_PREFIX}/decide`,
    body: {
      agentType: 'coordinator'
      // 缺少 action 和 data
    },
    expectSuccess: false
  },
  {
    name: '13. 验证错误：无效的 Agent 类型',
    method: 'POST',
    endpoint: `${API_PREFIX}/decide`,
    body: {
      agentType: 'invalid_agent',
      action: 'test',
      data: {}
    },
    expectSuccess: false
  },
  {
    name: '14. 验证错误：无效的订单 ID',
    method: 'GET',
    endpoint: `${API_PREFIX}/order/invalid_id`,
    body: null,
    expectSuccess: false
  }
];

// 发送 HTTP 请求
function makeRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
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
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            data: jsonData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// 运行单个测试
async function runTest(testCase) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试：${testCase.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`${testCase.method} ${testCase.endpoint}`);
  
  if (testCase.body) {
    console.log('请求体:', JSON.stringify(testCase.body, null, 2));
  }

  try {
    const startTime = Date.now();
    const response = await makeRequest(testCase.method, testCase.endpoint, testCase.body);
    const endTime = Date.now();
    
    console.log(`\n响应状态码：${response.statusCode}`);
    console.log(`响应时间：${endTime - startTime}ms`);
    console.log('响应数据:', JSON.stringify(response.data, null, 2));

    // 验证结果
    const success = testCase.expectSuccess ? response.data.success !== false : response.statusCode >= 400;
    
    if (success) {
      console.log('\n✅ 测试通过');
      return true;
    } else {
      console.log('\n❌ 测试失败：预期结果与实际不符');
      return false;
    }
  } catch (error) {
    console.error('\n❌ 请求失败:', error.message);
    return false;
  }
}

// 运行所有测试
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       Agent 决策 API 测试套件                           ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(`\n基础 URL: ${BASE_URL}`);
  console.log(`测试用例数量：${testCases.length}`);

  const results = [];
  
  for (const testCase of testCases) {
    const passed = await runTest(testCase);
    results.push({
      name: testCase.name,
      passed
    });
  }

  // 汇总结果
  console.log('\n\n' + '═'.repeat(60));
  console.log('测试结果汇总');
  console.log('═'.repeat(60));

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.length - passedCount;

  console.log(`\n总测试数：${results.length}`);
  console.log(`通过：${passedCount} ✅`);
  console.log(`失败：${failedCount} ❌`);
  console.log(`通过率：${((passedCount / results.length) * 100).toFixed(1)}%`);

  if (failedCount > 0) {
    console.log('\n失败的测试:');
    results
      .filter(r => !r.passed)
      .forEach((r, index) => {
        console.log(`  ${index + 1}. ${r.name}`);
      });
  }

  console.log('\n' + '═'.repeat(60));

  return failedCount === 0;
}

// 检查服务是否可用
async function checkServiceHealth() {
  try {
    const response = await makeRequest('GET', '/health');
    if (response.statusCode === 200) {
      console.log('✅ 服务健康检查通过');
      return true;
    } else {
      console.log('❌ 服务健康检查失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 无法连接到服务:', error.message);
    console.log('\n请确保服务已启动：');
    console.log('  cd backend');
    console.log('  npm run dev');
    return false;
  }
}

// 主函数
async function main() {
  console.log('开始检查服务状态...\n');
  
  const isHealthy = await checkServiceHealth();
  
  if (!isHealthy) {
    console.log('\n服务未就绪，退出测试。');
    process.exit(1);
  }

  // 运行测试
  const allPassed = await runAllTests();
  
  // 退出码
  process.exit(allPassed ? 0 : 1);
}

// 运行
main().catch((error) => {
  console.error('测试执行失败:', error);
  process.exit(1);
});
