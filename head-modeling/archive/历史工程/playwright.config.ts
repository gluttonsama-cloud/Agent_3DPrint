/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './playwright/e2e',
  
  // 超时设置
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  
  // 失败重试
  retries: 1,
  
  // 并行执行
  workers: 2,
  
  // 报告配置
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],
  
  use: {
    // 基础 URL
    baseURL: 'http://localhost:3000',
    
    // 浏览器截图
    screenshot: 'only-on-failure',
    
    // 视频录制
    video: 'retain-on-failure',
    
    // 追踪
    trace: 'retain-on-failure',
    
    // 浏览器上下文
    viewport: { width: 1920, height: 1080 },
  },
  
  // 项目配置
  projects: [
    {
      name: 'chromium',
      use: { 
        channel: 'chrome',
      },
    },
  ],
  
  // Web 服务器配置（可选，如果服务已运行则不需要）
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: true,
  // },
});
