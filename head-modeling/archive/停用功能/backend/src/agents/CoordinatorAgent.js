/**
 * 协调 Agent（Coordinator Agent）
 * 
 * 多 Agent 系统的决策中枢
 * 负责接收订单、协调其他 Agent、做出最终决策
 */

const { BaseAgent, AgentState } = require('./BaseAgent');
const { DecisionEngine, DecisionResult } = require('./DecisionEngine');
const { AgentMessenger } = require('./communication/AgentMessenger');
const { createOrderStateMachine, OrderStates } = require('../states/OrderStateMachine');
const AgentDecision = require('../models/AgentDecision');
const Order = require('../models/Order');
const { decisionLogService } = require('../services/DecisionLogService');
const orderTools = require('./tools/orderTools');

/**
 * 协调任务类型
 */
const CoordinationTaskType = {
  PROCESS_ORDER: 'process_order',           // 处理订单
  CHECK_STOCK: 'check_stock',               // 检查库存
  SCHEDULE_DEVICE: 'schedule_device',       // 调度设备
  MANUAL_REVIEW: 'manual_review',           // 人工审核
  QUERY_STATUS: 'query_status'              // 查询状态
};

/**
 * 协调 Agent 类
 */
class CoordinatorAgent extends BaseAgent {
  /**
   * 创建协调 Agent 实例
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    super({
      id: config.id || 'coordinator_agent',
      name: config.name || '协调 Agent',
      description: config.description || '多 Agent 系统决策中枢，负责订单协调和决策',
      llmConfig: config.llmConfig || {}
    });
    
    // 决策引擎
    this.decisionEngine = null;
    
    // Agent 通信信使
    this.messenger = null;
    
    // Agent 注册中心引用
    this.agentRegistry = null;
    
    // 订单状态机缓存
    this.stateMachines = new Map();
    
    // 当前处理的任务
    this.coordinationTasks = new Map();
  }
  
  /**
   * 设置 Agent 注册中心
   * @param {Object} registry - AgentRegistry 实例
   */
  setAgentRegistry(registry) {
    this.agentRegistry = registry;
  }
  
  /**
   * 注册默认工具
   */
  async registerDefaultTools() {
    console.log(`[CoordinatorAgent] ${this.name} 注册默认工具`);
    
    // 注册订单工具
    for (const [toolName, tool] of Object.entries(orderTools)) {
      this.registerTool(toolName, tool);
    }
  }
  
  /**
   * 注册自定义工具
   */
  async registerTools() {
    console.log(`[CoordinatorAgent] ${this.name} 注册协调工具`);
    
    // 注册协调专用工具
    this.registerTool('coordinateOrder', {
      name: 'coordinateOrder',
      description: '协调订单处理流程',
      inputSchema: {
        type: 'object',
        properties: {
          orderId: {
            type: 'string',
            description: '订单 ID'
          }
        },
        required: ['orderId']
      },
      execute: async (input) => {
        return await this.processOrder(input.orderId);
      }
    });
    
    this.registerTool('makeDecision', {
      name: 'makeDecision',
      description: '对订单做出决策',
      inputSchema: {
        type: 'object',
        properties: {
          orderId: {
            type: 'string',
            description: '订单 ID'
          },
          context: {
            type: 'object',
            description: '决策上下文'
          }
        },
        required: ['orderId']
      },
      execute: async (input) => {
        return await this.makeDecision(input.orderId, input.context);
      }
    });
  }
  
  /**
   * 初始化 Agent
   */
  async initialize() {
    try {
      this.setState(AgentState.INITIALIZING);
      console.log(`[CoordinatorAgent] ${this.name} 正在初始化...`);
      
      // 创建决策引擎
      this.decisionEngine = new DecisionEngine({
        enableLogging: true
      });
      
      // 创建 Agent 通信信使
      this.messenger = new AgentMessenger({
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        enableLogging: true
      });
      
      // 设置 Agent 注册中心
      if (this.agentRegistry) {
        this.messenger.setAgentRegistry(this.agentRegistry);
      }
      
      console.log('[CoordinatorAgent] 决策引擎和通信模块已初始化');
      
      // 调用父类初始化
      await super.initialize();
      
      this.setState(AgentState.READY);
      console.log(`[CoordinatorAgent] ${this.name} 初始化完成`);
      
      return true;
    } catch (error) {
      this.setState(AgentState.ERROR);
      console.error('[CoordinatorAgent] 初始化失败:', error.message);
      throw error;
    }
  }
  
  /**
   * 执行任务
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
        case CoordinationTaskType.PROCESS_ORDER:
          result = await this.processOrder(task.orderId);
          break;
          
        case CoordinationTaskType.CHECK_STOCK:
          result = await this.checkStock(task.orderId);
          break;
          
        case CoordinationTaskType.SCHEDULE_DEVICE:
          result = await this.scheduleDevice(task.orderId);
          break;
          
        case CoordinationTaskType.MANUAL_REVIEW:
          result = await this.requestManualReview(task.orderId, task.reason);
          break;
          
        case CoordinationTaskType.QUERY_STATUS:
          result = await this.queryStatus(task.orderId);
          break;
          
        default:
          throw new Error(`未知的任务类型：${task.type}`);
      }
      
      return result;
    } catch (error) {
      console.error('[CoordinatorAgent] 任务执行失败:', error.message);
      throw error;
    } finally {
      this.currentTask = null;
      this.setState(AgentState.READY);
    }
  }
  
  /**
   * 处理订单（核心方法）
   * @param {string} orderId - 订单 ID
   * @returns {Promise<Object>} 处理结果
   */
  async processOrder(orderId) {
    const taskId = `task_${Date.now()}_${orderId}`;
    
    console.log('[CoordinatorAgent] 开始处理订单:', orderId);
    
    // 创建任务记录
    const task = {
      id: taskId,
      orderId,
      type: CoordinationTaskType.PROCESS_ORDER,
      status: 'processing',
      startTime: Date.now(),
      steps: []
    };
    
    this.coordinationTasks.set(taskId, task);
    
    try {
      // 步骤 1: 获取订单详情
      task.steps.push({ name: '获取订单详情', status: 'processing' });
      const orderResult = await this.callTool('getOrderById', { orderId });
      
      if (!orderResult.success) {
        throw new Error(`获取订单失败：${orderResult.error}`);
      }
      
      task.steps[0].status = 'completed';
      task.steps[0].result = orderResult;
      
      const order = orderResult.order;
      
      // 步骤 2: 调用调度 Agent 分配设备
      task.steps.push({ name: '调度设备', status: 'processing' });
      const scheduleResult = await this.scheduleDevice(orderId);
      task.steps[1].status = 'completed';
      task.steps[1].result = scheduleResult;
      
      // 步骤 3: 调用库存 Agent 检查材料
      task.steps.push({ name: '检查库存', status: 'processing' });
      const stockResult = await this.checkStock(orderId);
      task.steps[2].status = 'completed';
      task.steps[2].result = stockResult;
      
      // 步骤 4: 决策引擎评估
      task.steps.push({ name: '决策评估', status: 'processing' });
      const decisionContext = {
        stockInfo: stockResult.stockInfo || {},
        scheduleInfo: scheduleResult.scheduleInfo || {}
      };
      
      const decision = await this.makeDecision(orderId, decisionContext);
      task.steps[3].status = 'completed';
      task.steps[3].result = decision;
      
      // 步骤 5: 记录决策
      task.steps.push({ name: '记录决策', status: 'processing' });
      await this.recordDecision(orderId, decision);
      task.steps[4].status = 'completed';
      
      // 步骤 6: 更新订单状态
      task.steps.push({ name: '更新订单状态', status: 'processing' });
      if (decision.result === DecisionResult.AUTO_APPROVE) {
        await this.updateOrderStatus(orderId, OrderStates.SCHEDULED);
      } else if (decision.result === DecisionResult.MANUAL_REVIEW) {
        await this.updateOrderStatus(orderId, OrderStates.REVIEWING);
      }
      task.steps[5].status = 'completed';
      
      // 更新任务状态
      task.status = 'completed';
      task.endTime = Date.now();
      task.result = {
        orderId,
        decision: decision,
        status: task.status
      };
      
      console.log('[CoordinatorAgent] 订单处理完成:', orderId, decision.result);
      
      return task.result;
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = Date.now();
      
      console.error('[CoordinatorAgent] 订单处理失败:', orderId, error.message);
      
      throw error;
    }
  }
  
  /**
   * 做出决策
   * @param {string} orderId - 订单 ID
   * @param {Object} context - 决策上下文
   * @returns {Promise<Object>} 决策结果
   */
  async makeDecision(orderId, context = {}) {
    console.log('[CoordinatorAgent] 开始决策评估:', orderId);
    
    // 获取订单
    const orderResult = await this.callTool('getOrderById', { orderId });
    
    if (!orderResult.success) {
      throw new Error(`获取订单失败：${orderResult.error}`);
    }
    
    const order = orderResult.order;
    
    // 使用决策引擎评估
    const decision = await this.decisionEngine.makeDecision(order, context);
    
    console.log('[CoordinatorAgent] 决策结果:', {
      orderId,
      result: decision.result,
      confidence: decision.confidence,
      reason: decision.reason
    });
    
    return decision;
  }
  
  /**
   * 调度设备
   * @param {string} orderId - 订单 ID
   * @returns {Promise<Object>} 调度结果
   */
  async scheduleDevice(orderId) {
    console.log('[CoordinatorAgent] 请求调度设备:', orderId);
    
    // 尝试调用调度 Agent
    const schedulerAgentId = 'scheduler_agent';
    
    try {
      const response = await this.messenger.sendRequest(
        schedulerAgentId,
        'schedule_device',
        { orderId },
        { fromAgentId: this.id }
      );
      
      console.log('[CoordinatorAgent] 调度 Agent 响应:', response);
      
      return {
        success: true,
        scheduleInfo: response,
        agentId: schedulerAgentId
      };
    } catch (error) {
      console.warn('[CoordinatorAgent] 调度 Agent 不可用，使用默认调度:', error.message);
      
      // 调度 Agent 不可用时，返回默认调度信息
      return {
        success: true,
        scheduleInfo: {
          status: 'pending',
          message: '调度 Agent 未就绪，等待人工分配设备'
        },
        fallback: true
      };
    }
  }
  
  /**
   * 检查库存
   * @param {string} orderId - 订单 ID
   * @returns {Promise<Object>} 库存检查结果
   */
  async checkStock(orderId) {
    console.log('[CoordinatorAgent] 请求检查库存:', orderId);
    
    // 尝试调用库存 Agent
    const inventoryAgentId = 'inventory_agent';
    
    try {
      const response = await this.messenger.sendRequest(
        inventoryAgentId,
        'check_stock',
        { orderId },
        { fromAgentId: this.id }
      );
      
      console.log('[CoordinatorAgent] 库存 Agent 响应:', response);
      
      return {
        success: true,
        stockInfo: response.stock || {},
        agentId: inventoryAgentId
      };
    } catch (error) {
      console.warn('[CoordinatorAgent] 库存 Agent 不可用，使用默认库存检查:', error.message);
      
      // 库存 Agent 不可用时，返回默认库存信息
      return {
        success: true,
        stockInfo: {},
        fallback: true
      };
    }
  }
  
  /**
   * 记录决策
   * @param {string} orderId - 订单 ID
   * @param {Object} decision - 决策对象
   * @returns {Promise<Object>} 记录结果
   */
  async recordDecision(orderId, decision) {
    console.log('[CoordinatorAgent] 记录决策:', orderId);
    
    try {
      // 获取订单以获取完整信息
      const order = await Order.findById(orderId);
      
      if (!order) {
        throw new Error(`订单不存在：${orderId}`);
      }
      
      // 使用决策日志服务记录决策
      const recordedDecision = await decisionLogService.record({
        orderId,
        agentId: this.id,
        agentName: this.name,
        decisionType: 'scheduling',
        decisionResult: decision.result,
        confidence: decision.confidence,
        inputSnapshot: {
          orderId,
          status: order.status,
          itemCount: order.items.length,
          totalPrice: order.totalPrice,
          metadata: order.metadata
        },
        rationale: decision.rationale || decision.reason,
        alternatives: decision.alternatives || [],
        impact: {
          estimatedTime: null,
          estimatedCost: null,
          qualityScore: decision.confidence
        },
        rulesMatched: decision.rulesMatched || []
      });
      
      console.log('[CoordinatorAgent] 决策记录完成:', recordedDecision._id);
      
      return {
        success: true,
        decisionId: recordedDecision._id,
        decision: recordedDecision
      };
    } catch (error) {
      console.error('[CoordinatorAgent] 记录决策失败:', error.message);
      throw error;
    }
  }
  
  /**
   * 更新订单状态
   * @param {string} orderId - 订单 ID
   * @param {string} newStatus - 新状态
   * @returns {Promise<Object>} 更新结果
   */
  async updateOrderStatus(orderId, newStatus) {
    console.log('[CoordinatorAgent] 更新订单状态:', orderId, '->', newStatus);
    
    try {
      // 获取或创建状态机
      let stateMachine = this.stateMachines.get(orderId);
      
      if (!stateMachine) {
        stateMachine = createOrderStateMachine(orderId);
        this.stateMachines.set(orderId, stateMachine);
      }
      
      // 执行状态转换
      if (stateMachine.canTransition(newStatus)) {
        const result = await stateMachine.transition(newStatus);
        
        // 同步到数据库
        const orderResult = await this.callTool('updateOrderStatus', {
          orderId,
          status: newStatus
        });
        
        return {
          success: true,
          stateMachine: result,
          database: orderResult
        };
      } else {
        console.warn('[CoordinatorAgent] 不允许的状态转换:', {
          from: stateMachine.getCurrentState(),
          to: newStatus
        });
        
        // 直接更新数据库
        return await this.callTool('updateOrderStatus', {
          orderId,
          status: newStatus
        });
      }
    } catch (error) {
      console.error('[CoordinatorAgent] 更新订单状态失败:', error.message);
      throw error;
    }
  }
  
  /**
   * 请求人工审核
   * @param {string} orderId - 订单 ID
   * @param {string} reason - 审核原因
   * @returns {Promise<Object>} 请求结果
   */
  async requestManualReview(orderId, reason) {
    console.log('[CoordinatorAgent] 请求人工审核:', orderId, reason);
    
    // 记录决策
    const decision = {
      result: DecisionResult.MANUAL_REVIEW,
      confidence: 0.5,
      reason,
      rationale: reason
    };
    
    await this.recordDecision(orderId, decision);
    
    // 更新状态为审核中
    await this.updateOrderStatus(orderId, OrderStates.REVIEWING);
    
    return {
      success: true,
      orderId,
      status: 'manual_review',
      reason
    };
  }
  
  /**
   * 查询订单状态
   * @param {string} orderId - 订单 ID
   * @returns {Promise<Object>} 状态信息
   */
  async queryStatus(orderId) {
    console.log('[CoordinatorAgent] 查询订单状态:', orderId);
    
    const orderResult = await this.callTool('getOrderById', { orderId });
    
    if (!orderResult.success) {
      return orderResult;
    }
    
    // 查找相关的协调任务
    const relatedTasks = [];
    for (const [taskId, task] of this.coordinationTasks.entries()) {
      if (task.orderId === orderId) {
        relatedTasks.push({
          id: task.id,
          type: task.type,
          status: task.status,
          startTime: task.startTime,
          endTime: task.endTime
        });
      }
    }
    
    // 获取状态机状态
    const stateMachine = this.stateMachines.get(orderId);
    
    return {
      success: true,
      order: orderResult.order,
      coordinationTasks: relatedTasks,
      stateMachine: stateMachine ? stateMachine.getSnapshot() : null
    };
  }
  
  /**
   * 处理来自其他 Agent 的请求
   * @param {Object} request - 请求对象
   * @returns {Promise<Object>} 响应对象
   */
  async handleRequest(request) {
    console.log('[CoordinatorAgent] 收到请求:', request);
    
    const { action, payload } = request;
    
    switch (action) {
      case 'process_order':
        return await this.processOrder(payload.orderId);
        
      case 'make_decision':
        return await this.makeDecision(payload.orderId, payload.context);
        
      case 'query_status':
        return await this.queryStatus(payload.orderId);
        
      default:
        throw new Error(`未知的请求动作：${action}`);
    }
  }
  
  /**
   * 获取协调任务列表
   * @param {Object} options - 查询选项
   * @returns {Array} 任务列表
   */
  getCoordinationTasks(options = {}) {
    const tasks = Array.from(this.coordinationTasks.values());
    
    // 按状态过滤
    if (options.status) {
      return tasks.filter(task => task.status === options.status);
    }
    
    // 按订单 ID 过滤
    if (options.orderId) {
      return tasks.filter(task => task.orderId === options.orderId);
    }
    
    return tasks;
  }
  
  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const tasks = Array.from(this.coordinationTasks.values());
    
    return {
      ...super.getState(),
      coordinationTasks: {
        total: tasks.length,
        processing: tasks.filter(t => t.status === 'processing').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length
      },
      decisionEngine: {
        rulesCount: this.decisionEngine?.getRules().length || 0
      },
      messenger: this.messenger?.getStats() || {}
    };
  }
  
  /**
   * 关闭 Agent
   */
  async shutdown() {
    console.log('[CoordinatorAgent] 正在关闭...');
    
    // 清理状态机
    this.stateMachines.clear();
    
    // 清理通信模块
    if (this.messenger) {
      this.messenger.clearPendingRequests();
    }
    
    // 调用父类关闭
    await super.shutdown();
    
    console.log('[CoordinatorAgent] 已关闭');
  }
}

module.exports = {
  CoordinatorAgent,
  CoordinationTaskType
};
