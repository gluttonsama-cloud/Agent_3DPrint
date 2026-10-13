# 建模 API

正式入口只有 `src/app.js`，导入时不启动监听，`npm start` 时启动。
从本服务目录的 `.env` 加载配置，默认端口 3001。

```powershell
npm ci
npm run dev
npm test
```

当前路由：/health、/api/health、/api/upload、/api/status、/api/download、/api/remove-background、/api-docs。
交易、设备、库存、Agent 和统计接口已封存，返回 404。当前服务不依赖 MongoDB、Redis 或业务队列启动。
保留的任务存储仍为内存 Map，重启后任务会丢失。
测试使用本地 HTTP，不发送真实生成或抠图请求。
旧测试及启动入口见 ../../archive/停用功能/backend。
