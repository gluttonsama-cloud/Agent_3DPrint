/**
 * 决策规则引擎
 * 
 * 基于规则引擎对订单进行评估和决策
 * 支持规则优先级、规则匹配、冲突解决等功能
 * 支持 LLM 辅助决策（当规则置信度低或规则冲突时）
 */

const { orderRules, DecisionResult, RulePriority } = require('./rules/orderRules');
const { QiniuLLMClient } = require('../config/qiniuLLM');

/**
 * 决策结果类
 */
class Decision {
  constructor({ result, confidence, reason, details = {}, rationale = '' }) {
    this.result = result;
    this.confidence = confidence;
    this.reason = reason;
    this.details = details;
    this.rationale = rationale;
    this.timestamp = new Date().toISOString();
  }
  
  /**
   * 转换为纯对象
   */
  toJSON() {
    return {
      result: this.result,
      confidence: this.confidence,
      reason: this.reason,
      details: this.details,
      rationale: this.rationale,
      timestamp: this.timestamp
    };
  }
}

/**
 * 决策引擎类
 */
class DecisionEngine {
  /**
   * 创建决策引擎实例
   * @param {Object} options - 配置选项
   * @param {Array} options.rules - 自定义规则列表（可选，默认使用 orderRules）
   * @param {boolean} options.enableLogging - 是否启用日志（默认 true）
   * @param {boolean} options.enableLLM - 是否启用 LLM 辅助决策（默认 true）
   */
  constructor(options = {}) {
    this.rules = options.rules || orderRules;
    this.enableLogging = options.enableLogging !== false;
    this.enableLLM = options.enableLLM !== false;
    
    // 按优先级排序规则
    this.sortRules();
    
    this.llmClient = this.enableLLM ? new QiniuLLMClient() : null;
    
    if (this.enableLogging) {
      console.log('[DecisionEngine] 初始化完成，加载规则数:', this.rules.length);
      console.log('[DecisionEngine] LLM 辅助决策:', this.enableLLM ? '已启用' : '已禁用');
    }
  }
  
  /**
   * 按优先级排序规则
   */
  sortRules() {
    this.rules.sort((a, b) => a.priority - b.priority);
  }
  
  /**
   * 添加规则
   * @param {Object} rule - 规则对象
   * @returns {boolean} 是否成功添加
   */
  addRule(rule) {
    if (!rule.id || !rule.condition || !rule.action) {
      console.error('[DecisionEngine] 规则必须包含 id, condition, action');
      return false;
    }
    
    // 检查是否已存在
    const exists = this.rules.some(r => r.id === rule.id);
    if (exists) {
      console.warn('[DecisionEngine] 规则已存在，将被覆盖:', rule.id);
      this.removeRule(rule.id);
    }
    
    this.rules.push(rule);
    this.sortRules();
    
    if (this.enableLogging) {
      console.log('[DecisionEngine] 规则已添加:', rule.id);
    }
    
    return true;
  }
  
  /**
   * 移除规则
   * @param {string} ruleId - 规则 ID
   * @returns {boolean} 是否成功移除
   */
  removeRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    
    if (index !== -1) {
      this.rules.splice(index, 1);
      if (this.enableLogging) {
        console.log('[DecisionEngine] 规则已移除:', ruleId);
      }
      return true;
    }
    
    return false;
  }
  
  /**
   * 获取规则列表
   * @returns {Array} 规则列表
   */
  getRules() {
    return this.rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      priority: rule.priority
    }));
  }
  
  /**
   * 评估单个规则
   * @param {Object} rule - 规则对象
   * @param {Object} order - 订单对象
   * @param {Object} context - 上下文信息
   * @returns {Object|null} 规则匹配结果
   */
  evaluateRule(rule, order, context = {}) {
    try {
      const conditionMet = rule.condition(order, context);
      
      if (conditionMet) {
        const actionResult = rule.action(order, context);
        const rationale = rule.rationale ? rule.rationale(order, context) : '';
        
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          matched: true,
          priority: rule.priority,
          ...actionResult,
          rationale
        };
      }
      
      return null;
    } catch (error) {
      console.error('[DecisionEngine] 规则评估失败:', rule.id, error.message);
      
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        matched: false,
        error: error.message
      };
    }
  }
  
  /**
   * 评估所有规则
   * @param {Object} order - 订单对象
   * @param {Object} context - 上下文信息
   * @returns {Array} 匹配的规则结果列表
   */
  evaluateAllRules(order, context = {}) {
    const results = [];
    
    for (const rule of this.rules) {
      const result = this.evaluateRule(rule, order, context);
      
      if (result) {
        results.push(result);
      }
    }
    
    return results;
  }
  
  /**
   * 解决冲突策略
   * 当多个规则匹配时，选择最终决策
   * 
   * @param {Array} results - 规则匹配结果列表
   * @returns {Object} 最终决策
   */
  resolveConflict(results) {
    if (results.length === 0) {
      return null;
    }
    
    if (results.length === 1) {
      return results[0];
    }
    
    // 策略 1: 拒绝优先（任何规则要求拒绝，则最终拒绝）
    const rejectResults = results.filter(r => r.result === DecisionResult.REJECT);
    if (rejectResults.length > 0) {
      const highestPriority = rejectResults.reduce(
        (min, r) => (r.priority < min.priority ? r : min),
        rejectResults[0]
      );
      
      return {
        ...highestPriority,
        conflictResolution: 'reject_priority',
        allMatches: results.length
      };
    }
    
    // 策略 2: 人工审核优先（任何规则要求人工审核，则转人工）
    const manualResults = results.filter(r => r.result === DecisionResult.MANUAL_REVIEW);
    if (manualResults.length > 0) {
      const highestPriority = manualResults.reduce(
        (min, r) => (r.priority < min.priority ? r : min),
        manualResults[0]
      );
      
      return {
        ...highestPriority,
        conflictResolution: 'manual_review_priority',
        allMatches: results.length
      };
    }
    
    // 策略 3: 自动通过（选择优先级最高的自动通过规则）
    const approveResults = results.filter(r => r.result === DecisionResult.AUTO_APPROVE);
    if (approveResults.length > 0) {
      const highestPriority = approveResults.reduce(
        (min, r) => (r.priority < min.priority ? r : min),
        approveResults[0]
      );
      
      return {
        ...highestPriority,
        conflictResolution: 'auto_approve',
        allMatches: results.length
      };
    }
    
    // 默认：返回优先级最高的规则
    const highestPriority = results.reduce(
      (min, r) => (r.priority < min.priority ? r : min),
      results[0]
    );
    
    return {
      ...highestPriority,
      conflictResolution: 'default_highest_priority',
      allMatches: results.length
    };
  }
  
  /**
   * 使用 LLM 辅助决策
   * 当规则置信度低或规则冲突时，调用 LLM 做出更智能的决策
   * 
   * @param {Object} order - 订单对象
   * @param {Object} context - 上下文信息
   * @param {Array} ruleResults - 规则评估结果
   * @returns {Promise<Decision>} LLM 决策结果
   */
  async makeDecisionWithLLM(order, context = {}, ruleResults = []) {
    if (!this.llmClient) {
      throw new Error('LLM 客户端未初始化');
    }
    
    const prompt = this.buildLLMPrompt(order, context, ruleResults);
    
    try {
      const response = await this.llmClient.invoke(prompt, {
        temperature: 0.3,
        maxTokens: 500
      });
      
      // 解析 LLM 响应
      const llmDecision = this.parseLLMResponse(response.content, order, context);
      
      if (this.enableLogging) {
        console.log('[DecisionEngine] LLM 决策:', {
          result: llmDecision.result,
          confidence: llmDecision.confidence,
          rationale: llmDecision.rationale?.substring(0, 100) + '...'
        });
      }
      
      return llmDecision;
    } catch (error) {
      console.error('[DecisionEngine] LLM 决策失败，降级到规则引擎:', error.message);
      throw error;
    }
  }
  
  /**
   * 构建 LLM Prompt
   */
  buildLLMPrompt(order, context, ruleResults) {
    const rulesSummary = ruleResults.length > 0
      ? ruleResults.map(r => `- ${r.ruleName}: ${r.result} (置信度：${r.confidence})`).join('\n')
      : '没有规则匹配';
    
    return `你是一个 3D 打印农场的智能决策助手。请评估以下订单并给出决策建议。

订单信息：
- 订单 ID: ${order._id || order.id}
- 客户：${order.customerName || '未知'}
- 模型：${order.modelName || '未知'}
- 材料：${order.material || '未知'}
- 体积：${order.volume || 0} cm³
- 当前状态：${order.status || 'pending'}

规则引擎评估结果：
${rulesSummary}

上下文信息：
${JSON.stringify(context, null, 2)}

请分析并回答：
1. 决策结果（只能选一个）：AUTO_APPROVE（自动通过）/ MANUAL_REVIEW（人工审核）/ REJECT（拒绝）
2. 置信度（0-1 之间的小数）
3. 决策理由（简明扼要）

格式要求（严格 JSON）：
{
  "result": "AUTO_APPROVE|MANUAL_REVIEW|REJECT",
  "confidence": 0.8,
  "rationale": "决策理由"
}`;
  }
  
  /**
   * 解析 LLM 响应
   */
  parseLLMResponse(content, order, context) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('LLM 响应不是有效的 JSON 格式');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return new Decision({
        result: parsed.result || DecisionResult.MANUAL_REVIEW,
        confidence: parseFloat(parsed.confidence) || 0.5,
        reason: 'LLM 辅助决策',
        rationale: parsed.rationale || '基于 AI 分析的决策',
        details: {
          source: 'llm',
          llmResponse: content
        }
      });
    } catch (error) {
      console.error('[DecisionEngine] 解析 LLM 响应失败:', error.message);
      
      return new Decision({
        result: DecisionResult.MANUAL_REVIEW,
        confidence: 0.3,
        reason: 'LLM 响应解析失败',
        rationale: '无法解析 AI 响应，转人工审核'
      });
    }
  }
  
  /**
   * 做出最终决策
   * @param {Object} order - 订单对象
   * @param {Object} context - 上下文信息
   * @returns {Promise<Decision>} 决策结果
   */
  async makeDecision(order, context = {}) {
    const startTime = Date.now();
    
    if (this.enableLogging) {
      console.log('[DecisionEngine] 开始评估订单:', order._id || order.id);
    }
    
    // 评估所有规则
    const ruleResults = this.evaluateAllRules(order, context);
    
    if (this.enableLogging) {
      console.log('[DecisionEngine] 规则评估完成，匹配规则数:', ruleResults.length);
      
      if (ruleResults.length > 0) {
        ruleResults.forEach(result => {
          console.log(`  - ${result.ruleName}: ${result.result} (优先级：${result.priority})`);
        });
      }
    }
    
    // 解决冲突
    const finalResult = this.resolveConflict(ruleResults);
    
    const needsLLM = this.enableLLM && (
      !finalResult ||
      finalResult.confidence < 0.6 ||
      finalResult.conflictResolution !== 'auto_approve'
    );
    
    let decision;
    
    if (needsLLM && this.llmClient) {
      try {
        console.log('[DecisionEngine] 触发 LLM 辅助决策...');
        decision = await this.makeDecisionWithLLM(order, context, ruleResults);
        decision.metadata = {
          ...decision.metadata,
          source: 'llm_assisted',
          matchedRules: ruleResults.map(r => ({
            ruleId: r.ruleId,
            ruleName: r.ruleName,
            priority: r.priority
          }))
        };
      } catch (error) {
        console.warn('[DecisionEngine] LLM 决策失败，回退到规则引擎');
        decision = this.createDecisionFromRules(finalResult, ruleResults, startTime);
      }
    } else {
      decision = this.createDecisionFromRules(
        finalResult,
        ruleResults,
        startTime
      );
    }
    
    if (this.enableLogging) {
      console.log('[DecisionEngine] 决策完成:', {
        result: decision.result,
        confidence: decision.confidence,
        evaluationTime: Date.now() - startTime,
        source: decision.metadata?.source || 'rules'
      });
    }
    
    return decision;
  }
  
  /**
   * 从规则结果创建决策
   */
  createDecisionFromRules(finalResult, ruleResults, startTime) {
    if (!finalResult) {
      return new Decision({
        result: DecisionResult.MANUAL_REVIEW,
        confidence: 0.5,
        reason: '没有规则匹配，默认转人工审核',
        rationale: '系统无法自动判断订单情况，需要人工介入'
      });
    }
    
    const decision = new Decision({
      result: finalResult.result,
      confidence: finalResult.confidence,
      reason: finalResult.reason,
      details: finalResult.details,
      rationale: finalResult.rationale || finalResult.rationale
    });
    
    decision.metadata = {
      matchedRules: ruleResults.map(r => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        priority: r.priority
      })),
      conflictResolution: finalResult.conflictResolution,
      totalRulesEvaluated: this.rules.length,
      evaluationTime: Date.now() - startTime,
      source: 'rules'
    };
    
    return decision;
  }
  
  /**
   * 批量评估订单
   * @param {Array} orders - 订单列表
   * @param {Object} context - 上下文信息
   * @returns {Promise<Array>} 决策结果列表
   */
  async batchMakeDecision(orders, context = {}) {
    const results = [];
    
    for (const order of orders) {
      try {
        const decision = await this.makeDecision(order, context);
        results.push({
          orderId: order._id || order.id,
          decision: decision.toJSON(),
          success: true
        });
      } catch (error) {
        results.push({
          orderId: order._id || order.id,
          error: error.message,
          success: false
        });
      }
    }
    
    return results;
  }
}

module.exports = {
  DecisionEngine,
  Decision,
  DecisionResult,
  RulePriority
};
