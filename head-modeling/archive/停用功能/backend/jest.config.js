/**
 * Jest 配置文件
 * 
 * 后端测试配置
 */

module.exports = {
  // 测试环境
  testEnvironment: 'node',
  
  // 测试文件匹配模式
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],
  
  // 忽略目录
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ],
  
  // 覆盖率配置
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/app.js',
    '!src/**/*.test.js',
    '!src/db/connect.js',
    '!src/db/mongoose*.js'
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  
  // 设置文件
  setupFilesAfterEnv: ['./tests/setup.js'],
  
  // 测试超时
  testTimeout: 10000,
  
  // 详细输出
  verbose: true
};