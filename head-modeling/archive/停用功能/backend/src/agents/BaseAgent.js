/**
 * Agent 基类
 * 
 * 为所有 Agent 提供统一的接口和基础功能
 * 包含工具注册、LLM 调用、错误处理、日志记录等
 */

const { agentEventEmitter, AgentEventType } = require('../utils/AgentEventEmitter');
const { createLLM } = require('../config/llm');

/**
 * Agent 状态枚举
 */
const AgentState = {
  IDLE: 'idle',           // 空闲
  INITIALIZING: 'initializing',  // 初始化中
  READY: 'ready',         // 就绪
  BUSY: 'busy',          // 忙碌
  ERROR: 'error',        // 错误
  SHUTDOWN: 'shutdown'   // 已关闭
};

/**
 * Agent 基类
 * 所有 Agent 必须继承此类并实现相应方法
 */
class BaseAgent {
  /**
   * 创建 Agent 实例
   * 
   * @param {Object} config - Agent 配置
   * @param {string} config.id - Agent 唯一标识
   * @param {string} config.name - Agent 名称
   * @param {string} config.description - Agent 描述
   * @param {Object} config.llmConfig - LLM 配置选项
   */
  constructor(config) {
    if (!config.id || !config.name) {
      throw new Error('Agent 必须配置 id 和 name');
    }

    this.id = config.id;
    this.name = config.name;
    this.description = config.description || '';
    this.llmConfig = config.llmConfig || {};
    
    this.state = AgentState.IDLE;
    this.tools = new Map(); // 工具注册表
    this.llm = null; // LLM 实例
    this.currentTask = null; // 当前任务
    
    console.log(`[Agent] ${this.name} (${this.id}) 实例已创建`);
  }

  /**
   * 初始化 Agent
   * 加载 LLM、注册工具、设置状态
   */
  async initialize() {
    try {
      this.setState(AgentState.INITIALIZING);
      console.log(`[Agent] ${this.name} 正在初始化...`);

      // 创建 LLM 实例
      this.llm = createLLM(this.llmConfig);
      console.log(`[Agent] ${this.name} LLM 已加载`);

      // 注册默认工具
      await this.registerDefaultTools();

      // 注册自定义工具
      await this.registerTools();

      this.setState(AgentState.READY);
      console.log(`[Agent] ${this.name} 初始化完成`);
      
      // 发射状态变化事件
      agentEventEmitter.emitStateChanged({
        agentId: this.id,
        previousState: AgentState.INITIALIZING,
        currentState: AgentState.READY
      });
      
      return true;
    } catch (error) {
      this.setState(AgentState.ERROR);
      console.error(`[Agent] ${this.name} 初始化失败:`, error.message);
      
      agentEventEmitter.emitAgentError({
        agentId: this.id,
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }

  /**
   * 注册默认工具
   * 所有 Agent 都可用基础工具
   */
  async registerDefaultTools() {
    // 可以在这里注册所有 Agent 通用的工具
    console.log(`[Agent] ${this.name} 注册默认工具`);
  }

  /**
   * 注册自定义工具
   * 子类必须实现此方法
   */
  async registerTools() {
    // 子类实现
    console.log(`[Agent] ${this.name} 注册自定义工具`);
  }

  /**
   * 注册工具
   * 
   * @param {string} name - 工具名称
   * @param {Object} tool - 工具对象
   */
  registerTool(name, tool) {
    this.tools.set(name, tool);
    console.log(`[Agent] ${this.name} 注册工具：${name}`);
  }

  /**
   * 获取工具
   * 
   * @param {string} name - 工具名称
   * @returns {Object|null} 工具对象
   */
  getTool(name) {
    return this.tools.get(name) || null;
  }

  /**
   * 列出所有已注册工具
   * 
   * @returns {Array} 工具名称列表
   */
  listTools() {
    return Array.from(this.tools.keys());
  }

  /**
   * 执行任务
   * 子类必须实现此方法
   * 
   * @param {Object} task - 任务信息
   * @returns {Promise<Object>} 执行结果
   */
  async execute(task) {
    throw new Error('子类必须实现 execute 方法');
  }

  /**
   * 调用 LLM
   * 封装 LLM 调用逻辑，包含错误处理和重试
   * 
   * @param {Array|Object} messages - 消息数组或内容字符串
   * @param {Object} options - 调用选项
   * @returns {Promise<Object>} LLM 响应
   */
  async invokeLLM(messages, options = {}) {
    if (!this.llm) {
      throw new Error('LLM 未初始化，请先调用 initialize()');
    }

    const startTime = Date.now();
    
    try {
      // 发射工具调用开始事件
      agentEventEmitter.emitToolCallStarted({
        agentId: this.id,
        name: 'LLM',
        input: { messages, options }
      });

      let response;
      
      // 处理不同类型的输入
      if (Array.isArray(messages)) {
        response = await this.llm.invoke(messages, options);
      } else if (typeof messages === 'string') {
        response = await this.llm.invoke(messages, options);
      } else {
        throw new Error('LLM 输入必须是字符串或消息数组');
      }

      const duration = Date.now() - startTime;

      // 发射工具调用完成事件
      agentEventEmitter.emitToolCallCompleted({
        agentId: this.id,
        name: 'LLM',
        output: response.content,
        duration
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error(`[Agent] ${this.name} LLM 调用失败:`, error.message);
      
      agentEventEmitter.emitAgentError({
        agentId: this.id,
        name: error.name,
        message: `LLM 调用失败：${error.message}`,
        stack: error.stack
      });
      
      throw error;
    }
  }

  /**
   * 调用工具
   * 
   * @param {string} toolName - 工具名称
   * @param {Object} input - 工具输入参数
   * @returns {Promise<Object>} 工具执行结果
   */
  async callTool(toolName, input) {
    const tool = this.getTool(toolName);
    
    if (!tool) {
      throw new Error(`工具不存在：${toolName}`);
    }

    const startTime = Date.now();
    
    try {
      console.log(`[Agent] ${this.name} 调用工具：${toolName}`);
      
      // 发射工具调用开始事件
      agentEventEmitter.emitToolCallStarted({
        agentId: this.id,
        name: toolName,
        input
      });

      // 执行工具
      const output = await tool.execute(input);
      
      const duration = Date.now() - startTime;

      // 发射工具调用完成事件
      agentEventEmitter.emitToolCallCompleted({
        agentId: this.id,
        name: toolName,
        output,
        duration
      });

      return output;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error(`[Agent] ${this.name} 工具调用失败 (${toolName}):`, error.message);
      
      agentEventEmitter.emitAgentError({
        agentId: this.id,
        name: error.name,
        message: `工具 ${toolName} 调用失败：${error.message}`,
        stack: error.stack
      });
      
      throw error;
    }
  }

  /**
   * 设置 Agent 状态
   * 
   * @param {string} newState - 新状态
   */
  setState(newState) {
    const previousState = this.state;
    this.state = newState;
    
    console.log(`[Agent] ${this.name} 状态变化：${previousState} -> ${newState}`);
    
    agentEventEmitter.emitStateChanged({
      agentId: this.id,
      previousState,
      currentState: newState
    });
  }

  /**
   * 获取 Agent 状态
   * 
   * @returns {Object} 状态信息
   */
  getState() {
    return {
      id: this.id,
      name: this.name,
      state: this.state,
      currentTask: this.currentTask,
      tools: this.listTools()
    };
  }

  /**
   * 关闭 Agent
   * 清理资源、关闭连接
   */
  async shutdown() {
    try {
      console.log(`[Agent] ${this.name} 正在关闭...`);
      
      this.setState(AgentState.SHUTDOWN);
      this.currentTask = null;
      
      // 清理工具
      this.tools.clear();
      
      console.log(`[Agent] ${this.name} 已关闭`);
      
      return true;
    } catch (error) {
      console.error(`[Agent] ${this.name} 关闭失败:`, error.message);
      throw error;
    }
  }
}

module.exports = {
  BaseAgent,
  AgentState
};
