/**
 * Token 优化服务
 * 
 * 提供 LLM Token 使用优化功能：
 * - Prompt 精简和压缩
 * - 响应长度限制
 * - 缓存重复查询
 * - Token 使用统计和监控
 */

const { cacheService, CacheStrategies } = require('./cacheService');

/**
 * Token 优化配置
 */
const TokenOptimizationConfig = {
  // 最大输入 Token 数（根据模型限制）
  maxInputTokens: {
    'gpt-3.5-turbo': 4096,
    'gpt-4': 8192,
    'gpt-4-turbo': 128000,
    'glm-4': 128000,
    'deepseek-v3': 64000,
    'default': 4096
  },
  // 默认最大输出 Token 数
  defaultMaxOutputTokens: 2048,
  // Prompt 压缩阈值（超过此长度则压缩）
  compressionThreshold: 1000,
  // 缓存相似查询的相似度阈值
  similarityThreshold: 0.85,
  // 启用 Prompt 缓存
  enablePromptCache: true,
  // Token 估算系数（中文字符约 1.5 Token，英文约 0.25 Token）
  chineseTokenRatio: 1.5,
  englishTokenRatio: 0.25
};

/**
 * Prompt 模板精简映射
 * 将冗长的描述替换为简洁版本
 */
const PromptTemplates = {
  // 订单审核精简模板
  orderReview: {
    system: '你是订单审核专家。分析订单并提供：可打印性评分(0-1)、预估时间、材料消耗、建议。',
    format: 'JSON格式：{printability, estimatedTime, materialUsage, recommendations[]}'
  },
  // 设备诊断精简模板
  deviceDiagnosis: {
    system: '你是设备诊断专家。根据错误代码和症状，提供：故障原因、置信度(0-1)、维修步骤、所需配件。',
    format: 'JSON格式：{rootCause, confidence, repairSteps[], requiredParts[]}'
  },
  // 库存预测精简模板
  inventoryPrediction: {
    system: '你是库存管理专家。根据历史数据预测未来库存状态，识别短缺风险。',
    format: 'JSON格式：{predictions[], alerts[], recommendations[]}'
  },
  // Agent 决策精简模板
  agentDecision: {
    system: '你是AI决策助手。根据上下文做出最优决策并解释理由。',
    format: 'JSON格式：{decision, confidence, reasoning, alternatives[]}'
  }
};

/**
 * Token 优化服务类
 */
class TokenOptimizerService {
  constructor() {
    // Token 使用统计
    this.tokenStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalSavedByCache: 0,
      totalSavedByCompression: 0,
      apiCalls: 0,
      cacheHits: 0
    };
    
    // Prompt 缓存（内存缓存，用于高频查询）
    this.promptCache = new Map();
    
    // 查询历史（用于相似性检测）
    this.queryHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * 估算文本 Token 数量
   * 使用近似算法，不依赖外部 tokenizer
   * 
   * @param {string} text - 输入文本
   * @returns {number} 估算的 Token 数
   */
  estimateTokens(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }
    
    // 分离中英文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const numbers = (text.match(/\d+/g) || []).length;
    const punctuation = (text.match(/[^\w\s\u4e00-\u9fa5]/g) || []).length;
    const whitespace = (text.match(/\s+/g) || []).length;
    
    // 计算估算 Token 数
    const tokens = 
      chineseChars * TokenOptimizationConfig.chineseTokenRatio +
      englishWords * TokenOptimizationConfig.englishTokenRatio +
      numbers * 0.5 +
      punctuation * 0.5 +
      whitespace * 0.1;
    
    return Math.ceil(tokens);
  }

  /**
   * 精简 Prompt
   * 移除冗余内容，保留核心信息
   * 
   * @param {string} prompt - 原始 Prompt
   * @param {string} templateType - 模板类型（可选）
   * @returns {Object} 精简后的 Prompt 和节省的 Token 数
   */
  compressPrompt(prompt, templateType = null) {
    if (!prompt) {
      return { prompt: '', savedTokens: 0 };
    }
    
    let compressed = prompt;
    let savedTokens = 0;
    const originalTokens = this.estimateTokens(prompt);
    
    // 如果有匹配的模板，使用精简模板
    if (templateType && PromptTemplates[templateType]) {
      const template = PromptTemplates[templateType];
      compressed = `${template.system}\n\n${template.format}\n\n输入数据：`;
      savedTokens = originalTokens - this.estimateTokens(compressed);
      
      return { prompt: compressed, savedTokens, usedTemplate: true };
    }
    
    // 通用压缩策略
    // 1. 移除多余空白
    compressed = compressed.replace(/\s+/g, ' ').trim();
    
    // 2. 移除重复的标点符号
    compressed = compressed.replace(/([。，！？；：])\1+/g, '$1');
    
    // 3. 移除重复的句子
    const sentences = compressed.split(/[。！？\n]/);
    const uniqueSentences = [...new Set(sentences.filter(s => s.trim()))];
    compressed = uniqueSentences.join('。');
    
    // 4. 如果仍然过长，截断到阈值
    if (this.estimateTokens(compressed) > TokenOptimizationConfig.compressionThreshold) {
      const truncated = compressed.substring(0, TokenOptimizationConfig.compressionThreshold * 2);
      compressed = truncated + '...';
    }
    
    savedTokens = originalTokens - this.estimateTokens(compressed);
    
    return { 
      prompt: compressed, 
      savedTokens: Math.max(0, savedTokens),
      usedTemplate: false 
    };
  }

  /**
   * 限制响应长度
   * 根据配置设置最大输出 Token 数
   * 
   * @param {string} model - 模型名称
   * @param {number} maxTokens - 期望的最大 Token 数
   * @returns {number} 调整后的最大 Token 数
   */
  limitResponseLength(model, maxTokens = null) {
    const defaultMax = TokenOptimizationConfig.defaultMaxOutputTokens;
    
    if (maxTokens && maxTokens > 0) {
      return Math.min(maxTokens, defaultMax);
    }
    
    return defaultMax;
  }

  /**
   * 获取模型的最大输入 Token 数
   * 
   * @param {string} model - 模型名称
   * @returns {number} 最大输入 Token 数
   */
  getMaxInputTokens(model) {
    const modelKey = Object.keys(TokenOptimizationConfig.maxInputTokens).find(key => 
      model.toLowerCase().includes(key.toLowerCase())
    );
    
    return TokenOptimizationConfig.maxInputTokens[modelKey] || 
           TokenOptimizationConfig.maxInputTokens.default;
  }

  /**
   * 检查并截断过长的输入
   * 
   * @param {string} text - 输入文本
   * @param {string} model - 模型名称
   * @returns {Object} 处理后的文本和是否被截断
   */
  checkAndTruncateInput(text, model) {
    const maxTokens = this.getMaxInputTokens(model);
    const currentTokens = this.estimateTokens(text);
    
    if (currentTokens <= maxTokens * 0.8) {
      return { text, truncated: false, tokens: currentTokens };
    }
    
    // 需要截断，保留 80% 的空间给输入
    const targetTokens = Math.floor(maxTokens * 0.8);
    const ratio = targetTokens / currentTokens;
    const targetLength = Math.floor(text.length * ratio);
    
    const truncatedText = text.substring(0, targetLength) + '...[内容已截断]';
    
    return { 
      text: truncatedText, 
      truncated: true, 
      originalTokens: currentTokens,
      newTokens: this.estimateTokens(truncatedText)
    };
  }

  /**
   * 缓存查询结果
   * 
   * @param {string} query - 查询内容
   * @param {any} result - 查询结果
   * @param {string} cacheType - 缓存类型
   */
  async cacheQuery(query, result, cacheType = 'AGENT_DECISION') {
    const queryHash = this._generateQueryHash(query);
    
    // 存入内存缓存
    this.promptCache.set(queryHash, {
      result,
      timestamp: Date.now()
    });
    
    // 存入 Redis 缓存
    try {
      await cacheService.set(cacheType, queryHash, result);
    } catch (error) {
      console.warn('[TokenOptimizer] 缓存写入失败:', error.message);
    }
    
    // 更新查询历史
    this._updateQueryHistory(query, queryHash);
  }

  /**
   * 查找缓存的查询结果
   * 
   * @param {string} query - 查询内容
   * @param {string} cacheType - 缓存类型
   * @returns {Object|null} 缓存结果或 null
   */
  async findCachedQuery(query, cacheType = 'AGENT_DECISION') {
    const queryHash = this._generateQueryHash(query);
    
    // 先查内存缓存
    const memCached = this.promptCache.get(queryHash);
    if (memCached && Date.now() - memCached.timestamp < 15 * 60 * 1000) {
      this.tokenStats.cacheHits++;
      this.tokenStats.totalSavedByCache += this.estimateTokens(query);
      return { result: memCached.result, source: 'memory' };
    }
    
    // 查 Redis 缓存
    try {
      const redisCached = await cacheService.get(cacheType, queryHash);
      if (redisCached) {
        // 回填内存缓存
        this.promptCache.set(queryHash, {
          result: redisCached,
          timestamp: Date.now()
        });
        
        this.tokenStats.cacheHits++;
        this.tokenStats.totalSavedByCache += this.estimateTokens(query);
        return { result: redisCached, source: 'redis' };
      }
    } catch (error) {
      console.warn('[TokenOptimizer] 缓存查询失败:', error.message);
    }
    
    // 查找相似查询
    const similar = this._findSimilarQuery(query);
    if (similar) {
      this.tokenStats.cacheHits++;
      this.tokenStats.totalSavedByCache += this.estimateTokens(query);
      return { result: similar.result, source: 'similar', similarity: similar.similarity };
    }
    
    return null;
  }

  /**
   * 生成查询哈希
   * @private
   */
  _generateQueryHash(query) {
    // 简单哈希函数
    let hash = 0;
    const str = query.trim().toLowerCase();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(16);
  }

  /**
   * 更新查询历史
   * @private
   */
  _updateQueryHistory(query, hash) {
    this.queryHistory.push({
      query,
      hash,
      timestamp: Date.now()
    });
    
    // 保持历史记录在限制内
    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory.shift();
    }
  }

  /**
   * 查找相似查询
   * @private
   */
  _findSimilarQuery(query) {
    const queryLower = query.trim().toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    
    let bestMatch = null;
    let bestSimilarity = 0;
    
    for (const item of this.queryHistory) {
      const itemWords = item.query.trim().toLowerCase().split(/\s+/);
      
      // 计算 Jaccard 相似度
      const intersection = queryWords.filter(w => itemWords.includes(w));
      const union = [...new Set([...queryWords, ...itemWords])];
      const similarity = intersection.length / union.length;
      
      if (similarity >= TokenOptimizationConfig.similarityThreshold && 
          similarity > bestSimilarity) {
        const cached = this.promptCache.get(item.hash);
        if (cached) {
          bestMatch = { result: cached.result, similarity };
          bestSimilarity = similarity;
        }
      }
    }
    
    return bestMatch;
  }

  /**
   * 记录 Token 使用情况
   * 
   * @param {number} inputTokens - 输入 Token 数
   * @param {number} outputTokens - 输出 Token 数
   * @param {string} model - 模型名称
   */
  recordTokenUsage(inputTokens, outputTokens, model) {
    this.tokenStats.totalInputTokens += inputTokens;
    this.tokenStats.totalOutputTokens += outputTokens;
    this.tokenStats.apiCalls++;
    
    console.log(`[TokenOptimizer] Token 使用: 输入 ${inputTokens}, 输出 ${outputTokens}, 模型 ${model}`);
  }

  /**
   * 获取 Token 使用统计
   * 
   * @returns {Object} 统计信息
   */
  getStats() {
    const totalTokens = this.tokenStats.totalInputTokens + this.tokenStats.totalOutputTokens;
    const totalSaved = this.tokenStats.totalSavedByCache + this.tokenStats.totalSavedByCompression;
    
    return {
      usage: {
        totalInputTokens: this.tokenStats.totalInputTokens,
        totalOutputTokens: this.tokenStats.totalOutputTokens,
        totalTokens,
        apiCalls: this.tokenStats.apiCalls,
        avgInputPerCall: this.tokenStats.apiCalls > 0 
          ? Math.round(this.tokenStats.totalInputTokens / this.tokenStats.apiCalls) 
          : 0,
        avgOutputPerCall: this.tokenStats.apiCalls > 0 
          ? Math.round(this.tokenStats.totalOutputTokens / this.tokenStats.apiCalls) 
          : 0
      },
      savings: {
        byCache: this.tokenStats.totalSavedByCache,
        byCompression: this.tokenStats.totalSavedByCompression,
        total: totalSaved,
        savingsRate: totalTokens > 0 
          ? ((totalSaved / (totalTokens + totalSaved)) * 100).toFixed(2) + '%' 
          : '0%'
      },
      cache: {
        hits: this.tokenStats.cacheHits,
        hitRate: this.tokenStats.apiCalls > 0 
          ? ((this.tokenStats.cacheHits / this.tokenStats.apiCalls) * 100).toFixed(2) + '%' 
          : '0%',
        memoryCacheSize: this.promptCache.size,
        historySize: this.queryHistory.length
      }
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.tokenStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalSavedByCache: 0,
      totalSavedByCompression: 0,
      apiCalls: 0,
      cacheHits: 0
    };
    
    this.queryHistory = [];
    
    console.log('[TokenOptimizer] 统计信息已重置');
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.promptCache.clear();
    this.queryHistory = [];
    console.log('[TokenOptimizer] 缓存已清理');
  }

  /**
   * 创建优化后的 LLM 调用包装器
   * 
   * @param {Object} llm - LLM 实例
   * @param {Object} options - 优化选项
   * @returns {Object} 包装后的 LLM 实例
   */
  createOptimizedLLMWrapper(llm, options = {}) {
    const {
      enableCache = true,
      enableCompression = true,
      templateType = null,
      maxOutputTokens = null
    } = options;
    
    const originalInvoke = llm.invoke.bind(llm);
    const self = this;
    
    llm.invoke = async function(messages, invokeOptions = {}) {
      // 处理消息格式
      const messageText = Array.isArray(messages) 
        ? messages.map(m => m.content || m).join('\n')
        : messages;
      
      // 检查缓存
      if (enableCache) {
        const cached = await self.findCachedQuery(messageText);
        if (cached) {
          console.log(`[TokenOptimizer] 使用缓存结果 (${cached.source})`);
          return cached.result;
        }
      }
      
      // 压缩 Prompt
      let optimizedMessages = messages;
      let savedTokens = 0;
      
      if (enableCompression && typeof messageText === 'string') {
        const compressed = self.compressPrompt(messageText, templateType);
        if (compressed.savedTokens > 0) {
          savedTokens = compressed.savedTokens;
          self.tokenStats.totalSavedByCompression += savedTokens;
          
          if (Array.isArray(messages)) {
            optimizedMessages = messages.map((m, i) => 
              i === messages.length - 1 
                ? { ...m, content: compressed.prompt }
                : m
            );
          } else {
            optimizedMessages = compressed.prompt;
          }
        }
      }
      
      // 设置最大输出 Token
      const finalOptions = {
        ...invokeOptions,
        maxTokens: self.limitResponseLength(
          invokeOptions.model || 'default', 
          maxOutputTokens
        )
      };
      
      // 调用原始 LLM
      const result = await originalInvoke(optimizedMessages, finalOptions);
      
      // 记录 Token 使用
      const inputTokens = self.estimateTokens(messageText);
      const outputTokens = self.estimateTokens(result.content || JSON.stringify(result));
      self.recordTokenUsage(inputTokens, outputTokens, invokeOptions.model || 'unknown');
      
      // 缓存结果
      if (enableCache) {
        await self.cacheQuery(messageText, result);
      }
      
      return result;
    };
    
    return llm;
  }

  /**
   * 批量优化多个 Prompt
   * 
   * @param {Array<string>} prompts - Prompt 数组
   * @param {string} templateType - 模板类型
   * @returns {Object} 优化结果
   */
  batchCompressPrompts(prompts, templateType = null) {
    const results = prompts.map(prompt => this.compressPrompt(prompt, templateType));
    
    const totalSaved = results.reduce((sum, r) => sum + r.savedTokens, 0);
    
    return {
      prompts: results.map(r => r.prompt),
      totalSavedTokens: totalSaved,
      avgSavedTokens: results.length > 0 ? Math.round(totalSaved / results.length) : 0
    };
  }
}

// 导出单例和配置
const tokenOptimizerService = new TokenOptimizerService();

module.exports = {
  TokenOptimizerService,
  tokenOptimizerService,
  TokenOptimizationConfig,
  PromptTemplates
};