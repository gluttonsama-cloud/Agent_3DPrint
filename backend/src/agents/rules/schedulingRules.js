/**
 * 调度规则
 * 
 * 定义设备调度的优先级规则和约束条件
 * 用于在特殊情况下调整设备分配策略
 */

/**
 * 规则类型
 */
const RuleType = {
  PRIORITY: 'priority',         // 优先级规则
  CONSTRAINT: 'constraint',     // 约束规则
  OPTIMIZATION: 'optimization'  // 优化规则
};

/**
 * 优先级级别
 */
const PriorityLevel = {
  CRITICAL: 1,    // 紧急
  HIGH: 2,        // 高
  NORMAL: 3,      // 普通
  LOW: 4          // 低
};

/**
 * 调度规则基类
 */
class SchedulingRule {
  /**
   * 创建规则实例
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.type = config.type || RuleType.PRIORITY;
    this.enabled = config.enabled !== false;
    this.priority = config.priority || 0;
  }

  /**
   * 应用规则
   * @param {Object} context - 规则上下文
   * @returns {Promise<Object>} 规则应用结果
   */
  async apply(context) {
    throw new Error('子类必须实现 apply 方法');
  }

  /**
   * 检查规则是否适用
   * @param {Object} context - 规则上下文
   * @returns {boolean} 是否适用
   */
  isApplicable(context) {
    return this.enabled;
  }
}

/**
 * 紧急订单插队规则
 * 允许紧急订单优先分配设备
 */
class UrgentOrderRule extends SchedulingRule {
  constructor() {
    super({
      id: 'urgent_order',
      name: '紧急订单插队',
      description: '允许紧急订单优先分配设备',
      type: RuleType.PRIORITY,
      priority: 10
    });
  }

  async apply(context) {
    const { order, devices } = context;
    
    // 检查是否是紧急订单
    const isUrgent = order.priority === PriorityLevel.CRITICAL || 
                     order.metadata?.urgent === true ||
                     order.expedited === true;
    
    if (!isUrgent) {
      return {
        applicable: false,
        message: '非紧急订单'
      };
    }
    
    // 紧急订单：优先选择最快完成的设备
    return {
      applicable: true,
      message: '紧急订单，优先分配',
      adjustments: {
        strategy: 'fastest',
        weightAdjustments: {
          time: 0.5,  // 提高时间权重
          load: 0.2   // 降低负载权重
        }
      }
    };
  }
}

/**
 * 设备维护规则
 * 避免分配即将维护的设备
 */
class MaintenanceRule extends SchedulingRule {
  constructor() {
    super({
      id: 'maintenance',
      name: '设备维护规则',
      description: '避免分配即将维护的设备',
      type: RuleType.CONSTRAINT,
      priority: 9
    });
  }

  async apply(context) {
    const { devices } = context;
    
    const now = new Date();
    const maintenanceThreshold = 2 * 60 * 60 * 1000; // 2 小时
    
    const adjustedDevices = devices.map(device => {
      const scheduledMaintenance = device.scheduledMaintenance;
      
      if (!scheduledMaintenance) {
        return { device, penalty: 0 };
      }
      
      const maintenanceTime = new Date(scheduledMaintenance.startTime);
      const timeUntilMaintenance = maintenanceTime - now;
      
      // 如果维护即将开始，降低该设备的优先级
      if (timeUntilMaintenance < maintenanceThreshold && timeUntilMaintenance > 0) {
        return {
          device,
          penalty: 0.3, // 降低 30% 评分
          reason: '即将维护'
        };
      }
      
      // 如果维护期间有任务，降低评分
      if (timeUntilMaintenance <= 0 && !scheduledMaintenance.completed) {
        return {
          device,
          penalty: 0.8, // 降低 80% 评分
          reason: '维护中'
        };
      }
      
      return { device, penalty: 0 };
    });
    
    return {
      applicable: true,
      message: '应用维护规则',
      adjustedDevices
    };
  }
}

/**
 * 材料批量规则
 * 优先选择与当前任务相同材料的设备（减少换料时间）
 */
class MaterialBatchingRule extends SchedulingRule {
  constructor() {
    super({
      id: 'material_batching',
      name: '材料批量规则',
      description: '优先选择与当前任务相同材料的设备',
      type: RuleType.OPTIMIZATION,
      priority: 7
    });
  }

  async apply(context) {
    const { order, devices } = context;
    
    const requiredMaterial = order.material;
    
    if (!requiredMaterial) {
      return {
        applicable: false,
        message: '订单未指定材料'
      };
    }
    
    const adjustedDevices = devices.map(device => {
      const currentTask = device.currentTask;
      const currentMaterial = currentTask?.material;
      
      // 如果设备当前任务使用相同材料，给予奖励
      if (currentMaterial === requiredMaterial) {
        return {
          device,
          bonus: 0.2, // 提高 20% 评分
          reason: '相同材料，减少换料时间'
        };
      }
      
      // 如果设备支持该材料但未在使用，正常评分
      const supportedMaterials = device.specifications?.supportedMaterials || [];
      if (supportedMaterials.includes(requiredMaterial)) {
        return { device, bonus: 0 };
      }
      
      // 不支持该材料，排除
      return { device, penalty: 1 };
    });
    
    return {
      applicable: true,
      message: '应用材料批量规则',
      adjustedDevices
    };
  }
}

/**
 * 负载均衡规则
 * 避免某些设备过载而其他设备闲置
 */
class LoadBalancingRule extends SchedulingRule {
  constructor() {
    super({
      id: 'load_balancing',
      name: '负载均衡规则',
      description: '避免设备过载或闲置',
      type: RuleType.OPTIMIZATION,
      priority: 6
    });
  }

  async apply(context) {
    const { devices } = context;
    
    // 计算平均负载
    const loads = devices.map(d => d.capacity?.currentLoad || 0);
    const avgLoad = loads.reduce((sum, load) => sum + load, 0) / loads.length;
    
    const adjustedDevices = devices.map(device => {
      const currentLoad = device.capacity?.currentLoad || 0;
      
      // 如果设备负载远高于平均，降低评分
      if (currentLoad > avgLoad + 30) {
        return {
          device,
          penalty: 0.3,
          reason: '负载过高'
        };
      }
      
      // 如果设备负载远低于平均，提高评分
      if (currentLoad < avgLoad - 30) {
        return {
          device,
          bonus: 0.2,
          reason: '负载较低'
        };
      }
      
      return { device, penalty: 0 };
    });
    
    return {
      applicable: true,
      message: `应用负载均衡规则（平均负载：${avgLoad.toFixed(1)}%）`,
      adjustedDevices
    };
  }
}

/**
 * 设备类型偏好规则
 * 某些订单类型偏好特定设备类型
 */
class DeviceTypePreferenceRule extends SchedulingRule {
  constructor() {
    super({
      id: 'device_type_preference',
      name: '设备类型偏好',
      description: '根据订单类型偏好特定设备',
      type: RuleType.PRIORITY,
      priority: 5
    });
    
    // 订单类型到设备类型的映射
    this.orderTypeToDeviceMap = {
      'high_detail': ['sla'],      // 高细节：优先 SLA
      'large_size': ['sls', 'mjf'], // 大尺寸：优先 SLS/MJF
      'prototype': ['fdm'],         // 原型：优先 FDM
      'production': ['mjf', 'sls']  // 生产：优先 MJF/SLS
    };
  }

  async apply(context) {
    const { order, devices } = context;
    
    const orderType = order.metadata?.orderType || order.type;
    
    if (!orderType) {
      return {
        applicable: false,
        message: '订单未指定类型'
      };
    }
    
    const preferredTypes = this.orderTypeToDeviceMap[orderType];
    
    if (!preferredTypes) {
      return {
        applicable: false,
        message: `未知订单类型：${orderType}`
      };
    }
    
    const adjustedDevices = devices.map(device => {
      if (preferredTypes.includes(device.type)) {
        return {
          device,
          bonus: 0.15,
          reason: `偏好设备类型：${device.type.toUpperCase()}`
        };
      }
      
      return { device, penalty: 0 };
    });
    
    return {
      applicable: true,
      message: `应用设备类型偏好规则（类型：${orderType}）`,
      adjustedDevices
    };
  }
}

/**
 * 调度规则管理器
 */
class SchedulingRuleManager {
  constructor() {
    this.rules = [];
    this.initializeDefaultRules();
  }

  /**
   * 初始化默认规则
   */
  initializeDefaultRules() {
    this.rules = [
      new UrgentOrderRule(),
      new MaintenanceRule(),
      new MaterialBatchingRule(),
      new LoadBalancingRule(),
      new DeviceTypePreferenceRule()
    ];
    
    // 按优先级排序
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 注册自定义规则
   * @param {SchedulingRule} rule - 规则实例
   */
  registerRule(rule) {
    if (!(rule instanceof SchedulingRule)) {
      throw new Error('必须是 SchedulingRule 的实例');
    }
    
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
    
    console.log('[SchedulingRuleManager] 规则已注册:', rule.name);
  }

  /**
   * 应用所有适用规则
   * @param {Object} context - 规则上下文
   * @returns {Promise<Object>} 规则应用结果
   */
  async applyAllRules(context) {
    const results = {
      appliedRules: [],
      adjustments: [],
      devicePenalties: new Map(),
      deviceBonuses: new Map()
    };
    
    for (const rule of this.rules) {
      // 检查规则是否适用
      if (!rule.isApplicable(context)) {
        continue;
      }
      
      try {
        const result = await rule.apply(context);
        
        if (result.applicable) {
          results.appliedRules.push({
            ruleId: rule.id,
            ruleName: rule.name,
            message: result.message
          });
          
          // 处理设备调整
          if (result.adjustedDevices) {
            result.adjustedDevices.forEach(({ device, penalty, bonus, reason }) => {
              if (penalty) {
                const current = results.devicePenalties.get(device._id.toString()) || 0;
                results.devicePenalties.set(device._id.toString(), current + penalty);
                results.adjustments.push({
                  deviceId: device._id,
                  type: 'penalty',
                  value: penalty,
                  reason,
                  rule: rule.name
                });
              }
              
              if (bonus) {
                const current = results.deviceBonuses.get(device._id.toString()) || 0;
                results.deviceBonuses.set(device._id.toString(), current + bonus);
                results.adjustments.push({
                  deviceId: device._id,
                  type: 'bonus',
                  value: bonus,
                  reason,
                  rule: rule.name
                });
              }
            });
          }
          
          // 处理权重调整
          if (result.adjustments?.weightAdjustments) {
            results.weightAdjustments = {
              ...results.weightAdjustments,
              ...result.adjustments.weightAdjustments
            };
          }
          
          // 处理策略调整
          if (result.adjustments?.strategy) {
            results.strategyOverride = result.adjustments.strategy;
          }
        }
      } catch (error) {
        console.error(`[SchedulingRuleManager] 规则 ${rule.name} 应用失败:`, error.message);
      }
    }
    
    // 转换 Map 为普通对象
    results.devicePenalties = Object.fromEntries(results.devicePenalties);
    results.deviceBonuses = Object.fromEntries(results.deviceBonuses);
    
    return results;
  }

  /**
   * 获取所有已注册规则
   * @returns {Array} 规则列表
   */
  getRules() {
    return this.rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      type: rule.type,
      priority: rule.priority,
      enabled: rule.enabled
    }));
  }

  /**
   * 启用/禁用规则
   * @param {string} ruleId - 规则 ID
   * @param {boolean} enabled - 是否启用
   */
  toggleRule(ruleId, enabled) {
    const rule = this.rules.find(r => r.id === ruleId);
    
    if (!rule) {
      throw new Error(`规则不存在：${ruleId}`);
    }
    
    rule.enabled = enabled;
    console.log(`[SchedulingRuleManager] 规则 ${rule.name} 已${enabled ? '启用' : '禁用'}`);
  }

  /**
   * 清除所有规则
   */
  clearRules() {
    this.rules = [];
    console.log('[SchedulingRuleManager] 所有规则已清除');
  }
}

module.exports = {
  SchedulingRule,
  UrgentOrderRule,
  MaintenanceRule,
  MaterialBatchingRule,
  LoadBalancingRule,
  DeviceTypePreferenceRule,
  SchedulingRuleManager,
  RuleType,
  PriorityLevel
};
