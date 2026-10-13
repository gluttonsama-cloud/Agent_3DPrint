/**
 * MongoDB Connection Module
 * 支持真实 MongoDB 和 Mock 模式切换
 */

// 检查是否启用 Mock 模式
const useMock = process.env.MOCK_DB === 'true' || process.env.MOCK_DB === '1';

let connection;

if (useMock) {
  // Mock 模式：使用内存数据库
  connection = require('./connect.mock');
  console.log('[MongoDB] 使用 Mock 模式（内存数据库）');
} else {
  // 真实模式：使用 Mongoose
  const mongoose = require('mongoose');
  
  connection = {
    async connect() {
      const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/3d-head-modeling';
      
      try {
        await mongoose.connect(uri);
        console.log(`MongoDB connected: ${uri}`);
        return mongoose.connection;
      } catch (error) {
        console.error('MongoDB connection error:', error.message);
        throw error;
      }
    },
    
    async disconnect() {
      try {
        await mongoose.disconnect();
        console.log('MongoDB disconnected');
      } catch (error) {
        console.error('MongoDB disconnect error:', error.message);
        throw error;
      }
    }
  };
}

module.exports = connection;
