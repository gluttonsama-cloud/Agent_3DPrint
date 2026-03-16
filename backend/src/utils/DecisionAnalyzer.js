/**
 * 决策分析工具
 * 
 * 提供决策数据的深度分析功能
 * 包括置信度分布、决策类型统计、规则命中率、异常检测等
 */

const AgentDecision = require('../models/AgentDecision');

/**
 * 决策分析器类
 */
class DecisionAnalyzer {
  /**
   * 创建决策分析器实例
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    this.config = {
      lowConfidenceThreshold: config.lowConfidenceThreshold || 0.5,
      highConfidenceThreshold: config.highConfidenceThreshold || 0.8,
      longDecisionTimeMs: config.longDecisionTimeMs || 5000,
      enableLogging: config.enableLogging !== false
    };
  }

  /**
   * 分析置信度分布
   * 
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 置信度分布分析结果
   */
  async analyzeConfidenceDistribution(options = {}) {
    try {
      const { startTime, endTime, agentId } = options || {};
      const query = {};

      if (startTime || endTime) {
        query.createdAt = {};
        if (startTime) query.createdAt.$gte = new Date(startTime);
        if (endTime) query.createdAt.$lte = new Date(endTime);
      }

      if (agentId) query.agentId = agentId;

      // 置信度区间统计
      const distribution = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              $cond: [
                { $gte: ['$confidence', this.config.highConfidenceThreshold] },
                'high',
                {
                  $cond: [
                    { $gte: ['$confidence', this.config.lowConfidenceThreshold] },
                    'medium',
                    'low'
                  ]
                }
              ]
            },
            count: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' },
            minConfidence: { $min: '$confidence' },
            maxConfidence: { $max: '$confidence' }
          }
        },
        {
          $project: {
            _id: 0,
            level: '$_id',
            count: 1,
            avgConfidence: { $round: ['$avgConfidence', 3] },
            minConfidence: { $round: ['$minConfidence', 3] },
            maxConfidence: { $round: ['$maxConfidence', 3] }
          }
        }
      ]);

      // 总体统计
      const overall = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avg: { $avg: '$confidence' },
            min: { $min: '$confidence' },
            max: { $max: '$confidence' },
            stdDev: { $stdDevSamp: '$confidence' }
          }
        }
      ]);

      const overallStats = overall[0] || { total: 0, avg: 0, min: 0, max: 0, stdDev: 0 };

      return {
        distribution: distribution.map(d => ({
          level: d.level,
          count: d.count,
          percentage: overallStats.total > 0
            ? parseFloat(((d.count / overallStats.total) * 100).toFixed(2))
            : 0,
          avgConfidence: d.avgConfidence,
          minConfidence: d.minConfidence,
          maxConfidence: d.maxConfidence
        })),
        overall: {
          total: overallStats.total,
          avgConfidence: parseFloat(overallStats.avg.toFixed(3)),
          minConfidence: parseFloat(overallStats.min.toFixed(3)),
          maxConfidence: parseFloat(overallStats.max.toFixed(3)),
          stdDev: overallStats.stdDev ? parseFloat(overallStats.stdDev.toFixed(3)) : 0
        },
        thresholds: {
          low: this.config.lowConfidenceThreshold,
          high: this.config.highConfidenceThreshold
        }
      };
    } catch (error) {
      console.error('[DecisionAnalyzer] 置信度分布分析失败:', error.message);
      throw error;
    }
  }

  /**
   * 分析决策类型统计
   * 
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 决策类型统计结果
   */
  async analyzeDecisionTypes(options = {}) {
    try {
      const { startTime, endTime, agentId } = options || {};
      const query = {};

      if (startTime || endTime) {
        query.createdAt = {};
        if (startTime) query.createdAt.$gte = new Date(startTime);
        if (endTime) query.createdAt.$lte = new Date(endTime);
      }

      if (agentId) query.agentId = agentId;

      // 按决策类型统计
      const byType = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$decisionType',
            count: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' },
            avgTime: { $avg: '$impact.estimatedTime' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // 按决策结果统计
      const byResult = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$decisionResult',
            count: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      const total = byType.reduce((sum, t) => sum + t.count, 0);

      return {
        byType: byType.map(t => ({
          type: t._id,
          count: t.count,
          percentage: total > 0 ? parseFloat(((t.count / total) * 100).toFixed(2)) : 0,
          avgConfidence: parseFloat(t.avgConfidence.toFixed(3)),
          avgEstimatedTime: t.avgTime ? parseFloat(t.avgTime.toFixed(1)) : null
        })),
        byResult: byResult.map(r => ({
          result: r._id,
          count: r.count,
          percentage: total > 0 ? parseFloat(((r.count / total) * 100).toFixed(2)) : 0,
          avgConfidence: parseFloat(r.avgConfidence.toFixed(3))
        })),
        total
      };
    } catch (error) {
      console.error('[DecisionAnalyzer] 决策类型统计失败:', error.message);
      throw error;
    }
  }

  /**
   * 分析规则命中率
   * 
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 规则命中率分析结果
   */
  async analyzeRuleMatchRate(options = {}) {
    try {
      const { startTime, endTime, agentId } = options || {};
      const query = {};

      if (startTime || endTime) {
        query.createdAt = {};
        if (startTime) query.createdAt.$gte = new Date(startTime);
        if (endTime) query.createdAt.$lte = new Date(endTime);
      }

      if (agentId) query.agentId = agentId;

      // 获取所有包含 rulesMatched 的决策
      const decisions = await AgentDecision.find(query)
        .select('rulesMatched decisionType confidence')
        .lean();

      // 统计规则使用情况
      const ruleStats = new Map();
      let withRulesCount = 0;

      decisions.forEach(decision => {
        if (decision.rulesMatched && decision.rulesMatched.length > 0) {
          withRulesCount++;
          decision.rulesMatched.forEach(rule => {
            if (!ruleStats.has(rule)) {
              ruleStats.set(rule, { count: 0, totalConfidence: 0 });
            }
            const stat = ruleStats.get(rule);
            stat.count++;
            stat.totalConfidence += decision.confidence;
          });
        }
      });

      // 转换为数组并计算平均置信度
      const ruleAnalysis = Array.from(ruleStats.entries()).map(([rule, stat]) => ({
        rule,
        count: stat.count,
        avgConfidence: parseFloat((stat.totalConfidence / stat.count).toFixed(3)),
        matchRate: withRulesCount > 0
          ? parseFloat(((stat.count / withRulesCount) * 100).toFixed(2))
          : 0
      })).sort((a, b) => b.count - a.count);

      return {
        totalDecisions: decisions.length,
        decisionsWithRules: withRulesCount,
        ruleMatchRate: decisions.length > 0
          ? parseFloat(((withRulesCount / decisions.length) * 100).toFixed(2))
          : 0,
        rules: ruleAnalysis.slice(0, 20), // 返回前 20 个规则
        uniqueRulesCount: ruleStats.size
      };
    } catch (error) {
      console.error('[DecisionAnalyzer] 规则命中率分析失败:', error.message);
      throw error;
    }
  }

  /**
   * 分析决策时间
   * 
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 决策时间分析结果
   */
  async analyzeDecisionTime(options = {}) {
    try {
      const { startTime, endTime, agentId } = options || {};
      const query = {};

      if (startTime || endTime) {
        query.createdAt = {};
        if (startTime) query.createdAt.$gte = new Date(startTime);
        if (endTime) query.createdAt.$lte = new Date(endTime);
      }

      if (agentId) query.agentId = agentId;

      // 按决策类型统计时间
      const byType = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$decisionType',
            avgTime: { $avg: '$impact.estimatedTime' },
            minTime: { $min: '$impact.estimatedTime' },
            maxTime: { $max: '$impact.estimatedTime' },
            count: { $sum: 1 }
          }
        },
        { $sort: { avgTime: -1 } }
      ]);

      // 总体统计
      const overall = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            avgTime: { $avg: '$impact.estimatedTime' },
            minTime: { $min: '$impact.estimatedTime' },
            maxTime: { $max: '$impact.estimatedTime' },
            count: { $sum: 1 }
          }
        }
      ]);

      const overallStats = overall[0] || { avgTime: 0, minTime: 0, maxTime: 0, count: 0 };

      // 长时间决策统计
      const longDecisions = await AgentDecision.countDocuments({
        ...query,
        'impact.estimatedTime': { $gt: this.config.longDecisionTimeMs / 1000 }
      });

      return {
        overall: {
          avgTime: overallStats.avgTime ? parseFloat(overallStats.avgTime.toFixed(1)) : 0,
          minTime: overallStats.minTime || 0,
          maxTime: overallStats.maxTime || 0,
          count: overallStats.count
        },
        byType: byType.map(t => ({
          type: t._id,
          avgTime: t.avgTime ? parseFloat(t.avgTime.toFixed(1)) : 0,
          minTime: t.minTime || 0,
          maxTime: t.maxTime || 0,
          count: t.count
        })),
        longDecisions: {
          count: longDecisions,
          threshold: this.config.longDecisionTimeMs / 1000,
          percentage: overallStats.count > 0
            ? parseFloat(((longDecisions / overallStats.count) * 100).toFixed(2))
            : 0
        }
      };
    } catch (error) {
      console.error('[DecisionAnalyzer] 决策时间分析失败:', error.message);
      throw error;
    }
  }

  /**
   * 检测异常决策
   * 
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 异常决策检测结果
   */
  async detectAnomalies(options = {}) {
    try {
      const { startTime, endTime, limit = 50 } = options || {};
      const query = {};

      if (startTime || endTime) {
        query.createdAt = {};
        if (startTime) query.createdAt.$gte = new Date(startTime);
        if (endTime) query.createdAt.$lte = new Date(endTime);
      }

      // 低置信度决策
      const lowConfidenceDecisions = await AgentDecision.find({
        ...query,
        confidence: { $lt: this.config.lowConfidenceThreshold }
      })
        .sort({ confidence: 1, createdAt: -1 })
        .limit(limit)
        .lean();

      // 长时间决策
      const longDecisions = await AgentDecision.find({
        ...query,
        'impact.estimatedTime': { $gt: this.config.longDecisionTimeMs / 1000 }
      })
        .sort({ 'impact.estimatedTime': -1 })
        .limit(limit)
        .lean();

      // 统计
      const totalDecisions = await AgentDecision.countDocuments(query);
      const lowConfidenceCount = await AgentDecision.countDocuments({
        ...query,
        confidence: { $lt: this.config.lowConfidenceThreshold }
      });
      const longDecisionCount = await AgentDecision.countDocuments({
        ...query,
        'impact.estimatedTime': { $gt: this.config.longDecisionTimeMs / 1000 }
      });

      return {
        summary: {
          totalDecisions,
          lowConfidenceCount,
          lowConfidenceRate: totalDecisions > 0
            ? parseFloat(((lowConfidenceCount / totalDecisions) * 100).toFixed(2))
            : 0,
          longDecisionCount,
          longDecisionRate: totalDecisions > 0
            ? parseFloat(((longDecisionCount / totalDecisions) * 100).toFixed(2))
            : 0
        },
        anomalies: {
          lowConfidence: lowConfidenceDecisions.map(d => ({
            decisionId: d._id,
            orderId: d.orderId,
            agentId: d.agentId,
            decisionType: d.decisionType,
            confidence: d.confidence,
            rationale: d.rationale,
            createdAt: d.createdAt
          })),
          longDecision: longDecisions.map(d => ({
            decisionId: d._id,
            orderId: d.orderId,
            agentId: d.agentId,
            decisionType: d.decisionType,
            estimatedTime: d.impact.estimatedTime,
            confidence: d.confidence,
            createdAt: d.createdAt
          }))
        },
        thresholds: {
          lowConfidence: this.config.lowConfidenceThreshold,
          longDecisionMs: this.config.longDecisionTimeMs
        }
      };
    } catch (error) {
      console.error('[DecisionAnalyzer] 异常检测失败:', error.message);
      throw error;
    }
  }

  /**
   * 分析 Agent 性能
   * 
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} Agent 性能分析结果
   */
  async analyzeAgentPerformance(options = {}) {
    try {
      const { startTime, endTime } = options || {};
      const query = {};

      if (startTime || endTime) {
        query.createdAt = {};
        if (startTime) query.createdAt.$gte = new Date(startTime);
        if (endTime) query.createdAt.$lte = new Date(endTime);
      }

      // 按 Agent 统计
      const byAgent = await AgentDecision.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$agentId',
            totalDecisions: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' },
            minConfidence: { $min: '$confidence' },
            maxConfidence: { $max: '$confidence' },
            lowConfidenceCount: {
              $sum: {
                $cond: [
                  { $lt: ['$confidence', this.config.lowConfidenceThreshold] },
                  1,
                  0
                ]
              }
            }
          }
        },
        { $sort: { totalDecisions: -1 } }
      ]);

      const total = byAgent.reduce((sum, a) => sum + a.totalDecisions, 0);

      return {
        agents: byAgent.map(a => ({
          agentId: a._id,
          totalDecisions: a.totalDecisions,
          percentage: total > 0 ? parseFloat(((a.totalDecisions / total) * 100).toFixed(2)) : 0,
          avgConfidence: parseFloat(a.avgConfidence.toFixed(3)),
          minConfidence: parseFloat(a.minConfidence.toFixed(3)),
          maxConfidence: parseFloat(a.maxConfidence.toFixed(3)),
          lowConfidenceCount: a.lowConfidenceCount,
          lowConfidenceRate: a.totalDecisions > 0
            ? parseFloat(((a.lowConfidenceCount / a.totalDecisions) * 100).toFixed(2))
            : 0
        })),
        totalAgents: byAgent.length
      };
    } catch (error) {
      console.error('[DecisionAnalyzer] Agent 性能分析失败:', error.message);
      throw error;
    }
  }

  /**
   * 生成综合分析报告
   * 
   * @param {Object} options - 分析选项
   * @returns {Promise<Object>} 综合分析报告
   */
  async generateReport(options = {}) {
    try {
      const { startTime, endTime } = options || {};

      if (this.config.enableLogging) {
        console.log('[DecisionAnalyzer] 生成综合分析报告:', { startTime, endTime });
      }

      const [
        confidenceDist,
        decisionTypes,
        ruleMatchRate,
        decisionTime,
        anomalies,
        agentPerformance
      ] = await Promise.all([
        this.analyzeConfidenceDistribution({ startTime, endTime }),
        this.analyzeDecisionTypes({ startTime, endTime }),
        this.analyzeRuleMatchRate({ startTime, endTime }),
        this.analyzeDecisionTime({ startTime, endTime }),
        this.detectAnomalies({ startTime, endTime }),
        this.analyzeAgentPerformance({ startTime, endTime })
      ]);

      return {
        generatedAt: new Date().toISOString(),
        period: { startTime, endTime },
        summary: {
          totalDecisions: confidenceDist.overall.total,
          avgConfidence: confidenceDist.overall.avgConfidence,
          lowConfidenceRate: anomalies.summary.lowConfidenceRate,
          longDecisionRate: anomalies.summary.longDecisionRate
        },
        confidence: confidenceDist,
        decisionTypes,
        ruleMatchRate,
        decisionTime,
        anomalies,
        agentPerformance
      };
    } catch (error) {
      console.error('[DecisionAnalyzer] 生成综合报告失败:', error.message);
      throw error;
    }
  }
}

module.exports = {
  DecisionAnalyzer
};
