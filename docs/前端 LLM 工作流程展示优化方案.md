# 前端 LLM 工作流程展示优化方案

**问题**: 当前 Agent 可视化页面展示的是硬编码模拟数据，没有显示真实的 LLM 决策流程。

**目标**: 展示完整的 LLM 辅助决策工作流程，包括：
1. 真实 Agent 决策数据（从后端 API）
2. 实时 Socket.IO 事件推送
3. LLM 决策详情（输入、输出、置信度、解释）
4. Agent 状态实时更新

---

## 📋 当前问题分析

### 1. 数据源问题

**现状**:
```typescript
// AgentVisualization.tsx - 硬编码模拟
const simulateNormalFlow = async () => {
  addThought('coordinator', '正在分析订单 ORD-123...');
  await delay(800);
  addEvent('Coordinator', '接收新订单，分配给 Scheduler', { 
    explanation: '检测到新订单...' // 硬编码
  });
}
```

**期望**:
```typescript
// 从后端 API 获取真实数据
const events = await getAgentDecisions();
// Socket.IO 实时推送
socket.on('agent-event', (event) => setEvents([event, ...events]));
```

### 2. DecisionPanel 展示问题

**现状**: 只显示基础字段
```typescript
details: {
  inputs: decision.inputSnapshot,
  rules: decision.rulesMatched,
  confidence: decision.confidence,
  explanation: decision.rationale
}
```

**期望**: 显示完整 LLM 决策信息
```typescript
details: {
  source: 'llm_assisted',      // LLM 标识
  inputs: {...},               // 输入快照
  llmEvaluation: {...},        // LLM 评估结果
  llmResponse: '...',          // LLM 原始响应
  rules: [...],                // 匹配规则
  confidence: 0.95,            // 置信度
  rationale: '...',            // 决策解释
  metadata: {                  // 元数据
    evaluationTime: 2300,
    model: 'deepseek-v3.2'
  }
}
```

### 3. Agent 状态更新问题

**现状**: 模拟状态更新
```typescript
updateAgentState('coordinator', { status: 'processing', active: true });
```

**期望**: 从后端获取真实状态
```typescript
// 轮询 Agent 状态
const status = await getAgentStatus('coordinator');
// 或 Socket.IO 推送
socket.on('agent-state-change', (state) => updateAgentState(state));
```

---

## 🔧 优化方案

### 方案 1: 混合模式（推荐）✅

**保留模拟功能用于演示**，同时**集成真实数据用于生产**。

#### 实现步骤

**Step 1: 添加数据源切换开关**
```typescript
const [useRealData, setUseRealData] = useState(false);

// UI 开关
<Switch 
  checked={useRealData} 
  onChange={setUseRealData}
  checkedChildren="真实数据"
  unCheckedChildren="模拟数据"
/>
```

**Step 2: 修改数据获取逻辑**
```typescript
useEffect(() => {
  if (useRealData) {
    // 获取真实数据
    fetchRealDecisions();
    setupSocketIO();
  } else {
    // 清空数据，等待模拟
    setEvents([]);
  }
}, [useRealData]);

const fetchRealDecisions = async () => {
  const data = await getAgentDecisions(50);
  setEvents(data);
};

const setupSocketIO = () => {
  const socket = io(process.env.VITE_API_BASE_URL);
  
  socket.on('agent-event', (event) => {
    setEvents(prev => [transformEvent(event), ...prev]);
  });
  
  socket.on('agent-state-change', (state) => {
    updateAgentState(state.agentId, state);
  });
};
```

**Step 3: 增强 DecisionPanel 显示**
```typescript
// 已实现，参考 DecisionPanel.tsx 修改
- 添加 LLM 标识（Alert 组件）
- 显示 LLM 评估结果
- 可展开查看 LLM 原始响应
```

**Step 4: 添加"触发真实决策"按钮**
```typescript
const triggerRealDecision = async () => {
  await triggerAgentDecision('coordinator', 'evaluate_order', {
    orderId: 'test_order_001'
  });
  message.success('已触发 Agent 决策');
};
```

---

### 方案 2: 完全真实模式

**移除所有模拟代码**，完全依赖后端数据。

**优点**:
- ✅ 代码更简洁
- ✅ 数据 100% 真实
- ✅ 减少维护成本

**缺点**:
- ❌ 无法演示（后端没有运行时）
- ❌ 依赖后端状态

---

## 📝 需要修改的文件清单

| 文件 | 修改内容 | 优先级 |
|------|---------|--------|
| `AgentVisualization.tsx` | 添加数据源切换 + 真实 API 集成 | P0 |
| `DecisionPanel.tsx` | 已修改（支持 LLM 展示） | ✅ 完成 |
| `agentService.ts` | 添加 `getAgentStatus` 接口 | P1 |
| `AgentFlow.tsx` | 支持实时状态更新 | P2 |
| 新增组件 `RealTimeMonitor.tsx` | 实时监控面板 | P2 |

---

## 🎯 实施计划

### Phase 1: 基础集成（P0）
- [ ] 添加数据源切换开关
- [ ] 集成真实 API 调用
- [ ] 设置 Socket.IO 监听

### Phase 2: 增强展示（P1）
- [ ] 触发真实决策按钮
- [ ] Agent 状态实时更新
- [ ] LLM 决策详情展示

### Phase 3: 优化体验（P2）
- [ ] 添加加载状态
- [ ] 错误处理和重试
- [ ] 性能优化（虚拟滚动）

---

## 🧪 测试验证

### 测试场景 1: 查看历史决策
```
1. 打开 Agent 可视化页面
2. 切换到"真实数据"模式
3. 查看决策时间线
4. 点击事件查看详情
预期：显示真实 LLM 决策数据
```

### 测试场景 2: 实时决策
```
1. 点击"触发真实决策"按钮
2. 观察 Agent 状态变化
3. 查看新生成的决策
预期：实时更新，显示 LLM 决策过程
```

### 测试场景 3: 模拟演示
```
1. 切换到"模拟数据"模式
2. 点击"模拟场景运行"
3. 观看动画演示
预期：正常播放，不影响真实数据
```

---

## 📊 预期效果

### 决策时间线
```
14:32:15 [Coordinator] 订单 ORD-001 - LLM 辅助决策
  ├─ 来源：llm_assisted
  ├─ 模型：deepseek-v3.2
  └─ 结果：MANUAL_REVIEW (置信度 85%)

14:32:18 [Scheduler] 订单 ORD-001 - 设备分配
  ├─ 来源：llm_assisted
  ├─ LLM 建议：printer_2
  └─ 结果：SUCCESS
```

### 决策详情页
```
╔══════════════════════════════════╗
║ 🤖 LLM 辅助决策                  ║
║ 此决策由 AI 大语言模型生成           ║
╚══════════════════════════════════╝

输入数据快照:
- 订单 ID: ORD-001
- 材料：白色 PLA
- 体积：50cm³
- 库存：充足

LLM 评估:
✓ 同意算法推荐
建议设备：printer_2
LLM 置信度：92%

决策解释:
规则引擎评估结果为'标准订单自动通过'，
置信度高（0.95），且订单完整性检查
的拒绝结果置信度为 1，但标准订单自
动通过的优先级更高...

[展开 LLM 原始响应 ▼]
```

---

## 🚀 立即实施方案

**推荐方案**: 方案 1（混合模式）

**理由**:
1. 保留演示功能（给客户展示）
2. 支持真实数据（生产环境）
3. 渐进式迁移（降低风险）

**实施时间**: 2-3 小时

---

**下一步**: 开始实施方案 1
