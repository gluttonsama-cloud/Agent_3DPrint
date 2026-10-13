/**
 * 库存 Agent
 * 
 * 负责材料库存检查、消耗预测、补货建议等功能
 * 是材料管理的核心 Agent
 */

const { BaseAgent, AgentState } = require('./BaseAgent');
const Material = require('../models/Material');
const Order = require('../models/Order');
const { InventoryForecastAlgorithm, ForecastMethod } = require('./algorithms/InventoryForecastAlgorithm');
const { InventoryRuleManager, InventoryStatus, ReorderPriority } = require('./rules/inventoryRules');
const { calculateOrderConsumption, fetchHistoricalConsumption } = require('../utils/consumptionCalculator');
const { notificationQueue } = require('../queues/notificationQueue');
const { decisionLogService } = require('../services/DecisionLogService');
const { QiniuLLMClient } = require('../config/qiniuLLM');

/**
 * 库存 Agent 任务类型枚举
 */
const InventoryTaskType = {
  CHECK_INVENTORY: 'check_inventory',           // 检查库存
  FORECAST_CONSUMPTION: 'forecast_consumption', // 预测消耗
  REORDER_SUGGESTION: 'reorder_suggestion',     // 补货建议
  LOW_STOCK_CHECK: 'low_stock_check',           // 低库存检查
  MATERIAL_COMPATIBILITY: 'material_compatibility' // 材料兼容性检查
};

/**
 * 库存 Agent 类
 */
class InventoryAgent extends BaseAgent {
  /**
   * 创建库存 Agent 实例
   * 
   * @param {Object} config - 配置选项
   */
  constructor(config = {}) {
    super({
      id: config.id || 'inventory_agent',
      name: config.name || '库存 Agent',
      description: config.description || '负责材料库存检查、消耗预测、补货建议',
      llmConfig: config.llmConfig || {}
    });

    this.forecastAlgorithm = null;
    this.ruleManager = null;
    this.llmClient = null;
    this.inventoryTasks = new Map();

    this.config = {
      enableNotifications: config.enableNotifications !== false,
      enableLogging: config.enableLogging !== false,
      enableLLM: config.enableLLM !== false,
      defaultForecastDays: config.defaultForecastDays || 7,
      defaultForecastMethod: config.defaultForecastMethod || ForecastMethod.SIMPLE_MOVING_AVERAGE,
      notificationThresholds: config.notificationThresholds || {
        lowStock: true,
        critical: true,
        outOfStock: true
      }
    };
  }

  /**
   * 注册工具
   */
  async registerTools() {
    console.log(`[InventoryAgent] ${this.name} 注册库存管理工具`);

    // 工具 1: 检查库存
    this.registerTool('checkInventory', {
      name: 'checkInventory',
      description: '检查材料库存状态',
      inputSchema: {
        type: 'object',
        properties: {
          materialId: { type: 'string', description: '材料 ID，不传则检查所有材料' },
          requiredAmount: { type: 'number', description: '需求量（克）' }
        }
      },
      execute: async (input) => await this.checkInventory(input.materialId, input.requiredAmount)
    });

    // 工具 2: 获取消耗预测
    this.registerTool('getForecast', {
      name: 'getForecast',
      description: '获取材料消耗预测',
      inputSchema: {
        type: 'object',
        properties: {
          materialId: { type: 'string', description: '材料 ID' },
          forecastDays: { type: 'number', description: '预测天数' },
          method: { type: 'string', description: '预测方法', enum: ['simple_moving_average', 'weighted_moving_average', 'linear_regression'] }
        }
      },
      execute: async (input) => await this.getForecast(input.materialId, input.forecastDays, input.method)
    });

    // 工具 3: 获取补货建议
    this.registerTool('getReorderSuggestion', {
      name: 'getReorderSuggestion',
      description: '获取材料补货建议',
      inputSchema: {
        type: 'object',
        properties: {
          materialId: { type: 'string', description: '材料 ID' }
        }
      },
      execute: async (input) => await this.getReorderSuggestion(input.materialId)
    });

    // 工具 4: 获取低库存材料列表
    this.registerTool('getLowStockMaterials', {
      name: 'getLowStockMaterials',
      description: '获取低库存材料列表',
      inputSchema: {
        type: 'object',
        properties: {
          includeCritical: { type: 'boolean', description: '是否包含严重不足的材料' }
        }
      },
      execute: async (input) => await this.getLowStockMaterials(input.includeCritical)
    });

    // 工具 5: 检查材料兼容性
    this.registerTool('checkMaterialCompatibility', {
      name: 'checkMaterialCompatibility',
      description: '检查材料与设备的兼容性',
      inputSchema: {
        type: 'object',
        properties: {
          materialId: { type: 'string', description: '材料 ID' },
          deviceId: { type: 'string', description: '设备 ID' }
        },
        required: ['materialId', 'deviceId']
      },
      execute: async (input) => await this.checkMaterialCompatibility(input.materialId, input.deviceId)
    });
  }

  /**
   * 初始化 Agent
   */
  async initialize() {
    try {
      this.setState(AgentState.INITIALIZING);
      console.log(`[InventoryAgent] ${this.name} 正在初始化...`);

      this.forecastAlgorithm = new InventoryForecastAlgorithm({
        defaultMethod: this.config.defaultForecastMethod,
        defaultDays: this.config.defaultForecastDays
      });

      this.ruleManager = new InventoryRuleManager();
      this.llmClient = this.config.enableLLM ? new QiniuLLMClient() : null;

      console.log('[InventoryAgent] 预测算法、规则管理器和 LLM 客户端已初始化');

      await super.initialize();

      this.setState(AgentState.READY);
      console.log(`[InventoryAgent] ${this.name} 初始化完成`);

      return true;
    } catch (error) {
      this.setState(AgentState.ERROR);
      console.error('[InventoryAgent] 初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 执行任务
   * 
   * @param {Object} task - 任务信息
   * @returns {Promise<Object>} 执行结果
   */
  async execute(task) {
    if (!task || !task.type) {
      throw new Error('任务类型不能为空');
    }

    this.currentTask = task;
    this.setState(AgentState.BUSY);

    try {
      let result;

      switch (task.type) {
        case InventoryTaskType.CHECK_INVENTORY:
          result = await this.checkInventory(task.materialId, task.requiredAmount);
          break;

        case InventoryTaskType.FORECAST_CONSUMPTION:
          result = await this.getForecast(task.materialId, task.forecastDays, task.method);
          break;

        case InventoryTaskType.REORDER_SUGGESTION:
          result = await this.getReorderSuggestion(task.materialId);
          break;

        case InventoryTaskType.LOW_STOCK_CHECK:
          result = await this.getLowStockMaterials(task.includeCritical);
          break;

        case InventoryTaskType.MATERIAL_COMPATIBILITY:
          result = await this.checkMaterialCompatibility(task.materialId, task.deviceId);
          break;

        default:
          throw new Error(`未知的任务类型：${task.type}`);
      }

      return result;
    } catch (error) {
      console.error('[InventoryAgent] 任务执行失败:', error.message);
      throw error;
    } finally {
      this.currentTask = null;
      this.setState(AgentState.READY);
    }
  }

  /**
   * 检查库存
   * 
   * @param {string} materialId - 材料 ID（可选，不传则检查所有材料）
   * @param {number} requiredAmount - 需求量（可选）
   * @returns {Promise<Object>} 检查结果
   */
  async checkInventory(materialId = null, requiredAmount = 0) {
    const taskId = `inv_${Date.now()}_${materialId || 'all'}`;
    console.log('[InventoryAgent] 开始检查库存:', { materialId, requiredAmount });

    const task = {
      id: taskId,
      type: InventoryTaskType.CHECK_INVENTORY,
      materialId,
      status: 'processing',
      startTime: Date.now(),
      steps: []
    };
    this.inventoryTasks.set(taskId, task);

    try {
      // 步骤 1: 获取材料
      task.steps.push({ name: '获取材料信息', status: 'processing' });
      let materials;

      if (materialId) {
        const material = await Material.findById(materialId);
        if (!material) {
          throw new Error(`材料不存在：${materialId}`);
        }
        materials = [material];
      } else {
        materials = await Material.find({}).lean();
      }

      task.steps[0].status = 'completed';
      task.steps[0].result = { count: materials.length };

      // 步骤 2: 检查每个材料的库存状态
      task.steps.push({ name: '检查库存状态', status: 'processing' });
      const results = [];

      for (const material of materials) {
        const statusResult = this.ruleManager.checkInventoryStatus(material, requiredAmount);
        results.push({
          materialId: material._id,
          materialName: material.name,
          materialType: material.type,
          ...statusResult
        });

        // 如果库存不足，发送通知
        if (this.config.enableNotifications && statusResult.isBelowThreshold) {
          await this._sendLowStockNotification(material, statusResult);
        }
      }

      task.steps[1].status = 'completed';
      task.steps[1].result = { checkedCount: results.length };

      // 汇总结果
      const summary = {
        total: results.length,
        sufficient: results.filter(r => r.status === InventoryStatus.SUFFICIENT).length,
        lowStock: results.filter(r => r.status === InventoryStatus.LOW_STOCK).length,
        critical: results.filter(r => r.status === InventoryStatus.CRITICAL).length,
        outOfStock: results.filter(r => r.status === InventoryStatus.OUT_OF_STOCK).length
      };

      task.status = 'completed';
      task.endTime = Date.now();
      task.result = { summary, details: results };

      // 记录库存检查决策
      for (const result of results) {
        try {
          await decisionLogService.record({
            orderId: result.orderId || 'inventory_check',
            agentId: this.id,
            agentName: this.name,
            decisionType: 'quality_check',
            decisionResult: result.status,
            confidence: 1.0,
            inputSnapshot: {
              materialId: result.materialId,
              materialName: result.materialName,
              materialType: result.materialType,
              currentStock: result.currentStock,
              requiredAmount: result.requiredAmount || 0,
              threshold: result.threshold
            },
            rationale: `库存${result.isSufficient ? '充足' : '不足'}，当前库存：${result.currentStock} ${result.unit}`,
            alternatives: [],
            impact: {
              estimatedTime: null,
              estimatedCost: null,
              qualityScore: result.isSufficient ? 1.0 : 0.3
            },
            rulesMatched: result.appliedRules || []
          });
        } catch (logError) {
          console.error('[InventoryAgent] 记录决策失败:', logError.message);
        }
      }

      console.log('[InventoryAgent] 库存检查完成:', summary);

      return {
        success: true,
        taskId,
        summary,
        details: results
      };
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = Date.now();
      console.error('[InventoryAgent] 库存检查失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取消耗预测
   * 
   * @param {string} materialId - 材料 ID（可选）
   * @param {number} forecastDays - 预测天数
   * @param {string} method - 预测方法
   * @returns {Promise<Object>} 预测结果
   */
  async getForecast(materialId = null, forecastDays = null, method = null) {
    const taskId = `fcst_${Date.now()}_${materialId || 'all'}`;
    console.log('[InventoryAgent] 开始生成消耗预测:', { materialId, forecastDays, method });

    forecastDays = forecastDays || this.config.defaultForecastDays;
    method = method || this.config.defaultForecastMethod;

    const task = {
      id: taskId,
      type: InventoryTaskType.FORECAST_CONSUMPTION,
      materialId,
      forecastDays,
      method,
      status: 'processing',
      startTime: Date.now()
    };
    this.inventoryTasks.set(taskId, task);

    try {
      // 从数据库获取历史数据并预测
      const forecast = await this.forecastAlgorithm.forecastFromDB(materialId, {
        forecastDays,
        method
      });

      task.status = 'completed';
      task.endTime = Date.now();
      task.result = forecast;

      console.log('[InventoryAgent] 消耗预测完成:', {
        method: forecast.method,
        predictedConsumption: forecast.predictedConsumption
      });

      return {
        success: true,
        taskId,
        forecast
      };
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = Date.now();
      console.error('[InventoryAgent] 消耗预测失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取补货建议
   * 
   * @param {string} materialId - 材料 ID（可选，不传则获取所有材料的补货建议）
   * @returns {Promise<Object>} 补货建议
   */
  async getReorderSuggestion(materialId = null) {
    const taskId = `reorder_${Date.now()}_${materialId || 'all'}`;
    console.log('[InventoryAgent] 开始生成补货建议:', { materialId });

    const task = {
      id: taskId,
      type: InventoryTaskType.REORDER_SUGGESTION,
      materialId,
      status: 'processing',
      startTime: Date.now(),
      steps: []
    };
    this.inventoryTasks.set(taskId, task);

    try {
      task.steps.push({ name: '获取材料列表', status: 'processing' });
      let materials;

      if (materialId) {
        const material = await Material.findById(materialId);
        if (!material) {
          throw new Error(`材料不存在：${materialId}`);
        }
        materials = [material];
      } else {
        materials = await Material.find({}).lean();
      }

      task.steps[0].status = 'completed';
      task.steps[0].result = { count: materials.length };

      task.steps.push({ name: '生成补货建议', status: 'processing' });
      const suggestions = [];

      for (const material of materials) {
        const forecast = await this.forecastAlgorithm.forecastFromDB(material._id.toString(), {
          forecastDays: 7
        });

        const reorderResult = this.ruleManager.shouldReorder(material, forecast);
        const priorityScore = this.ruleManager.calculateReorderPriorityScore(material, forecast);

        if (reorderResult.shouldReorder) {
          suggestions.push({
            materialId: material._id,
            materialName: material.name,
            materialType: material.type,
            currentStock: material.stock.quantity,
            unit: material.stock.unit,
            reorderAmount: reorderResult.reorderAmount,
            priority: reorderResult.priority,
            priorityScore,
            estimatedCost: reorderResult.reorderAmount * (material.costPerUnit || 0),
            availableDays: reorderResult.availableDays,
            forecast: {
              method: forecast.method,
              predictedConsumption: forecast.predictedConsumption,
              trend: forecast.trend
            },
            supplier: material.supplier
          });
        }
      }

      task.steps[1].status = 'completed';
      task.steps[1].result = { suggestionCount: suggestions.length };

      suggestions.sort((a, b) => b.priorityScore - a.priorityScore);

      if (this.config.enableLLM && this.llmClient && suggestions.length > 0) {
        task.steps.push({ name: 'LLM 评估', status: 'processing' });
        try {
          const llmEvaluation = await this.evaluateReorderWithLLM(suggestions);
          task.steps[2].status = 'completed';
          task.steps[2].result = llmEvaluation;
          suggestions.llmEvaluation = llmEvaluation;
        } catch (llmError) {
          console.warn('[InventoryAgent] LLM 评估失败，使用算法结果:', llmError.message);
          task.steps[2].status = 'completed';
          task.steps[2].result = { error: llmError.message, fallback: 'algorithm_result' };
        }
      }

      task.status = 'completed';
      task.endTime = Date.now();
      task.result = { suggestions };

      console.log('[InventoryAgent] 补货建议生成完成:', {
        totalMaterials: materials.length,
        needReorder: suggestions.length
      });

      return {
        success: true,
        taskId,
        totalMaterials: materials.length,
        needReorder: suggestions.length,
        suggestions
      };
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = Date.now();
      console.error('[InventoryAgent] 补货建议生成失败:', error.message);
      throw error;
    }
  }
  
  /**
   * 使用 LLM 评估补货建议
   */
  async evaluateReorderWithLLM(suggestions) {
    if (!this.llmClient) {
      throw new Error('LLM 客户端未初始化');
    }
    
    const materialsInfo = suggestions.map((s, idx) => 
      `${idx + 1}. ${s.materialName} (${s.materialType}) - 当前库存：${s.currentStock}${s.unit}, ` +
      `建议补货：${s.reorderAmount}${s.unit}, 优先级：${s.priority}, 分数：${s.priorityScore.toFixed(2)}, ` +
      `预计消耗：${s.forecast.predictedConsumption.toFixed(1)}${s.unit}/7 天`
    ).join('\n');
    
    const prompt = `你是 3D 打印农场库存管理专家。请评估以下补货建议：

需要补货的材料清单（按优先级排序）：
${materialsInfo}

当前最优先补货：${suggestions[0]?.materialName} (${suggestions[0]?.priority} 优先级)

请分析并回答：
1. 是否同意当前补货优先级排序？（是/否）
2. 如果有不同建议，请说明哪个材料应该更优先
3. 你的补货策略建议是什么？（考虑资金周转、供应商交货期、季节性因素等）

格式要求（严格 JSON）：
{
  "agree": true,
  "topPriorityMaterial": "白色 PLA 线材",
  "rationale": "理由说明",
  "budgetAllocation": {"materialName": "建议金额"},
  "confidence": 0.85
}`;
    
    const response = await this.llmClient.invoke(prompt, {
      temperature: 0.3,
      maxTokens: 500
    });
    
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('LLM 响应不是有效的 JSON 格式');
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        agree: parsed.agree !== false,
        topPriorityMaterial: parsed.topPriorityMaterial,
        rationale: parsed.rationale || 'LLM 评估完成',
        budgetAllocation: parsed.budgetAllocation,
        confidence: parseFloat(parsed.confidence) || 0.7,
        llmResponse: response.content
      };
    } catch (error) {
      console.error('[InventoryAgent] 解析 LLM 响应失败:', error.message);
      return {
        agree: true,
        rationale: 'LLM 响应解析失败，使用算法推荐',
        confidence: 0.5,
        error: error.message
      };
    }
  }

  /**
   * 获取低库存材料列表
   * 
   * @param {boolean} includeCritical - 是否包含严重不足的材料
   * @returns {Promise<Object>} 低库存材料列表
   */
  async getLowStockMaterials(includeCritical = true) {
    const taskId = `lowstock_${Date.now()}`;
    console.log('[InventoryAgent] 开始获取低库存材料列表');

    const task = {
      id: taskId,
      type: InventoryTaskType.LOW_STOCK_CHECK,
      status: 'processing',
      startTime: Date.now()
    };
    this.inventoryTasks.set(taskId, task);

    try {
      // 获取所有材料
      const materials = await Material.find({}).lean();

      // 检查每个材料的库存状态
      const lowStockMaterials = [];

      for (const material of materials) {
        const statusResult = this.ruleManager.checkInventoryStatus(material);

        // 根据条件过滤
        let include = false;
        if (statusResult.status === InventoryStatus.LOW_STOCK) {
          include = true;
        } else if (includeCritical && 
                   (statusResult.status === InventoryStatus.CRITICAL || 
                    statusResult.status === InventoryStatus.OUT_OF_STOCK)) {
          include = true;
        }

        if (include) {
          const forecast = await this.forecastAlgorithm.forecastFromDB(material._id.toString(), {
            forecastDays: 7
          });

          lowStockMaterials.push({
            materialId: material._id,
            materialName: material.name,
            materialType: material.type,
            currentStock: material.stock.quantity,
            threshold: material.threshold,
            unit: material.stock.unit,
            status: statusResult.status,
            percentage: statusResult.percentage,
            availableDays: forecast.averageDailyConsumption > 0
              ? Math.floor(material.stock.quantity / forecast.averageDailyConsumption)
              : Infinity,
            forecast: {
              trend: forecast.trend,
              averageDailyConsumption: forecast.averageDailyConsumption
            }
          });
        }
      }

      // 按库存百分比排序（最低的在前）
      lowStockMaterials.sort((a, b) => parseFloat(a.percentage) - parseFloat(b.percentage));

      task.status = 'completed';
      task.endTime = Date.now();
      task.result = { count: lowStockMaterials.length };

      console.log('[InventoryAgent] 低库存材料列表获取完成:', {
        count: lowStockMaterials.length
      });

      return {
        success: true,
        taskId,
        count: lowStockMaterials.length,
        materials: lowStockMaterials
      };
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = Date.now();
      console.error('[InventoryAgent] 低库存材料列表获取失败:', error.message);
      throw error;
    }
  }

  /**
   * 检查材料兼容性
   * 
   * @param {string} materialId - 材料 ID
   * @param {string} deviceId - 设备 ID
   * @returns {Promise<Object>} 兼容性检查结果
   */
  async checkMaterialCompatibility(materialId, deviceId) {
    const taskId = `compat_${Date.now()}_${materialId}_${deviceId}`;
    console.log('[InventoryAgent] 开始检查材料兼容性:', { materialId, deviceId });

    const task = {
      id: taskId,
      type: InventoryTaskType.MATERIAL_COMPATIBILITY,
      materialId,
      deviceId,
      status: 'processing',
      startTime: Date.now()
    };
    this.inventoryTasks.set(taskId, task);

    try {
      // 获取材料和设备
      const [material, Device] = await Promise.all([
        Material.findById(materialId),
        (async () => {
          const { default: DeviceModel } = await import('../models/Device.js');
          return await DeviceModel.findOne({ deviceId });
        })()
      ]);

      if (!material) {
        throw new Error(`材料不存在：${materialId}`);
      }

      if (!Device) {
        throw new Error(`设备不存在：${deviceId}`);
      }

      // 检查兼容性
      const compatibilityResult = this.ruleManager.checkMaterialCompatibility(material, Device);

      // 如果不兼容，获取替代材料建议
      let alternatives = [];
      if (!compatibilityResult.compatible) {
        const availableMaterials = await Material.find({ 'stock.quantity': { $gt: 0 } }).lean();
        alternatives = this.ruleManager.getAlternativeMaterials(material, availableMaterials);
      }

      task.status = 'completed';
      task.endTime = Date.now();
      task.result = compatibilityResult;

      console.log('[InventoryAgent] 材料兼容性检查完成:', {
        compatible: compatibilityResult.compatible
      });

      return {
        success: true,
        taskId,
        compatible: compatibilityResult.compatible,
        details: compatibilityResult,
        alternatives: alternatives.slice(0, 3) // 返回前 3 个替代方案
      };
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = Date.now();
      console.error('[InventoryAgent] 材料兼容性检查失败:', error.message);
      throw error;
    }
  }

  /**
   * 发送低库存通知
   * 
   * @param {Object} material - 材料对象
   * @param {Object} statusResult - 库存状态结果
   * @returns {Promise<void>}
   */
  async _sendLowStockNotification(material, statusResult) {
    if (!this.config.enableNotifications) {
      return;
    }

    // 根据状态判断是否发送通知
    const shouldNotify = 
      (statusResult.status === InventoryStatus.LOW_STOCK && this.config.notificationThresholds.lowStock) ||
      (statusResult.status === InventoryStatus.CRITICAL && this.config.notificationThresholds.critical) ||
      (statusResult.status === InventoryStatus.OUT_OF_STOCK && this.config.notificationThresholds.outOfStock);

    if (!shouldNotify) {
      return;
    }

    try {
      await notificationQueue.add({
        type: 'INVENTORY_LOW_STOCK',
        priority: statusResult.status === InventoryStatus.OUT_OF_STOCK ? 'high' : 'medium',
        data: {
          materialId: material._id,
          materialName: material.name,
          materialType: material.type,
          currentStock: material.stock.quantity,
          threshold: material.threshold,
          unit: material.stock.unit,
          status: statusResult.status
        },
        message: `材料 "${material.name}" 库存不足，当前库存：${material.stock.quantity} ${material.stock.unit}`
      });

      console.log('[InventoryAgent] 低库存通知已加入队列:', material.name);
    } catch (error) {
      console.error('[InventoryAgent] 发送通知失败:', error.message);
    }
  }

  /**
   * 获取库存任务状态
   * 
   * @param {string} taskId - 任务 ID
   * @returns {Object|null} 任务状态
   */
  getInventoryTask(taskId) {
    return this.inventoryTasks.get(taskId) || null;
  }

  /**
   * 获取所有库存任务
   * 
   * @param {Object} options - 选项
   * @returns {Array} 任务列表
   */
  getInventoryTasks(options = {}) {
    const tasks = Array.from(this.inventoryTasks.values());

    if (options.status) {
      return tasks.filter(t => t.status === options.status);
    }

    if (options.type) {
      return tasks.filter(t => t.type === options.type);
    }

    return tasks;
  }

  /**
   * 获取 Agent 统计信息
   * 
   * @returns {Object} 统计信息
   */
  getStats() {
    const tasks = Array.from(this.inventoryTasks.values());

    return {
      ...super.getState(),
      inventoryTasks: {
        total: tasks.length,
        processing: tasks.filter(t => t.status === 'processing').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length
      },
      forecast: {
        defaultMethod: this.forecastAlgorithm?.getConfig().defaultMethod,
        defaultDays: this.forecastAlgorithm?.getConfig().defaultDays
      },
      notifications: {
        enabled: this.config.enableNotifications,
        thresholds: this.config.notificationThresholds
      }
    };
  }

  /**
   * 关闭 Agent
   */
  async shutdown() {
    console.log('[InventoryAgent] 正在关闭...');
    this.inventoryTasks.clear();
    await super.shutdown();
    console.log('[InventoryAgent] 已关闭');
  }
}

module.exports = {
  InventoryAgent,
  InventoryTaskType
};
