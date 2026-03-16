/**
 * Material Service
 * 
 * 负责材料库存管理的业务逻辑层
 * 提供材料查询、库存更新、低库存预警、补货建议等功能
 */

const Material = require('../models/Material');
const { agentRegistry } = require('../agents/registry');
const { agentEventEmitter, AgentEventType } = require('../utils/AgentEventEmitter');

/**
 * MaterialService 类
 * 提供材料管理的所有业务操作
 */
class MaterialService {
  /**
   * 查询材料列表
   * 
   * @param {Object} filters - 过滤条件
   * @param {string} filters.type - 材料类型（resin/filament/powder/liquid）
   * @param {string} filters.name - 材料名称（模糊搜索）
   * @param {boolean} filters.lowStock - 是否只查询低库存材料
   * @param {Object} pagination - 分页参数
   * @param {number} pagination.page - 页码（从 1 开始）
   * @param {number} pagination.limit - 每页数量
   * @returns {Promise<Object>} 材料列表和分页信息
   */
  async getMaterials(filters = {}, pagination = {}) {
    const { type, name, lowStock } = filters;
    const { page = 1, limit = 20 } = pagination;

    try {
      // 构建查询条件
      const query = {};
      
      if (type) {
        query.type = type;
      }
      
      if (name) {
        query.name = { $regex: name, $options: 'i' }; // 不区分大小写的模糊搜索
      }
      
      // 低库存过滤
      if (lowStock === true) {
        const materials = await Material.find(query).lean();
        const lowStockMaterials = materials.filter(m => m.stock.quantity <= m.threshold);
        
        // 手动分页
        const skip = (page - 1) * limit;
        const paginatedMaterials = lowStockMaterials.slice(skip, skip + limit);
        
        return {
          success: true,
          data: {
            materials: paginatedMaterials,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: lowStockMaterials.length,
              totalPages: Math.ceil(lowStockMaterials.length / limit)
            }
          }
        };
      }

      // 计算分页
      const skip = (page - 1) * limit;
      
      // 查询材料列表
      const [materials, total] = await Promise.all([
        Material.find(query)
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ createdAt: -1 })
          .lean(),
        Material.countDocuments(query)
      ]);

      return {
        success: true,
        data: {
          materials,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      };
    } catch (error) {
      console.error('[MaterialService] 查询材料列表失败:', error.message);
      throw error;
    }
  }

  /**
   * 查询材料详情
   * 
   * @param {string} materialId - 材料 ID
   * @returns {Promise<Object>} 材料详情
   */
  async getMaterialById(materialId) {
    try {
      const material = await Material.findById(materialId);
      
      if (!material) {
        const error = new Error('材料不存在');
        error.status = 404;
        throw error;
      }

      // 计算是否需要补货
      const needsReorder = material.stock.quantity <= material.threshold;
      
      // 计算可用天数（基于历史消耗）
      let availableDays = null;
      try {
        const inventory = agentRegistry.get('inventory_agent');
        if (inventory) {
          const forecast = await inventory.execute({
            type: 'forecast_consumption',
            materialId,
            forecastDays: 7
          });
          
          if (forecast.forecast && forecast.forecast.averageDailyConsumption > 0) {
            availableDays = Math.floor(
              material.stock.quantity / forecast.forecast.averageDailyConsumption
            );
          }
        }
      } catch (forecastError) {
        console.warn('[MaterialService] 获取预测失败:', forecastError.message);
      }

      return {
        success: true,
        data: {
          ...material.toObject(),
          needsReorder,
          availableDays
        }
      };
    } catch (error) {
      console.error('[MaterialService] 查询材料详情失败:', error.message);
      throw error;
    }
  }

  /**
   * 更新库存
   * 
   * @param {string} materialId - 材料 ID
   * @param {number} quantityChange - 库存变化量（正数增加，负数减少）
   * @param {Object} context - 上下文信息
   * @param {string} context.reason - 变化原因
   * @param {string} context.orderId - 关联订单 ID（可选）
   * @returns {Promise<Object>} 更新后的材料信息
   */
  async updateStock(materialId, quantityChange, context = {}) {
    try {
      const material = await Material.findById(materialId);
      
      if (!material) {
        const error = new Error('材料不存在');
        error.status = 404;
        throw error;
      }

      const newQuantity = material.stock.quantity + quantityChange;
      
      // 检查更新后库存是否为负
      if (newQuantity < 0) {
        const error = new Error(`库存不足，当前库存：${material.stock.quantity} ${material.stock.unit}`);
        error.status = 400;
        throw error;
      }

      // 更新库存
      material.stock.quantity = newQuantity;
      await material.save();

      // 发射库存检查事件
      agentEventEmitter.emitInventoryChecked({
        materialType: material.type,
        currentStock: newQuantity,
        requiredAmount: Math.abs(quantityChange),
        isSufficient: newQuantity >= material.threshold,
        checkedAt: new Date().toISOString()
      });

      // 如果库存低于阈值，发射低库存预警事件
      if (newQuantity <= material.threshold) {
        const suggestedAmount = Math.ceil(material.threshold * 2); // 建议补货量为阈值的 2 倍
        
        agentEventEmitter.emitEvent('inventory_low', {
          materialId: material._id,
          materialName: material.name,
          materialType: material.type,
          currentStock: newQuantity,
          threshold: material.threshold,
          unit: material.stock.unit,
          suggestedAmount,
          orderId: context.orderId || null,
          reason: context.reason || '库存低于阈值'
        });
      }

      console.log(`[MaterialService] 库存已更新：${material.name}, 变化：${quantityChange}, 新库存：${newQuantity}`);

      return {
        success: true,
        data: material.toObject(),
        message: `库存已更新：${quantityChange > 0 ? '+' : ''}${quantityChange} ${material.stock.unit}`
      };
    } catch (error) {
      console.error('[MaterialService] 更新库存失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取低库存材料列表
   * 
   * @param {boolean} includeCritical - 是否包含严重不足的材料
   * @returns {Promise<Object>} 低库存材料列表
   */
  async getLowStockMaterials(includeCritical = true) {
    try {
      const materials = await Material.find({}).lean();
      
      const lowStockMaterials = materials.filter(m => {
        const percentage = m.stock.quantity / m.threshold;
        
        if (includeCritical) {
          return m.stock.quantity <= m.threshold;
        }
        
        // 只返回库存低于阈值但大于 0 的材料
        return m.stock.quantity <= m.threshold && m.stock.quantity > 0;
      }).map(m => ({
        ...m,
        percentage: (m.stock.quantity / m.threshold * 100).toFixed(2) + '%',
        availableDays: null, // 待填充
        status: this._getStockStatus(m)
      }));

      // 按库存百分比排序（最低的在前）
      lowStockMaterials.sort((a, b) => {
        const aPercentage = parseFloat(a.percentage);
        const bPercentage = parseFloat(b.percentage);
        return aPercentage - bPercentage;
      });

      return {
        success: true,
        data: {
          materials: lowStockMaterials,
          total: lowStockMaterials.length,
          critical: lowStockMaterials.filter(m => m.status === 'critical' || m.status === 'out_of_stock').length
        }
      };
    } catch (error) {
      console.error('[MaterialService] 获取低库存材料失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取补货建议（调用 InventoryAgent）
   * 
   * @returns {Promise<Object>} 补货建议列表
   */
  async getReorderSuggestions() {
    try {
      const inventory = agentRegistry.get('inventory_agent');
      
      if (!inventory) {
        console.warn('[MaterialService] InventoryAgent 未注册，使用基础算法生成建议');
        return await this._generateBasicReorderSuggestions();
      }

      // 调用 InventoryAgent 获取补货建议
      const result = await inventory.execute({
        type: 'reorder_suggestion'
      });

      if (!result.success) {
        throw new Error('获取补货建议失败');
      }

      // 格式化返回数据
      const suggestions = result.suggestions.map(s => ({
        materialId: s.materialId.toString(),
        name: s.materialName,
        type: s.materialType,
        currentStock: s.currentStock,
        threshold: null, // Agent 返回的数据中不包含 threshold
        suggestedAmount: s.reorderAmount,
        unit: s.unit,
        priority: s.priority,
        priorityScore: s.priorityScore,
        estimatedCost: s.estimatedCost,
        availableDays: s.availableDays,
        forecast: s.forecast,
        supplier: s.supplier
      }));

      return {
        success: true,
        data: {
          suggestions,
          totalMaterials: result.totalMaterials,
          needReorder: result.needReorder
        }
      };
    } catch (error) {
      console.error('[MaterialService] 获取补货建议失败:', error.message);
      throw error;
    }
  }

  /**
   * 基础补货建议生成（当 InventoryAgent 不可用时）
   * 
   * @returns {Promise<Object>} 补货建议列表
   * @private
   */
  async _generateBasicReorderSuggestions() {
    const materials = await Material.find({}).lean();
    const suggestions = [];

    for (const material of materials) {
      if (material.stock.quantity <= material.threshold) {
        const suggestedAmount = Math.ceil(material.threshold * 2);
        const priority = this._calculatePriority(material);
        
        suggestions.push({
          materialId: material._id.toString(),
          name: material.name,
          type: material.type,
          currentStock: material.stock.quantity,
          threshold: material.threshold,
          suggestedAmount,
          unit: material.stock.unit,
          priority,
          priorityScore: this._calculatePriorityScore(material),
          estimatedCost: suggestedAmount * (material.costPerUnit || 0),
          availableDays: null,
          forecast: null,
          supplier: material.supplier
        });
      }
    }

    // 按优先级分数排序
    suggestions.sort((a, b) => b.priorityScore - a.priorityScore);

    return {
      success: true,
      data: {
        suggestions,
        totalMaterials: materials.length,
        needReorder: suggestions.length
      }
    };
  }

  /**
   * 批量更新库存
   * 
   * @param {Array} updates - 更新数组
   * @param {string} updates[].materialId - 材料 ID
   * @param {number} updates[].quantityChange - 库存变化量
   * @returns {Promise<Object>} 批量更新结果
   */
  async bulkUpdateStock(updates) {
    try {
      const results = [];
      const errors = [];

      for (const update of updates) {
        const { materialId, quantityChange } = update;
        
        if (!materialId || quantityChange === undefined) {
          errors.push({
            materialId,
            error: 'materialId 和 quantityChange 是必填字段'
          });
          continue;
        }

        try {
          const result = await this.updateStock(materialId, quantityChange, {
            reason: '批量更新',
            orderId: update.orderId
          });
          
          results.push({
            materialId,
            success: true,
            data: result.data
          });
        } catch (error) {
          errors.push({
            materialId,
            error: error.message
          });
        }
      }

      return {
        success: errors.length === 0,
        data: {
          results,
          errors,
          total: updates.length,
          successCount: results.length,
          failCount: errors.length
        }
      };
    } catch (error) {
      console.error('[MaterialService] 批量更新库存失败:', error.message);
      throw error;
    }
  }

  /**
   * 检查材料是否充足
   * 
   * @param {string} materialId - 材料 ID
   * @param {number} requiredAmount - 需求量
   * @returns {Promise<Object>} 检查结果
   */
  async checkMaterialSufficiency(materialId, requiredAmount) {
    try {
      const material = await Material.findById(materialId);
      
      if (!material) {
        const error = new Error('材料不存在');
        error.status = 404;
        throw error;
      }

      const isSufficient = material.stock.quantity >= requiredAmount;
      const isBelowThreshold = material.stock.quantity <= material.threshold;

      return {
        success: true,
        data: {
          materialId,
          materialName: material.name,
          materialType: material.type,
          currentStock: material.stock.quantity,
          requiredAmount,
          isSufficient,
          isBelowThreshold,
          unit: material.stock.unit,
          remainingAfterUse: material.stock.quantity - requiredAmount,
          status: this._getStockStatus(material)
        }
      };
    } catch (error) {
      console.error('[MaterialService] 检查材料充足性失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取库存状态
   * 
   * @param {Object} material - 材料对象
   * @returns {string} 库存状态
   * @private
   */
  _getStockStatus(material) {
    if (material.stock.quantity === 0) {
      return 'out_of_stock';
    } else if (material.stock.quantity <= material.threshold * 0.25) {
      return 'critical';
    } else if (material.stock.quantity <= material.threshold) {
      return 'low_stock';
    } else if (material.stock.quantity <= material.threshold * 2) {
      return 'adequate';
    } else {
      return 'sufficient';
    }
  }

  /**
   * 计算补货优先级
   * 
   * @param {Object} material - 材料对象
   * @returns {string} 优先级（high/medium/low）
   * @private
   */
  _calculatePriority(material) {
    const percentage = material.stock.quantity / material.threshold;
    
    if (percentage <= 0.25) {
      return 'high';
    } else if (percentage <= 0.5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * 计算补货优先级分数
   * 
   * @param {Object} material - 材料对象
   * @returns {number} 优先级分数（0-100）
   * @private
   */
  _calculatePriorityScore(material) {
    const percentage = material.stock.quantity / material.threshold;
    const baseScore = (1 - percentage) * 100;
    
    // 根据材料类型调整分数
    let typeMultiplier = 1;
    if (material.type === 'resin') {
      typeMultiplier = 1.2; // 树脂材料优先级稍高
    } else if (material.type === 'filament') {
      typeMultiplier = 1.1;
    }
    
    return Math.min(100, Math.round(baseScore * typeMultiplier));
  }
}

module.exports = {
  MaterialService
};
