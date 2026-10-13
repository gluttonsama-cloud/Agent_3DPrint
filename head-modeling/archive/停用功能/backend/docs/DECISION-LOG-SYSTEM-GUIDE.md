# 决策日志系统指南

## 概述

决策日志系统用于记录、查询和分析多 Agent 系统中所有 Agent 的决策过程。该系统支持决策追溯、统计分析、异常检测等功能，是比赛演示和调试的重要工具。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent 层                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │Coordinator  │  │ Scheduler   │  │ Inventory   │         │
│  │   Agent     │  │   Agent     │  │   Agent     │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┴────────────────┘                 │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │DecisionLog  │
                    │  Service    │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
┌────────▼────────┐ ┌──────▼──────┐ ┌───────▼───────┐
│ AgentDecision   │ │Decision     │ │AgentEvent     │
│   (MongoDB)     │ │ Analyzer    │ │  Emitter      │
└─────────────────┘ └─────────────┘ └───────────────┘
                           │
                    ┌──────▼──────┐
                    │  REST API   │
                    │   Routes    │
                    └─────────────┘
```

## 数据模型

### AgentDecision Schema

```javascript
{
  orderId: ObjectId,           // 关联订单 ID
  agentId: String,             // Agent 标识
  agentName: String,           // Agent 名称
  decisionType: String,        // 决策类型
  decisionResult: String,      // 决策结果
  confidence: Number,          // 置信度 (0-1)
  inputSnapshot: Map,          // 输入数据快照
  rationale: String,           // 决策理由
  alternatives: Array,         // 备选方案
  impact: Object,              // 影响评估
  rulesMatched: Array,         // 匹配的规则
  timestamp: Date              // 决策时间
}
```

### 决策类型枚举

- `device_selection` - 设备选择
- `material_selection` - 材料选择
- `print_parameter` - 打印参数
- `quality_check` - 质量检查
- `error_recovery` - 错误恢复
- `scheduling` - 调度决策

## 使用方法

### 1. 记录决策

```javascript
const { decisionLogService } = require('../services/DecisionLogService');

// 记录单个决策
await decisionLogService.record({
  orderId: 'order_123',
  agentId: 'coordinator_agent',
  agentName: '协调 Agent',
  decisionType: 'scheduling',
  decisionResult: 'approved',
  confidence: 0.95,
  inputSnapshot: {
    photoQuality: 0.92,
    materialStock: 500,
    deviceAvailability: 3
  },
  rationale: '所有条件满足：照片质量优秀（0.92），库存充足（500g），3 台设备可用',
  alternatives: [
    { option: 'manual_review', score: 0.3, reason: '照片质量接近阈值' }
  ],
  impact: {
    estimatedTime: 120,
    estimatedCost: 150,
    qualityScore: 0.9
  },
  rulesMatched: ['rule_photo_quality_high', 'rule_stock_sufficient']
});
```

### 2. 查询决策

```javascript
// 按订单 ID 查询
const decisions = await decisionLogService.findByOrderId('order_123', {
  limit: 50,
  sort: 'desc'
});

// 按 Agent ID 查询
const agentDecisions = await decisionLogService.findByAgentId('coordinator_agent', {
  decisionType: 'scheduling',
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z',
  limit: 50
});

// 按时间范围查询
const timeRangeDecisions = await decisionLogService.findByTimeRange(
  new Date('2026-03-01'),
  new Date('2026-03-04'),
  { agentId: 'coordinator_agent', limit: 100 }
);

// 查询低置信度决策
const lowConfidence = await decisionLogService.findLowConfidence(0.5, {
  limit: 50
});
```

### 3. 获取统计信息

```javascript
const stats = await decisionLogService.getStats({
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z',
  agentId: 'coordinator_agent'
});

// 返回统计结果包含：
// - total: 总决策数
// - byType: 按决策类型统计
// - byAgent: 按 Agent 统计
// - confidenceDistribution: 置信度分布
// - avgConfidence: 平均置信度
// - lowConfidenceCount: 低置信度决策数
// - lowConfidenceRate: 低置信度比率
```

### 4. 导出日志

```javascript
// 导出为 JSON
const jsonData = await decisionLogService.exportAsJSON({
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z'
});

// 导出为 CSV
const csvData = await decisionLogService.exportAsCSV({
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z'
});
```

## 决策分析

### 1. 置信度分布分析

```javascript
const { DecisionAnalyzer } = require('../utils/DecisionAnalyzer');
const analyzer = new DecisionAnalyzer();

const confidenceAnalysis = await analyzer.analyzeConfidenceDistribution({
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z',
  agentId: 'coordinator_agent'
});

// 返回：
// - distribution: 置信度区间分布（high/medium/low）
// - overall: 总体统计（总数、平均值、最小值、最大值、标准差）
// - thresholds: 阈值配置
```

### 2. 决策类型统计

```javascript
const typeAnalysis = await analyzer.analyzeDecisionTypes({
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z'
});

// 返回：
// - byType: 按决策类型统计
// - byResult: 按决策结果统计
// - total: 总决策数
```

### 3. 规则命中率分析

```javascript
const ruleAnalysis = await analyzer.analyzeRuleMatchRate({
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z'
});

// 返回：
// - totalDecisions: 总决策数
// - decisionsWithRules: 包含规则的决策数
// - ruleMatchRate: 规则命中率
// - rules: 规则使用统计（前 20 个）
// - uniqueRulesCount: 唯一规则数量
```

### 4. 决策时间分析

```javascript
const timeAnalysis = await analyzer.analyzeDecisionTime({
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z'
});

// 返回：
// - overall: 总体时间统计
// - byType: 按决策类型统计时间
// - longDecisions: 长时间决策统计
```

### 5. 异常检测

```javascript
const anomalies = await analyzer.detectAnomalies({
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z',
  limit: 50
});

// 返回：
// - summary: 异常统计摘要
// - anomalies.lowConfidence: 低置信度决策列表
// - anomalies.longDecision: 长时间决策列表
// - thresholds: 检测阈值
```

### 6. Agent 性能分析

```javascript
const agentAnalysis = await analyzer.analyzeAgentPerformance({
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z'
});

// 返回：
// - agents: 各 Agent 性能统计
// - totalAgents: Agent 总数
```

### 7. 生成综合报告

```javascript
const report = await analyzer.generateReport({
  startTime: '2026-03-01T00:00:00.000Z',
  endTime: '2026-03-04T23:59:59.999Z'
});

// 返回包含所有分析维度的综合报告
```

## REST API

### 查询 API

#### GET /api/decision-logs/:orderId
查询订单的决策历史

**参数：**
- `orderId` (路径参数) - 订单 ID
- `limit` (查询参数) - 返回数量限制（默认 50）
- `sort` (查询参数) - 排序方式 asc/desc（默认 desc）

**响应：**
```json
{
  "success": true,
  "count": 5,
  "decisions": [...]
}
```

#### GET /api/decision-logs/agent/:agentId
查询 Agent 的决策记录

**参数：**
- `agentId` (路径参数) - Agent ID
- `decisionType` (查询参数) - 决策类型过滤
- `startTime` (查询参数) - 开始时间 ISO8601
- `endTime` (查询参数) - 结束时间 ISO8601
- `limit` (查询参数) - 返回数量限制（默认 50）

#### GET /api/decision-logs/stats
获取决策统计信息

**参数：**
- `startTime` (查询参数) - 开始时间 ISO8601
- `endTime` (查询参数) - 结束时间 ISO8601
- `agentId` (查询参数) - Agent ID 过滤

#### GET /api/decision-logs/export
导出决策日志

**参数：**
- `format` (查询参数) - 导出格式 json/csv（默认 json）
- `startTime` (查询参数) - 开始时间 ISO8601
- `endTime` (查询参数) - 结束时间 ISO8601
- `agentId` (查询参数) - Agent ID 过滤
- `decisionType` (查询参数) - 决策类型过滤

### 分析 API

#### GET /api/decision-logs/analysis/confidence
分析置信度分布

#### GET /api/decision-logs/analysis/types
分析决策类型统计

#### GET /api/decision-logs/analysis/rules
分析规则命中率

#### GET /api/decision-logs/analysis/time
分析决策时间

#### GET /api/decision-logs/analysis/anomalies
检测异常决策

#### GET /api/decision-logs/analysis/agents
分析 Agent 性能

#### GET /api/decision-logs/analysis/report
生成综合分析报告

### 其他 API

#### GET /api/decision-logs/low-confidence
查询低置信度决策

**参数：**
- `threshold` (查询参数) - 置信度阈值（默认 0.5）
- `limit` (查询参数) - 返回数量限制（默认 50）

#### GET /api/decision-logs/type/:decisionType
按决策类型查询

**参数：**
- `decisionType` (路径参数) - 决策类型
- `startTime` (查询参数) - 开始时间 ISO8601
- `endTime` (查询参数) - 结束时间 ISO8601
- `limit` (查询参数) - 返回数量限制（默认 50）

## 与 Agent 集成

### CoordinatorAgent 集成

```javascript
const { decisionLogService } = require('../services/DecisionLogService');

// 在做出决策后记录
async makeDecision(orderId, context = {}) {
  const decision = await this.decisionEngine.makeDecision(order, context);
  
  // 记录决策
  await decisionLogService.record({
    orderId,
    agentId: this.id,
    agentName: this.name,
    decisionType: 'scheduling',
    decisionResult: decision.result,
    confidence: decision.confidence,
    rationale: decision.rationale || decision.reason,
    rulesMatched: decision.rulesMatched || []
  });
  
  return decision;
}
```

### SchedulerAgent 集成

```javascript
// 在设备分配后记录
async allocateDevice(orderId, strategy = null) {
  const allocationResult = await this.allocationAlgorithm.allocate(order, options);
  
  if (allocationResult.success) {
    const device = allocationResult.recommendations[0].device;
    await decisionLogService.record({
      orderId,
      agentId: this.id,
      agentName: this.name,
      decisionType: 'device_selection',
      decisionResult: device.deviceId,
      confidence: allocationResult.score || 0.8,
      rationale: `设备评分最高，${device.deviceId} 为最优选择`,
      alternatives: allocationResult.recommendations.slice(1, 4).map(rec => ({
        option: rec.device.deviceId,
        score: rec.score,
        reason: rec.reason
      })),
      rulesMatched: ruleAdjustments?.appliedRules?.map(r => r.ruleId) || []
    });
  }
  
  return allocationResult;
}
```

### InventoryAgent 集成

```javascript
// 在库存检查后记录
async checkInventory(materialId = null, requiredAmount = 0) {
  const results = [];
  
  for (const material of materials) {
    const statusResult = this.ruleManager.checkInventoryStatus(material, requiredAmount);
    
    // 记录决策
    await decisionLogService.record({
      orderId: material.orderId || 'inventory_check',
      agentId: this.id,
      agentName: this.name,
      decisionType: 'quality_check',
      decisionResult: statusResult.status,
      confidence: 1.0,
      rationale: `库存${statusResult.isSufficient ? '充足' : '不足'}`,
      rulesMatched: statusResult.appliedRules || []
    });
  }
  
  return { summary, details: results };
}
```

## 事件系统

决策日志系统与 AgentEventEmitter 集成，自动发射以下事件：

- `decision_made` - 决策记录事件
- `decision_low_confidence` - 低置信度告警事件

### 监听决策事件

```javascript
const { agentEventEmitter, AgentEventType } = require('../utils/AgentEventEmitter');

// 监听所有决策事件
agentEventEmitter.on(AgentEventType.DECISION_MADE, (event) => {
  console.log('决策事件:', event.data);
});

// 监听低置信度告警
agentEventEmitter.on('decision_low_confidence', (event) => {
  console.warn('低置信度告警:', event.data);
});
```

## 最佳实践

### 1. 决策记录时机

- **立即记录**：在 Agent 做出决策后立即记录
- **完整信息**：确保记录完整的输入快照和决策理由
- **备选方案**：记录备选方案及其评分，便于追溯

### 2. 置信度设置

- **高置信度** (> 0.8)：明确规则匹配，数据充分
- **中置信度** (0.5-0.8)：部分规则匹配，数据基本充分
- **低置信度** (< 0.5)：规则不匹配，数据不足，需要人工审核

### 3. 输入快照

记录关键输入数据，便于问题追溯：

```javascript
inputSnapshot: {
  // 订单相关
  orderId,
  status,
  itemCount,
  totalPrice,
  
  // 质量相关
  photoQuality,
  materialQuality,
  
  // 资源相关
  materialStock,
  deviceAvailability,
  
  // 其他上下文
  metadata
}
```

### 4. 规则匹配

记录匹配的规则 ID，便于规则效果分析：

```javascript
rulesMatched: [
  'rule_photo_quality_high',
  'rule_stock_sufficient',
  'rule_devices_available'
]
```

### 5. 性能考虑

- **批量记录**：对于大量决策，使用 `recordBatch` 方法
- **定期导出**：定期导出历史数据，避免数据库过大
- **索引优化**：确保常用查询字段已建立索引

## 配置选项

### DecisionLogService 配置

```javascript
const decisionLogService = new DecisionLogService({
  enableLogging: true,              // 启用日志输出
  enableEvents: true,               // 启用事件发射
  lowConfidenceThreshold: 0.5,      // 低置信度阈值
  maxHistorySize: 1000              // 内存历史最大大小
});
```

### DecisionAnalyzer 配置

```javascript
const analyzer = new DecisionAnalyzer({
  lowConfidenceThreshold: 0.5,      // 低置信度阈值
  highConfidenceThreshold: 0.8,     // 高置信度阈值
  longDecisionTimeMs: 5000,         // 长时间决策阈值（毫秒）
  enableLogging: true               // 启用日志输出
});
```

## 故障排除

### 常见问题

1. **决策记录失败**
   - 检查 MongoDB 连接
   - 验证必填字段是否完整
   - 检查置信度范围 (0-1)

2. **查询结果为空**
   - 检查时间范围是否正确
   - 验证 orderId/agentId 是否匹配
   - 确认数据库中有数据

3. **性能问题**
   - 使用索引优化查询
   - 限制返回数量 (limit)
   - 避免过大的时间范围

### 调试技巧

```javascript
// 启用详细日志
const decisionLogService = new DecisionLogService({
  enableLogging: true
});

// 检查内存历史
const history = decisionLogService.getHistory(50);
console.log('最近的决策:', history);

// 清空内存历史（调试后）
decisionLogService.clearHistory();
```

## 未来扩展

- [ ] 决策可视化仪表板
- [ ] 实时决策监控
- [ ] 决策质量评估模型
- [ ] 自动规则优化建议
- [ ] 决策链追溯（多 Agent 协作链路）

## 相关文件

- `backend/src/services/DecisionLogService.js` - 决策日志服务
- `backend/src/utils/DecisionAnalyzer.js` - 决策分析工具
- `backend/src/routes/decisionLogs.js` - 决策查询 API
- `backend/src/models/AgentDecision.js` - 决策记录模型
- `backend/src/utils/AgentEventEmitter.js` - 事件发射器
