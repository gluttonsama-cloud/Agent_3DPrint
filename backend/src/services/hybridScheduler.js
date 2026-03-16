/**
 * 混合调度器服务
 * 智能选择 3D 生成 API Provider
 * 
 * 策略：
 * 1. 优先使用腾讯混元 3D API（国产，便宜，快速）
 * 2. 混元失败时降级到 Replicate API（备用）
 * 3. 记录 Provider 使用情况，便于成本分析
 */

const hunyuanService = require('./hunyuan3d');
const taskStore = require('./taskStore');

/**
 * Provider 枚举
 */
const Provider = {
  HUNYUAN: 'hunyuan',
  REPLICATE: 'replicate'
};

/**
 * 错误码定义
 */
const ErrorCode = {
  RESOURCE_INSUFFICIENT: 'RESOURCE_INSUFFICIENT',
  TIMEOUT: 'TIMEOUT',
  API_ERROR: 'API_ERROR',
  UNKNOWN: 'UNKNOWN'
};

/**
 * 智能提交任务（带降级逻辑）
 * @param {string} taskId - 任务 ID
 * @param {string[]} imageUrls - 图片 URL 数组
 * @param {Object} options - 选项
 * @returns {Promise<Object>} 提交结果
 */
async function submitTask(taskId, imageUrls, options = {}) {
  const { mode = 'single' } = options;
  
  console.log(`🎯 混合调度器启动 - Task: ${taskId}, Mode: ${mode}`);
  
  // 更新任务状态
  taskStore.updateTask(taskId, {
    schedulerStatus: 'SUBMITTING',
    schedulerMessage: '正在提交到混元 3D API...',
    attemptCount: 0
  });

  // 尝试 1：混元 3D API
  try {
    console.log('📤 尝试 1：腾讯混元 3D API');
    
    taskStore.updateTask(taskId, {
      provider: Provider.HUNYUAN,
      attemptCount: 1
    });

    const isMultiView = mode === 'multiview' && imageUrls.length >= 4;
    
    const jobInfo = await hunyuanService.createTask(imageUrls, {
      multiView: isMultiView
    });

    console.log(`✅ 混元 3D 任务创建成功：${jobInfo.JobId}`);

    taskStore.updateTask(taskId, {
      providerJobId: jobInfo.JobId,
      schedulerStatus: 'SUBMITTED',
      schedulerMessage: '已提交到混元 3D API',
      submittedAt: new Date()
    });

    return {
      success: true,
      provider: Provider.HUNYUAN,
      jobId: jobInfo.JobId,
      requestId: jobInfo.RequestId
    };

  } catch (error) {
    console.error('❌ 混元 3D API 失败:', error.message);
    
    const errorCode = classifyError(error.message);
    
    taskStore.updateTask(taskId, {
      schedulerStatus: 'HUNYUAN_FAILED',
      schedulerMessage: `混元 3D 失败：${error.message}`,
      hunyuanError: {
        message: error.message,
        code: errorCode,
        timestamp: new Date()
      }
    });

    // 判断是否需要降级
    if (!shouldFallback(errorCode)) {
      console.log('⚠️  错误不可恢复，不降级');
      
      taskStore.updateTask(taskId, {
        schedulerStatus: 'FAILED',
        schedulerMessage: '混元 3D API 失败，且不满足降级条件'
      });

      return {
        success: false,
        provider: Provider.HUNYUAN,
        error: error.message,
        errorCode
      };
    }

    console.log('⬇️  尝试降级到 Replicate API...');
  }

  // 尝试 2：Replicate API（暂不实现，留待后续扩展）
  console.log('⚠️  Replicate API 暂未实现，无法降级');
  
  taskStore.updateTask(taskId, {
    schedulerStatus: 'FAILED',
    schedulerMessage: '混元 3D 失败，Replicate 未实现'
  });

  return {
    success: false,
    provider: null,
    error: '所有 3D 生成服务均失败',
    errorCode: ErrorCode.API_ERROR
  };
}

/**
 * 根据错误信息分类错误类型
 */
function classifyError(errorMessage) {
  const msg = errorMessage.toLowerCase();
  
  if (msg.includes('resource') || msg.includes('insufficient')) {
    return ErrorCode.RESOURCE_INSUFFICIENT;
  }
  
  if (msg.includes('timeout')) {
    return ErrorCode.TIMEOUT;
  }
  
  if (msg.includes('api') || msg.includes('network')) {
    return ErrorCode.API_ERROR;
  }
  
  return ErrorCode.UNKNOWN;
}

/**
 * 判断是否应该降级到备用 Provider
 */
function shouldFallback(errorCode) {
  // 资源不足 → 降级
  if (errorCode === ErrorCode.RESOURCE_INSUFFICIENT) {
    return true;
  }
  
  // API 临时故障 → 降级
  if (errorCode === ErrorCode.API_ERROR) {
    return true;
  }
  
  // 超时 → 降级
  if (errorCode === ErrorCode.TIMEOUT) {
    return true;
  }
  
  // 其他错误（如参数错误、认证失败）→ 不降级
  return false;
}

/**
 * 获取 Provider 统计信息
 */
function getProviderStats() {
  const allTasks = taskStore.getAllTasks();
  
  const stats = {
    total: allTasks.length,
    byProvider: {
      hunyuan: 0,
      replicate: 0,
      unknown: 0
    },
    fallbackCount: 0
  };

  allTasks.forEach(task => {
    // 统计 Provider 使用
    if (task.provider === Provider.HUNYUAN) {
      stats.byProvider.hunyuan++;
    } else if (task.provider === Provider.REPLICATE) {
      stats.byProvider.replicate++;
    } else {
      stats.byProvider.unknown++;
    }

    // 统计降级
    if (task.attemptCount > 1) {
      stats.fallbackCount++;
    }
  });

  return stats;
}

module.exports = {
  submitTask,
  getProviderStats,
  Provider,
  ErrorCode
};
