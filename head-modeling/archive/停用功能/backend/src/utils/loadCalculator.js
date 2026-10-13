/**
 * 负载计算工具
 * 
 * 提供设备负载、时间估算、成本计算等功能
 * 为调度 Agent 提供数据支持
 */

/**
 * 计算设备当前负载分数
 * 
 * @param {Object} device - 设备对象
 * @returns {number} 负载分数 (0-1)，越低表示负载越低
 */
function calculateLoadScore(device) {
  if (!device || !device.capacity) {
    return 1; // 无设备信息时返回最高负载
  }

  const { currentLoad = 0, maxLoad = 100 } = device.capacity;
  
  // 负载分数 = 1 - (当前负载 / 最大负载)
  // 负载越低分越高
  const loadScore = 1 - (currentLoad / maxLoad);
  
  // 确保在 0-1 范围内
  return Math.max(0, Math.min(1, loadScore));
}

/**
 * 计算设备时间分数
 * 
 * @param {number} estimatedTime - 预计耗时（分钟）
 * @param {number} maxTime - 最大可接受时间（分钟）
 * @returns {number} 时间分数 (0-1)，越短分越高
 */
function calculateTimeScore(estimatedTime, maxTime = 480) {
  if (!estimatedTime || estimatedTime <= 0) {
    return 1; // 无时间信息时返回最高分
  }
  
  // 时间分数 = 1 - (预计时间 / 最大时间)
  // 时间越短分越高
  const timeScore = 1 - (estimatedTime / maxTime);
  
  // 确保在 0-1 范围内
  return Math.max(0, Math.min(1, timeScore));
}

/**
 * 计算设备质量分数
 * 
 * @param {Object} device - 设备对象
 * @returns {number} 质量分数 (0-1)，基于设备精度
 */
function calculateQualityScore(device) {
  if (!device || !device.specifications) {
    return 0.5; // 无设备信息时返回平均分
  }
  
  // 从设备分辨率估算质量分数
  const resolution = device.specifications.resolution;
  
  if (!resolution) {
    // 如果没有分辨率信息，使用默认质量分数
    return device.resolutionScore || 0.5;
  }
  
  // 根据分辨率字符串估算分数
  // 例如：0.05mm = 1.0, 0.1mm = 0.8, 0.2mm = 0.6, 0.3mm = 0.4
  const resolutionValue = parseFloat(resolution);
  
  if (isNaN(resolutionValue)) {
    return 0.5;
  }
  
  // 分辨率值越小，分数越高
  // 假设 0.05mm 为最佳，0.5mm 为最差
  const qualityScore = 1 - ((resolutionValue - 0.05) / 0.45);
  
  return Math.max(0, Math.min(1, qualityScore));
}

/**
 * 计算设备成本分数
 * 
 * @param {number} costPerHour - 每小时成本
 * @param {number} maxCost - 最大可接受成本
 * @returns {number} 成本分数 (0-1)，越低分越高
 */
function calculateCostScore(costPerHour, maxCost = 500) {
  if (!costPerHour || costPerHour <= 0) {
    return 0.5; // 无成本信息时返回平均分
  }
  
  // 成本分数 = 1 - (每小时成本 / 最大成本)
  // 成本越低分越高
  const costScore = 1 - (costPerHour / maxCost);
  
  // 确保在 0-1 范围内
  return Math.max(0, Math.min(1, costScore));
}

/**
 * 估算打印时间
 * 
 * @param {Object} device - 设备对象
 * @param {Object} order - 订单对象
 * @returns {number} 预计时间（分钟）
 */
function estimatePrintTime(device, order) {
  if (!device || !order) {
    return 0;
  }
  
  // 基础打印时间（从订单元数据获取）
  const baseTime = order.metadata?.estimatedPrintTime || 60; // 默认 60 分钟
  
  // 根据设备类型调整时间
  const typeMultiplier = {
    sla: 1.2,  // SLA 通常较慢但精度高
    fdm: 1.0,  // FDM 标准速度
    sls: 1.5,  // SLS 较慢
    mjf: 0.8   // MJF 较快
  };
  
  const multiplier = typeMultiplier[device.type] || 1.0;
  
  // 根据设备规格调整
  const buildVolume = device.specifications?.buildVolume;
  if (buildVolume) {
    const volumeFactor = (buildVolume.x * buildVolume.y * buildVolume.z) / 1000000;
    // 体积越大，时间越长
    return baseTime * multiplier * Math.sqrt(volumeFactor);
  }
  
  return baseTime * multiplier;
}

/**
 * 估算打印成本
 * 
 * @param {Object} device - 设备对象
 * @param {number} printTime - 打印时间（分钟）
 * @returns {number} 预计成本
 */
function estimatePrintCost(device, printTime) {
  if (!device) {
    return 0;
  }
  
  // 设备每小时成本
  const costPerHour = device.costPerHour || 100; // 默认 100 元/小时
  
  // 材料成本
  const materialCost = device.materialCostPerGram || 1; // 默认 1 元/克
  const materialWeight = 50; // 假设 50 克
  
  // 总成本 = 时间成本 + 材料成本
  const timeCost = (printTime / 60) * costPerHour;
  const totalCost = timeCost + (materialWeight * materialCost);
  
  return totalCost;
}

/**
 * 计算设备综合评分
 * 
 * @param {Object} device - 设备对象
 * @param {Object} order - 订单对象
 * @param {Object} weights - 权重配置
 * @returns {Object} 评分详情
 */
function calculateDeviceScore(device, order, weights = {}) {
  // 默认权重
  const defaultWeights = {
    load: 0.3,      // 负载权重
    time: 0.3,      // 时间权重
    quality: 0.25,  // 质量权重
    cost: 0.15      // 成本权重
  };
  
  const { load, time, quality, cost } = { ...defaultWeights, ...weights };
  
  // 计算各项分数
  const loadScore = calculateLoadScore(device);
  const estimatedTime = estimatePrintTime(device, order);
  const timeScore = calculateTimeScore(estimatedTime);
  const qualityScore = calculateQualityScore(device);
  const estimatedCost = estimatePrintCost(device, estimatedTime);
  const costScore = calculateCostScore(device.costPerHour || 100);
  
  // 综合评分
  const totalScore = (load * loadScore) + 
                     (time * timeScore) + 
                     (quality * qualityScore) + 
                     (cost * costScore);
  
  return {
    totalScore,
    scores: {
      load: loadScore,
      time: timeScore,
      quality: qualityScore,
      cost: costScore
    },
    estimates: {
      time: estimatedTime,
      cost: estimatedCost
    },
    weights: {
      load,
      time,
      quality,
      cost
    }
  };
}

/**
 * 计算设备预计完成时间
 * 
 * @param {Object} device - 设备对象
 * @param {number} additionalTime - 额外需要的时间（分钟）
 * @returns {Date} 预计完成时间
 */
function calculateEstimatedCompletion(device, additionalTime = 0) {
  const now = new Date();
  
  // 如果设备当前有任务
  if (device.currentTask && device.currentTask.estimatedCompletion) {
    const currentCompletion = new Date(device.currentTask.estimatedCompletion);
    
    // 如果当前任务完成时间晚于现在
    if (currentCompletion > now) {
      // 在当前任务完成后加上额外时间
      return new Date(currentCompletion.getTime() + additionalTime * 60000);
    }
  }
  
  // 否则从现在开始计算
  return new Date(now.getTime() + additionalTime * 60000);
}

module.exports = {
  calculateLoadScore,
  calculateTimeScore,
  calculateQualityScore,
  calculateCostScore,
  estimatePrintTime,
  estimatePrintCost,
  calculateDeviceScore,
  calculateEstimatedCompletion
};
