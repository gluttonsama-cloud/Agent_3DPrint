/**
 * Material Model Schema
 * Represents 3D printing materials with stock tracking
 */

const mongoose = require('../db/mongoose');

const materialSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Material name is required'],
      trim: true
    },
    type: {
      type: String,
      enum: ['resin', 'filament', 'powder', 'liquid'],
      required: [true, 'Material type is required']
    },
    stock: {
      quantity: {
        type: Number,
        required: true,
        default: 0,
        min: [0, 'Stock quantity cannot be negative']
      },
      unit: {
        type: String,
        enum: ['kg', 'g', 'L', 'mL', 'spool', 'cartridge'],
        required: true,
        default: 'kg'
      }
    },
    threshold: {
      type: Number,
      required: [true, 'Reorder threshold is required'],
      min: [0, 'Threshold cannot be negative'],
      default: 10
    },
    properties: {
      color: String,
      density: Number,
      tensileStrength: String,
      printTemperature: {
        min: Number,
        max: Number
      }
    },
    supplier: {
      name: String,
      contactInfo: String,
      sku: String
    },
    costPerUnit: {
      type: Number,
      required: true,
      min: [0, 'Cost cannot be negative']
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
materialSchema.index({ type: 1 });
materialSchema.index({ name: 1 });
materialSchema.index({ 'stock.quantity': 1 });

// Virtual to check if material needs reordering
materialSchema.virtual('needsReorder').get(function() {
  return this.stock.quantity <= this.threshold;
});

// Instance method to update stock
materialSchema.methods.updateStock = async function(quantityChange) {
  const newQuantity = this.stock.quantity + quantityChange;
  if (newQuantity < 0) {
    throw new Error('Insufficient stock');
  }
  this.stock.quantity = newQuantity;
  return this.save();
};

// Static method to find low stock materials
materialSchema.statics.findLowStock = function() {
  return this.find().where('stock.quantity').lte(this.schema.path('threshold').options.default || 10);
};

module.exports = mongoose.model('Material', materialSchema);
