/**
 * 设备管理 API 测试脚本
 * 
 * 测试所有设备管理相关 API 端点
 * 包括：创建、查询、更新、删除、任务分配等
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';

// 测试数据
const testDevices = [
  {
    deviceId: 'PRINTER-001',
    type: 'sla',
    location: 'Lab A',
    capacity: { maxVolume: 100, currentLoad: 0 },
    specifications: {
      buildVolume: { x: 200, y: 200, z: 250 },
      resolution: '0.05mm',
      supportedMaterials: ['resin-standard', 'resin-tough']
    }
  },
  {
    deviceId: 'PRINTER-002',
    type: 'fdm',
    location: 'Lab B',
    capacity: { maxVolume: 80, currentLoad: 50 },
    specifications: {
      buildVolume: { x: 300, y: 300, z: 400 },
      resolution: '0.1mm',
      supportedMaterials: ['pla', 'abs', 'petg']
    }
  },
  {
    deviceId: 'PRINTER-003',
    type: 'sls',
    location: 'Lab C',
    status: 'maintenance',
    capacity: { maxVolume: 90, currentLoad: 0 }
  }
];

// 颜色输出辅助函数
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`测试：${name}`, 'cyan');
  log('='.repeat(60), 'cyan');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

// 测试主函数
async function runTests() {
  log('\n🚀 开始设备管理 API 测试', 'cyan');
  logInfo(`API 地址：${BASE_URL}`);

  let createdDeviceIds = [];
  let testPassed = 0;
  let testFailed = 0;

  try {
    // ========== 测试 1: 创建设备 ==========
    logTest('1. 创建设备');
    
    for (const deviceData of testDevices) {
      try {
        logInfo(`创建设备：${deviceData.deviceId}`);
        const response = await axios.post(`${BASE_URL}/devices`, deviceData);
        
        if (response.data && response.data.data) {
          logSuccess(`设备创建成功：${response.data.data.deviceId}`);
          logInfo(`状态：${response.data.data.status}`);
          createdDeviceIds.push(response.data.data._id);
          testPassed++;
        } else {
          logError('响应格式不正确');
          testFailed++;
        }
      } catch (error) {
        if (error.response && error.response.status === 409) {
          logInfo(`设备已存在：${deviceData.deviceId}`);
          // 查询现有设备 ID
          const queryResponse = await axios.get(`${BASE_URL}/devices`, {
            params: { deviceId: deviceData.deviceId }
          });
          if (queryResponse.data.data && queryResponse.data.data.length > 0) {
            createdDeviceIds.push(queryResponse.data.data[0]._id);
            logSuccess(`使用现有设备 ID: ${queryResponse.data.data[0].deviceId}`);
            testPassed++;
          }
        } else {
          logError(`创建失败：${error.message}`);
          if (error.response) {
            logError(`状态码：${error.response.status}`);
            logError(`响应：${JSON.stringify(error.response.data)}`);
          }
          testFailed++;
        }
      }
    }

    // ========== 测试 2: 查询设备列表 ==========
    logTest('2. 查询设备列表');
    
    try {
      const response = await axios.get(`${BASE_URL}/devices`, {
        params: { page: 1, limit: 10 }
      });
      
      if (response.data && response.data.data) {
        logSuccess(`获取设备列表成功`);
        logInfo(`设备数量：${response.data.data.length}`);
        logInfo(`总数：${response.data.pagination?.total || 'N/A'}`);
        testPassed++;
      } else {
        logError('响应格式不正确');
        testFailed++;
      }
    } catch (error) {
      logError(`查询失败：${error.message}`);
      testFailed++;
    }

    // ========== 测试 3: 按状态筛选设备 ==========
    logTest('3. 按状态筛选设备');
    
    try {
      const response = await axios.get(`${BASE_URL}/devices`, {
        params: { status: 'idle' }
      });
      
      logSuccess(`按状态筛选成功`);
      logInfo(`空闲设备数量：${response.data.data.length}`);
      testPassed++;
    } catch (error) {
      logError(`筛选失败：${error.message}`);
      testFailed++;
    }

    // ========== 测试 4: 按类型筛选设备 ==========
    logTest('4. 按类型筛选设备');
    
    try {
      const response = await axios.get(`${BASE_URL}/devices`, {
        params: { type: 'sla' }
      });
      
      logSuccess(`按类型筛选成功`);
      logInfo(`SLA 设备数量：${response.data.data.length}`);
      testPassed++;
    } catch (error) {
      logError(`筛选失败：${error.message}`);
      testFailed++;
    }

    // ========== 测试 5: 获取可用设备 ==========
    logTest('5. 获取可用设备');
    
    try {
      const response = await axios.get(`${BASE_URL}/devices/available`);
      
      logSuccess(`获取可用设备成功`);
      logInfo(`可用设备数量：${response.data.data.length}`);
      testPassed++;
    } catch (error) {
      logError(`获取失败：${error.message}`);
      testFailed++;
    }

    // ========== 测试 6: 获取设备详情 ==========
    logTest('6. 获取设备详情');
    
    if (createdDeviceIds.length > 0) {
      try {
        const response = await axios.get(`${BASE_URL}/devices/${createdDeviceIds[0]}`);
        
        if (response.data && response.data.data) {
          logSuccess(`获取设备详情成功`);
          logInfo(`设备 ID: ${response.data.data.deviceId}`);
          logInfo(`类型：${response.data.data.type}`);
          logInfo(`状态：${response.data.data.status}`);
          testPassed++;
        } else {
          logError('响应格式不正确');
          testFailed++;
        }
      } catch (error) {
        logError(`获取详情失败：${error.message}`);
        testFailed++;
      }
    } else {
      logInfo('跳过：没有可用的设备 ID');
    }

    // ========== 测试 7: 更新设备状态 ==========
    logTest('7. 更新设备状态');
    
    if (createdDeviceIds.length > 0) {
      try {
        const response = await axios.patch(`${BASE_URL}/devices/${createdDeviceIds[0]}`, {
          status: 'busy',
          currentTask: {
            orderId: '507f1f77bcf86cd799439011',
            startedAt: new Date().toISOString(),
            estimatedCompletion: new Date(Date.now() + 3600000).toISOString()
          }
        });
        
        if (response.data && response.data.data) {
          logSuccess(`更新设备状态成功`);
          logInfo(`新状态：${response.data.data.status}`);
          testPassed++;
        } else {
          logError('响应格式不正确');
          testFailed++;
        }
      } catch (error) {
        logError(`更新失败：${error.message}`);
        testFailed++;
      }
    } else {
      logInfo('跳过：没有可用的设备 ID');
    }

    // ========== 测试 8: 使用专用端点更新状态 ==========
    logTest('8. 使用专用端点更新状态 (PUT /:id/status)');
    
    if (createdDeviceIds.length > 1) {
      try {
        const response = await axios.put(`${BASE_URL}/devices/${createdDeviceIds[1]}/status`, {
          status: 'maintenance'
        });
        
        if (response.data && response.data.data) {
          logSuccess(`使用专用端点更新状态成功`);
          logInfo(`新状态：${response.data.data.status}`);
          testPassed++;
        } else {
          logError('响应格式不正确');
          testFailed++;
        }
      } catch (error) {
        logError(`更新失败：${error.message}`);
        testFailed++;
      }
    } else {
      logInfo('跳过：没有足够的设备 ID');
    }

    // ========== 测试 9: 获取更新后的设备列表 ==========
    logTest('9. 验证状态更新');
    
    try {
      const response = await axios.get(`${BASE_URL}/devices`, {
        params: { status: 'busy' }
      });
      
      logSuccess(`查询繁忙设备成功`);
      logInfo(`繁忙设备数量：${response.data.data.length}`);
      testPassed++;
    } catch (error) {
      logError(`查询失败：${error.message}`);
      testFailed++;
    }

    // ========== 测试 10: 尝试删除正在运行任务的设备（应该失败） ==========
    logTest('10. 尝试删除繁忙设备（应失败）');
    
    if (createdDeviceIds.length > 0) {
      try {
        await axios.delete(`${BASE_URL}/devices/${createdDeviceIds[0]}`);
        logError('应该失败但没有失败');
        testFailed++;
      } catch (error) {
        if (error.response && error.response.status === 400) {
          logSuccess('正确拒绝了删除繁忙设备的请求');
          logInfo(`错误信息：${error.response.data.message}`);
          testPassed++;
        } else {
          logError(`错误类型不符合预期：${error.message}`);
          testFailed++;
        }
      }
    } else {
      logInfo('跳过：没有可用的设备 ID');
    }

    // ========== 测试 11: 删除空闲设备 ==========
    logTest('11. 删除空闲设备');
    
    // 先更新一个设备为空闲状态
    if (createdDeviceIds.length > 1) {
      try {
        // 先将设备设置为空闲
        await axios.patch(`${BASE_URL}/devices/${createdDeviceIds[1]}`, {
          status: 'idle',
          currentTask: null
        });
        
        // 然后删除
        const deleteResponse = await axios.delete(`${BASE_URL}/devices/${createdDeviceIds[1]}`);
        
        if (deleteResponse.data && deleteResponse.data.message) {
          logSuccess(`删除设备成功`);
          logInfo(`消息：${deleteResponse.data.message}`);
          createdDeviceIds.splice(1, 1); // 从列表中移除
          testPassed++;
        }
      } catch (error) {
        logError(`删除失败：${error.message}`);
        if (error.response) {
          logError(`状态码：${error.response.status}`);
          logError(`响应：${JSON.stringify(error.response.data)}`);
        }
        testFailed++;
      }
    } else {
      logInfo('跳过：没有足够的设备 ID');
    }

    // ========== 测试总结 ==========
    log('\n' + '='.repeat(60), 'cyan');
    log('测试总结', 'cyan');
    log('='.repeat(60), 'cyan');
    logSuccess(`通过：${testPassed}`);
    logError(`失败：${testFailed}`);
    log(`总计：${testPassed + testFailed}`);
    log('='.repeat(60), 'cyan');

    if (testFailed === 0) {
      log('\n🎉 所有测试通过！', 'green');
    } else {
      log(`\n⚠️  有 ${testFailed} 个测试失败，请检查错误信息`, 'yellow');
    }

  } catch (error) {
    log('\n💥 测试执行过程中发生严重错误', 'red');
    logError(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    // 清理：删除创建的测试设备
    if (createdDeviceIds.length > 0) {
      log('\n🧹 清理测试数据...', 'cyan');
      for (const deviceId of createdDeviceIds) {
        try {
          // 先将设备设置为空闲状态
          await axios.patch(`${BASE_URL}/devices/${deviceId}`, {
            status: 'idle',
            currentTask: null
          });
          
          // 然后删除
          await axios.delete(`${BASE_URL}/devices/${deviceId}`);
          logSuccess(`已删除测试设备：${deviceId}`);
        } catch (error) {
          logError(`删除设备失败 ${deviceId}: ${error.message}`);
        }
      }
    }
  }
}

// 运行测试
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, testDevices };
