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
    
    const materialParts = (material || '白色 PLA').split(' ');
    const materialType = materialParts.slice(1).join(' ') || 'PLA';
    
    // ==================== 步骤 1: 创建订单 ====================
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
    
    steps.push({
      step: 1,
      agent: 'coordinator',
      agentName: '协调 Agent',
      action: 'create_order',
      status: 'completed',
      timestamp: new Date().toISOString(),
      thoughts: [
        `创建新订单 ${savedOrderId}`,
        `客户: ${customerName || '演示客户'}`,
        `材料: ${material}`,
        `体积: ${volume} cm³`,
        `订单已保存到数据库`
      ],
      data: { orderId: savedOrderId, status: 'pending' }
    });
    
    // ==================== 步骤 2: SchedulerAgent.allocateDevice() ====================
    let deviceAllocation = null;
    let selectedDevice = null;
    
    if (scheduler) {
      steps.push({
        step: 2,
        agent: 'scheduler',
        agentName: '调度 Agent',
        action: 'allocate_device',
        status: 'processing',
        timestamp: new Date().toISOString(),
        thoughts: [`调用 SchedulerAgent.allocateDevice(${savedOrderId}, 'optimal')`]
      });
      
      try {
        deviceAllocation = await scheduler.allocateDevice(savedOrderId.toString(), 'optimal');
        
        if (deviceAllocation.success && deviceAllocation.result?.recommendations?.[0]) {
          selectedDevice = deviceAllocation.result.recommendations[0].device;
          
          steps[steps.length - 1] = {
            step: 2,
            agent: 'scheduler',
            agentName: '调度 Agent',
            action: 'allocate_device',
            status: 'completed',
            timestamp: new Date().toISOString(),
            thoughts: [
              `查询可用设备（类型: ${deviceType}）`,
              `找到 ${deviceAllocation.result.availableDevices?.length || 0} 个设备`,
              `选择: ${selectedDevice.deviceId}`,
              `评分: ${((deviceAllocation.result.score || 0.85) * 100).toFixed(0)}%`,
              deviceAllocation.appliedRules?.length > 0 ? `规则: ${deviceAllocation.appliedRules.map(r => r.ruleId).join(', ')}` : ''
            ].filter(Boolean),
            data: {
              deviceId: selectedDevice.deviceId,
              deviceType: selectedDevice.type,
              newStatus: 'busy',
              score: deviceAllocation.result.score
            },
            messagePayload: {
              from: 'coordinator',
              to: 'scheduler',
              type: 'device_allocation',
              content: { orderId: savedOrderId }
            }
          };
        } else {
          steps[steps.length - 1].status = 'failed';
          steps[steps.length - 1].thoughts.push('分配失败: 无可用设备');
        }
      } catch (e) {
        steps[steps.length - 1].status = 'failed';
        steps[steps.length - 1].thoughts.push(`错误: ${e.message}`);
        console.error('[Workflow] SchedulerAgent 失败:', e.message);
      }
    }
    
    // ==================== 步骤 3: InventoryAgent.checkInventory() ====================
    const requiredAmount = Math.ceil((parseInt(volume) || 80) * 1.25);
    const materials = await Material.find({});
    const targetMaterial = materials.find(m => 
      m.type?.toLowerCase() === materialType.toLowerCase() ||
      m.name?.toLowerCase().includes(materialType.toLowerCase())
    );
    
    let isInventorySufficient = false;
    
    if (inventory && targetMaterial) {
      // 确保 materialId 是字符串
      const materialIdStr = typeof targetMaterial._id === 'object' 
        ? (targetMaterial._id.id || targetMaterial._id.toString?.() || String(targetMaterial._id))
        : String(targetMaterial._id);
      
      steps.push({
        step: 3,
        agent: 'inventory',
        agentName: '库存 Agent',
        action: 'check_inventory',
        status: 'processing',
        timestamp: new Date().toISOString(),
        thoughts: [`调用 InventoryAgent.checkInventory(${materialIdStr}, ${requiredAmount})`]
      });
      
      try {
        const inventoryCheck = await inventory.checkInventory(materialIdStr, requiredAmount);
        const detail = inventoryCheck.result?.details?.[0];
        isInventorySufficient = detail?.isSufficient || false;
        const currentStock = detail?.currentStock || 0;
        
        steps[steps.length - 1] = {
          step: 3,
          agent: 'inventory',
          agentName: '库存 Agent',
          action: 'check_inventory',
          status: isInventorySufficient ? 'completed' : 'warning',
          timestamp: new Date().toISOString(),
          thoughts: [
            `检查: ${targetMaterial.name}`,
            `当前: ${currentStock}g`,
            `需求: ${requiredAmount}g`,
            isInventorySufficient ? '✅ 库存充足' : '⚠️ 库存不足'
          ],
          data: {
            materialId: targetMaterial._id,
            materialName: targetMaterial.name,
            currentStock,
            requiredAmount,
            sufficient: isInventorySufficient
          },
          messagePayload: {
            from: 'coordinator',
            to: 'inventory',
            type: 'inventory_check',
            content: { material: targetMaterial.name, requiredAmount }
          }
        };
        
        if (isInventorySufficient) {
          await Material.updateOne(
            { _id: targetMaterial._id },
            { $set: { 'stock.quantity': currentStock - requiredAmount } }
          );
        }
      } catch (e) {
        steps[steps.length - 1].status = 'failed';
        steps[steps.length - 1].thoughts.push(`错误: ${e.message}`);
      }
    }
    
    // ==================== 步骤 4: DecisionEngine.makeDecision() ====================
    let decision = null;
    
    if (coordinator?.decisionEngine) {
      steps.push({
        step: 4,
        agent: 'coordinator',
        agentName: '协调 Agent',
        action: 'make_decision',
        status: 'processing',
        timestamp: new Date().toISOString(),
        thoughts: ['调用 DecisionEngine.makeDecision() - 规则 + LLM']
      });
      
      try {
        const llmDecision = await coordinator.decisionEngine.makeDecision(
          {
            _id: savedOrderId,
            material: materialType,
            volume: parseInt(volume) || 80,
            deviceType,
            status: 'pending',
            metadata: {
              deviceAllocated: selectedDevice ? { id: selectedDevice.deviceId } : null,
              inventoryStatus: { sufficient: isInventorySufficient, requiredAmount }
            }
          },
          {
            stock: { [materialType.toLowerCase()]: targetMaterial?.stock?.quantity || 0 },
            devices: selectedDevice ? [{ id: selectedDevice.deviceId, status: 'busy' }] : []
          }
        );
        
        decision = {
          result: llmDecision.result,
          confidence: llmDecision.confidence,
          rationale: llmDecision.rationale || llmDecision.reason,
          llmResponse: llmDecision.details?.llmResponse
        };
        
        const newStatus = decision.result === 'auto_approve' ? 'approved' : 
                         decision.result === 'reject' ? 'rejected' : 'pending_review';
        await Order.updateOne({ _id: savedOrderId }, { $set: { status: newStatus } });
        
        steps[steps.length - 1] = {
          step: 4,
          agent: 'coordinator',
          agentName: '协调 Agent',
          action: 'make_decision',
          status: 'completed',
          timestamp: new Date().toISOString(),
          thoughts: [
            `设备: ${selectedDevice ? '✅' : '❌'}`,
            `库存: ${isInventorySufficient ? '✅' : '⚠️'}`,
            `决策: ${decision.result}`,
            `置信度: ${(decision.confidence * 100).toFixed(0)}%`,
            decision.llmResponse ? '🧠 LLM 参与' : '📋 规则引擎'
          ],
          data: { decision: decision.result, confidence: decision.confidence, rationale: decision.rationale }
        };
      } catch (e) {
        steps[steps.length - 1].status = 'failed';
        steps[steps.length - 1].thoughts.push(`错误: ${e.message}`);
        decision = { result: 'manual_review', confidence: 0.5, rationale: e.message };
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ [工作流 ${workflowId}] 完成:`, { orderId: savedOrderId, decision: decision?.result, elapsed });
    
    res.json({
      success: true,
      data: {
        workflowId,
        orderId: savedOrderId,
        elapsed,
        decision,
        steps,
        summary: {
          orderCreated: true,
          deviceAllocated: selectedDevice ? { id: selectedDevice.deviceId, type: selectedDevice.type } : null,
          inventoryChecked: { material: targetMaterial?.name, sufficient: isInventorySufficient },
          autoApproved: decision?.result === 'auto_approve'
        },
        agentCalls: {
          scheduler: { method: 'allocateDevice', success: !!selectedDevice },
          inventory: { method: 'checkInventory', success: true },
          decisionEngine: { method: 'makeDecision', result: decision?.result, usedLLM: !!decision?.llmResponse }
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