/**
 * 设备分配算法
 * 
 * 实现智能设备分配的核心算法
 * 包含设备筛选、评分、排序等功能
 */

const Device = require('../../models/Device');
const {
  calculateDeviceScore,
  estimatePrintTime,
  calculateEstimatedCompletion
} = require('../../utils/loadCalculator');

/**
 * 分配策略类型
 */
const AllocationStrategy = {
  FASTEST: 'fastest',           // 最快完成
  LOWEST_COST: 'lowest_cost',   // 最低成本
  BEST_QUALITY: 'best_quality', // 最优质量
  BALANCED_LOAD: 'balanced_load', // 负载均衡
  OPTIMAL: 'optimal'            // 综合最优（默认）
};

/**
 * 设备分配算法类
 */
class DeviceAllocationAlgorithm {
  /**
   * 创建算法实例
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    // 评分权重配置
    this.weights = config.weights || {
      load: 0.3,
      time: 0.3,
      quality: 0.25,
      cost: 0.15
    };
    
    // 默认分配策略
    this.defaultStrategy = config.defaultStrategy || AllocationStrategy.OPTIMAL;
    
    // 设备筛选选项
    this.filterOptions = config.filterOptions || {
      excludeMaintenance: true,  // 排除维护中的设备
      excludeOffline: true,      // 排除离线设备
      requireMaterialSupport: true // 要求支持所需材料
    };
  }

  /**
   * 分配设备（主方法）
   * 
   * @param {Object} order - 订单对象
   * @param {Object} options - 分配选项
   * @returns {Promise<Object>} 分配结果
   */
  async allocate(order, options = {}) {
    const strategy = options.strategy || this.defaultStrategy;
    
    console.log('[DeviceAllocationAlgorithm] 开始设备分配:', {
      orderId: order._id,
      strategy,
      deviceType: order.deviceType,
      material: order.material
    });
    
    // 步骤 1: 获取所有可用设备
    const devices = await this.getAvailableDevices(order.deviceType);
    
    if (devices.length === 0) {
      return {
        success: false,
        error: '没有可用的设备',
        recommendations: [],
        alternatives: []
      };
    }
    
    // 步骤 2: 筛选兼容设备
    const compatibleDevices = this.filterCompatibleDevices(devices, order);
    
    if (compatibleDevices.length === 0) {
      return {
        success: false,
        error: '没有兼容的设备',
        recommendations: [],
        alternatives: []
      };
    }
    
    // 步骤 3: 计算每个设备的评分
    const scoredDevices = await this.scoreDevices(compatibleDevices, order);
    
    // 步骤 4: 根据策略排序
    const sortedDevices = this.sortByStrategy(scoredDevices, strategy, order);
    
    // 步骤 5: 生成推荐结果
    const result = this.generateRecommendation(sortedDevices, order, strategy);
    
    console.log('[DeviceAllocationAlgorithm] 设备分配完成:', {
      recommendedDevice: result.recommendations[0]?.device?.deviceId,
      totalScored: sortedDevices.length
    });
    
    return result;
  }

  /**
   * 获取可用设备
   * 
   * @param {string} deviceType - 设备类型
   * @returns {Promise<Array>} 设备列表
   */
  async getAvailableDevices(deviceType) {
    const query = {
      status: { 
        $in: ['idle', 'busy'],
        $nin: ['maintenance', 'offline']
      }
    };
    
    if (deviceType) {
      query.type = deviceType;
    }
    
    return await Device.find(query).sort({ 'capacity.currentLoad': 1 });
  }

  /**
   * 筛选兼容设备
   * 
   * @param {Array} devices - 设备列表
   * @param {Object} order - 订单对象
   * @returns {Array} 兼容设备列表
   */
  filterCompatibleDevices(devices, order) {
    return devices.filter(device => {
      if (this.filterOptions.excludeOffline && device.status === 'offline') {
        return false;
      }
      
      if (this.filterOptions.excludeMaintenance && device.status === 'maintenance') {
        return false;
      }
      
      if (this.filterOptions.requireMaterialSupport && order.material) {
        const supportedMaterials = device.specifications?.supportedMaterials || [];
        const materialLower = order.material.toLowerCase();
        if (!supportedMaterials.some(m => m.toLowerCase() === materialLower)) {
          return false;
        }
      }
      
      const currentLoad = device.capacity?.currentLoad || 0;
      if (currentLoad >= 100) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * 计算设备评分
   * 
   * @param {Array} devices - 设备列表
   * @param {Object} order - 订单对象
   * @returns {Promise<Array>} 评分后的设备列表
   */
  async scoreDevices(devices, order) {
    const scored = await Promise.all(
      devices.map(async device => {
        // 计算综合评分
        const scoreResult = calculateDeviceScore(device, order, this.weights);
        
        // 估算打印时间
        const estimatedTime = estimatePrintTime(device, order);
        
        // 计算预计完成时间
        const estimatedCompletion = calculateEstimatedCompletion(device, estimatedTime);
        
        // 估算成本
        const costPerHour = device.costPerHour || 100;
        const estimatedCost = (estimatedTime / 60) * costPerHour;
        
        return {
          device,
          ...scoreResult,
          estimates: {
            ...scoreResult.estimates,
            completionTime: estimatedCompletion
          }
        };
      })
    );
    
    return scored;
  }

  /**
   * 根据策略排序设备
   * 
   * @param {Array} scoredDevices - 评分后的设备列表
   * @param {string} strategy - 分配策略
   * @param {Object} order - 订单对象
   * @returns {Array} 排序后的设备列表
   */
  sortByStrategy(scoredDevices, strategy, order) {
    const sorted = [...scoredDevices];
    
    switch (strategy) {
      case AllocationStrategy.FASTEST:
        // 按预计完成时间排序（最早的在前）
        sorted.sort((a, b) => 
          a.estimates.completionTime - b.estimates.completionTime
        );
        break;
        
      case AllocationStrategy.LOWEST_COST:
        // 按成本排序（最低的在前）
        sorted.sort((a, b) => 
          a.estimates.cost - b.estimates.cost
        );
        break;
        
      case AllocationStrategy.BEST_QUALITY:
        // 按质量分数排序（最高的在前）
        sorted.sort((a, b) => 
          b.scores.quality - a.scores.quality
        );
        break;
        
      case AllocationStrategy.BALANCED_LOAD:
        // 按负载分数排序（最低的在前）
        sorted.sort((a, b) => 
          b.scores.load - a.scores.load
        );
        break;
        
      case AllocationStrategy.OPTIMAL:
      default:
        // 按综合评分排序（最高的在前）
        sorted.sort((a, b) => 
          b.totalScore - a.totalScore
        );
        break;
    }
    
    return sorted;
  }

  /**
   * 生成推荐结果
   * 
   * @param {Array} sortedDevices - 排序后的设备列表
   * @param {Object} order - 订单对象
   * @param {string} strategy - 分配策略
   * @returns {Object} 推荐结果
   */
  generateRecommendation(sortedDevices, order, strategy) {
    if (sortedDevices.length === 0) {
      return {
        success: false,
        error: '没有可用设备',
        recommendations: [],
        alternatives: [],
        strategy
      };
    }
    
    const best = sortedDevices[0];
    
    // 生成推荐设备
    const recommendation = {
      device: best.device,
      score: best.totalScore,
      scores: best.scores,
      estimatedStartTime: this.calculateStartTime(best.device),
      estimatedCompletionTime: best.estimates.completionTime,
      estimatedCost: best.estimates.cost,
      rationale: this.generateRationale(best, strategy)
    };
    
    // 生成备选设备（最多 3 个）
    const alternatives = sortedDevices.slice(1, 4).map(item => ({
      device: item.device,
      score: item.totalScore,
      estimatedCompletionTime: item.estimates.completionTime,
      estimatedCost: item.estimates.cost
    }));
    
    return {
      success: true,
      strategy,
      recommendations: [recommendation],
      alternatives,
      totalScored: sortedDevices.length,
      weights: this.weights
    };
  }

  /**
   * 计算设备预计开始时间
   * 
   * @param {Object} device - 设备对象
   * @returns {Date} 预计开始时间
   */
  calculateStartTime(device) {
    if (device.status === 'idle' || !device.currentTask?.estimatedCompletion) {
      return new Date(); // 立即开始
    }
    
    // 等待当前任务完成
    return new Date(device.currentTask.estimatedCompletion);
  }

  /**
   * 生成推荐原因
   * 
   * @param {Object} scoredDevice - 评分后的设备对象
   * @param {string} strategy - 分配策略
   * @returns {string} 推荐原因
   */
  generateRationale(scoredDevice, strategy) {
    const { device, scores, estimates } = scoredDevice;
    
    const reasons = [];
    
    // 根据策略生成主要原因
    switch (strategy) {
      case AllocationStrategy.FASTEST:
        reasons.push(`预计完成时间最早 (${this.formatTime(estimates.completionTime)})`);
        break;
        
      case AllocationStrategy.LOWEST_COST:
        reasons.push(`成本最低 (约${estimates.cost.toFixed(2)}元)`);
        break;
        
      case AllocationStrategy.BEST_QUALITY:
        reasons.push(`精度最高 (质量评分：${(scores.quality * 100).toFixed(0)}%)`);
        break;
        
      case AllocationStrategy.BALANCED_LOAD:
        reasons.push(`负载最低 (负载评分：${(scores.load * 100).toFixed(0)}%)`);
        break;
        
      case AllocationStrategy.OPTIMAL:
      default:
        reasons.push('综合评分最高');
        
        // 添加具体优势
        const bestScore = Math.max(scores.load, scores.time, scores.quality, scores.cost);
        if (bestScore === scores.load) {
          reasons.push('当前负载较低');
        } else if (bestScore === scores.time) {
          reasons.push('预计完成时间较早');
        } else if (bestScore === scores.quality) {
          reasons.push('设备精度高');
        } else if (bestScore === scores.cost) {
          reasons.push('运营成本较低');
        }
        break;
    }
    
    // 添加设备基本信息
    reasons.push(`设备类型：${device.type.toUpperCase()}`);
    reasons.push(`设备位置：${device.location || '未指定'}`);
    
    return reasons.join('；');
  }

  /**
   * 格式化时间
   * 
   * @param {Date} date - 日期对象
   * @returns {string} 格式化后的时间字符串
   */
  formatTime(date) {
    if (!date) return '未知';
    
    const d = new Date(date);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * 批量分配（为多个订单分配设备）
   * 
   * @param {Array} orders - 订单列表
   * @param {Object} options - 分配选项
   * @returns {Promise<Array>} 分配结果列表
   */
  async allocateBatch(orders, options = {}) {
    const results = [];
    
    for (const order of orders) {
      try {
        const result = await this.allocate(order, options);
        results.push({
          orderId: order._id,
          success: true,
          result
        });
      } catch (error) {
        results.push({
          orderId: order._id,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * 更新权重配置
   * 
   * @param {Object} newWeights - 新权重配置
   */
  updateWeights(newWeights) {
    this.weights = { ...this.weights, ...newWeights };
    console.log('[DeviceAllocationAlgorithm] 权重配置已更新:', this.weights);
  }

  /**
   * 更新筛选选项
   * 
   * @param {Object} newOptions - 新筛选选项
   */
  updateFilterOptions(newOptions) {
    this.filterOptions = { ...this.filterOptions, ...newOptions };
    console.log('[DeviceAllocationAlgorithm] 筛选选项已更新:', this.filterOptions);
  }
}

module.exports = {
  DeviceAllocationAlgorithm,
  AllocationStrategy
};
