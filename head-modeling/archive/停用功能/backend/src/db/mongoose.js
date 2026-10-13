/**
 * Mongoose 模块包装器
 * 在 Mock 模式下返回 Mock mongoose，真实模式返回真实 mongoose
 */

const useMock = process.env.MOCK_DB === 'true' || process.env.MOCK_DB === '1';

let mongoose;

if (useMock) {
  // Mock 模式
  mongoose = require('./mongoose.mock');
  console.log('[Mongoose] 使用 Mock 模式');
} else {
  // 真实模式
  mongoose = require('mongoose');
  
  // 配置 mongoose
  mongoose.set('strictPopulate', false);
}

module.exports = mongoose;
