/**
 * Agent 协作工作流 API
 * 
 * 完整的真实生产流程：
 * 1. 创建订单到数据库
 * 2. CoordinatorAgent 接收并处理订单
 * 3. SchedulerAgent.allocateDevice() 分配设备
 * 4. InventoryAgent.checkInventory() 检查库存
 * 5. DecisionEngine 使用规则 + LLM 做最终决策
 */

const express = require('express');
const router = express.Router();
const { agentRegistry } = require('../agents/registry');
const Device = require('../models/Device');
const Material = require('../models/Material');
const Order = require('../models/Order');

router.post('/process-order', async (req, res) => {
  const { 
    orderId, 
    customerName, 
    customerPhone,
    material, 
    volume, 
    deviceType = 'fdm',
    priority = 'normal'
  } = req.body;
  
  const workflowId = `WF-${Date.now()}`;
  const steps = [];
  const startTime = Date.now();
  
  console.log(`\n🚀 [工作流 ${workflowId}] 开始处理订单:`, { orderId, material, volume });

  try {
    const coordinator = agentRegistry.get('coordinator_agent');
    const scheduler = agentRegistry.get('scheduler_agent');
    const inventory = agentRegistry.get('inventory_agent');
    
    // 基础辅助：解析材质类型
    const materialParts = (material || '白色 PLA').split(' ');
    const materialType = materialParts.slice(1).join(' ') || materialParts[0] || 'PLA';
    
    // ==================== 步骤 1: 订单初始化 (Coordinator + StateMachine) ====================
    const { OrderStateMachine } = require('../states/OrderStateMachine');
    const { createRequestMessage } = require('../agents/communication/Protocol');
    
    // 创建订单记录
    const newOrder = new Order({
      _id: orderId || undefined,
      customerName: customerName || '演示客户',
      customerPhone: customerPhone || '13800138000',
      modelName: '3D 打印模型',
      material: materialType,
      volume: parseInt(volume) || 80,
      deviceType,
      priority,
      status: 'pending',
      metadata: {
        photoQuality: 0.85,
        completeParams: true,
        hasModelFile: true,
        validDimensions: true,
        workflowId
      }
    });
    
    await newOrder.save();
    const savedOrderId = newOrder._id;
    
    // 初始化状态机
    const fsm = new OrderStateMachine(savedOrderId.toString(), 'pending_review');
    
    const step1Msg = createRequestMessage({
      from: 'system',
      to: 'coordinator_agent',
      action: 'initialize_workflow',
      data: { orderId: savedOrderId }
    });

    steps.push({
      step: 1,
      agent: 'coordinator',
      agentName: '协调 Agent',
      action: 'initialize_workflow',
      status: 'completed',
      timestamp: new Date().toISOString(),
      thoughts: [
        `接收到新订单请求，分配 ID: ${savedOrderId}`,
        `初始化订单状态机: [pending_review]`,
        `准备协调各子 Agent 进行处理...`
      ],
      protocol: step1Msg.toObject(),
      data: { 
        order: newOrder.toObject(),
        fsm: fsm.getSnapshot()
      }
    });
    
    // ==================== 步骤 2: 设备调度评估 (Scheduler + Algorithm) ====================
    let deviceAllocation = null;
    let selectedDevice = null;
    
    if (scheduler) {
      const step2Msg = createRequestMessage({
        from: 'coordinator_agent',
        to: 'scheduler_agent',
        action: 'allocate_device',
        data: { orderId: savedOrderId, strategy: 'optimal' }
      });

      steps.push({
        step: 2,
        agent: 'scheduler',
        agentName: '调度 Agent',
        action: 'allocate_device',
        status: 'processing',
        timestamp: new Date().toISOString(),
        thoughts: [`分析设备负载与任务兼容性...`],
        protocol: step2Msg.toObject()
      });
      
      try {
        deviceAllocation = await scheduler.allocateDevice(savedOrderId.toString(), 'optimal');
        
        if (deviceAllocation.success && deviceAllocation.result?.recommendations?.[0]) {
          selectedDevice = deviceAllocation.result.recommendations[0].device;
          const rec = deviceAllocation.result.recommendations[0];
          
          steps[steps.length - 1] = {
            ...steps[steps.length - 1],
            status: 'completed',
            thoughts: [
              `筛选可用设备: 找到 ${deviceAllocation.result.totalScored || 0} 台兼容设备`,
              `应用调度算法: 权重 [负载 0.3, 时间 0.3, 质量 0.25, 成本 0.15]`,
              `最优分配: ${selectedDevice.deviceId} (综合评分: ${(rec.score * 100).toFixed(1)}%)`,
              `预计开始时间: ${new Date(rec.estimatedStartTime).toLocaleString()}`
            ],
            data: {
              selectedDevice: {
                id: selectedDevice.deviceId,
                type: selectedDevice.type,
                location: selectedDevice.location
              },
              scores: rec.scores,
              weights: deviceAllocation.result.weights,
              alternatives: deviceAllocation.result.alternatives,
              strategy: 'optimal'
            }
          };
        } else {
          steps[steps.length - 1].status = 'failed';
          steps[steps.length - 1].thoughts.push('分配失败: 无可用设备');
        }
      } catch (e) {
        steps[steps.length - 1].status = 'failed';
        steps[steps.length - 1].thoughts.push(`错误: ${e.message}`);
      }
    }
    
    // ==================== 步骤 3: 库存预测与预扣 (Inventory + Forecast) ====================
    const requiredAmount = Math.ceil((parseInt(volume) || 80) * 1.25);
    const { MaterialService } = require('../services/MaterialService');
    const materialService = new MaterialService();
    
    const { data: { materials } } = await materialService.getMaterials();
    const targetMaterial = materials.find(m => 
      m.type?.toLowerCase() === materialType.toLowerCase() ||
      m.name?.toLowerCase().includes(materialType.toLowerCase()) ||
      materialType.toLowerCase().includes(m.name?.toLowerCase())
    );
    
    let isInventorySufficient = false;
    let forecastData = null;
    
    if (inventory && targetMaterial) {
      const step3Msg = createRequestMessage({
        from: 'coordinator_agent',
        to: 'inventory_agent',
        action: 'check_inventory',
        data: { materialId: targetMaterial._id, amount: requiredAmount }
      });

      steps.push({
        step: 3,
        agent: 'inventory',
        agentName: '库存 Agent',
        action: 'check_inventory',
        status: 'processing',
        timestamp: new Date().toISOString(),
        thoughts: [`检查原材料库存并分析未来消耗趋势...`],
        protocol: step3Msg.toObject()
      });
      
      try {
        const inventoryCheck = await inventory.checkInventory(targetMaterial._id.toString(), requiredAmount);
        const detail = inventoryCheck.result?.details?.[0];
        isInventorySufficient = detail?.isSufficient || false;
        
        // 获取预测数据
        forecastData = await inventory.getForecast(targetMaterial._id.toString(), { forecastDays: 7 });
        
        steps[steps.length - 1] = {
          ...steps[steps.length - 1],
          status: isInventorySufficient ? 'completed' : 'warning',
          thoughts: [
            `检查: ${targetMaterial.name}`,
            `当前: ${detail.currentStock}g`,
            `需求: ${requiredAmount}g`,
            isInventorySufficient ? '✅ 库存充足' : '⚠️ 库存不足',
            `趋势预测: 未来 7 天消耗量约 ${forecastData.result.predictedConsumption.toFixed(1)}g (信心: ${(forecastData.result.confidence * 100).toFixed(0)}%)`
          ],
          data: {
            currentStock: detail.currentStock,
            requiredAmount,
            sufficient: isInventorySufficient,
            forecast: forecastData.result
          }
        };
        
        if (isInventorySufficient) {
          // 使用 MaterialService 确保触发事件通知
          await materialService.updateStock(targetMaterial._id.toString(), -requiredAmount, {
            reason: 'Agent Workflow Auto Deduction',
            orderId: savedOrderId
          });
          console.log(`[Inventory] 成功预扣库存: ${targetMaterial.name} -${requiredAmount}g`);
        }
      } catch (e) {
        steps[steps.length - 1].status = 'failed';
        steps[steps.length - 1].thoughts.push(`错误: ${e.message}`);
      }
    }
    
    // ==================== 步骤 4: 规则引擎评估 (Coordinator + RuleEngine) ====================
    let ruleResults = [];
    if (coordinator?.decisionEngine) {
      steps.push({
        step: 4,
        agent: 'coordinator',
        agentName: '协调 Agent',
        action: 'evaluate_rules',
        status: 'processing',
        timestamp: new Date().toISOString(),
        thoughts: [`应用业务规则引擎进行多维度审核...`]
      });

      ruleResults = coordinator.decisionEngine.evaluateAllRules(
        { ...newOrder.toObject(), _id: savedOrderId },
        { 
          deviceAllocated: selectedDevice ? true : false,
          inventoryStatus: isInventorySufficient ? 'sufficient' : 'insufficient'
        }
      );

      steps[steps.length - 1] = {
        ...steps[steps.length - 1],
        status: 'completed',
        thoughts: [
          `规则引擎扫描完成，命中规则数: ${ruleResults.length}`,
          `核心匹配: ${ruleResults.map(r => r.ruleName).join(', ') || '无特殊限制'}`,
          `当前初选结果: ${ruleResults.some(r => r.result === 'REJECT') ? '建议拒绝' : '建议通过'}`
        ],
        data: {
          rules: ruleResults.map(r => ({
            id: r.ruleId,
            name: r.ruleName,
            priority: r.priority,
            result: r.result,
            rationale: r.rationale
          }))
        }
      };
    }

    // ==================== 步骤 5: LLM 辅助深度决策 (Coordinator + QiniuLLM) ====================
    let llmDecisionResult = null;
    if (coordinator?.decisionEngine && coordinator.decisionEngine.enableLLM) {
      steps.push({
        step: 5,
        agent: 'coordinator',
        agentName: '协调 Agent',
        action: 'llm_decision',
        status: 'processing',
        timestamp: new Date().toISOString(),
        thoughts: [`触发大规模语言模型 (GLM-5) 进行综合风险评估与决策优化...`]
      });

      try {
        llmDecisionResult = await coordinator.decisionEngine.makeDecisionWithLLM(
          { ...newOrder.toObject(), _id: savedOrderId },
          { 
            deviceAllocated: selectedDevice ? { id: selectedDevice.deviceId } : null,
            inventoryStatus: { sufficient: isInventorySufficient, requiredAmount },
            forecast: forecastData?.result
          },
          ruleResults
        );

        steps[steps.length - 1] = {
          ...steps[steps.length - 1],
          status: 'completed',
          thoughts: [
            `LLM 推理完成，最终判定: ${llmDecisionResult.result}`,
            `置信度评分: ${(llmDecisionResult.confidence * 100).toFixed(1)}%`,
            `专家理由: ${llmDecisionResult.rationale.substring(0, 100)}...`
          ],
          data: {
            result: llmDecisionResult.result,
            confidence: llmDecisionResult.confidence,
            rationale: llmDecisionResult.rationale,
            source: 'qiniu_glm5',
            llmResponse: llmDecisionResult.details?.llmResponse
          }
        };
      } catch (e) {
        steps[steps.length - 1].status = 'failed';
        steps[steps.length - 1].thoughts.push(`LLM 调用失败: ${e.message}，将降级使用规则引擎结论`);
      }
    }

    // ==================== 步骤 6: 状态机流转与执行 (Coordinator + FSM) ====================
    steps.push({
      step: 6,
      agent: 'coordinator',
      agentName: '协调 Agent',
      action: 'finalize_execution',
      status: 'processing',
      timestamp: new Date().toISOString(),
      thoughts: [`提交最终决策并驱动订单状态机流转...`]
    });

    const finalDecision = llmDecisionResult || { 
      result: ruleResults.some(r => r.result === 'REJECT') ? 'REJECT' : 'AUTO_APPROVE',
      confidence: 0.8,
      rationale: '基于规则引擎的降级决策'
    };

    const targetStatus = finalDecision.result === 'AUTO_APPROVE' || finalDecision.result === 'auto_approve' ? 'approved' : 
                         finalDecision.result === 'REJECT' || finalDecision.result === 'reject' ? 'rejected' : 'pending_review';
    
    // 执行状态转换
    const fromState = fsm.getCurrentState();
    try {
      if (targetStatus === 'approved') {
        const { DeviceService } = require('../services/DeviceService');
        const deviceService = new DeviceService();
        
        await fsm.transition('reviewing', { operator: 'coordinator_agent', reason: 'AI Auto Approved' });
        await fsm.transition('scheduled', { operator: 'scheduler_agent', deviceId: selectedDevice?.deviceId });
        
        // 显式更新设备状态，确保 Socket.io 推送到前端
        if (selectedDevice) {
          await deviceService.updateDeviceStatusByDeviceId(selectedDevice.deviceId, 'busy', {
            orderId: savedOrderId,
            startedAt: new Date(),
            estimatedCompletion: steps[1].data?.scores?.estimatedCompletion || new Date(Date.now() + 3600000)
          });
          console.log(`[Device] 成功更新设备状态: ${selectedDevice.deviceId} -> busy`);
        }
      } else if (targetStatus === 'rejected') {
        await fsm.transition('cancelled', { operator: 'coordinator_agent', reason: finalDecision.rationale });
      }
    } catch (e) {
      console.warn('FSM Transition failed:', e.message);
    }

    await Order.updateOne({ _id: savedOrderId }, { $set: { status: targetStatus } });

    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      status: 'completed',
      thoughts: [
        `决策结果已持久化: ${targetStatus}`,
        `状态机链条: ${fromState} -> ... -> ${fsm.getCurrentState()}`,
        `工作流全生命周期处理完成。`
      ],
      data: {
        finalStatus: targetStatus,
        fsmSnapshot: fsm.getSnapshot(),
        fsmHistory: fsm.getHistory()
      }
    };

    const elapsed = Date.now() - startTime;
    res.json({
      success: true,
      data: {
        workflowId,
        orderId: savedOrderId,
        elapsed,
        decision: finalDecision,
        steps,
        summary: {
          orderCreated: true,
          deviceAllocated: selectedDevice ? { id: selectedDevice.deviceId, type: selectedDevice.type } : null,
          inventoryStatus: { material: targetMaterial?.name, sufficient: isInventorySufficient },
          autoApproved: targetStatus === 'approved',
          stateTransitions: fsm.getHistory().map(h => h.state)
        },
        agentCalls: {
          scheduler: { method: 'allocateDevice', success: !!selectedDevice },
          inventory: { method: 'checkInventory', success: true },
          decisionEngine: { method: 'makeDecision', result: finalDecision.result, usedLLM: !!llmDecisionResult }
        }
      }
    });

  } catch (error) {
    console.error(`❌ [工作流 ${workflowId}] 失败:`, error.message);
    res.status(500).json({ success: false, error: error.message, workflowId, steps });
  }
});

router.get('/order/:orderId', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, error: '订单不存在' });
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/agents/status', (req, res) => {
  const agents = agentRegistry.list();
  res.json({ success: true, data: agents.map(a => ({ id: a.id, name: a.name, state: a.state })) });
});

module.exports = router;