/**
 * Jest 测试环境设置
 * 
 * 在每个测试文件运行前执行
 */

// 增加测试超时时间
jest.setTimeout(10000);

// 全局测试环境变量
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test_db';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// 抑制控制台日志（测试时）
if (process.env.SUPPRESS_CONSOLE) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

// 全局清理
afterAll(async () => {
  // 清理所有活动的定时器
  jest.clearAllTimers();
});