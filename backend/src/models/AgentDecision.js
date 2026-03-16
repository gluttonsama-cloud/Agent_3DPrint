/**
 * AgentDecision Model Schema
 * Records AI agent decisions made during order processing
 */

const mongoose = require('../db/mongoose');

const agentDecisionSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference is required']
    },
    agentId: {
      type: String,
      required: [true, 'Agent ID is required'],
      trim: true
    },
    decisionType: {
      type: String,
      enum: [
        'device_selection',
        'material_selection',
        'print_parameter',
        'quality_check',
        'error_recovery',
        'scheduling'
      ],
      required: [true, 'Decision type is required']
    },
    decisionResult: {
      type: String,
      required: [true, 'Decision result is required']
    },
    confidence: {
      type: Number,
      required: true,
      min: [0, 'Confidence cannot be negative'],
      max: [1, 'Confidence cannot exceed 1'],
      default: 0.5
    },
    inputSnapshot: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      required: true
    },
    rationale: {
      type: String,
      required: [true, 'Decision rationale is required']
    },
    alternatives: [
      {
        option: String,
        score: Number,
        reason: String
      }
    ],
    impact: {
      estimatedTime: Number,
      estimatedCost: Number,
      qualityScore: Number
    }
  },
  {
    timestamps: true
  }
);

// ============================================
// 索引配置
// ============================================

// 基础查询索引
agentDecisionSchema.index({ orderId: 1, createdAt: -1 });
agentDecisionSchema.index({ agentId: 1, decisionType: 1 });
agentDecisionSchema.index({ decisionType: 1 });
agentDecisionSchema.index({ createdAt: -1 });

// Dashboard 统计查询优化索引
agentDecisionSchema.index({ confidence: 1 });        // 低置信度查询
agentDecisionSchema.index({ agentId: 1 });           // Agent 性能分析

// Instance method to link decision to order
agentDecisionSchema.methods.linkToOrder = async function() {
  const Order = mongoose.model('Order');
  const order = await Order.findById(this.orderId);
  if (order) {
    await order.addAgentDecision(this._id);
  }
  return this;
};

// Static method to find decisions by order
agentDecisionSchema.statics.findByOrder = function(orderId) {
  return this.find({ orderId }).sort({ createdAt: -1 }).populate('orderId');
};

// Static method to find low confidence decisions
agentDecisionSchema.statics.findLowConfidence = function(threshold = 0.5) {
  return this.find({ confidence: { $lt: threshold } });
};

module.exports = mongoose.model('AgentDecision', agentDecisionSchema);
