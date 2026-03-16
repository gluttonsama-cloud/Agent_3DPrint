/**
 * Device Model Schema
 * Represents a 3D printing device with status and capacity tracking
 */

const mongoose = require('../db/mongoose');

const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: [true, 'Device ID is required'],
      unique: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['sla', 'fdm', 'sls', 'mjf'],
      required: [true, 'Device type is required']
    },
    status: {
      type: String,
      enum: ['idle', 'busy', 'maintenance', 'offline'],
      default: 'idle',
      required: true
    },
    currentTask: {
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
      },
      startedAt: Date,
      estimatedCompletion: Date
    },
    capacity: {
      maxVolume: {
        type: Number,
        default: 100,
        min: [0, 'Capacity cannot be negative']
      },
      currentLoad: {
        type: Number,
        default: 0,
        min: [0, 'Current load cannot be negative'],
        max: [100, 'Current load cannot exceed 100%']
      }
    },
    specifications: {
      buildVolume: {
        x: Number,
        y: Number,
        z: Number
      },
      resolution: String,
      supportedMaterials: [String]
    },
    location: {
      type: String,
      trim: true
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
deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ status: 1 });
deviceSchema.index({ type: 1, status: 1 });

// Instance method to assign task to device
deviceSchema.methods.assignTask = async function(orderId, estimatedCompletion) {
  this.status = 'busy';
  this.currentTask = {
    orderId,
    startedAt: new Date(),
    estimatedCompletion
  };
  return this.save();
};

// Instance method to complete current task
deviceSchema.methods.completeTask = async function() {
  this.status = 'idle';
  this.currentTask = undefined;
  return this.save();
};

// Static method to find available devices
deviceSchema.statics.findAvailable = function(type) {
  const query = { status: 'idle' };
  if (type) {
    query.type = type;
  }
  return this.find(query).sort({ 'capacity.currentLoad': 1 });
};

module.exports = mongoose.model('Device', deviceSchema);
