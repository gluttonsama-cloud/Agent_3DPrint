/**
 * 决策日志服务
 * 
 * 负责记录、查询、分析所有 Agent 的决策过程
 * 支持决策追溯、统计分析、异常检测等功能
 */

const AgentDecision = require('../models/AgentDecision');
const { agentEventEmitter } = require('../utils/AgentEventEmitter');

/**
 * 决策日志服务类
 */
class DecisionLogService {
  /**
   * 创建决策日志服务实例
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    this.config = {
      enableLogging: config.enableLogging !== false,
      enableEvents: config.enableEvents !== false,
      lowConfidenceThreshold: config.lowConfidenceThreshold || 0.5,
      maxHistorySize: config.maxHistorySize || 1000
    };

    // 内存中的决策历史缓存
    this.decisionHistory = [];
  }

  /**
   * 记录单个决策
   * 
   * @param {Object} decisionData - 决策数据
   * @returns {Promise<Object>} 保存的决策记录
   */
  async record(decisionData) {
    try {
      // 验证必填字段
      this._validateDecisionData(decisionData);

      // 创建决策记录
      const decision = new AgentDecision({
        orderId: decisionData.orderId,
        agentId: decisionData.agentId,
        agentName: decisionData.agentName,
        decisionType: decisionData.decisionType,
        decisionResult: decisionData.decisionResult,
        confidence: decisionData.confidence,
        inputSnapshot: decisionData.inputSnapshot || {},
        rationale: decisionData.rationale,
        alternatives: decisionData.alternatives || [],
        impact: decisionData.impact || {},
        rulesMatched: decisionData.rulesMatched || [],
        timestamp: new Date()
      });

      // 保存到数据库
      await decision.save();

      // 关联到订单
      if (decision.linkToOrder) {
        await decision.linkToOrder();
      }

      // 添加到内存历史
      this._addToHistory(decision);

      // 发射决策记录事件
      if (this.config.enableEvents) {
        this._emitDecisionEvent(decision);
      }

      // 检查是否需要低置信度告警
      if (decision.confidence < this.config.lowConfidenceThreshold) {
        this._emitLowConfidenceAlert(decision);
      }

      if (this.config.enableLogging) {
        console.log('[DecisionLog] 决策记录成功:', {
          decisionId: decision._id,
          orderId: decision.orderId,
          agentId: decision.agentId,
          decisionType: decision.decisionType,
          confidence: decision.confidence
        });
      }

      return decision;
    } catch (error) {
      console.error('[DecisionLog] 记录决策失败:', error.message);
      throw error;
    }
  }

  /**
   * 批量记录决策
   * 
   * @param {Array} decisions - 决策数据数组
   * @returns {Promise<Array>} 保存的决策记录数组
   */
  async recordBatch(decisions) {
    try {
      const results = await Promise.all(
        decisions.map(decision => this.record(decision))
      );

      console.log('[DecisionLog] 批量记录完成:', {
        total: decisions.length,
        success: results.length
      });

      return results;
    } catch (error) {
      console.error('[DecisionLog] 批量记录失败:', error.message);
      throw error;
    }
  }

  /**
   * 按订单 ID 查询决策历史
   * 
   * @param {string} orderId - 订单 ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 决策记录数组
   */
  async findByOrderId(orderId, options = {}) {
    try {
      const limit = options.limit || 50;
      const sort = options.sort === 'asc' ? 1 : -1;

      const decisions = await AgentDecision.find({ orderId })
        .sort({ createdAt: sort })
        .limit(limit)
        .lean();

      if (this.config.enableLogging) {
        console.log('[DecisionLog] 查询订单决策历史:', {
          orderId,
          count: decisions.length
        });
      }

      return decisions;
    } catch (error) {
      console.error('[DecisionLog] 查询订单决策历史失败:', error.message);
      throw error;
    }
  }

  /**
   * 按 Agent ID 查询决策记录
   * 
   * @param {string} agentId - Agent ID
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 决策记录数组
   */
  async findByAgentId(agentId, options = {}) {
    try {
      const { limit = 50, decisionType, startTime, endTime } = options;
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
        console.log('[DecisionLog] 查询 Agent 决策记录:', {
          agentId,
          count: decisions.length
        });
      }

      return decisions;
    } catch (error) {
      console.error('[DecisionLog] 查询 Agent 决策记录失败:', error.message);
      throw error;
    }
  }

  /**
   * 按时间范围查询决策记录
   * 
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 决策记录数组
   */
  async findByTimeRange(startTime, endTime, options = {}) {
    try {
      const { agentId, decisionType, limit = 100 } = options;
      const query = {
        createdAt: {
          $gte: new Date(startTime),
          $lte: new Date(endTime)
        }
      };

      if (agentId) query.agentId = agentId;
      if (decisionType) query.decisionType = decisionType;

      const decisions = await AgentDecision.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      if (this.config.enableLogging) {
        console.log('[DecisionLog] 按时间范围查询:', {
          startTime,
          endTime,
          count: decisions.length
        });
      }

      return decisions;
    } catch (error) {
      console.error('[DecisionLog] 按时间范围查询失败:', error.message);
      throw error;
    }
  }

  /**
   * 查询低置信度决策
   * 
   * @param {number} threshold - 置信度阈值
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 决策记录数组
   */
  async findLowConfidence(threshold = null, options = {}) {
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
        console.log('[DecisionLog] 查询低置信度决策:', {
          threshold: confThreshold,
          count: decisions.length
        });
      }

      return decisions;
    } catch (error) {
      console.error('[DecisionLog] 查询低置信度决策失败:', error.message);
      throw error;
    }
  }

  /**
   * 按决策类型查询
   * 
   * @param {string} decisionType - 决策类型
   * @param {Object} options - 查询选项
   * @returns {Promise<Array>} 决策记录数组
   */
  async findByDecisionType(decisionType, options = {}) {
    try {
      const { limit = 50, startTime, endTime } = options;
      const query = { decisionType };

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
        console.log('[DecisionLog] 按决策类型查询:', {
          decisionType,
          count: decisions.length
        });
      }

      return decisions;
    } catch (error) {
      console.error('[DecisionLog] 按决策类型查询失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取统计信息
   * 
   * @param {Object} options - 统计选项
   * @returns {Promise<Object>} 统计结果
   */
  async getStats(options = {}) {
    try {
      const { startTime, endTime, agentId } = options || {};
      const query = {};

      if (startTime || endTime) {
        query.createdAt = {};
        if (startTime) query.createdAt.$gte = new Date(startTime);
        if (endTime) query.createdAt.$lte = new Date(endTime);
      }

      if (agentId) query.agentId = agentId;

      // 总决策数
      const totalCount = await AgentDecision.countDocuments(query);

      // 按决策类型统计
      const byType = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$decisionType',
            count: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' }
          }
        }
      ]);

      // 按 Agent 统计
      const byAgent = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$agentId',
            count: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' }
          }
        }
      ]);

      // 置信度分布
      const confidenceDistribution = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              $cond: [
                { $gte: ['$confidence', 0.8] },
                'high (0.8-1.0)',
                {
                  $cond: [
                    { $gte: ['$confidence', 0.5] },
                    'medium (0.5-0.8)',
                    'low (0-0.5)'
                  ]
                }
              ]
            },
            count: { $sum: 1 }
          }
        }
      ]);

      // 平均置信度
      const avgConfidenceResult = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            avgConfidence: { $avg: '$confidence' }
          }
        }
      ]);

      // 低置信度决策数
      const lowConfidenceCount = await AgentDecision.countDocuments({
        ...query,
        confidence: { $lt: this.config.lowConfidenceThreshold }
      });

      return {
        total: totalCount,
        byType: byType.map(item => ({
          type: item._id,
          count: item.count,
          avgConfidence: parseFloat(item.avgConfidence.toFixed(3))
        })),
        byAgent: byAgent.map(item => ({
          agentId: item._id,
          count: item.count,
          avgConfidence: parseFloat(item.avgConfidence.toFixed(3))
        })),
        confidenceDistribution: confidenceDistribution.map(item => ({
          level: item._id,
          count: item.count
        })),
        avgConfidence: avgConfidenceResult[0]
          ? parseFloat(avgConfidenceResult[0].avgConfidence.toFixed(3))
          : 0,
        lowConfidenceCount,
        lowConfidenceRate: totalCount > 0
          ? parseFloat((lowConfidenceCount / totalCount).toFixed(3))
          : 0
      };
    } catch (error) {
      console.error('[DecisionLog] 获取统计信息失败:', error.message);
      throw error;
    }
  }

  /**
   * 导出决策日志为 JSON
   * 
   * @param {Object} options - 导出选项
   * @returns {Promise<Array>} 决策记录数组
   */
  async exportAsJSON(options = {}) {
    try {
      const { startTime, endTime, agentId, decisionType } = options;
      const query = {};

      if (startTime || endTime) {
        query.createdAt = {};
        if (startTime) query.createdAt.$gte = new Date(startTime);
        if (endTime) query.createdAt.$lte = new Date(endTime);
      }

      if (agentId) query.agentId = agentId;
      if (decisionType) query.decisionType = decisionType;

      const decisions = await AgentDecision.find(query)
        .sort({ createdAt: -1 })
        .lean();

      if (this.config.enableLogging) {
        console.log('[DecisionLog] 导出 JSON:', {
          count: decisions.length
        });
      }

      return decisions;
    } catch (error) {
      console.error('[DecisionLog] 导出 JSON 失败:', error.message);
      throw error;
    }
  }

  /**
   * 导出决策日志为 CSV 格式
   * 
   * @param {Object} options - 导出选项
   * @returns {Promise<string>} CSV 字符串
   */
  async exportAsCSV(options = {}) {
    try {
      const decisions = await this.exportAsJSON(options);

      // CSV 表头
      const headers = [
        'orderId',
        'agentId',
        'decisionType',
        'decisionResult',
        'confidence',
        'rationale',
        'createdAt'
      ];

      // CSV 行
      const rows = decisions.map(decision => {
        return [
          decision.orderId,
          decision.agentId,
          decision.decisionType,
          decision.decisionResult,
          decision.confidence,
          `"${(decision.rationale || '').replace(/"/g, '""')}"`,
          decision.createdAt
        ].join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');

      if (this.config.enableLogging) {
        console.log('[DecisionLog] 导出 CSV:', {
          rows: rows.length
        });
      }

      return csv;
    } catch (error) {
      console.error('[DecisionLog] 导出 CSV 失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取内存历史
   * 
   * @param {number} limit - 限制返回数量
   * @returns {Array} 决策历史
   */
  getHistory(limit = 50) {
    return this.decisionHistory.slice(-limit);
  }

  /**
   * 清空内存历史
   */
  clearHistory() {
    this.decisionHistory = [];
    console.log('[DecisionLog] 内存历史已清空');
  }

  /**
   * 验证决策数据
   * 
   * @param {Object} data - 决策数据
   * @private
   */
  _validateDecisionData(data) {
    const requiredFields = [
      'orderId',
      'agentId',
      'decisionType',
      'decisionResult',
      'confidence',
      'rationale'
    ];

    for (const field of requiredFields) {
      if (!data[field]) {
        throw new Error(`缺少必填字段：${field}`);
      }
    }

    // 验证置信度范围
    if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
      throw new Error('置信度必须是 0 到 1 之间的数字');
    }
  }

  /**
   * 添加到内存历史
   * 
   * @param {Object} decision - 决策记录
   * @private
   */
  _addToHistory(decision) {
    this.decisionHistory.push({
      orderId: decision.orderId,
      agentId: decision.agentId,
      decisionType: decision.decisionType,
      decisionResult: decision.decisionResult,
      confidence: decision.confidence,
      createdAt: decision.createdAt
    });

    // 限制历史记录大小
    if (this.decisionHistory.length > this.config.maxHistorySize) {
      this.decisionHistory.shift();
    }
  }

  /**
   * 发射决策记录事件
   * 
   * @param {Object} decision - 决策记录
   * @private
   */
  _emitDecisionEvent(decision) {
    agentEventEmitter.emitDecision({
      agentId: decision.agentId,
      type: decision.decisionType,
      orderId: decision.orderId,
      result: decision.decisionResult,
      reasoning: decision.rationale,
      confidence: decision.confidence,
      timestamp: decision.createdAt
    });
  }

  /**
   * 发射低置信度告警事件
   * 
   * @param {Object} decision - 决策记录
   * @private
   */
  _emitLowConfidenceAlert(decision) {
    agentEventEmitter.emitEvent('decision_low_confidence', {
      decisionId: decision._id,
      orderId: decision.orderId,
      agentId: decision.agentId,
      decisionType: decision.decisionType,
      confidence: decision.confidence,
      threshold: this.config.lowConfidenceThreshold,
      message: `低置信度决策告警：${decision.agentId} 对订单 ${decision.orderId} 的决策置信度仅为 ${decision.confidence}`
    });

    console.warn('[DecisionLog] 低置信度决策告警:', {
      orderId: decision.orderId,
      agentId: decision.agentId,
      confidence: decision.confidence
    });
  }
}

// 创建单例实例
const decisionLogService = new DecisionLogService({
  enableLogging: true,
  enableEvents: true,
  lowConfidenceThreshold: 0.5
});

module.exports = {
  DecisionLogService,
  decisionLogService
};
