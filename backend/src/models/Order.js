/**
 * Order Model Schema
 * Represents a 3D modeling order with items, pricing, and status tracking
 */

const mongoose = require('../db/mongoose');

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Order must belong to a user']
    },
    items: [
      {
        deviceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Device',
          required: false
        },
        materialId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Material',
          required: false
        },
        quantity: {
          type: Number,
          required: true,
          min: [1, 'Quantity must be at least 1']
        },
        unitPrice: {
          type: Number,
          required: true,
          min: [0, 'Unit price cannot be negative']
        },
        specifications: {
          type: Map,
          of: mongoose.Schema.Types.Mixed
        }
      }
    ],
    totalPrice: {
      type: Number,
      required: [true, 'Total price is required'],
      min: [0, 'Total price cannot be negative']
    },
    status: {
      type: String,
      enum: ['pending_review', 'reviewing', 'scheduled', 'printing', 'post_processing', 'completed', 'shipped', 'cancelled', 'refunded', 'pending', 'processing', 'failed'],
      default: 'pending_review',
      required: true
    },
    agentDecisions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AgentDecision'
      }
    ],
    metadata: {
      sourcePhotos: [String],
      generatedModelUrl: String,
      notes: String
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ============================================
// 索引配置
// ============================================

// 基础查询索引
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

// Dashboard 统计查询优化索引
orderSchema.index({ status: 1 });                    // 按状态计数
orderSchema.index({ status: 1, updatedAt: -1 });     // 设备利用率统计（过去 24 小时完成订单）
orderSchema.index({ 'items.deviceId': 1 });          // 设备订单关联查询

// Virtual for calculating item count
orderSchema.virtual('itemCount').get(function() {
  return this.items.length;
});

// Instance method to add agent decision reference
orderSchema.methods.addAgentDecision = function(decisionId) {
  if (!this.agentDecisions.includes(decisionId)) {
    this.agentDecisions.push(decisionId);
  }
  return this.save();
};

// Static method to find orders by status
orderSchema.statics.findByStatus = function(status) {
  return this.find({ status }).populate('items.deviceId').exec();
};

module.exports = mongoose.model('Order', orderSchema);
