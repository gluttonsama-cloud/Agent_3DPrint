/**
 * Agent 注册中心
 * 
 * 管理所有 Agent 实例的注册、查找和状态
 * 提供统一的 Agent 管理和调度接口
 */

const { agentEventEmitter, AgentEventType } = require('../utils/AgentEventEmitter');
const { CoordinatorAgent } = require('./CoordinatorAgent');
const { SchedulerAgent } = require('./SchedulerAgent');
const { InventoryAgent } = require('./InventoryAgent');
const { AgentMessenger } = require('./communication/AgentMessenger');

/**
 * Agent 注册中心类
 * 单例模式，确保全局唯一实例
 */
class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this.agentMetadata = new Map();
    this.messenger = null;
  }

  /**
   * 注册 Agent 实例
   * 
   * @param {Object} agent - Agent 实例
   * @param {Object} metadata - Agent 元数据
   * @returns {boolean} 注册是否成功
   */
  register(agent, metadata = {}) {
    if (!agent || !agent.id) {
      console.error('[AgentRegistry] 注册失败：Agent 必须包含 id 属性');
      return false;
    }

    if (this.agents.has(agent.id)) {
      console.warn(`[AgentRegistry] Agent ${agent.id} 已存在，将被覆盖`);
    }

    this.agents.set(agent.id, agent);
    this.agentMetadata.set(agent.id, {
      name: agent.name,
      description: agent.description,
      registeredAt: new Date().toISOString(),
      state: agent.state || 'unknown',
      ...metadata
    });

    console.log(`[AgentRegistry] Agent 已注册：${agent.id} (${agent.name})`);
    return true;
  }

  /**
   * 获取 Agent 实例
   * 
   * @param {string} agentId - Agent ID
   * @returns {Object|null} Agent 实例
   */
  get(agentId) {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      console.warn(`[AgentRegistry] Agent 未找到：${agentId}`);
      return null;
    }
    
    return agent;
  }

  /**
   * 获取或创建 Agent 通信信使
   * @param {Object} options - 信使配置选项
   * @returns {AgentMessenger} AgentMessenger 实例
   */
  getMessenger(options = {}) {
    if (!this.messenger) {
      this.messenger = new AgentMessenger(options);
      this.messenger.setAgentRegistry(this);
      console.log('[AgentRegistry] AgentMessenger 已创建');
    }
    return this.messenger;
  }

  /**
   * 创建并注册协调 Agent
   * 
   * @param {Object} config - 协调 Agent 配置
   * @returns {Promise<CoordinatorAgent>} 协调 Agent 实例
   */
  async createCoordinatorAgent(config = {}) {
    try {
      const coordinator = new CoordinatorAgent({
        id: config.id || 'coordinator_agent',
        name: config.name || '协调 Agent',
        description: config.description || '多 Agent 系统决策中枢',
        llmConfig: config.llmConfig || {}
      });
      
      coordinator.setAgentRegistry(this);
      
      this.register(coordinator, {
        type: 'coordinator',
        version: '1.0.0',
        capabilities: ['order_processing', 'decision_making', 'agent_coordination']
      });
      
      await coordinator.initialize();
      
      console.log('[AgentRegistry] 协调 Agent 已创建并初始化');
      
      return coordinator;
    } catch (error) {
      console.error('[AgentRegistry] 创建协调 Agent 失败:', error.message);
      throw error;
    }
  }
  
  /**
   * 创建并注册调度 Agent
   * 
   * @param {Object} config - 调度 Agent 配置
   * @returns {Promise<SchedulerAgent>} 调度 Agent 实例
   */
  async createSchedulerAgent(config = {}) {
    try {
      const scheduler = new SchedulerAgent({
        id: config.id || 'scheduler_agent',
        name: config.name || '调度 Agent',
        description: config.description || '负责 3D 打印设备的智能分配和调度',
        llmConfig: config.llmConfig || {},
        enableRules: config.enableRules !== false,
        enableLogging: config.enableLogging !== false,
        defaultStrategy: config.defaultStrategy
      });
      
      this.register(scheduler, {
        type: 'scheduler',
        version: '1.0.0',
        capabilities: ['device_allocation', 'load_balancing', 'schedule_optimization']
      });
      
      await scheduler.initialize();
      
      console.log('[AgentRegistry] 调度 Agent 已创建并初始化');
      
      return scheduler;
    } catch (error) {
      console.error('[AgentRegistry] 创建调度 Agent 失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建并注册库存 Agent
   * 
   * @param {Object} config - 库存 Agent 配置
   * @returns {Promise<InventoryAgent>} 库存 Agent 实例
   */
  async createInventoryAgent(config = {}) {
    try {
      const inventory = new InventoryAgent({
        id: config.id || 'inventory_agent',
        name: config.name || '库存 Agent',
        description: config.description || '负责材料库存检查、消耗预测、补货建议',
        llmConfig: config.llmConfig || {},
        enableNotifications: config.enableNotifications !== false,
        enableLogging: config.enableLogging !== false,
        defaultForecastDays: config.defaultForecastDays || 7,
        defaultForecastMethod: config.defaultForecastMethod,
        notificationThresholds: config.notificationThresholds
      });
      
      this.register(inventory, {
        type: 'inventory',
        version: '1.0.0',
        capabilities: ['inventory_check', 'consumption_forecast', 'reorder_suggestion', 'material_compatibility']
      });
      
      await inventory.initialize();
      
      console.log('[AgentRegistry] 库存 Agent 已创建并初始化');
      
      return inventory;
    } catch (error) {
      console.error('[AgentRegistry] 创建库存 Agent 失败:', error.message);
      throw error;
    }
  }

  /**
   * 列出所有 Agent
   * 
   * @param {Object} options - 选项
   * @param {string} options.state - 按状态过滤
   * @returns {Array} Agent 信息列表
   */
  list(options = {}) {
    const agents = [];
    
    for (const [id, agent] of this.agents.entries()) {
      const metadata = this.agentMetadata.get(id);
      
      // 按状态过滤
      if (options.state && agent.state !== options.state) {
        continue;
      }
      
      agents.push({
        id,
        name: metadata?.name || agent.name,
        description: metadata?.description || agent.description,
        state: agent.state,
        tools: agent.listTools ? agent.listTools() : [],
        registeredAt: metadata?.registeredAt
      });
    }
    
    return agents;
  }

  /**
   * 获取所有可用的 Agent（状态为 ready）
   * 
   * @returns {Array} 可用 Agent 列表
   */
  getAvailableAgents() {
    return this.list({ state: 'ready' });
  }

  /**
   * 获取指定数量的空闲 Agent
   * 
   * @param {number} count - 数量
   * @returns {Array} 空闲 Agent 实例列表
   */
  getIdleAgents(count = 1) {
    const idleAgents = [];
    
    for (const [id, agent] of this.agents.entries()) {
      if (agent.state === 'idle' || agent.state === 'ready') {
        idleAgents.push(agent);
        if (idleAgents.length >= count) {
          break;
        }
      }
    }
    
    return idleAgents;
  }

  /**
   * 移除 Agent
   * 
   * @param {string} agentId - Agent ID
   * @returns {boolean} 移除是否成功
   */
  async remove(agentId) {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      console.warn(`[AgentRegistry] Agent 未找到：${agentId}`);
      return false;
    }

    try {
      // 关闭 Agent
      if (agent.shutdown) {
        await agent.shutdown();
      }
      
      this.agents.delete(agentId);
      this.agentMetadata.delete(agentId);
      
      console.log(`[AgentRegistry] Agent 已移除：${agentId}`);
      return true;
    } catch (error) {
      console.error(`[AgentRegistry] 移除 Agent 失败：${agentId}`, error.message);
      return false;
    }
  }

  /**
   * 更新 Agent 状态
   * 
   * @param {string} agentId - Agent ID
   * @param {string} newState - 新状态
   * @returns {boolean} 更新是否成功
   */
  updateState(agentId, newState) {
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      console.warn(`[AgentRegistry] Agent 未找到：${agentId}`);
      return false;
    }

    const previousState = agent.state;
    agent.state = newState;
    
    const metadata = this.agentMetadata.get(agentId);
    if (metadata) {
      metadata.state = newState;
      metadata.updatedAt = new Date().toISOString();
      this.agentMetadata.set(agentId, metadata);
    }

    console.log(`[AgentRegistry] Agent 状态更新：${agentId} ${previousState} -> ${newState}`);
    return true;
  }

  /**
   * 获取 Agent 统计信息
   * 
   * @returns {Object} 统计信息
   */
  getStats() {
    const agents = Array.from(this.agents.values());
    const stateCounts = {};
    
    agents.forEach(agent => {
      stateCounts[agent.state] = (stateCounts[agent.state] || 0) + 1;
    });

    return {
      total: agents.length,
      byState: stateCounts,
      available: stateCounts['ready'] || 0,
      busy: stateCounts['busy'] || 0
    };
  }

  /**
   * 清空所有 Agent
   */
  async clear() {
    console.log('[AgentRegistry] 清空所有 Agent...');
    
    const agentIds = Array.from(this.agents.keys());
    
    for (const agentId of agentIds) {
      await this.remove(agentId);
    }
    
    console.log('[AgentRegistry] 所有 Agent 已清空');
  }

  /**
   * 初始化所有 Agent
   * 调用所有已注册 Agent 的 initialize 方法
   * 
   * @returns {Promise<Object>} 初始化结果
   */
  async initializeAll() {
    console.log('[AgentRegistry] 初始化所有 Agent...');
    
    const results = {
      success: [],
      failed: []
    };
    
    for (const [id, agent] of this.agents.entries()) {
      try {
        if (agent.initialize) {
          await agent.initialize();
          results.success.push(id);
        } else {
          console.warn(`[AgentRegistry] Agent ${id} 没有 initialize 方法`);
          results.success.push(id);
        }
      } catch (error) {
        console.error(`[AgentRegistry] Agent ${id} 初始化失败:`, error.message);
        results.failed.push({
          id,
          error: error.message
        });
      }
    }
    
    console.log(`[AgentRegistry] 初始化完成：成功 ${results.success.length}, 失败 ${results.failed.length}`);
    return results;
  }

  /**
   * 关闭所有 Agent
   */
  async shutdownAll() {
    console.log('[AgentRegistry] 关闭所有 Agent...');
    
    for (const [id, agent] of this.agents.entries()) {
      try {
        if (agent.shutdown) {
          await agent.shutdown();
        }
      } catch (error) {
        console.error(`[AgentRegistry] Agent ${id} 关闭失败:`, error.message);
      }
    }
    
    // 关闭信使
    if (this.messenger) {
      this.messenger.close();
      this.messenger = null;
    }
    
    console.log('[AgentRegistry] 所有 Agent 已关闭');
  }
  
  /**
   * 创建并注册协调 Agent
   * 
   * @param {Object} config - 协调 Agent 配置
   * @returns {Promise<CoordinatorAgent>} 协调 Agent 实例
   */
  async createCoordinatorAgent(config = {}) {
    try {
      const coordinator = new CoordinatorAgent({
        id: config.id || 'coordinator_agent',
        name: config.name || '协调 Agent',
        description: config.description || '多 Agent 系统决策中枢',
        llmConfig: config.llmConfig || {}
      });
      
      // 设置注册中心引用
      coordinator.setAgentRegistry(this);
      
      // 注册到注册中心
      this.register(coordinator, {
        type: 'coordinator',
        version: '1.0.0',
        capabilities: ['order_processing', 'decision_making', 'agent_coordination']
      });
      
      // 初始化 Agent
      await coordinator.initialize();
      
      console.log('[AgentRegistry] 协调 Agent 已创建并初始化');
      
      return coordinator;
    } catch (error) {
      console.error('[AgentRegistry] 创建协调 Agent 失败:', error.message);
      throw error;
    }
  }
}

// 创建单例实例
const agentRegistry = new AgentRegistry();

module.exports = {
  AgentRegistry,
  agentRegistry
};
