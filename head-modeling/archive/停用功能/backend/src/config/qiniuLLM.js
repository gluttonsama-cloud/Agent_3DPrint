/**
 * 七牛云 AI LLM 客户端（简化版）
 * 
 * 直接使用 axios 调用七牛云 API，避免 LangChain 的复杂性和潜在问题
 * 支持 GLM-5 主模型和 DeepSeek 备用模型自动降级
 */

const axios = require('axios');

/**
 * LLM 客户端类
 */
class QiniuLLMClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.QINIU_AI_API_KEY;
    this.baseURL = config.baseURL || process.env.QINIU_AI_BASE_URL || 'https://api.qnaigc.com/v1';
    this.model = config.model || process.env.QINIU_AI_MODEL || 'z-ai/glm-5';
    this.fallbackModel = config.fallbackModel || process.env.QINIU_AI_FALLBACK_MODEL || 'deepseek/deepseek-v3.2-251201';
    this.temperature = config.temperature || parseFloat(process.env.QINIU_AI_TEMPERATURE) || 0.7;
    this.maxTokens = config.maxTokens || parseInt(process.env.QINIU_AI_MAX_TOKENS) || 2048;
    this.timeout = config.timeout || parseInt(process.env.LLM_TIMEOUT) || 30000;
    this.maxRetries = config.maxRetries || parseInt(process.env.LLM_MAX_RETRIES) || 3;
    
    console.log('[QiniuLLM] 初始化:', {
      model: this.model,
      fallbackModel: this.fallbackModel,
      baseURL: this.baseURL,
      timeout: this.timeout
    });
  }
  
  /**
   * 调用 LLM
   * 
   * @param {string|Array} messages - 消息字符串或消息数组
   * @param {Object} options - 调用选项
   * @returns {Promise<{content: string, usage?: Object}>} LLM 响应
   */
  async invoke(messages, options = {}) {
    const messagesArray = Array.isArray(messages)
      ? messages
      : [{ role: 'user', content: messages }];
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this._callAPI(this.model, messagesArray, options);
        return response;
      } catch (error) {
        lastError = error;
        console.warn(`[QiniuLLM] ${this.model} 调用失败 (尝试 ${attempt + 1}/${this.maxRetries + 1}):`, error.message);
        
        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    if (this.model !== this.fallbackModel) {
      console.warn(`[QiniuLLM] ${this.model} 多次失败，降级到 ${this.fallbackModel}`);
      
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const response = await this._callAPI(this.fallbackModel, messagesArray, options);
          return response;
        } catch (error) {
          lastError = error;
          console.warn(`[QiniuLLM] ${this.fallbackModel} 调用失败 (尝试 ${attempt + 1}/${this.maxRetries + 1}):`, error.message);
          
          if (attempt < this.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * 实际调用 API
   * 
   * @private
   */
  async _callAPI(model, messages, options = {}) {
    const url = `${this.baseURL}/chat/completions`;
    
    const payload = {
      model,
      messages,
      temperature: options.temperature || this.temperature,
      max_tokens: options.maxTokens || this.maxTokens
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
    
    const response = await axios.post(url, payload, {
      headers,
      timeout: options.timeout || this.timeout
    });
    
    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      throw new Error('API 响应格式异常');
    }
    
    const choice = response.data.choices[0];
    
    return {
      content: choice.message.content,
      reasoning_content: choice.message.reasoning_content,
      usage: response.data.usage,
      finish_reason: choice.finish_reason
    };
  }
}

module.exports = {
  QiniuLLMClient
};
