/**
 * 订单决策规则定义
 * 
 * 定义协调 Agent 使用的决策规则
 * 包含照片质量检查、库存检查、标准订单评估等规则
 * 每个规则包含：优先级、条件、动作、置信度、解释
 */

/**
 * 决策结果枚举
 */
const DecisionResult = {
  AUTO_APPROVE: 'auto_approve',     // 自动通过
  MANUAL_REVIEW: 'manual_review',   // 转人工审核
  REJECT: 'reject'                  // 拒绝
};

/**
 * 规则优先级（数字越小优先级越高）
 */
const RulePriority = {
  CRITICAL: 1,      // 关键规则（必须满足）
  HIGH: 2,          // 高优先级规则
  MEDIUM: 3,        // 中等优先级规则
  LOW: 4            // 低优先级规则
};

/**
 * 订单决策规则集合
 */
const orderRules = [
  {
    id: 'photo_quality_check',
    name: '照片质量检查',
    description: '检查上传照片的质量是否满足 3D 建模要求',
    priority: RulePriority.CRITICAL,
    
    /**
     * 规则条件
     * @param {Object} order - 订单对象
     * @returns {boolean} 是否满足条件
     */
    condition: (order) => {
      // 从元数据中获取照片质量评分
      const photoQuality = order.metadata?.photoQuality || 0;
      return photoQuality < 0.7;
    },
    
    /**
     * 规则动作
     * @param {Object} order - 订单对象
     * @returns {Object} 决策结果
     */
    action: (order) => ({
      result: DecisionResult.MANUAL_REVIEW,
      confidence: 0.9,
      reason: '照片质量不足，需要人工检查',
      details: {
        photoQuality: order.metadata?.photoQuality || 0,
        threshold: 0.7,
        suggestion: '建议用户重新拍摄清晰照片'
      }
    }),
    
    /**
     * 规则解释模板
     */
    rationale: (order) => {
      const quality = order.metadata?.photoQuality || 0;
      return `照片质量评分为${(quality * 100).toFixed(0)}%，低于要求的 70%，需要人工审核确认是否可以进行 3D 建模`;
    }
  },
  
  {
    id: 'material_stock_check',
    name: '库存检查',
    description: '检查所需材料库存是否充足',
    priority: RulePriority.HIGH,
    
    condition: (order, context = {}) => {
      // 从上下文中获取库存信息
      const stockInfo = context.stockInfo || {};
      const requiredAmount = context.requiredAmount || 1;
      
      // 检查每个订单项目的材料库存
      if (!order.items || order.items.length === 0) {
        return false;
      }
      
      for (const item of order.items) {
        const materialId = item.materialId?._id || item.materialId;
        if (!materialId) {
          continue; // 没有指定材料，跳过检查
        }
        
        const stock = stockInfo[materialId] || 0;
        if (stock < (item.quantity || requiredAmount)) {
          return true; // 库存不足
        }
      }
      
      return false;
    },
    
    action: (order, context = {}) => {
      const stockInfo = context.stockInfo || {};
      const missingMaterials = [];
      
      for (const item of order.items) {
        const materialId = item.materialId?._id || item.materialId;
        if (!materialId) continue;
        
        const stock = stockInfo[materialId] || 0;
        const required = item.quantity || 1;
        
        if (stock < required) {
          missingMaterials.push({
            materialId,
            required,
            available: stock,
            shortage: required - stock
          });
        }
      }
      
      return {
        result: DecisionResult.MANUAL_REVIEW,
        confidence: 0.95,
        reason: '库存不足，需要采购',
        details: {
          missingMaterials,
          suggestion: '需要采购材料后才能继续生产'
        }
      };
    },
    
    rationale: (order, context = {}) => {
      const stockInfo = context.stockInfo || {};
      const issues = [];
      
      for (const item of order.items) {
        const materialId = item.materialId?._id || item.materialId;
        if (!materialId) continue;
        
        const stock = stockInfo[materialId] || 0;
        const required = item.quantity || 1;
        
        if (stock < required) {
          issues.push(`材料${materialId}需要${required}个，但库存只有${stock}个`);
        }
      }
      
      return `库存检查发现问题：${issues.join('; ')}。需要人工确认是否进行采购`;
    }
  },
  
  {
    id: 'parameter_standard_check',
    name: '参数标准检查',
    description: '检查订单参数是否符合标准规格',
    priority: RulePriority.MEDIUM,
    
    condition: (order) => {
      // 检查是否有非标准参数
      if (!order.items || order.items.length === 0) {
        return false;
      }
      
      for (const item of order.items) {
        const specs = item.specifications;
        if (!specs) {
          continue;
        }
        
        // 检查是否有自定义参数
        for (const [key, value] of Object.entries(specs)) {
          // 如果包含"custom"、"special"等关键词，认为是非标准参数
          if (typeof value === 'string' && 
              (value.toLowerCase().includes('custom') || 
               value.toLowerCase().includes('special'))) {
            return true;
          }
          
          // 如果参数值超出标准范围
          if (typeof value === 'number' && (value < 0 || value > 1000)) {
            return true;
          }
        }
      }
      
      return false;
    },
    
    action: (order) => ({
      result: DecisionResult.MANUAL_REVIEW,
      confidence: 0.75,
      reason: '订单包含非标准参数，需要人工确认',
      details: {
        hasCustomParameters: true,
        suggestion: '需要技术人员确认参数可行性'
      }
    }),
    
    rationale: (order) => {
      const customSpecs = [];
      
      for (const item of order.items) {
        if (!item.specifications) continue;
        
        for (const [key, value] of Object.entries(item.specifications)) {
          if (typeof value === 'string' && 
              (value.toLowerCase().includes('custom') || 
               value.toLowerCase().includes('special'))) {
            customSpecs.push(`${key}: ${value}`);
          }
        }
      }
      
      return `订单包含自定义参数：${customSpecs.join(', ')}。需要人工确认可行性`;
    }
  },
  
  {
    id: 'standard_order_auto_approve',
    name: '标准订单自动通过',
    description: '对于照片质量好、库存充足、参数标准的订单自动通过',
    priority: RulePriority.LOW,
    
    condition: (order, context = {}) => {
      // 照片质量检查
      const photoQuality = order.metadata?.photoQuality || 0;
      if (photoQuality < 0.8) {
        return false;
      }
      
      // 库存检查
      const stockInfo = context.stockInfo || {};
      for (const item of order.items || []) {
        const materialId = item.materialId?._id || item.materialId;
        if (!materialId) continue;
        
        const stock = stockInfo[materialId] || 0;
        if (stock < (item.quantity || 1)) {
          return false;
        }
      }
      
      // 参数标准检查（通过表示没有非标准参数）
      const hasCustomParams = (order.items || []).some(item => {
        if (!item.specifications) return false;
        
        return Object.values(item.specifications).some(value => {
          if (typeof value === 'string' && 
              (value.toLowerCase().includes('custom') || 
               value.toLowerCase().includes('special'))) {
            return true;
          }
          if (typeof value === 'number' && (value < 0 || value > 1000)) {
            return true;
          }
          return false;
        });
      });
      
      if (hasCustomParams) {
        return false;
      }
      
      return true;
    },
    
    action: (order) => ({
      result: DecisionResult.AUTO_APPROVE,
      confidence: 0.95,
      reason: '标准订单，自动通过',
      details: {
        photoQuality: order.metadata?.photoQuality || 0,
        stockStatus: '充足',
        parameterStatus: '标准',
        suggestion: '可以进入生产调度流程'
      }
    }),
    
    rationale: (order) => {
      const quality = order.metadata?.photoQuality || 0;
      return `订单符合所有标准：照片质量${(quality * 100).toFixed(0)}%，库存充足，参数标准。自动通过审核`;
    }
  },
  
  {
    id: 'order_completeness_check',
    name: '订单完整性检查',
    description: '检查订单信息是否完整',
    priority: RulePriority.CRITICAL,
    
    condition: (order) => {
      // 必填字段检查
      if (!order.userId) {
        return true;
      }
      
      if (!order.items || order.items.length === 0) {
        return true;
      }
      
      // 检查每个项目是否有必填字段
      for (const item of order.items) {
        if (!item.deviceId) {
          return true;
        }
        if (!item.quantity || item.quantity < 1) {
          return true;
        }
        if (item.unitPrice === undefined || item.unitPrice < 0) {
          return true;
        }
      }
      
      return false;
    },
    
    action: (order) => ({
      result: DecisionResult.REJECT,
      confidence: 1.0,
      reason: '订单信息不完整',
      details: {
        missingFields: getMissingFields(order),
        suggestion: '需要补充完整订单信息'
      }
    }),
    
    rationale: (order) => {
      const missing = getMissingFields(order);
      return `订单缺少必填字段：${missing.join(', ')}。无法处理不完整的订单`;
    }
  }
];

/**
 * 获取订单缺失的字段
 * @param {Object} order - 订单对象
 * @returns {Array<string>} 缺失字段列表
 */
function getMissingFields(order) {
  const missing = [];
  
  if (!order.userId) {
    missing.push('userId');
  }
  
  if (!order.items || order.items.length === 0) {
    missing.push('items');
    return missing;
  }
  
  order.items.forEach((item, index) => {
    if (!item.deviceId) {
      missing.push(`items[${index}].deviceId`);
    }
    if (!item.quantity || item.quantity < 1) {
      missing.push(`items[${index}].quantity`);
    }
    if (item.unitPrice === undefined || item.unitPrice < 0) {
      missing.push(`items[${index}].unitPrice`);
    }
  });
  
  return missing;
}

module.exports = {
  orderRules,
  DecisionResult,
  RulePriority
};
