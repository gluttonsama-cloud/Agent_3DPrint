# 数据看板 API 文档

> 版本：v1.0.0  
> 最后更新：2026-03-04

本文档描述数据看板系统的完整 API 接口，用于提供订单统计、设备利用率、库存趋势、Agent 性能分析等数据，支持前端数据可视化展示。

---

## 目录

1. [API 端点概览](#api-端点概览)
2. [详细端点说明](#详细端点说明)
3. [统计指标说明](#统计指标说明)
4. [图表推荐](#图表推荐)
5. [最佳实践](#最佳实践)
6. [错误处理](#错误处理)

---

## API 端点概览

| 端点 | 方法 | 描述 | 数据源 |
|------|------|------|--------|
| `/api/dashboard/overview` | GET | 获取概览统计数据 | Order, Device, Material |
| `/api/dashboard/orders/stats` | GET | 获取订单统计数据 | Order |
| `/api/dashboard/devices/utilization` | GET | 获取设备利用率 | Device, Order |
| `/api/dashboard/inventory/trend` | GET | 获取库存趋势数据 | Material |
| `/api/dashboard/agents/performance` | GET | 获取 Agent 性能分析 | AgentDecision |
| `/api/dashboard/decisions/analysis` | GET | 获取决策分析数据 | AgentDecision |
| `/api/dashboard/export` | GET | 导出报表 | 全部 |

---

## 详细端点说明

### 1. 概览统计

获取系统核心指标的实时快照。

**请求**
```http
GET /api/dashboard/overview
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "totalOrders": 1250,
    "pendingOrders": 15,
    "printingOrders": 8,
    "completedToday": 42,
    "deviceUtilization": 0.78,
    "lowStockMaterials": 3
  }
}
```

**字段说明**
- `totalOrders`: 系统总订单数
- `pendingOrders`: 待处理订单数（状态为 pending）
- `printingOrders`: 正在打印的订单数（状态为 printing）
- `completedToday`: 今日完成的订单数
- `deviceUtilization`: 设备整体利用率（0-1 之间的小数）
- `lowStockMaterials`: 低库存物料数量（库存 ≤ 阈值）

**前端使用建议**
- 用于首页概览卡片展示
- 建议每 30 秒自动刷新一次
- 设备利用率可使用仪表盘组件

---

### 2. 订单统计

获取指定时间范围内的订单统计数据。

**请求**
```http
GET /api/dashboard/orders/stats?days=30
```

**查询参数**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `days` | number | 30 | 统计天数范围 |

**响应示例**
```json
{
  "success": true,
  "data": {
    "total": 1250,
    "byStatus": {
      "pending": 10,
      "processing": 5,
      "printing": 8,
      "completed": 1200,
      "cancelled": 27
    },
    "trend": [
      {
        "date": "2026-02-03",
        "count": 35,
        "revenue": 12500
      },
      {
        "date": "2026-02-04",
        "count": 42,
        "revenue": 15800
      }
    ]
  }
}
```

**字段说明**
- `total`: 统计周期内总订单数
- `byStatus`: 按订单状态分组的统计
- `trend`: 每日订单趋势数组
  - `date`: 日期（YYYY-MM-DD 格式）
  - `count`: 当日订单数
  - `revenue`: 当日订单总金额

**前端使用建议**
- 按状态统计：使用饼图或环形图
- 趋势数据：使用折线图或柱状图
- 支持时间范围选择器（7 天、30 天、90 天）

---

### 3. 设备利用率

获取所有设备的利用率统计和趋势。

**请求**
```http
GET /api/dashboard/devices/utilization
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "overall": 0.78,
    "byDevice": [
      {
        "deviceId": "PRINTER-001",
        "utilization": 0.85,
        "status": "busy",
        "completedToday": 12
      },
      {
        "deviceId": "PRINTER-002",
        "utilization": 0.65,
        "status": "idle",
        "completedToday": 8
      }
    ],
    "trend": [
      { "hour": "00", "utilization": 0.45 },
      { "hour": "01", "utilization": 0.42 },
      { "hour": "02", "utilization": 0.38 }
    ]
  }
}
```

**字段说明**
- `overall`: 整体设备利用率（所有设备平均值）
- `byDevice`: 每个设备的详细统计
  - `deviceId`: 设备唯一标识
  - `utilization`: 设备利用率（0-1）
  - `status`: 设备状态（idle/busy/maintenance/offline）
  - `completedToday`: 今日完成订单数
- `trend`: 过去 24 小时利用率趋势（每小时）

**前端使用建议**
- 整体利用率：使用大型仪表盘
- 设备列表：使用卡片网格，状态用颜色区分
- 趋势图：使用面积折线图

---

### 4. 库存趋势

获取物料库存趋势数据。

**请求**
```http
GET /api/dashboard/inventory/trend?materialId=mat_xxx&days=30
```

**查询参数**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `materialId` | string | - | 物料 ID（可选，不传返回所有物料） |
| `days` | number | 30 | 统计天数 |

**响应示例**
```json
{
  "success": true,
  "data": {
    "totalMaterials": 15,
    "lowStockCount": 3,
    "items": [
      {
        "materialId": "mat_xxx",
        "name": "光敏树脂 - 白色",
        "type": "resin",
        "currentStock": 25.5,
        "unit": "kg",
        "threshold": 10,
        "needsReorder": false,
        "history": [
          { "date": "2026-02-03", "stock": 30 },
          { "date": "2026-02-04", "stock": 28 },
          { "date": "2026-02-05", "stock": 25.5 }
        ]
      }
    ]
  }
}
```

**字段说明**
- `totalMaterials`: 总物料数
- `lowStockCount`: 低库存物料数
- `items`: 物料详情数组
  - `materialId`: 物料 ID
  - `name`: 物料名称
  - `type`: 物料类型（resin/filament/powder/liquid）
  - `currentStock`: 当前库存量
  - `unit`: 单位（kg/g/L/mL/spool/cartridge）
  - `threshold`: 补货阈值
  - `needsReorder`: 是否需要补货
  - `history`: 库存历史（每日快照）

**前端使用建议**
- 库存列表：使用表格，低库存高亮显示
- 库存趋势：使用折线图
- 补货告警：使用红色标记或弹窗提醒

---

### 5. Agent 性能分析

获取各 Agent 的决策性能指标。

**请求**
```http
GET /api/dashboard/agents/performance
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "coordinator": {
      "totalDecisions": 1200,
      "avgConfidence": 0.92,
      "autoApproveRate": 0.85,
      "avgDecisionTime": 1.2
    },
    "scheduler": {
      "totalDecisions": 1150,
      "avgConfidence": 0.88,
      "avgDecisionTime": 2.5
    },
    "inventory": {
      "totalDecisions": 1100,
      "avgConfidence": 0.95,
      "avgDecisionTime": 0.8
    }
  }
}
```

**字段说明**
- `coordinator`: 协调 Agent 性能
  - `totalDecisions`: 总决策数
  - `avgConfidence`: 平均置信度（0-1）
  - `autoApproveRate`: 自动批准率（0-1）
  - `avgDecisionTime`: 平均决策时间（秒）
- `scheduler`: 调度 Agent 性能（结构同上）
- `inventory`: 库存 Agent 性能（结构同上）

**前端使用建议**
- 使用对比柱状图展示各 Agent 指标
- 置信度使用进度条或仪表盘
- 决策时间使用横向柱状图

---

### 6. 决策分析

获取系统决策的详细分析数据。

**请求**
```http
GET /api/dashboard/decisions/analysis
```

**响应示例**
```json
{
  "success": true,
  "data": {
    "byType": {
      "device_selection": 850,
      "material_selection": 150,
      "print_parameter": 100,
      "scheduling": 100
    },
    "confidenceDistribution": {
      "high": 950,
      "medium": 200,
      "low": 50
    },
    "lowConfidenceRate": 0.04,
    "totalDecisions": 1200
  }
}
```

**字段说明**
- `byType`: 按决策类型分组统计
  - `device_selection`: 设备选择决策数
  - `material_selection`: 物料选择决策数
  - `print_parameter`: 打印参数决策数
  - `scheduling`: 调度决策数
- `confidenceDistribution`: 置信度分布
  - `high`: 高置信度（0.8-1.0）决策数
  - `medium`: 中置信度（0.5-0.8）决策数
  - `low`: 低置信度（0-0.5）决策数
- `lowConfidenceRate`: 低置信度决策占比
- `totalDecisions`: 总决策数

**前端使用建议**
- 决策类型：使用饼图
- 置信度分布：使用堆叠柱状图
- 低置信度告警：使用红色数字突出显示

---

### 7. 导出报表

导出完整的数据报表。

**请求**
```http
GET /api/dashboard/export?format=json&days=30
```

**查询参数**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `format` | string | json | 导出格式（json/csv/pdf） |
| `days` | number | 30 | 统计天数 |

**响应示例（JSON 格式）**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-03-04T10:30:00.000Z",
    "period": {
      "days": 30,
      "unit": "days"
    },
    "overview": { ... },
    "orders": { ... },
    "devices": { ... },
    "inventory": { ... },
    "agents": { ... },
    "decisions": { ... }
  }
}
```

**CSV 格式示例**
```csv
报表生成时间，2026-03-04T10:30:00.000Z
统计周期，30 天

=== 概览统计 ===
指标，数值
totalOrders,1250
pendingOrders,15
...

=== 订单统计 ===
指标，数值
总订单数，1250
pending,10
...
```

**前端使用建议**
- 提供下载按钮
- JSON 格式适合程序处理
- CSV 格式适合 Excel 打开
- PDF 格式需要额外依赖支持

---

## 统计指标说明

### 订单相关指标

| 指标 | 计算方式 | 说明 |
|------|----------|------|
| 总订单数 | count(orders) | 系统创建的所有订单 |
| 待处理订单 | count(orders where status='pending') | 等待审核的订单 |
| 打印中订单 | count(orders where status='printing') | 正在打印的订单 |
| 今日完成 | count(orders where status='completed' AND date=today) | 今天完成的订单 |

### 设备利用率

**计算公式**：
```
设备利用率 = (活跃设备数 / 总设备数) × 权重 + (完成订单数 × 0.1)
```

- 活跃设备：状态为 `busy` 的设备
- 权重基于设备当前负载百分比
- 每个完成订单贡献 0.1 的利用率

### Agent 置信度

**置信度级别划分**：
- 高置信度：0.8 - 1.0
- 中置信度：0.5 - 0.8
- 低置信度：0.0 - 0.5

**低置信度告警阈值**：0.5

---

## 图表推荐

### 1. 概览卡片
- **组件类型**：统计卡片
- **展示内容**：6 个核心指标
- **更新频率**：30 秒

### 2. 订单趋势
- **推荐图表**：折线图 + 柱状图混合
- **X 轴**：日期
- **Y 轴（左）**：订单数量（柱状图）
- **Y 轴（右）**：订单金额（折线图）
- **颜色**：主色调蓝色

### 3. 订单状态分布
- **推荐图表**：环形图
- **颜色映射**：
  - pending: 黄色
  - processing: 蓝色
  - printing: 橙色
  - completed: 绿色
  - cancelled: 红色

### 4. 设备利用率
- **推荐图表**：仪表盘 + 热力图
- **整体利用率**：大型仪表盘
- **单设备状态**：卡片网格，背景色表示状态
  - idle: 绿色
  - busy: 蓝色
  - maintenance: 橙色
  - offline: 灰色

### 5. 库存趋势
- **推荐图表**：多折线图
- **X 轴**：日期
- **Y 轴**：库存数量
- **告警线**：阈值水平线（红色虚线）

### 6. Agent 性能对比
- **推荐图表**：分组柱状图
- **分组**：各 Agent
- **指标**：决策数、置信度、决策时间
- **颜色**：不同指标使用不同颜色

### 7. 决策分析
- **推荐图表**：饼图 + 堆叠柱状图
- **决策类型**：饼图
- **置信度分布**：堆叠柱状图（按天）

---

## 最佳实践

### 1. 性能优化

**批量查询**
```javascript
// ✅ 推荐：并行查询多个数据源
const [overview, orders, devices] = await Promise.all([
  dashboardService.getOverview(),
  dashboardService.getOrderStats(30),
  dashboardService.getDeviceUtilization()
]);

// ❌ 不推荐：串行查询
const overview = await dashboardService.getOverview();
const orders = await dashboardService.getOrderStats(30);
const devices = await dashboardService.getDeviceUtilization();
```

**缓存策略**
- 概览数据：缓存 30 秒
- 订单统计：缓存 5 分钟
- 设备利用率：缓存 1 分钟
- Agent 性能：缓存 10 分钟

### 2. 错误处理

**前端错误处理示例**
```javascript
async function fetchDashboardData() {
  try {
    const response = await fetch('/api/dashboard/overview');
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || '获取数据失败');
    }
    
    return result.data;
  } catch (error) {
    console.error('[Dashboard] 获取数据失败:', error);
    // 显示错误提示
    showErrorToast('数据加载失败，请稍后重试');
    return null;
  }
}
```

### 3. 数据刷新策略

**推荐方案**
```javascript
// 轮询刷新
useEffect(() => {
  // 立即获取一次数据
  fetchDashboardData();
  
  // 设置定时刷新
  const interval = setInterval(() => {
    fetchDashboardData();
  }, 30000); // 30 秒
  
  return () => clearInterval(interval);
}, []);

// 页面可见性变化时刷新
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    fetchDashboardData();
  }
});
```

### 4. 响应式设计

**断点建议**
```css
/* 移动端 */
@media (max-width: 768px) {
  .dashboard-grid {
    grid-template-columns: 1fr; /* 单列 */
  }
}

/* 平板 */
@media (min-width: 769px) and (max-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr); /* 双列 */
  }
}

/* 桌面 */
@media (min-width: 1025px) {
  .dashboard-grid {
    grid-template-columns: repeat(3, 1fr); /* 三列 */
  }
}
```

---

## 错误处理

### 错误响应格式

```json
{
  "success": false,
  "error": "错误类型描述",
  "message": "详细错误信息"
}
```

### 常见错误码

| HTTP 状态码 | 错误类型 | 说明 |
|------------|----------|------|
| 400 | Bad Request | 请求参数错误 |
| 404 | Not Found | 资源不存在 |
| 500 | Internal Server Error | 服务器内部错误 |

### 错误处理示例

```javascript
// 参数验证错误
{
  "success": false,
  "error": "不支持的导出格式",
  "message": "支持的格式：json, csv, pdf"
}

// 数据库查询错误
{
  "success": false,
  "error": "获取订单统计数据失败",
  "message": "Connection timeout"
}
```

---

## 更新日志

### v1.0.0 (2026-03-04)
- ✅ 初始版本发布
- ✅ 实现 7 个核心 API 端点
- ✅ 集成 Order、Device、Material、AgentDecision 数据源
- ✅ 支持 JSON/CSV 导出格式
- ✅ 完整的中文文档

---

## 联系与支持

如有问题或建议，请联系开发团队。
