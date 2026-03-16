/**
 * 材料管理 API 测试脚本
 * 
 * 测试所有材料管理相关的 API 端点
 * 使用方法：node scripts/test-material-api.js
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000/api';

// 测试颜色
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
 * 打印测试标题
 */
function printTitle(title) {
  console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);
}

/**
 * 打印测试用例
 */
function printTest(name) {
  total++;
  process.stdout.write(`${colors.blue}测试：${name}... ${colors.reset}`);
}

/**
 * 标记测试通过
 */
function pass(message = '✓') {
  passed++;
  console.log(`${colors.green}${message}${colors.reset}`);
}

/**
 * 标记测试失败
 */
function fail(error) {
  failed++;
  console.log(`${colors.red}✗${colors.reset}`);
  console.log(`${colors.red}  错误：${error.message}${colors.reset}`);
}

/**
 * 打印测试摘要
 */
function printSummary() {
  console.log(`\n${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.yellow}测试摘要${colors.reset}`);
  console.log(`${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`总测试数：${total}`);
  console.log(`${colors.green}通过：${passed}${colors.reset}`);
  console.log(`${colors.red}失败：${failed}${colors.reset}`);
  console.log(`成功率：${((passed / total) * 100).toFixed(2)}%`);
  console.log(`${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}\n`);
}

/**
 * 测试健康检查
 */
async function testHealthCheck() {
  printTitle('1. 健康检查测试');
  
  try {
    printTest('API 健康检查');
    const response = await axios.get(`${BASE_URL.replace('/api', '')}/health`);
    
    if (response.data.status === 'ok') {
      pass('✓ 服务器正常运行');
    } else {
      fail(new Error('健康检查返回异常状态'));
    }
  } catch (error) {
    fail(error);
  }
}

/**
 * 测试创建材料
 */
async function testCreateMaterial() {
  printTitle('2. 创建材料测试');
  
  const testMaterials = [
    {
      name: '标准树脂 - 白色',
      type: 'resin',
      stock: {
        quantity: 500,
        unit: 'g'
      },
      threshold: 100,
      costPerUnit: 0.5,
      properties: {
        color: '白色',
        density: 1.2,
        printTemperature: {
          min: 60,
          max: 80
        }
      },
      supplier: {
        name: '供应商 A',
        contactInfo: 'supplier-a@example.com',
        sku: 'RESIN-WHT-001'
      }
    },
    {
      name: '柔性树脂 - 黑色',
      type: 'resin',
      stock: {
        quantity: 50,
        unit: 'g'
      },
      threshold: 100,
      costPerUnit: 0.8,
      properties: {
        color: '黑色',
        density: 1.1
      }
    }
  ];

  for (const material of testMaterials) {
    try {
      printTest(`创建材料：${material.name}`);
      const response = await axios.post(`${BASE_URL}/materials`, material);
      
      if (response.data.success) {
        pass(`✓ 创建成功，ID: ${response.data.data._id}`);
        material._id = response.data.data._id; // 保存 ID 供后续测试使用
      } else {
        fail(new Error(response.data.error || '创建失败'));
      }
    } catch (error) {
      fail(error);
    }
  }

  return testMaterials;
}

/**
 * 测试查询材料列表
 */
async function testGetMaterials() {
  printTitle('3. 查询材料列表测试');
  
  try {
    printTest('获取所有材料');
    const response = await axios.get(`${BASE_URL}/materials`, {
      params: {
        page: 1,
        limit: 10
      }
    });
    
    if (response.data.success) {
      pass(`✓ 获取成功，共 ${response.data.data?.length || 0} 个材料`);
    } else {
      fail(new Error('查询失败'));
    }
  } catch (error) {
    fail(error);
  }

  try {
    printTest('按类型过滤（resin）');
    const response = await axios.get(`${BASE_URL}/materials`, {
      params: {
        type: 'resin'
      }
    });
    
    if (response.data.success) {
      pass(`✓ 过滤成功，共 ${response.data.data?.length || 0} 个树脂材料`);
    } else {
      fail(new Error('过滤失败'));
    }
  } catch (error) {
    fail(error);
  }

  try {
    printTest('查询低库存材料');
    const response = await axios.get(`${BASE_URL}/materials`, {
      params: {
        lowStock: 'true'
      }
    });
    
    if (response.data.success) {
      pass(`✓ 查询成功，共 ${response.data.data?.length || 0} 个低库存材料`);
    } else {
      fail(new Error('查询失败'));
    }
  } catch (error) {
    fail(error);
  }
}

/**
 * 测试查询材料详情
 */
async function testGetMaterialDetail(materialId) {
  printTitle('4. 查询材料详情测试');
  
  try {
    printTest(`获取材料详情：${materialId}`);
    const response = await axios.get(`${BASE_URL}/materials/${materialId}`);
    
    if (response.data.success) {
      const data = response.data.data;
      pass(`✓ 获取成功：${data.name}, 库存：${data.stock.quantity} ${data.stock.unit}`);
    } else {
      fail(new Error('查询失败'));
    }
  } catch (error) {
    fail(error);
  }
}

/**
 * 测试更新库存
 */
async function testUpdateStock(materialId) {
  printTitle('5. 更新库存测试');
  
  try {
    printTest('减少库存（订单消耗）');
    const response = await axios.patch(`${BASE_URL}/materials/${materialId}/stock`, {
      quantityChange: -30,
      reason: '订单消耗',
      orderId: 'order_test_001'
    });
    
    if (response.data.success) {
      pass(`✓ 更新成功：${response.data.message}`);
    } else {
      fail(new Error(response.data.error || '更新失败'));
    }
  } catch (error) {
    fail(error);
  }

  try {
    printTest('增加库存（补货入库）');
    const response = await axios.patch(`${BASE_URL}/materials/${materialId}/stock`, {
      quantityChange: 200,
      reason: '补货入库'
    });
    
    if (response.data.success) {
      pass(`✓ 更新成功：${response.data.message}`);
    } else {
      fail(new Error(response.data.error || '更新失败'));
    }
  } catch (error) {
    fail(error);
  }
}

/**
 * 测试低库存材料列表
 */
async function testGetLowStockMaterials() {
  printTitle('6. 低库存材料列表测试');
  
  try {
    printTest('获取低库存材料列表');
    const response = await axios.get(`${BASE_URL}/materials/low-stock`);
    
    if (response.data.success) {
      const data = response.data.data;
      pass(`✓ 获取成功，共 ${data?.length || 0} 个低库存材料`);
      
      if (data && data.length > 0) {
        console.log(`  严重不足：${response.data.meta?.critical || 0} 个`);
      }
    } else {
      fail(new Error('查询失败'));
    }
  } catch (error) {
    fail(error);
  }
}

/**
 * 测试补货建议
 */
async function testGetReorderSuggestions() {
  printTitle('7. 补货建议测试');
  
  try {
    printTest('获取补货建议');
    const response = await axios.get(`${BASE_URL}/materials/reorder-suggestions`);
    
    if (response.data.success) {
      const data = response.data.data;
      pass(`✓ 获取成功，共 ${data?.length || 0} 个补货建议`);
      console.log(`  总材料数：${response.data.meta?.totalMaterials || 0}`);
      console.log(`  需要补货：${response.data.meta?.needReorder || 0}`);
      
      if (data && data.length > 0) {
        console.log(`  建议列表:`);
        data.slice(0, 3).forEach(item => {
          console.log(`    - ${item.name}: ${item.currentStock} → ${item.suggestedAmount} ${item.unit} (优先级：${item.priority})`);
        });
      }
    } else {
      fail(new Error('查询失败'));
    }
  } catch (error) {
    fail(error);
  }
}

/**
 * 测试批量更新库存
 */
async function testBulkUpdateStock(materials) {
  printTitle('8. 批量更新库存测试');
  
  if (materials.length < 2) {
    console.log('跳过：没有足够的材料进行测试');
    return;
  }

  try {
    printTest('批量更新库存');
    const updates = [
      {
        materialId: materials[0]._id,
        quantityChange: -50,
        orderId: 'order_batch_001'
      },
      {
        materialId: materials[1]._id,
        quantityChange: 100
      }
    ];

    const response = await axios.post(`${BASE_URL}/materials/bulk-stock-update`, {
      updates
    });
    
    if (response.data.success) {
      pass(`✓ 批量更新成功`);
      console.log(`  成功：${response.data.data?.successCount || 0}, 失败：${response.data.data?.failCount || 0}`);
    } else {
      fail(new Error(response.data.error || '更新失败'));
    }
  } catch (error) {
    fail(error);
  }
}

/**
 * 测试材料充足性检查
 */
async function testCheckSufficiency(materialId) {
  printTitle('9. 材料充足性检查测试');
  
  try {
    printTest('检查材料是否充足（需求量小于库存）');
    const response = await axios.post(`${BASE_URL}/materials/${materialId}/check-sufficiency`, {
      requiredAmount: 100
    });
    
    if (response.data.success) {
      const data = response.data.data;
      const status = data.isSufficient ? '充足' : '不足';
      pass(`✓ 检查结果：${status}`);
      console.log(`  当前库存：${data.currentStock} ${data.unit}`);
      console.log(`  需求量：${data.requiredAmount} ${data.unit}`);
      console.log(`  使用后剩余：${data.remainingAfterUse} ${data.unit}`);
    } else {
      fail(new Error('检查失败'));
    }
  } catch (error) {
    fail(error);
  }

  try {
    printTest('检查材料是否充足（需求量大于库存）');
    const response = await axios.post(`${BASE_URL}/materials/${materialId}/check-sufficiency`, {
      requiredAmount: 10000
    });
    
    if (response.data.success) {
      const data = response.data.data;
      const status = data.isSufficient ? '充足' : '不足';
      pass(`✓ 检查结果：${status}`);
    } else {
      fail(new Error('检查失败'));
    }
  } catch (error) {
    fail(error);
  }
}

/**
 * 测试更新材料信息
 */
async function testUpdateMaterial(materialId) {
  printTitle('10. 更新材料信息测试');
  
  try {
    printTest('部分更新材料信息');
    const response = await axios.patch(`${BASE_URL}/materials/${materialId}`, {
      threshold: 150,
      costPerUnit: 0.55
    });
    
    if (response.data.success) {
      pass(`✓ 更新成功`);
      console.log(`  新阈值：${response.data.data.threshold}`);
      console.log(`  新成本：${response.data.data.costPerUnit}`);
    } else {
      fail(new Error('更新失败'));
    }
  } catch (error) {
    fail(error);
  }
}

/**
 * 主测试流程
 */
async function runTests() {
  console.log(`\n${colors.green}╔════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.green}║  材料管理 API 测试                                       ║${colors.reset}`);
  console.log(`${colors.green}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);
  
  console.log(`API 地址：${BASE_URL}`);
  console.log(`开始时间：${new Date().toLocaleString('zh-CN')}\n`);

  // 1. 健康检查
  await testHealthCheck();

  // 2. 创建材料
  const materials = await testCreateMaterial();

  // 等待材料创建完成
  await new Promise(resolve => setTimeout(resolve, 500));

  // 3. 查询材料列表
  await testGetMaterials();

  // 4. 查询材料详情（如果有创建的材料）
  if (materials.length > 0) {
    await testGetMaterialDetail(materials[0]._id);

    // 5. 更新库存
    await testUpdateStock(materials[0]._id);

    // 8. 批量更新库存
    await testBulkUpdateStock(materials);

    // 9. 材料充足性检查
    await testCheckSufficiency(materials[0]._id);

    // 10. 更新材料信息
    await testUpdateMaterial(materials[0]._id);
  }

  // 6. 低库存材料列表
  await testGetLowStockMaterials();

  // 7. 补货建议
  await testGetReorderSuggestions();

  // 打印摘要
  printSummary();

  // 退出代码
  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(error => {
  console.error(`${colors.red}测试执行失败：${error.message}${colors.reset}`);
  process.exit(1);
});
