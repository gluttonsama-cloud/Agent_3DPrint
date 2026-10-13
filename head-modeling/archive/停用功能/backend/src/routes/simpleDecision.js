/**
 * 简化的 Agent 决策 API - 用于前端测试
 * 不需要完整的 Agent 系统，直接调用 DecisionEngine
 */

const express = require('express');
const router = express.Router();
const { DecisionEngine } = require('../agents/DecisionEngine');
const { QiniuLLMClient } = require('../config/qiniuLLM');

// 创建全局 DecisionEngine 实例（启用 LLM，使用 DeepSeek）
process.env.QINIU_AI_MODEL = 'deepseek/deepseek-v3.2-251201'; // 强制使用 DeepSeek（更快）

const decisionEngine = new DecisionEngine({
  enableLogging: true,
  enableLLM: true
});

/**
 * POST /api/simple-decision/coordinator
 * 简化的 Coordinator 决策接口
 */
router.post('/coordinator', async (req, res) => {
  try {
    const { orderId, customerName, material, volume, deviceType = 'fdm' } = req.body;
    
    if (!orderId || !material || !volume) {
      return res.status(400).json({
        error: '缺少必填字段',
        required: ['orderId', 'material', 'volume']
      });
    }
    
    const order = {
      _id: orderId || `ORD-${Date.now()}`,
      customerName: customerName || '测试客户',
      modelName: '3D 模型',
      material,
      volume: parseInt(volume),
      deviceType,
      status: 'pending_review',
      metadata: {
        photoQuality: 'good',
        completeParams: true,
        hasModelFile: true,
        validDimensions: true
      }
    };
    
    const context = {
      stock: { [material.toLowerCase().replace(/\s/g, '_')]: 1000 },
      devices: [
        { id: 'printer_1', status: 'idle' },
        { id: 'printer_2', status: 'idle' }
      ]
    };
    
    console.log('\n📦 收到决策请求:', { orderId: order._id, material, volume });
    
    const startTime = Date.now();
    const decision = await decisionEngine.makeDecision(order, context);
    const elapsed = Date.now() - startTime;
    
    console.log('✅ 决策完成:', { 
      result: decision.result, 
      confidence: decision.confidence,
      elapsed: `${elapsed}ms`
    });
    
    res.json({
      success: true,
      data: {
        orderId: order._id,
        decision: decision.toJSON(),
        elapsed,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ 决策失败:', error.message);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;
