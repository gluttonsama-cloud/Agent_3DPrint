/**
 * 库存查询工具
 * 
 * 为 Agent 提供材料库存相关的查询和操作能力
 * 包含库存查询、库存更新、补货建议等功能
 */

const Material = require('../../models/Material');
const { agentEventEmitter } = require('../../utils/AgentEventEmitter');

/**
 * 库存工具集合
 */
const materialTools = {
  /**
   * 根据 ID 查询材料
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.materialId - 材料 ID
   * @returns {Promise<Object|null>} 材料信息
   */
  getMaterialById: {
    name: 'getMaterialById',
    description: '根据材料 ID 查询材料详细信息',
    inputSchema: {
      type: 'object',
      properties: {
        materialId: {
          type: 'string',
          description: '材料 ID'
        }
      },
      required: ['materialId']
    },
    execute: async (input) => {
      try {
        console.log('[MaterialTool] 查询材料:', input.materialId);
        
        const material = await Material.findById(input.materialId);
        
        if (!material) {
          return {
            success: false,
            error: '材料不存在',
            materialId: input.materialId
          };
        }
        
        return {
          success: true,
          material: {
            id: material._id,
            name: material.name,
            type: material.type,
            stock: material.stock,
            threshold: material.threshold,
            needsReorder: material.needsReorder,
            properties: material.properties,
            supplier: material.supplier,
            costPerUnit: material.costPerUnit,
            createdAt: material.createdAt,
            updatedAt: material.updatedAt
          }
        };
      } catch (error) {
        console.error('[MaterialTool] 查询材料失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 查询所有材料
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.type - 材料类型过滤
   * @returns {Promise<Array>} 材料列表
   */
  getAllMaterials: {
    name: 'getAllMaterials',
    description: '查询所有材料，可按类型过滤',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: '材料类型：resin, filament, powder, liquid',
          enum: ['resin', 'filament', 'powder', 'liquid']
        }
      }
    },
    execute: async (input) => {
      try {
        console.log('[MaterialTool] 查询所有材料，类型:', input.type);
        
        const query = {};
        if (input.type) query.type = input.type;
        
        const materials = await Material.find(query);
        
        return {
          success: true,
          materials: materials.map(material => ({
            id: material._id,
            name: material.name,
            type: material.type,
            stock: material.stock,
            threshold: material.threshold,
            needsReorder: material.needsReorder,
            costPerUnit: material.costPerUnit
          })),
          count: materials.length
        };
      } catch (error) {
        console.error('[MaterialTool] 查询材料列表失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 检查材料库存
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.materialId - 材料 ID
   * @param {number} input.requiredAmount - 所需数量
   * @returns {Promise<Object>} 库存检查结果
   */
  checkMaterialStock: {
    name: 'checkMaterialStock',
    description: '检查材料库存是否充足',
    inputSchema: {
      type: 'object',
      properties: {
        materialId: {
          type: 'string',
          description: '材料 ID'
        },
        requiredAmount: {
          type: 'number',
          description: '所需数量'
        }
      },
      required: ['materialId', 'requiredAmount']
    },
    execute: async (input) => {
      try {
        console.log('[MaterialTool] 检查材料库存:', input.materialId, '所需:', input.requiredAmount);
        
        const material = await Material.findById(input.materialId);
        
        if (!material) {
          return {
            success: false,
            error: '材料不存在'
          };
        }
        
        const currentStock = material.stock.quantity;
        const isSufficient = currentStock >= input.requiredAmount;
        
        // 发射库存检查事件
        agentEventEmitter.emitInventoryChecked({
          materialType: material.type,
          currentStock,
          requiredAmount: input.requiredAmount,
          isSufficient
        });
        
        return {
          success: true,
          material: {
            id: material._id,
            name: material.name,
            type: material.type,
            stock: material.stock
          },
          check: {
            requiredAmount: input.requiredAmount,
            currentStock,
            isSufficient,
            remaining: isSufficient ? currentStock - input.requiredAmount : 0
          }
        };
      } catch (error) {
        console.error('[MaterialTool] 检查库存失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 更新材料库存
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.materialId - 材料 ID
   * @param {number} input.quantityChange - 库存变化量（正数增加，负数减少）
   * @returns {Promise<Object>} 更新结果
   */
  updateMaterialStock: {
    name: 'updateMaterialStock',
    description: '更新材料库存数量',
    inputSchema: {
      type: 'object',
      properties: {
        materialId: {
          type: 'string',
          description: '材料 ID'
        },
        quantityChange: {
          type: 'number',
          description: '库存变化量（正数增加，负数减少）'
        }
      },
      required: ['materialId', 'quantityChange']
    },
    execute: async (input) => {
      try {
        console.log('[MaterialTool] 更新材料库存:', input.materialId, '变化:', input.quantityChange);
        
        const material = await Material.findById(input.materialId);
        
        if (!material) {
          return {
            success: false,
            error: '材料不存在'
          };
        }
        
        const previousStock = material.stock.quantity;
        await material.updateStock(input.quantityChange);
        
        return {
          success: true,
          material: {
            id: material._id,
            name: material.name,
            stock: material.stock
          },
          update: {
            previousStock,
            newStock: material.stock.quantity,
            change: input.quantityChange
          }
        };
      } catch (error) {
        console.error('[MaterialTool] 更新库存失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 查询低库存材料
   * 
   * @param {Object} input - 输入参数
   * @returns {Promise<Array>} 低库存材料列表
   */
  getLowStockMaterials: {
    name: 'getLowStockMaterials',
    description: '查询所有需要补货的低库存材料',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    execute: async () => {
      try {
        console.log('[MaterialTool] 查询低库存材料');
        
        const materials = await Material.findLowStock();
        
        return {
          success: true,
          materials: materials.map(material => ({
            id: material._id,
            name: material.name,
            type: material.type,
            stock: material.stock,
            threshold: material.threshold,
            shortage: material.threshold - material.stock.quantity
          })),
          count: materials.length
        };
      } catch (error) {
        console.error('[MaterialTool] 查询低库存材料失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 生成补货建议
   * 
   * @param {Object} input - 输入参数
   * @param {number} input.multiplier - 补货倍数（默认 2 倍）
   * @returns {Promise<Array>} 补货建议列表
   */
  generateReorderSuggestions: {
    name: 'generateReorderSuggestions',
    description: '为低库存材料生成补货建议',
    inputSchema: {
      type: 'object',
      properties: {
        multiplier: {
          type: 'number',
          description: '补货倍数，建议补货量 = 阈值 × 倍数',
          default: 2
        }
      }
    },
    execute: async (input) => {
      try {
        console.log('[MaterialTool] 生成补货建议，倍数:', input.multiplier || 2);
        
        const materials = await Material.findLowStock();
        const multiplier = input.multiplier || 2;
        
        const suggestions = materials.map(material => {
          const reorderAmount = material.threshold * multiplier;
          const estimatedCost = reorderAmount * material.costPerUnit;
          
          return {
            materialId: material._id,
            materialName: material.name,
            materialType: material.type,
            currentStock: material.stock.quantity,
            threshold: material.threshold,
            suggestedReorderAmount: reorderAmount,
            unit: material.stock.unit,
            estimatedCost,
            supplier: material.supplier
          };
        });
        
        return {
          success: true,
          suggestions,
          totalItems: suggestions.length,
          totalEstimatedCost: suggestions.reduce((sum, item) => sum + item.estimatedCost, 0)
        };
      } catch (error) {
        console.error('[MaterialTool] 生成补货建议失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  }
};

module.exports = materialTools;
