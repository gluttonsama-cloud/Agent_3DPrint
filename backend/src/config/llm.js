/**
 * LLM 配置文件
 * 
 * 为 LangChain.js Agent 系统提供 LLM 连接配置
 * 支持多种 LLM 提供商（OpenAI、Claude、本地模型）
 * 支持环境变量配置、连接超时、重试机制
 */

const { ChatOpenAI } = require('@langchain/openai');

/**
 * LLM 提供商枚举
 */
const LLMProvider = {
  OPENAI: 'openai',
  CLAUDE: 'claude',
  ZHIPU: 'zhipu',  // 智谱 AI
  QINIU: 'qiniu',   // 七牛云 AI（GLM-5/DeepSeek）
  LOCAL: 'local'
};

/**
 * LLM 配置选项
 * 从环境变量读取配置，支持多种 LLM 提供商
 */
const llmConfig = {
  // LLM 提供商（openai, claude, zhipu, qiniu, local）
  provider: process.env.LLM_PROVIDER || LLMProvider.OPENAI,
  // API 密钥
  apiKey: process.env.LLM_API_KEY || 
          process.env.OPENAI_API_KEY || 
          process.env.ZHIPU_API_KEY || 
          process.env.QINIU_AI_API_KEY || 
          '',
  // 模型名称
  model: process.env.LLM_MODEL || 
         process.env.OPENAI_MODEL || 
         process.env.ZHIPU_MODEL || 
         process.env.QINIU_AI_MODEL || 
         'gpt-3.5-turbo',
  // 基础 API URL（用于本地模型或自定义端点）
  baseUrl: process.env.LLM_BASE_URL || 
           process.env.QINIU_AI_BASE_URL || 
           undefined,
  // 连接超时时间（毫秒）
  timeout: parseInt(process.env.LLM_TIMEOUT, 10) || 30000,
  // 最大重试次数
  maxRetries: parseInt(process.env.LLM_MAX_RETRIES, 10) || 3,
  // 温度参数（0-1，控制输出随机性）
  temperature: parseFloat(process.env.LLM_TEMPERATURE) || 
               parseFloat(process.env.QINIU_AI_TEMPERATURE) || 
               0.7,
  // 最大 token 数
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS, 10) || 
             parseInt(process.env.QINIU_AI_MAX_TOKENS) || 
             2048,
  // 备用模型（七牛云专用）
  fallbackModel: process.env.QINIU_AI_FALLBACK_MODEL || 'deepseek/deepseek-v3.2-251201'
};

/**
 * 验证 LLM 配置是否完整
 * 
 * @returns {{valid: boolean, missing: string[]}} 验证结果
 */
function validateConfig() {
  const missing = [];
  
  if (!llmConfig.apiKey) {
    missing.push('LLM_API_KEY');
  }
  
  if (!llmConfig.model) {
    missing.push('LLM_MODEL');
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * 创建 LLM 实例
 * 根据配置的提供商创建对应的 LLM 客户端
 * 
 * @param {Object} options - 覆盖配置选项
 * @returns {Object} LLM 实例
 */
function createLLM(options = {}) {
  // 合并默认配置和覆盖选项
  const config = { ...llmConfig, ...options };
  
  console.log('[LLM] 创建 LLM 实例:', {
    provider: config.provider,
    model: config.model,
    timeout: config.timeout
  });
  
  // 根据提供商创建不同的 LLM 实例
  switch (config.provider) {
    case LLMProvider.OPENAI:
      return createOpenAI(config);
    
    case LLMProvider.CLAUDE:
      return createClaude(config);
    
    case LLMProvider.ZHIPU:
      return createZhipu(config);
    
    case LLMProvider.QINIU:
      return createQiniu(config);
    
    case LLMProvider.LOCAL:
      return createLocal(config);
    
    default:
      console.warn(`[LLM] 未知提供商 "${config.provider}"，使用 OpenAI 默认配置`);
      return createOpenAI(config);
  }
}

/**
 * 创建 OpenAI LLM 实例
 * 
 * @param {Object} config - LLM 配置
 * @returns {ChatOpenAI} OpenAI 聊天模型实例
 */
function createOpenAI(config) {
  const llm = new ChatOpenAI({
    model: config.model,  // 新版本 LangChain 使用 model 而不是 modelName
    apiKey: config.apiKey,  // 新版本使用 apiKey 而不是 openAIApiKey
    baseURL: config.baseUrl,
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    temperature: config.temperature,
    maxTokens: config.maxTokens
  });
  
  console.log('[LLM] OpenAI 实例创建成功');
  return llm;
}

/**
 * 创建 Claude LLM 实例
 * 注意：需要安装 @langchain/anthropic 包
 * 
 * @param {Object} config - LLM 配置
 * @returns {Object} Claude 聊天模型实例
 */
function createClaude(config) {
  try {
    const { ChatAnthropic } = require('@langchain/anthropic');
    
    const llm = new ChatAnthropic({
      modelName: config.model,
      anthropicApiKey: config.apiKey,
      timeout: config.timeout,
      maxRetries: config.maxRetries,
      temperature: config.temperature,
      maxTokens: config.maxTokens
    });
    
    console.log('[LLM] Claude 实例创建成功');
    return llm;
  } catch (error) {
    console.error('[LLM] 创建 Claude 实例失败，请安装 @langchain/anthropic 包');
    console.error('[LLM] 回退到 OpenAI');
    return createOpenAI(config);
  }
}

/**
 * 创建智谱 AI LLM 实例
 * 使用原生 SDK 并包装成 LangChain 兼容接口
 * 
 * @param {Object} config - LLM 配置
 * @returns {Object} 兼容 LangChain 接口的智谱 AI 实例
 */
function createZhipu(config) {
  try {
    // 动态导入智谱 AI SDK
    const { ZhipuAI } = require('zhipuai');
    
    // 创建智谱 AI 客户端
    const client = new ZhipuAI({
      apiKey: config.apiKey
    });
    
    console.log('[LLM] 智谱 AI 客户端创建成功');
    
    // 包装成 LangChain 兼容接口
    return {
      /**
       * 调用 LLM（LangChain 兼容接口）
       * @param {string|Array} messages - 消息字符串或消息数组
       * @param {Object} options - 调用选项
       * @returns {Promise<{content: string}>} 响应内容
       */
      invoke: async (messages, options = {}) => {
        try {
          // 统一处理消息格式
          const messagesArray = Array.isArray(messages) 
            ? messages 
            : [{ role: 'user', content: messages }];
          
          // 调用智谱 AI API
          const response = await client.chat.completions.create({
            model: config.model || 'glm-4-flash',
            messages: messagesArray,
            temperature: options.temperature || config.temperature,
            max_tokens: options.maxTokens || config.maxTokens
          });
          
          // 返回 LangChain 兼容格式
          return {
            content: response.choices[0].message.content,
            usage: response.usage,
            finish_reason: response.choices[0].finish_reason
          };
        } catch (error) {
          console.error('[LLM] 智谱 AI 调用失败:', error.message);
          throw error;
        }
      }
    };
  } catch (error) {
    console.error('[LLM] 创建智谱 AI 实例失败，请安装 zhipuai 包');
    console.error('[LLM] 错误详情:', error.message);
    console.error('[LLM] 回退到 OpenAI');
    return createOpenAI(config);
  }
}

/**
 * 创建七牛云 AI LLM 实例
 * 兼容 OpenAI 接口，支持 GLM-5 和 DeepSeek 模型
 * 
 * @param {Object} config - LLM 配置
 * @returns {ChatOpenAI} 兼容 OpenAI 接口的七牛云 AI 实例
 */
function createQiniu(config) {
  console.log('[LLM] 创建七牛云 AI 实例:', {
    model: config.model,
    baseUrl: config.baseUrl,
    fallbackModel: config.fallbackModel
  });
  
  // 使用 ChatOpenAI，配置七牛云的 baseURL
  const llm = new ChatOpenAI({
    model: config.model || 'z-ai/glm-5',
    apiKey: config.apiKey,  // 新版本 LangChain 使用 apiKey
    baseURL: config.baseUrl || 'https://api.qnaigc.com/v1',
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    temperature: config.temperature,
    maxTokens: config.maxTokens
  });
  
  console.log('[LLM] 七牛云 AI 实例创建成功（主模型：GLM-5）');
  
  // 包装一层，支持自动降级到 DeepSeek
  const originalInvoke = llm.invoke.bind(llm);
  llm.invoke = async (messages, options = {}) => {
    try {
      return await originalInvoke(messages, options);
    } catch (error) {
      // GLM-5 失败时，尝试使用 DeepSeek
      if (config.model !== config.fallbackModel) {
        console.warn('[LLM] GLM-5 调用失败，降级到 DeepSeek:', error.message);
        
        const fallbackLLM = new ChatOpenAI({
          model: config.fallbackModel,
          apiKey: config.apiKey,
          baseURL: config.baseUrl || 'https://api.qnaigc.com/v1',
          timeout: config.timeout,
          maxRetries: config.maxRetries,
          temperature: config.temperature,
          maxTokens: config.maxTokens
        });
        
        return await fallbackLLM.invoke(messages, options);
      }
      
      throw error;
    }
  };
  
  return llm;
}

/**
 * 创建本地 LLM 实例
 * 用于连接本地部署的模型（如 Ollama、vLLM 等）
 * 
 * @param {Object} config - LLM 配置
 * @returns {ChatOpenAI} 兼容 OpenAI 接口的本地模型实例
 */
function createLocal(config) {
  if (!config.baseUrl) {
    throw new Error('[LLM] 本地模型需要配置 LLM_BASE_URL');
  }
  
  const llm = new ChatOpenAI({
    modelName: config.model,
    openAIApiKey: config.apiKey || 'ollama', // 本地模型通常不需要 API 密钥
    configuration: {
      baseURL: config.baseUrl
    },
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    temperature: config.temperature,
    maxTokens: config.maxTokens
  });
  
  console.log('[LLM] 本地模型实例创建成功:', config.baseUrl);
  return llm;
}

/**
 * 测试 LLM 连接
 * 发送简单的测试消息验证连接是否正常
 * 
 * @param {Object} llm - LLM 实例
 * @returns {Promise<boolean>} 连接是否成功
 */
async function testConnection(llm) {
  try {
    console.log('[LLM] 测试连接...');
    
    // 发送简单的测试消息
    const response = await llm.invoke('你好，请回复"OK"表示连接正常');
    
    console.log('[LLM] 连接测试成功:', response.content);
    return true;
  } catch (error) {
    console.error('[LLM] 连接测试失败:', error.message);
    return false;
  }
}

/**
 * 获取当前 LLM 配置信息
 * 
 * @returns {Object} 配置信息（不包含敏感信息）
 */
function getConfigInfo() {
  return {
    provider: llmConfig.provider,
    model: llmConfig.model,
    baseUrl: llmConfig.baseUrl ? '***' : undefined,
    timeout: llmConfig.timeout,
    maxRetries: llmConfig.maxRetries,
    temperature: llmConfig.temperature,
    maxTokens: llmConfig.maxTokens
  };
}

module.exports = {
  LLMProvider,
  llmConfig,
  validateConfig,
  createLLM,
  createOpenAI,
  createClaude,
  createZhipu,
  createQiniu,
  createLocal,
  testConnection,
  getConfigInfo
};
