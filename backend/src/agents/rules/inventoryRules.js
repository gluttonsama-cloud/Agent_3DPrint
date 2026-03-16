/**
 * 库存检查规则
 * 
 * 定义库存检查、补货判断、材料兼容性等规则
 */

/**
 * 库存状态枚举
 */
const InventoryStatus = {
  SUFFICIENT: 'sufficient',      // 库存充足
  LOW_STOCK: 'low_stock',        // 低库存
  CRITICAL: 'critical',          // 严重不足
  OUT_OF_STOCK: 'out_of_stock'   // 缺货
};

/**
 * 补货优先级枚举
 */
const ReorderPriority = {
  URGENT: 'urgent',      // 紧急
  HIGH: 'high',          // 高
  MEDIUM: 'medium',      // 中
  LOW: 'low'             // 低
};

/**
 * 库存规则管理器
 */
class InventoryRuleManager {
  constructor(config = {}) {
    this.config = {
      // 低库存阈值百分比（相对于阈值）
      lowStockThreshold: config.lowStockThreshold || 1.2,
      // 严重不足阈值百分比
      criticalThreshold: config.criticalThreshold || 0.5,
      // 默认交货周期（天）
      defaultLeadTimeDays: config.defaultLeadTimeDays || 7,
      // 默认安全系数
      defaultSafetyFactor: config.defaultSafetyFactor || 1.5
    };
  }

  /**
   * 检查库存状态
   * 
   * @param {Object} material - 材料对象
   * @param {number} requiredAmount - 需求量
   * @returns {Object} 检查结果
   */
  checkInventoryStatus(material, requiredAmount = 0) {
    const currentStock = material.stock.quantity;
    const threshold = material.threshold;
    
    // 考虑需求量后的可用库存
    const availableStock = currentStock - requiredAmount;
    
    let status = InventoryStatus.SUFFICIENT;
    let percentage = 100;
    
    if (threshold > 0) {
      percentage = (availableStock / threshold) * 100;
    }
    
    if (availableStock <= 0) {
      status = InventoryStatus.OUT_OF_STOCK;
    } else if (percentage < this.config.criticalThreshold * 100) {
      status = InventoryStatus.CRITICAL;
    } else if (percentage < this.config.lowStockThreshold * 100) {
      status = InventoryStatus.LOW_STOCK;
    }
    
    return {
      status,
      currentStock,
      availableStock,
      required: requiredAmount,
      threshold,
      percentage: percentage.toFixed(2),
      isBelowThreshold: availableStock <= threshold
    };
  }

  /**
   * 检查库存是否满足订单需求
   * 
   * @param {Object} material - 材料对象
   * @param {Object} order - 订单对象
   * @param {number} forecastConsumption - 预测消耗量
   * @returns {Object} 检查结果
   */
  checkOrderFulfillment(material, order, forecastConsumption = 0) {
    const currentStock = material.stock.quantity;
    
    // 计算订单所需材料量（简化，假设 order.weight 为克）
    const orderWeight = order.weight || 0;
    const supportRate = order.supportRate || 0.3;
    const wasteRate = order.wasteRate || 0.1;
    const requiredAmount = orderWeight * (1 + supportRate + wasteRate);
    
    // 检查当前库存是否满足订单
    const canFulfillOrder = currentStock >= requiredAmount;
    
    // 检查考虑预测后是否充足
    const totalRequired = requiredAmount + forecastConsumption;
    const isSufficient = currentStock >= totalRequired;
    
    return {
      canFulfillOrder,
      isSufficient,
      currentStock,
      requiredForOrder: requiredAmount,
      forecastConsumption,
      totalRequired,
      shortage: Math.max(0, totalRequired - currentStock),
      surplus: Math.max(0, currentStock - totalRequired)
    };
  }

  /**
   * 判断是否需要补货
   * 
   * @param {Object} material - 材料对象
   * @param {Object} forecast - 预测数据
   * @returns {Object} 补货判断结果
   */
  shouldReorder(material, forecast) {
    const currentStock = material.stock.quantity;
    const threshold = material.threshold;
    const predictedConsumption = forecast.predictedConsumption || 0;
    const averageDailyConsumption = forecast.averageDailyConsumption || 0;
    
    // 计算安全库存
    const safetyStock = averageDailyConsumption * 
                       this.config.defaultLeadTimeDays * 
                       this.config.defaultSafetyFactor;
    
    // 目标库存 = 预测消耗 + 安全库存
    const targetStock = predictedConsumption + safetyStock;
    
    // 判断是否需要补货
    const shouldReorder = currentStock < targetStock;
    
    // 计算建议补货量
    const reorderAmount = shouldReorder ? (targetStock - currentStock) : 0;
    
    // 判断优先级
    let priority = ReorderPriority.LOW;
    if (currentStock <= threshold * this.config.criticalThreshold) {
      priority = ReorderPriority.URGENT;
    } else if (currentStock <= threshold) {
      priority = ReorderPriority.HIGH;
    } else if (currentStock <= threshold * this.config.lowStockThreshold) {
      priority = ReorderPriority.MEDIUM;
    }
    
    return {
      shouldReorder,
      priority,
      currentStock,
      targetStock,
      reorderAmount: Math.max(0, reorderAmount),
      safetyStock,
      predictedConsumption,
      availableDays: averageDailyConsumption > 0 
        ? Math.floor(currentStock / averageDailyConsumption) 
        : Infinity
    };
  }

  /**
   * 检查材料兼容性
   * 
   * @param {Object} material - 材料对象
   * @param {Object} device - 设备对象
   * @returns {Object} 兼容性检查结果
   */
  checkMaterialCompatibility(material, device) {
    if (!device) {
      return {
        compatible: false,
        reason: '设备信息缺失'
      };
    }
    
    if (!material) {
      return {
        compatible: false,
        reason: '材料信息缺失'
      };
    }
    
    // 检查设备是否支持该材料类型
    const supportedMaterials = device.supportedMaterials || [];
    const isSupported = supportedMaterials.includes(material.type) || 
                       supportedMaterials.includes(material._id?.toString());
    
    // 检查材料库存是否充足
    const hasStock = material.stock.quantity > 0;
    
    // 检查打印温度是否在设备范围内
    let temperatureCompatible = true;
    if (material.properties?.printTemperature && device.specifications?.temperatureRange) {
      const matTemp = material.properties.printTemperature;
      const deviceTemp = device.specifications.temperatureRange;
      
      temperatureCompatible = 
        (!matTemp.max || matTemp.max <= deviceTemp.max) &&
        (!matTemp.min || matTemp.min >= deviceTemp.min);
    }
    
    return {
      compatible: isSupported && hasStock && temperatureCompatible,
      isSupported,
      hasStock,
      temperatureCompatible,
      material: {
        id: material._id,
        name: material.name,
        type: material.type
      },
      device: {
        id: device._id,
        deviceId: device.deviceId,
        type: device.type
      },
      issues: this._getCompatibilityIssues(isSupported, hasStock, temperatureCompatible)
    };
  }

  /**
   * 获取兼容性问题列表
   * 
   * @param {boolean} isSupported - 是否支持
   * @param {boolean} hasStock - 是否有库存
   * @param {boolean} temperatureCompatible - 温度是否兼容
   * @returns {Array} 问题列表
   */
  _getCompatibilityIssues(isSupported, hasStock, temperatureCompatible) {
    const issues = [];
    
    if (!isSupported) {
      issues.push('设备不支持该材料类型');
    }
    if (!hasStock) {
      issues.push('材料库存不足');
    }
    if (!temperatureCompatible) {
      issues.push('材料打印温度超出设备范围');
    }
    
    return issues;
  }

  /**
   * 获取替代材料建议
   * 
   * @param {Object} material - 原材料对象
   * @param {Array} availableMaterials - 可用材料列表
   * @returns {Array} 替代材料建议列表
   */
  getAlternativeMaterials(material, availableMaterials) {
    if (!availableMaterials || availableMaterials.length === 0) {
      return [];
    }
    
    const alternatives = [];
    
    availableMaterials.forEach(alt => {
      // 排除自身
      if (alt._id?.toString() === material._id?.toString()) {
        return;
      }
      
      // 检查类型是否相同
      const sameType = alt.type === material.type;
      
      // 检查颜色是否相同
      const sameColor = alt.properties?.color === material.properties?.color;
      
      // 检查库存是否充足
      const hasStock = alt.stock.quantity > 0;
      
      // 计算匹配度
      let matchScore = 0;
      if (sameType) matchScore += 50;
      if (sameColor) matchScore += 30;
      if (hasStock) matchScore += 20;
      
      // 密度相近（差异 10% 以内）
      if (material.properties?.density && alt.properties?.density) {
        const densityDiff = Math.abs(alt.properties.density - material.properties.density) / 
                           material.properties.density;
        if (densityDiff <= 0.1) {
          matchScore += 10;
        }
      }
      
      if (matchScore > 0) {
        alternatives.push({
          material: {
            id: alt._id,
            name: alt.name,
            type: alt.type,
            color: alt.properties?.color
          },
          matchScore,
          hasStock: alt.stock.quantity > 0,
          availableQuantity: alt.stock.quantity,
          unit: alt.stock.unit,
          reasons: this._getAlternativeReasons(sameType, sameColor, hasStock)
        });
      }
    });
    
    // 按匹配度排序
    return alternatives.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * 获取替代材料原因说明
   * 
   * @param {boolean} sameType - 类型相同
   * @param {boolean} sameColor - 颜色相同
   * @param {boolean} hasStock - 有库存
   * @returns {Array} 原因列表
   */
  _getAlternativeReasons(sameType, sameColor, hasStock) {
    const reasons = [];
    
    if (sameType) reasons.push('相同材料类型');
    if (sameColor) reasons.push('相同颜色');
    if (hasStock) reasons.push('有库存');
    
    return reasons;
  }

  /**
   * 计算补货优先级分数
   * 
   * @param {Object} material - 材料对象
   * @param {Object} forecast - 预测数据
   * @returns {number} 优先级分数（0-100）
   */
  calculateReorderPriorityScore(material, forecast) {
    const currentStock = material.stock.quantity;
    const threshold = material.threshold;
    const averageDailyConsumption = forecast.averageDailyConsumption || 0;
    
    let score = 0;
    
    // 基于库存水平（0-40 分）
    if (threshold > 0) {
      const stockRatio = currentStock / threshold;
      if (stockRatio <= 0.5) score += 40;
      else if (stockRatio <= 1) score += 20;
      else if (stockRatio <= 1.5) score += 10;
    }
    
    // 基于可用天数（0-30 分）
    if (averageDailyConsumption > 0) {
      const availableDays = currentStock / averageDailyConsumption;
      if (availableDays <= 3) score += 30;
      else if (availableDays <= 7) score += 20;
      else if (availableDays <= 14) score += 10;
    }
    
    // 基于消耗趋势（0-30 分）
    const trend = forecast.trend || 'stable';
    if (trend === 'increasing') score += 30;
    else if (trend === 'stable') score += 15;
    
    return Math.min(100, score);
  }

  /**
   * 获取配置
   * 
   * @returns {Object} 当前配置
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 更新配置
   * 
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

module.exports = {
  InventoryRuleManager,
  InventoryStatus,
  ReorderPriority
};
