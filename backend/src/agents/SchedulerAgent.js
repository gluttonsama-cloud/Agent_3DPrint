const { BaseAgent, AgentState } = require('./BaseAgent');
const Device = require('../models/Device');
const Order = require('../models/Order');
const { DeviceAllocationAlgorithm, AllocationStrategy } = require('./algorithms/DeviceAllocationAlgorithm');
const { SchedulingRuleManager, PriorityLevel } = require('./rules/schedulingRules');
const { decisionLogService } = require('../services/DecisionLogService');
const { QiniuLLMClient } = require('../config/qiniuLLM');

const SchedulerTaskType = {
  SCHEDULE_DEVICE: 'schedule_device',
  QUERY_AVAILABLE: 'query_available',
  UPDATE_DEVICE_STATUS: 'update_status',
  BATCH_ALLOCATE: 'batch_allocate'
};

class SchedulerAgent extends BaseAgent {
  constructor(config = {}) {
    super({
      id: config.id || 'scheduler_agent',
      name: config.name || '调度 Agent',
      description: config.description || '负责 3D 打印设备的智能分配和调度',
      llmConfig: config.llmConfig || {}
    });
    this.allocationAlgorithm = null;
    this.ruleManager = null;
    this.llmClient = null;
    this.schedulingTasks = new Map();
    this.config = {
      enableRules: config.enableRules !== false,
      enableLogging: config.enableLogging !== false,
      enableLLM: config.enableLLM !== false,
      defaultStrategy: config.defaultStrategy || AllocationStrategy.OPTIMAL
    };
  }

  async registerTools() {
    console.log(`[SchedulerAgent] ${this.name} 注册调度工具`);
    this.registerTool('allocateDevice', {
      name: 'allocateDevice',
      description: '为订单分配最佳设备',
      inputSchema: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: '订单 ID' },
          strategy: { type: 'string', description: '分配策略', enum: ['fastest', 'lowest_cost', 'best_quality', 'balanced_load', 'optimal'] }
        },
        required: ['orderId']
      },
      execute: async (input) => await this.allocateDevice(input.orderId, input.strategy)
    });
    this.registerTool('queryAvailableDevices', {
      name: 'queryAvailableDevices',
      description: '查询可用设备列表',
      inputSchema: {
        type: 'object',
        properties: {
          deviceType: { type: 'string', description: '设备类型', enum: ['sla', 'fdm', 'sls', 'mjf'] }
        }
      },
      execute: async (input) => await this.queryAvailableDevices(input.deviceType)
    });
    this.registerTool('batchAllocate', {
      name: 'batchAllocate',
      description: '为多个订单批量分配设备',
      inputSchema: {
        type: 'object',
        properties: {
          orderIds: { type: 'array', items: { type: 'string' }, description: '订单 ID 列表' },
          strategy: { type: 'string', description: '分配策略' }
        },
        required: ['orderIds']
      },
      execute: async (input) => await this.batchAllocate(input.orderIds, input.strategy)
    });
  }

  async initialize() {
    try {
      this.setState(AgentState.INITIALIZING);
      console.log(`[SchedulerAgent] ${this.name} 正在初始化...`);
      this.allocationAlgorithm = new DeviceAllocationAlgorithm({
        defaultStrategy: this.config.defaultStrategy,
        weights: { load: 0.3, time: 0.3, quality: 0.25, cost: 0.15 }
      });
      this.ruleManager = new SchedulingRuleManager();
      this.llmClient = this.config.enableLLM ? new QiniuLLMClient() : null;
      console.log('[SchedulerAgent] 分配算法、规则管理器和 LLM 客户端已初始化');
      await super.initialize();
      this.setState(AgentState.READY);
      console.log(`[SchedulerAgent] ${this.name} 初始化完成`);
      return true;
    } catch (error) {
      this.setState(AgentState.ERROR);
      console.error('[SchedulerAgent] 初始化失败:', error.message);
      throw error;
    }
  }

  async execute(task) {
    if (!task || !task.type) throw new Error('任务类型不能为空');
    this.currentTask = task;
    this.setState(AgentState.BUSY);
    try {
      let result;
      switch (task.type) {
        case SchedulerTaskType.SCHEDULE_DEVICE:
          result = await this.scheduleDevice(task.orderId, task.strategy);
          break;
        case SchedulerTaskType.QUERY_AVAILABLE:
          result = await this.queryAvailableDevices(task.deviceType);
          break;
        case SchedulerTaskType.BATCH_ALLOCATE:
          result = await this.batchAllocate(task.orderIds, task.strategy);
          break;
        case SchedulerTaskType.UPDATE_DEVICE_STATUS:
          result = await this.updateDeviceStatus(task.deviceId, task.status);
          break;
        default:
          throw new Error(`未知的任务类型：${task.type}`);
      }
      return result;
    } catch (error) {
      console.error('[SchedulerAgent] 任务执行失败:', error.message);
      throw error;
    } finally {
      this.currentTask = null;
      this.setState(AgentState.READY);
    }
  }

  async allocateDevice(orderId, strategy = null) {
    const taskId = `sched_${Date.now()}_${orderId}`;
    console.log('[SchedulerAgent] 开始分配设备:', { orderId, strategy: strategy || 'default' });
    const task = { id: taskId, orderId, type: SchedulerTaskType.SCHEDULE_DEVICE, status: 'processing', startTime: Date.now(), steps: [] };
    this.schedulingTasks.set(taskId, task);
    try {
      task.steps.push({ name: '获取订单详情', status: 'processing' });
      const order = await Order.findById(orderId);
      if (!order) throw new Error(`订单不存在：${orderId}`);
      task.steps[0].status = 'completed';
      task.steps[0].result = { orderId: order._id, deviceType: order.deviceType };
      
      task.steps.push({ name: '应用调度规则', status: 'processing' });
      let ruleAdjustments = null;
      if (this.config.enableRules) {
        const ruleContext = { order, devices: await this.getAvailableDevices(order.deviceType) };
        ruleAdjustments = await this.ruleManager.applyAllRules(ruleContext);
        if (this.config.enableLogging) console.log('[SchedulerAgent] 应用的规则:', ruleAdjustments.appliedRules);
      }
      task.steps[1].status = 'completed';
      task.steps[1].result = ruleAdjustments;
      
      task.steps.push({ name: '执行分配算法', status: 'processing' });
      const allocationOptions = { strategy: strategy || ruleAdjustments?.strategyOverride || this.config.defaultStrategy };
      if (ruleAdjustments?.weightAdjustments) this.allocationAlgorithm.updateWeights(ruleAdjustments.weightAdjustments);
      const allocationResult = await this.allocationAlgorithm.allocate(order, allocationOptions);
      task.steps[2].status = 'completed';
      task.steps[2].result = allocationResult;
      
      if (this.config.enableLLM && this.llmClient && allocationResult.success) {
        task.steps.push({ name: 'LLM 评估', status: 'processing' });
        try {
          const llmEvaluation = await this.evaluateAllocationWithLLM(order, allocationResult);
          task.steps[3].status = 'completed';
          task.steps[3].result = llmEvaluation;
          
          if (llmEvaluation.suggestedDeviceId && llmEvaluation.suggestedDeviceId !== allocationResult.recommendations[0]?.device?.deviceId) {
            console.log('[SchedulerAgent] LLM 建议不同设备:', llmEvaluation.suggestedDeviceId);
            allocationResult.llmSuggestion = llmEvaluation;
          }
        } catch (llmError) {
          console.warn('[SchedulerAgent] LLM 评估失败，使用算法结果:', llmError.message);
          task.steps[3].status = 'completed';
          task.steps[3].result = { error: llmError.message, fallback: 'algorithm_result' };
        }
      }
      
      if (allocationResult.success) {
        const finalStepIdx = task.steps.length;
        task.steps.push({ name: '更新设备状态', status: 'processing' });
        const device = allocationResult.recommendations[0].device;
        const updateData = {
          status: 'busy',
          currentTask: { 
            orderId: order._id, 
            startedAt: new Date(), 
            estimatedCompletion: allocationResult.recommendations[0].estimatedCompletionTime 
          }
        };
        await Device.updateOne({ deviceId: device.deviceId }, { $set: updateData });
        device.status = 'busy';
        device.currentTask = updateData.currentTask;
        task.steps[finalStepIdx].status = 'completed';
      }
      task.status = 'completed';
      task.endTime = Date.now();
      task.result = allocationResult;
      
      // 记录设备分配决策
      if (allocationResult.success && allocationResult.recommendations[0]) {
        try {
          const device = allocationResult.recommendations[0].device;
          await decisionLogService.record({
            orderId,
            agentId: this.id,
            agentName: this.name,
            decisionType: 'device_selection',
            decisionResult: device.deviceId,
            confidence: allocationResult.score || 0.8,
            inputSnapshot: {
              orderId,
              deviceType: order.deviceType,
              strategy: strategy || ruleAdjustments?.strategyOverride || this.config.defaultStrategy,
              availableDevicesCount: allocationResult.availableDevices?.length || 0
            },
            rationale: allocationResult.llmSuggestion?.rationale || `设备评分最高，${device.deviceId} 为最优选择`,
            alternatives: allocationResult.recommendations.slice(1, 4).map(rec => ({
              option: rec.device.deviceId,
              score: rec.score,
              reason: rec.reason
            })),
            impact: {
              estimatedTime: allocationResult.recommendations[0].estimatedCompletionTime,
              estimatedCost: null,
              qualityScore: allocationResult.score || 0.8
            },
            rulesMatched: ruleAdjustments?.appliedRules?.map(r => r.ruleId) || []
          });
        } catch (logError) {
          console.error('[SchedulerAgent] 记录决策失败:', logError.message);
        }
      }
      
      console.log('[SchedulerAgent] 设备分配完成:', { orderId, success: allocationResult.success, deviceId: allocationResult.recommendations[0]?.device?.deviceId });
      return { success: true, taskId, result: allocationResult, appliedRules: ruleAdjustments?.appliedRules || [] };
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = Date.now();
      console.error('[SchedulerAgent] 设备分配失败:', orderId, error.message);
      throw error;
    }
  }
  
  /**
   * 使用 LLM 评估设备分配结果
   */
  async evaluateAllocationWithLLM(order, allocationResult) {
    if (!this.llmClient) {
      throw new Error('LLM 客户端未初始化');
    }
    
    const topRecommendations = allocationResult.recommendations.slice(0, 3);
    const devicesInfo = topRecommendations.map((rec, idx) => 
      `${idx + 1}. ${rec.device.deviceId} (${rec.device.type}) - 负载：${rec.device.capacity?.currentLoad || 0}%, ` +
      `预计完成：${rec.estimatedCompletionTime}, 评分：${rec.score.toFixed(2)}, 理由：${rec.reason}`
    ).join('\n');
    
    const prompt = `你是 3D 打印农场调度专家。请评估以下设备分配方案：

订单信息：
- 订单 ID: ${order._id}
- 设备类型：${order.deviceType}
- 材料：${order.material}
- 体积：${order.volume || 0} cm³

算法推荐的设备选项：
${devicesInfo}

当前推荐：${topRecommendations[0]?.device.deviceId}

请分析并回答：
1. 是否同意当前推荐？（是/否）
2. 如果不同意，推荐哪个设备？（填写设备 ID）
3. 你的理由是什么？（考虑负载均衡、紧急程度、设备特殊性等因素）

格式要求（严格 JSON）：
{
  "agree": true,
  "suggestedDeviceId": "device_001",
  "rationale": "理由说明",
  "confidence": 0.85
}`;
    
    const response = await this.llmClient.invoke(prompt, {
      temperature: 0.3,
      maxTokens: 400
    });
    
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('LLM 响应不是有效的 JSON 格式');
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        agree: parsed.agree !== false,
        suggestedDeviceId: parsed.suggestedDeviceId,
        rationale: parsed.rationale || 'LLM 评估完成',
        confidence: parseFloat(parsed.confidence) || 0.7,
        llmResponse: response.content
      };
    } catch (error) {
      console.error('[SchedulerAgent] 解析 LLM 响应失败:', error.message);
      return {
        agree: true,
        rationale: 'LLM 响应解析失败，使用算法推荐',
        confidence: 0.5,
        error: error.message
      };
    }
  }

  async scheduleDevice(orderId, strategy = null) { return await this.allocateDevice(orderId, strategy); }
  async queryAvailableDevices(deviceType = null) {
    console.log('[SchedulerAgent] 查询可用设备:', { deviceType });
    const devices = await this.getAvailableDevices(deviceType);
    return { success: true, count: devices.length, devices: devices.map(d => ({ deviceId: d.deviceId, type: d.type, status: d.status, location: d.location, currentLoad: d.capacity?.currentLoad || 0, specifications: d.specifications })) };
  }
  async batchAllocate(orderIds, strategy = null) {
    console.log('[SchedulerAgent] 批量分配设备:', { count: orderIds.length, strategy });
    const results = [];
    for (const orderId of orderIds) {
      try {
        const result = await this.allocateDevice(orderId, strategy);
        results.push({ orderId, success: true, result });
      } catch (error) {
        results.push({ orderId, success: false, error: error.message });
      }
    }
    return {
      success: true,
      total: orderIds.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  async updateDeviceStatus(deviceId, status) {
    console.log('[SchedulerAgent] 更新设备状态:', { deviceId, status });
    const device = await Device.findOne({ deviceId });
    if (!device) throw new Error(`设备不存在：${deviceId}`);
    const previousStatus = device.status;
    device.status = status;
    if (status === 'idle') device.currentTask = undefined;
    await device.save();
    console.log(`[SchedulerAgent] 设备状态已更新：${deviceId} ${previousStatus} -> ${status}`);
    return { success: true, deviceId, previousStatus, newStatus: status };
  }

  async getAvailableDevices(deviceType = null) {
    const query = { 
      status: { 
        $in: ['idle', 'busy'],
        $nin: ['maintenance', 'offline'] 
      } 
    };
    if (deviceType) query.type = deviceType;
    return await Device.find(query).sort({ 'capacity.currentLoad': 1 });
  }

  getSchedulingTask(taskId) { return this.schedulingTasks.get(taskId) || null; }

  getSchedulingTasks(options = {}) {
    const tasks = Array.from(this.schedulingTasks.values());
    if (options.status) return tasks.filter(t => t.status === options.status);
    if (options.orderId) return tasks.filter(t => t.orderId === options.orderId);
    return tasks;
  }

  getStats() {
    const tasks = Array.from(this.schedulingTasks.values());
    return {
      ...super.getState(),
      schedulingTasks: {
        total: tasks.length,
        processing: tasks.filter(t => t.status === 'processing').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length
      },
      allocationAlgorithm: {
        defaultStrategy: this.allocationAlgorithm?.defaultStrategy,
        weights: this.allocationAlgorithm?.weights
      },
      rules: {
        enabled: this.config.enableRules,
        count: this.ruleManager?.getRules().length || 0
      }
    };
  }

  async shutdown() {
    console.log('[SchedulerAgent] 正在关闭...');
    this.schedulingTasks.clear();
    await super.shutdown();
    console.log('[SchedulerAgent] 已关闭');
  }
}

module.exports = { SchedulerAgent, SchedulerTaskType };
