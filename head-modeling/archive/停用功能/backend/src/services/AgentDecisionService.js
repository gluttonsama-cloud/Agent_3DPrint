/**
 * Agent 决策服务
 * 
 * 负责触发 Agent 决策、查询决策历史、获取决策解释等功能
 * 集成所有 Agent（Coordinator、Scheduler、Inventory）和 DecisionLogService
 */

const AgentDecision = require('../models/AgentDecision');
const Order = require('../models/Order');
const { decisionLogService } = require('./DecisionLogService');
const { agentRegistry } = require('../agents/registry');
const { asyncHandler, NotFoundError, ValidationError } = require('../middleware/errorHandler');

/**
 * Agent 类型枚举
 */
const AgentType = {
  COORDINATOR: 'coordinator',
  SCHEDULER: 'scheduler',
  INVENTORY: 'inventory'
};

/**
 * Agent ID 映射
 */
const AGENT_IDS = {
  [AgentType.COORDINATOR]: 'coordinator_agent',
  [AgentType.SCHEDULER]: 'scheduler_agent',
  [AgentType.INVENTORY]: 'inventory_agent'
};

/**
 * Agent 决策服务类
 */
class AgentDecisionService {
  /**
   * 创建 Agent 决策服务实例
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    this.config = {
      enableLogging: config.enableLogging !== false,
      enableEvents: config.enableEvents !== false,
      lowConfidenceThreshold: config.lowConfidenceThreshold || 0.5,
      defaultTimeout: config.defaultTimeout || 30000
    };
  }

  /**
   * 触发 Agent 决策
   * 
   * @param {string} agentType - Agent 类型：coordinator/scheduler/inventory
   * @param {string} action - 决策动作
   * @param {Object} data - 决策数据
   * @returns {Promise<Object>} 决策结果
   */
  async triggerDecision(agentType, action, data) {
    try {
      // 验证 Agent 类型
      if (!this._isValidAgentType(agentType)) {
        throw new ValidationError(`无效的 Agent 类型：${agentType}`);
      }

      const agentId = AGENT_IDS[agentType];
      
      if (this.config.enableLogging) {
        console.log('[AgentDecisionService] 触发 Agent 决策:', {
          agentType,
          agentId,
          action,
          data
        });
      }

      // 获取 Agent 实例
      const agent = agentRegistry.get(agentId);
      
      if (!agent) {
        throw new NotFoundError(`${agentType} Agent 未就绪`);
      }

      // 根据 Agent 类型和动作执行不同的决策逻辑
      let decisionResult;
      
      switch (agentType) {
        case AgentType.COORDINATOR:
          decisionResult = await this._triggerCoordinatorDecision(agent, action, data);
          break;
          
        case AgentType.SCHEDULER:
          decisionResult = await this._triggerSchedulerDecision(agent, action, data);
          break;
          
        case AgentType.INVENTORY:
          decisionResult = await this._triggerInventoryDecision(agent, action, data);
          break;
          
        default:
          throw new ValidationError(`不支持的 Agent 类型：${agentType}`);
      }

      // 记录决策到日志
      if (decisionResult && decisionResult.decisionId) {
        await this.recordDecision({
          decisionId: decisionResult.decisionId,
          agentId,
          ...decisionResult
        });
      }

      if (this.config.enableLogging) {
        console.log('[AgentDecisionService] Agent 决策完成:', {
          agentType,
          decisionId: decisionResult.decisionId,
          result: decisionResult.decisionResult
        });
      }

      return decisionResult;
    } catch (error) {
      console.error('[AgentDecisionService] 触发 Agent 决策失败:', error.message);
      throw error;
    }
  }

  /**
   * 触发协调 Agent 决策
   * @private
   */
  async _triggerCoordinatorDecision(agent, action, data) {
    const { orderId } = data;
    
    if (!orderId) {
      throw new ValidationError('orderId 是必填字段');
    }

    // 验证订单是否存在
    const order = await Order.findById(orderId);
    if (!order) {
      throw new NotFoundError(`订单不存在：${orderId}`);
    }

    // 根据动作执行不同的决策
    let result;
    
    switch (action) {
      case 'review_order':
        result = await agent.execute({
          type: 'make_decision',
          orderId,
          context: data.context || {}
        });
        break;
        
      case 'process_order':
        result = await agent.execute({
          type: 'process_order',
          orderId
        });
        break;
        
      default:
        throw new ValidationError(`不支持的动作：${action}`);
    }

    return {
      decisionId: result?.decisionId || `dec_${Date.now()}_${orderId}`,
      agentId: agent.id,
      decisionType: 'scheduling',
      decisionResult: result?.result || 'processed',
      confidence: result?.confidence || 0.8,
      rationale: result?.rationale || result?.reason || '订单处理完成',
      alternatives: result?.alternatives || [],
      rulesMatched: result?.rulesMatched || [],
      timestamp: new Date()
    };
  }

  /**
   * 触发调度 Agent 决策
   * @private
   */
  async _triggerSchedulerDecision(agent, action, data) {
    const { orderId, strategy } = data;
    
    if (!orderId) {
      throw new ValidationError('orderId 是必填字段');
    }

    // 验证订单是否存在
    const order = await Order.findById(orderId);
    if (!order) {
      throw new NotFoundError(`订单不存在：${orderId}`);
    }

    // 执行设备分配
    const result = await agent.execute({
      type: 'schedule_device',
      orderId,
      strategy: strategy || 'optimal'
    });

    // 从结果中提取决策信息
    const allocation = result?.result;
    const recommendation = allocation?.recommendations?.[0];
    
    return {
      decisionId: `dec_sched_${Date.now()}_${orderId}`,
      agentId: agent.id,
      decisionType: 'device_selection',
      decisionResult: recommendation?.device?.deviceId || 'pending',
      confidence: allocation?.score || 0.8,
      rationale: recommendation?.reason || '设备评分最高',
      alternatives: allocation?.recommendations?.slice(1, 4)?.map(rec => ({
        option: rec.device?.deviceId,
        score: rec.score,
        reason: rec.reason
      })) || [],
      impact: {
        estimatedTime: recommendation?.estimatedCompletionTime,
        estimatedCost: null,
        qualityScore: allocation?.score || 0.8
      },
      timestamp: new Date()
    };
  }

  /**
   * 触发库存 Agent 决策
   * @private
   */
  async _triggerInventoryDecision(agent, action, data) {
    const { materialId, requiredAmount, orderId } = data;
    
    if (!materialId) {
      throw new ValidationError('materialId 是必填字段');
    }

    // 执行库存检查
    const result = await agent.execute({
      type: 'check_inventory',
      materialId,
      requiredAmount: requiredAmount || 0
    });

    // 从结果中提取决策信息
    const detail = result?.details?.[0];
    
    return {
      decisionId: `dec_inv_${Date.now()}_${materialId}`,
      agentId: agent.id,
      decisionType: 'material_selection',
      decisionResult: detail?.status || 'unknown',
      confidence: detail?.isSufficient ? 1.0 : 0.3,
      rationale: detail?.isSufficient 
        ? `库存充足，当前库存：${detail.currentStock} ${detail.unit}`
        : `库存不足，当前库存：${detail.currentStock} ${detail.unit}，需求：${requiredAmount || 0}`,
      alternatives: [],
      impact: {
        estimatedTime: null,
        estimatedCost: null,
        qualityScore: detail?.isSufficient ? 1.0 : 0.3
      },
      timestamp: new Date()
    };
  }

  /**
   * 查询订单的决策历史
   * 
   * @param {string} orderId - 订单 ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 决策记录数组
   */
  async getDecisionsByOrder(orderId, options = {}) {
    try {
      if (!orderId) {
        throw new ValidationError('订单 ID 不能为空');
      }

      const limit = options.limit || 50;
      const sort = options.sort === 'asc' ? 1 : -1;

      const decisions = await AgentDecision.find({ orderId })
        .sort({ createdAt: sort })
        .limit(limit)
        .lean();

      if (this.config.enableLogging) {
        console.log('[AgentDecisionService] 查询订单决策历史:', {
          orderId,
          count: decisions.length
        });
      }

      return decisions;
    } catch (error) {
      console.error('[AgentDecisionService] 查询订单决策历史失败:', error.message);
      throw error;
    }
  }

  /**
   * 查询特定 Agent 的决策
   * 
   * @param {string} agentId - Agent ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 决策记录数组
   */
  async getDecisionsByAgent(agentId, options = {}) {
    try {
      if (!agentId) {
        throw new ValidationError('Agent ID 不能为空');
      }

      const { limit = 20, decisionType, startTime, endTime } = options;
      const query = { agentId };

      if (decisionType) {
        query.decisionType = decisionType;
      }

      if (startTime || endTime) {
        query.createdAt = {};
        if (startTime) query.createdAt.$gte = new Date(startTime);
        if (endTime) query.createdAt.$lte = new Date(endTime);
      }

      const decisions = await AgentDecision.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      if (this.config.enableLogging) {
        console.log('[AgentDecisionService] 查询 Agent 决策记录:', {
          agentId,
          count: decisions.length
        });
      }

      return decisions;
    } catch (error) {
      console.error('[AgentDecisionService] 查询 Agent 决策记录失败:', error.message);
      throw error;
    }
  }

  /**
   * 查询决策详情
   * 
   * @param {string} decisionId - 决策 ID
   * @returns {Promise<Object>} 决策详情
   */
  async getDecisionById(decisionId) {
    try {
      if (!decisionId) {
        throw new ValidationError('决策 ID 不能为空');
      }

      const decision = await AgentDecision.findById(decisionId)
        .populate('orderId')
        .lean();

      if (!decision) {
        throw new NotFoundError(`决策记录不存在：${decisionId}`);
      }

      if (this.config.enableLogging) {
        console.log('[AgentDecisionService] 查询决策详情:', decisionId);
      }

      return decision;
    } catch (error) {
      console.error('[AgentDecisionService] 查询决策详情失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取决策解释
   * 
   * @param {string} decisionId - 决策 ID
   * @returns {Promise<Object>} 决策解释
   */
  async getDecisionExplanation(decisionId) {
    try {
      if (!decisionId) {
        throw new ValidationError('决策 ID 不能为空');
      }

      const decision = await AgentDecision.findById(decisionId)
        .populate('orderId')
        .lean();

      if (!decision) {
        throw new NotFoundError(`决策记录不存在：${decisionId}`);
      }

      // 构建决策解释
      const explanation = {
        decisionId: decision._id,
        inputSnapshot: decision.inputSnapshot,
        rulesMatched: decision.rulesMatched || [],
        alternatives: decision.alternatives || [],
        rationale: decision.rationale,
        confidence: decision.confidence,
        decisionType: decision.decisionType,
        decisionResult: decision.decisionResult,
        impact: decision.impact,
        createdAt: decision.createdAt,
        updatedAt: decision.updatedAt
      };

      if (this.config.enableLogging) {
        console.log('[AgentDecisionService] 获取决策解释:', decisionId);
      }

      return explanation;
    } catch (error) {
      console.error('[AgentDecisionService] 获取决策解释失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取低置信度决策
   * 
   * @param {number} threshold - 置信度阈值
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 低置信度决策数组
   */
  async getLowConfidenceDecisions(threshold = null, options = {}) {
    try {
      const confThreshold = threshold || this.config.lowConfidenceThreshold;
      const limit = options.limit || 50;

      const decisions = await AgentDecision.find({
        confidence: { $lt: confThreshold }
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      if (this.config.enableLogging) {
        console.log('[AgentDecisionService] 查询低置信度决策:', {
          threshold: confThreshold,
          count: decisions.length
        });
      }

      return decisions;
    } catch (error) {
      console.error('[AgentDecisionService] 查询低置信度决策失败:', error.message);
      throw error;
    }
  }

  /**
   * 记录决策（集成 DecisionLogService）
   * 
   * @param {Object} decisionData - 决策数据
   * @returns {Promise<Object>} 保存的决策记录
   */
  async recordDecision(decisionData) {
    try {
      // 验证必填字段
      this._validateDecisionData(decisionData);

      // 使用 DecisionLogService 记录决策
      const recordedDecision = await decisionLogService.record({
        orderId: decisionData.orderId || 'system',
        agentId: decisionData.agentId,
        agentName: decisionData.agentName,
        decisionType: decisionData.decisionType,
        decisionResult: decisionData.decisionResult,
        confidence: decisionData.confidence,
        inputSnapshot: decisionData.inputSnapshot || {},
        rationale: decisionData.rationale,
        alternatives: decisionData.alternatives || [],
        impact: decisionData.impact || {},
        rulesMatched: decisionData.rulesMatched || []
      });

      if (this.config.enableLogging) {
        console.log('[AgentDecisionService] 决策记录完成:', {
          decisionId: recordedDecision._id,
          agentId: recordedDecision.agentId
        });
      }

      return recordedDecision;
    } catch (error) {
      console.error('[AgentDecisionService] 记录决策失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量记录决策
   * 
   * @param {Array} decisions - 决策数据数组
   * @returns {Promise<Array>} 保存的决策记录数组
   */
  async recordBatchDecisions(decisions) {
    try {
      const results = await Promise.all(
        decisions.map(decision => this.recordDecision(decision))
      );

      if (this.config.enableLogging) {
        console.log('[AgentDecisionService] 批量记录完成:', {
          total: decisions.length,
          success: results.length
        });
      }

      return results;
    } catch (error) {
      console.error('[AgentDecisionService] 批量记录失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取决策统计信息
   * 
   * @param {Object} options - 统计选项
   * @returns {Promise<Object>} 统计结果
   */
  async getDecisionStats(options = {}) {
    try {
      const { startTime, endTime, agentId } = options;
      
      // 使用 DecisionLogService 获取统计信息
      const stats = await decisionLogService.getStats({
        startTime,
        endTime,
        agentId
      });

      if (this.config.enableLogging) {
        console.log('[AgentDecisionService] 获取决策统计信息');
      }

      return stats;
    } catch (error) {
      console.error('[AgentDecisionService] 获取决策统计信息失败:', error.message);
      throw error;
    }
  }

  /**
   * 验证 Agent 类型
   * @private
   */
  _isValidAgentType(agentType) {
    return Object.values(AgentType).includes(agentType);
  }

  /**
   * 验证决策数据
   * @private
   */
  _validateDecisionData(data) {
    const requiredFields = [
      'agentId',
      'decisionType',
      'decisionResult',
      'confidence',
      'rationale'
    ];

    for (const field of requiredFields) {
      if (!data[field]) {
        throw new ValidationError(`缺少必填字段：${field}`);
      }
    }

    // 验证置信度范围
    if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
      throw new ValidationError('置信度必须是 0 到 1 之间的数字');
    }
  }
}

// 创建单例实例
const agentDecisionService = new AgentDecisionService({
  enableLogging: true,
  enableEvents: true,
  lowConfidenceThreshold: 0.5
});

module.exports = {
  AgentDecisionService,
  agentDecisionService,
  AgentType
};
