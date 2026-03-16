/**
 * 数据看板 API 测试脚本
 * 
 * 测试所有数据看板 API 端点的功能
 * 包含模拟数据生成和接口验证
 */

const http = require('http');

// 配置
const BASE_URL = 'http://localhost:3000';
const BASE_PATH = '/api/dashboard';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * 发送 HTTP GET 请求
 * @param {string} path - 请求路径
 * @returns {Promise<Object>} 响应数据
 */
function getRequest(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    console.log(`\n${colors.cyan}→ GET ${url}${colors.reset}`);
    
    const req = http.get(url, (res) => {
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
          reject(new Error(`JSON 解析失败：${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    // 设置超时
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('请求超时（10 秒）'));
    });
  });
}

/**
 * 测试单个 API 端点
 * @param {string} name - 测试名称
 * @param {string} path - API 路径
 * @param {Function} validator - 验证函数
 */
async function testEndpoint(name, path, validator) {
  console.log(`\n${colors.blue}════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.yellow}测试：${name}${colors.reset}`);
  console.log(`${colors.blue}════════════════════════════════════════${colors.reset}`);
  
  try {
    const response = await getRequest(path);
    
    console.log(`${colors.green}✓ 状态码：${response.statusCode}${colors.reset}`);
    
    // 验证响应结构
    if (validator) {
      const isValid = validator(response.data);
      if (isValid) {
        console.log(`${colors.green}✓ 数据验证通过${colors.reset}`);
      } else {
        console.log(`${colors.red}✗ 数据验证失败${colors.reset}`);
      }
    }
    
    // 打印关键数据
    if (response.data.success) {
      console.log(`${colors.green}✓ 响应成功${colors.reset}`);
      printDataSummary(response.data.data);
    } else {
      console.log(`${colors.red}✗ 响应失败：${response.data.error || response.data.message}${colors.reset}`);
    }
    
    return { success: true, response };
  } catch (error) {
    console.log(`${colors.red}✗ 请求失败：${error.message}${colors.reset}`);
    return { success: false, error };
  }
}

/**
 * 打印数据摘要
 * @param {Object} data - 响应数据
 */
function printDataSummary(data) {
  if (!data) return;
  
  const entries = Object.entries(data);
  entries.slice(0, 6).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        console.log(`  ${colors.cyan}${key}${colors.reset}: 数组[${value.length}项]`);
      } else {
        console.log(`  ${colors.cyan}${key}${colors.reset}: 对象{${Object.keys(value).length}个属性}`);
      }
    } else {
      console.log(`  ${colors.cyan}${key}${colors.reset}: ${value}`);
    }
  });
  
  if (entries.length > 6) {
    console.log(`  ... 还有 ${entries.length - 6} 个属性`);
  }
}

/**
 * 验证函数工厂
 */
const validators = {
  // 验证概览数据
  overview: (data) => {
    const required = ['totalOrders', 'pendingOrders', 'printingOrders', 'completedToday', 'deviceUtilization', 'lowStockMaterials'];
    return required.every(key => key in data);
  },
  
  // 验证订单统计
  orderStats: (data) => {
    return 'total' in data && 'byStatus' in data && 'trend' in data;
  },
  
  // 验证设备利用率
  deviceUtilization: (data) => {
    return 'overall' in data && 'byDevice' in data && 'trend' in data;
  },
  
  // 验证库存趋势
  inventoryTrend: (data) => {
    return 'totalMaterials' in data && 'lowStockCount' in data && 'items' in data;
  },
  
  // 验证 Agent 性能
  agentPerformance: (data) => {
    return typeof data === 'object' && Object.keys(data).length > 0;
  },
  
  // 验证决策分析
  decisionAnalysis: (data) => {
    return 'byType' in data && 'confidenceDistribution' in data && 'lowConfidenceRate' in data;
  },
  
  // 验证导出报表
  exportReport: (data) => {
    return 'generatedAt' in data && 'period' in data && 'overview' in data;
  }
};

/**
 * 运行所有测试
 */
async function runTests() {
  console.log(`${colors.cyan}`);
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║          数据看板 API 测试套件                          ║');
  console.log('╚════════════════════════════════════════════════════════╝${colors.reset}');
  console.log(`\n${colors.yellow}基础 URL: ${BASE_URL}${colors.reset}`);
  console.log(`${colors.yellow}开始时间：${new Date().toLocaleString('zh-CN')}${colors.reset}`);
  
  const results = [];
  
  // 测试 1: 概览统计
  results.push(await testEndpoint(
    '概览统计',
    `${BASE_PATH}/overview`,
    validators.overview
  ));
  
  // 测试 2: 订单统计
  results.push(await testEndpoint(
    '订单统计（30 天）',
    `${BASE_PATH}/orders/stats?days=30`,
    validators.orderStats
  ));
  
  // 测试 3: 订单统计（7 天）
  results.push(await testEndpoint(
    '订单统计（7 天）',
    `${BASE_PATH}/orders/stats?days=7`,
    validators.orderStats
  ));
  
  // 测试 4: 设备利用率
  results.push(await testEndpoint(
    '设备利用率',
    `${BASE_PATH}/devices/utilization`,
    validators.deviceUtilization
  ));
  
  // 测试 5: 库存趋势（所有物料）
  results.push(await testEndpoint(
    '库存趋势（所有物料）',
    `${BASE_PATH}/inventory/trend?days=30`,
    validators.inventoryTrend
  ));
  
  // 测试 6: Agent 性能分析
  results.push(await testEndpoint(
    'Agent 性能分析',
    `${BASE_PATH}/agents/performance`,
    validators.agentPerformance
  ));
  
  // 测试 7: 决策分析
  results.push(await testEndpoint(
    '决策分析',
    `${BASE_PATH}/decisions/analysis`,
    validators.decisionAnalysis
  ));
  
  // 测试 8: 导出报表（JSON）
  results.push(await testEndpoint(
    '导出报表（JSON）',
    `${BASE_PATH}/export?format=json&days=30`,
    validators.exportReport
  ));
  
  // 测试 9: 导出报表（CSV）
  results.push(await testEndpoint(
    '导出报表（CSV）',
    `${BASE_PATH}/export?format=csv&days=7`,
    null // CSV 不验证 JSON 结构
  ));
  
  // 测试 10: 错误处理（无效格式）
  results.push(await testEndpoint(
    '错误处理（无效导出格式）',
    `${BASE_PATH}/export?format=xml`,
    null
  ));
  
  // 打印测试结果摘要
  printSummary(results);
}

/**
 * 打印测试摘要
 * @param {Array} results - 测试结果数组
 */
function printSummary(results) {
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const total = results.length;
  
  console.log(`\n${colors.blue}══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.blue}测试摘要${colors.reset}`);
  console.log(`${colors.blue}══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`总测试数：${total}`);
  console.log(`${colors.green}通过：${passed}${colors.reset}`);
  console.log(`${colors.red}失败：${failed}${colors.reset}`);
  console.log(`成功率：${((passed / total) * 100).toFixed(1)}%`);
  console.log(`\n${colors.yellow}结束时间：${new Date().toLocaleString('zh-CN')}${colors.reset}`);
  
  if (failed > 0) {
    console.log(`\n${colors.red}⚠ 有 ${failed} 个测试失败，请检查服务器状态或 API 实现${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}✓ 所有测试通过！${colors.reset}`);
    process.exit(0);
  }
}

/**
 * 检查服务器是否运行
 * @returns {Promise<boolean>} 服务器是否可访问
 */
async function checkServer() {
  try {
    await getRequest('/health');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log(`${colors.yellow}正在检查服务器状态...${colors.reset}`);
  
  const isRunning = await checkServer();
  
  if (!isRunning) {
    console.log(`${colors.red}✗ 服务器未运行或无法访问${colors.reset}`);
    console.log(`${colors.yellow}请先启动服务器：npm run dev${colors.reset}`);
    process.exit(1);
  }
  
  console.log(`${colors.green}✓ 服务器运行正常${colors.reset}`);
  
  // 运行所有测试
  await runTests();
}

// 运行主函数
main().catch(error => {
  console.error(`${colors.red}测试执行失败：${error.message}${colors.reset}`);
  process.exit(1);
});
