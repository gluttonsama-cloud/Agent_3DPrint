# 全流程测试指南

> 3D 打印多 Agent 管理系统 - 生产级测试用例

---

## 目录

1. [测试环境准备](#测试环境准备)
2. [功能测试用例](#功能测试用例)
3. [业务流程测试](#业务流程测试)
4. [性能测试](#性能测试)
5. [验收标准](#验收标准)
6. [测试报告模板](#测试报告模板)

---

## 测试环境准备

### 硬件要求

| 组件 | 最小配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核 |
| RAM | 4GB | 8GB |
| 存储 | 10GB | 20GB SSD |
| 网络 | 100Mbps | 1Gbps |

### 软件要求

| 软件 | 版本要求 | 用途 |
|------|----------|------|
| Node.js | >= 18.0.0 | 后端运行环境 |
| MongoDB | >= 6.0 | 数据库（或 Mock 模式） |
| Redis | >= 6.0 | 缓存/队列（或 Mock 模式） |
| Docker | >= 20.10 | 容器化部署（可选） |

### 环境配置

#### 步骤 1：克隆代码

```bash
git clone <repo-url>
cd 3d-print-agent-system
```

#### 步骤 2：安装依赖

```bash
# 后端
cd backend
npm install

# 前端
cd ../admin-web
npm install
```

#### 步骤 3：配置环境

```bash
cd backend
cp .env.example .env
# 编辑 .env 配置数据库连接
```

**后端 .env 示例**:

```bash
NODE_ENV=test
PORT=3001
MONGODB_URI=mongodb://localhost:27017/3dprint_test
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=test_secret_key
```

#### 步骤 4：启动服务

```bash
# 方式 1：使用 Mock 模式（无需真实数据库）
cd backend
npm run dev:mock

# 方式 2：完整模式（需要 MongoDB/Redis）
npm run dev

# 前端（新终端窗口）
cd admin-web
npm run dev
```

#### 步骤 5：验证服务

```bash
# 检查后端健康状态
curl http://localhost:3001/health

# 检查前端
curl http://localhost:3000/
```

预期输出:

```json
{
  "status": "ok",
  "timestamp": "2026-03-07T10:00:00.000Z"
}
```

---

## 功能测试用例

### 测试 1：订单创建流程

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-001 |
| **优先级** | P0 |
| **模块** | 订单管理 |
| **前置条件** | 后端和前端服务已启动 |

**测试步骤**:

1. 访问 `http://localhost:3000/orders`
2. 点击"创建订单"按钮
3. 填写订单信息：
   - 客户姓名：测试用户
   - 模型名称：测试模型
   - 材料：黑色 PLA 线材
   - 体积：50g
4. 上传 STL 文件（可选）
5. 点击"提交"

**预期结果**:
- ✅ 订单创建成功提示
- ✅ 跳转到订单详情页
- ✅ 订单状态为"pending"
- ✅ 数据库中新增订单记录

**验证命令**:

```bash
# 检查最新订单
curl http://localhost:3001/api/orders | jq '.data.items[-1]'

# 预期输出
{
  "_id": "order_xxx",
  "customerName": "测试用户",
  "modelName": "测试模型",
  "material": "黑色 PLA 线材",
  "volume": 50,
  "status": "pending",
  "createdAt": "2026-03-07T10:00:00.000Z"
}
```

---

### 测试 2：订单分配设备

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-002 |
| **优先级** | P0 |
| **模块** | 设备管理 |
| **前置条件** | 已创建订单，至少 1 台空闲设备 |

**测试步骤**:

1. 访问订单详情页
2. 点击"分配设备"按钮
3. 选择可用设备
4. 点击"确认分配"

**预期结果**:
- ✅ 分配成功提示
- ✅ 订单状态变为"processing"
- ✅ 设备状态变为"busy"
- ✅ 库存扣减（如果配置了自动扣减）

**验证命令**:

```bash
# 检查订单状态（替换 ORDER_ID）
curl http://localhost:3001/api/orders/ORDER_ID | jq '.data.status'
# 预期：processing

# 检查设备状态（替换 DEVICE_ID）
curl http://localhost:3001/api/devices/DEVICE_ID | jq '.data.status'
# 预期：busy

# 检查库存
curl http://localhost:3001/api/materials | jq '.data.items[] | select(.name=="黑色 PLA 线材") | .stock.quantity'
```

---

### 测试 3：3D 模型上传与预览

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-003 |
| **优先级** | P1 |
| **模块** | 文件上传 |
| **前置条件** | 订单详情页已打开 |

**测试步骤**:

1. 在订单详情页点击"上传模型"
2. 选择 STL 文件（<50MB）
3. 等待上传完成
4. 查看模型预览

**预期结果**:
- ✅ 上传成功提示
- ✅ 模型预览正常显示
- ✅ 可 360 度旋转
- ✅ 可缩放

**验证命令**:

```bash
# 检查模型文件列表
curl http://localhost:3001/api/upload/models | jq '.data[] | select(.filename | contains("test"))'

# 访问模型文件
curl http://localhost:3001/uploads/models/test.stl -o /tmp/test.stl

# 验证文件完整性
file /tmp/test.stl
# 预期：ASCII text 或 binary data
```

---

### 测试 4：仪表盘统计

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-004 |
| **优先级** | P1 |
| **模块** | 仪表盘 |
| **前置条件** | 系统中已有订单数据 |

**测试步骤**:

1. 访问 `http://localhost:3000/dashboard`
2. 查看统计数据
3. 验证数据准确性

**预期结果**:
- ✅ 订单总数正确
- ✅ 待处理订单数正确
- ✅ 设备利用率显示正确
- ✅ 图表正常渲染

**验证命令**:

```bash
# 实时统计
curl http://localhost:3001/api/dashboard/stats | jq '.data'

# 预期输出
{
  "totalOrders": 10,
  "pendingOrders": 3,
  "printingOrders": 2,
  "completedOrders": 5,
  "deviceUtilization": 0.67
}

# 订单趋势（近 7 天）
curl http://localhost:3001/api/dashboard/orders/trend?days=7 | jq '.data'

# 设备利用率
curl http://localhost:3001/api/dashboard/devices/utilization | jq '.data'
```

---

### 测试 5：低库存预警

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-005 |
| **优先级** | P2 |
| **模块** | 库存管理 |
| **前置条件** | 材料库存已配置阈值 |

**测试步骤**:

1. 访问库存管理页面
2. 查看材料列表
3. 找到库存低于阈值的材料

**预期结果**:
- ✅ 低库存材料显示橙色/红色标签
- ✅ 显示补货建议
- ✅ 仪表盘低库存数量正确

**验证命令**:

```bash
# 检查低库存材料
curl http://localhost:3001/api/materials/low-stock | jq '.data'

# 预期输出
[
  {
    "_id": "material_xxx",
    "name": "黑色 PLA 线材",
    "stock": {
      "quantity": 500,
      "unit": "g",
      "threshold": 1000
    },
    "lowStock": true
  }
]
```

---

### 测试 6：用户认证

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-006 |
| **优先级** | P0 |
| **模块** | 认证授权 |
| **前置条件** | 已注册管理员账号 |

**测试步骤**:

1. 访问登录页面
2. 输入用户名和密码
3. 点击登录
4. 访问需要认证的 API

**预期结果**:
- ✅ 登录成功，跳转首页
- ✅ 本地存储 JWT token
- ✅ 未认证请求被拦截

**验证命令**:

```bash
# 登录获取 token
TOKEN=$(curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}' \
  | jq -r '.data.token')

# 使用 token 访问受保护 API
curl http://localhost:3001/api/orders \
  -H "Authorization: Bearer $TOKEN"
```

---

### 测试 7：设备状态监控

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-007 |
| **优先级** | P1 |
| **模块** | 设备管理 |
| **前置条件** | 已注册设备 |

**测试步骤**:

1. 访问设备列表页
2. 查看设备状态
3. 刷新页面验证状态更新

**预期结果**:
- ✅ 设备列表正常显示
- ✅ 状态实时更新
- ✅ 离线设备显示灰色

**验证命令**:

```bash
# 获取设备列表
curl http://localhost:3001/api/devices | jq '.data'

# 预期输出
{
  "items": [
    {
      "_id": "device_001",
      "name": "Printer-001",
      "type": "fdm",
      "status": "idle",
      "lastSeen": "2026-03-07T10:00:00.000Z"
    }
  ]
}
```

---

## 业务流程测试

### 测试 8：完整订单生命周期

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-101 |
| **优先级** | P0 |
| **模块** | 端到端 |
| **前置条件** | 系统已启动，设备可用 |

**测试步骤**:

#### 阶段 1：创建订单

1. 创建订单
   - 客户：张三
   - 模型：手机支架
   - 材料：黑色 PLA
   - 体积：100g

**预期**: 订单状态 `pending`

#### 阶段 2：分配设备

2. 选择空闲设备并分配

**预期**: 
- 订单状态 → `processing`
- 设备状态 → `busy`

#### 阶段 3：开始打印（模拟）

3. 点击"开始打印"

**预期**: 
- 库存自动扣减
- 订单状态 → `printing`
- 设备状态保持 `busy`

#### 阶段 4：完成订单

4. 点击"完成订单"

**预期**: 
- 订单状态 → `completed`
- 设备状态 → `idle`

#### 阶段 5：验证结果

5. 检查最终状态

**预期**: 
- ✅ 订单状态：completed
- ✅ 设备状态：idle
- ✅ 库存已扣减
- ✅ 仪表盘统计更新

**验证命令**:

```bash
# 检查订单完整流程
ORDER_ID="xxx"
DEVICE_ID="xxx"

# 最终订单状态
curl http://localhost:3001/api/orders/$ORDER_ID | jq '{
  status: .data.status,
  device: .data.device,
  material: .data.material,
  volume: .data.volume
}'

# 最终设备状态
curl http://localhost:3001/api/devices/$DEVICE_ID | jq '{
  status: .data.status,
  currentJob: .data.currentJob
}'

# 库存变化
curl http://localhost:3001/api/materials | jq '.data.items[] | select(.name=="黑色 PLA 线材") | {
  name: .name,
  quantity: .stock.quantity
}'
```

---

### 测试 9：多订单并发处理

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-102 |
| **优先级** | P1 |
| **模块** | 并发处理 |
| **前置条件** | 至少 2 台空闲设备 |

**测试步骤**:

1. 同时创建 3 个订单
2. 同时分配到 2 台设备
3. 验证订单和设备状态

**预期结果**:
- ✅ 无死锁
- ✅ 状态一致
- ✅ 无超卖（库存正确）

---

## 性能测试

### 测试 10：并发订单创建

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-201 |
| **优先级** | P2 |
| **模块** | 性能 |
| **测试工具** | Apache Bench (ab) |

**测试步骤**:

```bash
# 准备订单数据
cat > order.json <<EOF
{
  "customerName": "测试用户",
  "modelName": "测试模型",
  "material": "黑色 PLA 线材",
  "volume": 50
}
EOF

# 并发创建 100 个订单（10 个并发）
ab -n 100 -c 10 \
  -p order.json \
  -T application/json \
  http://localhost:3001/api/orders
```

**预期结果**:
- ✅ 成功率 > 95%
- ✅ 平均响应时间 < 2s
- ✅ 无数据库死锁

**性能指标参考**:

```
Concurrency Level:      10
Time taken for tests:   15.234 seconds
Complete requests:      100
Failed requests:        2
Requests per second:    6.56 [#/sec]
Time per request:       1523.400 [ms]
```

---

### 测试 11：大文件上传

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-202 |
| **优先级** | P2 |
| **模块** | 文件上传 |
| **测试工具** | curl |

**测试步骤**:

```bash
# 生成 40MB 测试文件（模拟大型 STL）
dd if=/dev/zero of=large_model.stl bs=1M count=40

# 上传大文件
curl -X POST http://localhost:3001/api/upload/model \
  -F "file=@large_model.stl" \
  -v
```

**预期结果**:
- ✅ 上传成功（201）
- ✅ 文件保存正确
- ✅ 预览正常加载
- ✅ 响应时间 < 30s

---

### 测试 12：API 响应时间

| 属性 | 值 |
|------|-----|
| **用例 ID** | TC-203 |
| **优先级** | P2 |
| **模块** | 性能 |
| **测试工具** | autocannon |

**测试步骤**:

```bash
# 安装 autocannon
npm install -g autocannon

# 测试订单列表 API
autocannon -c 10 -d 30 http://localhost:3001/api/orders

# 测试设备列表 API
autocannon -c 10 -d 30 http://localhost:3001/api/devices
```

**预期结果**:

| API | P50 | P95 | P99 |
|-----|-----|-----|-----|
| GET /api/orders | <200ms | <500ms | <1s |
| GET /api/devices | <200ms | <500ms | <1s |
| POST /api/orders | <500ms | <1s | <2s |

---

## 验收标准

### 功能验收

| 检查项 | 要求 | 状态 |
|--------|------|------|
| P0 测试用例 | 全部通过 | ☐ |
| P1 测试用例 | 全部通过 | ☐ |
| 关键业务流程 | 无阻塞 | ☐ |
| 数据一致性 | 无异常 | ☐ |

### 性能验收

| 指标 | 要求 | 实测 |
|------|------|------|
| API 响应时间（P95） | < 2s | - |
| 页面加载时间 | < 3s | - |
| 并发成功率 | > 95% | - |
| 大文件上传 | < 30s | - |

### 稳定性验收

| 检查项 | 要求 | 状态 |
|--------|------|------|
| 连续运行时间 | 24 小时无崩溃 | ☐ |
| 内存使用 | 稳定，无泄漏 | ☐ |
| 错误恢复 | 自动重启 | ☐ |

### 安全验收

| 检查项 | 要求 | 状态 |
|--------|------|------|
| 认证授权 | JWT 有效 | ☐ |
| 输入验证 | SQL 注入防护 | ☐ |
| 文件上传 | 类型/大小限制 | ☐ |
| API 限流 | 防暴力攻击 | ☐ |

---

## 测试报告模板

### 测试结果汇总

| 测试类型 | 总数 | 通过 | 失败 | 通过率 |
|---------|------|------|------|--------|
| P0 测试 | 5 | - | - | - |
| P1 测试 | 3 | - | - | - |
| P2 测试 | 2 | - | - | - |
| **总计** | 10 | - | - | - |

### 缺陷列表

| ID | 严重程度 | 描述 | 复现步骤 | 状态 |
|----|---------|------|----------|------|
| BUG-001 | 高 | - | - | 待修复 |
| BUG-002 | 中 | - | - | 待修复 |

### 环境信息

```
测试日期：2026-03-07
测试人员：-
Node.js 版本：v18.x
MongoDB 版本：7.x
测试环境：本地开发环境
```

### 测试结论

```
[ ] 通过，可以发布
[ ] 有条件通过，需修复以下问题：-
[ ] 不通过，存在阻塞性问题
```

---

## 自动化测试（待实现）

### 单元测试示例

```javascript
// tests/unit/order.test.js
const { describe, it, expect } = require('@jest/globals');
const OrderService = require('../../src/services/OrderService');

describe('OrderService', () => {
  it('should create order successfully', async () => {
    const orderData = {
      customerName: 'Test User',
      modelName: 'Test Model',
      material: 'PLA',
      volume: 50
    };
    
    const order = await OrderService.create(orderData);
    
    expect(order.status).toBe('pending');
    expect(order.customerName).toBe('Test User');
  });
  
  it('should throw error for invalid volume', async () => {
    const orderData = {
      customerName: 'Test User',
      modelName: 'Test Model',
      material: 'PLA',
      volume: -10 // 无效值
    };
    
    await expect(OrderService.create(orderData))
      .rejects.toThrow('体积必须大于 0');
  });
});
```

### 集成测试示例

```javascript
// tests/integration/order.api.test.js
const request = require('supertest');
const app = require('../../src/app');

describe('Orders API', () => {
  let authToken;
  
  beforeAll(async () => {
    // 登录获取 token
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password123' });
    authToken = res.body.data.token;
  });
  
  it('POST /api/orders - should create order', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        customerName: 'Test User',
        modelName: 'Test Model',
        material: 'PLA',
        volume: 50
      });
    
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });
});
```

### 运行测试

```bash
# 单元测试
npm run test:unit

# 集成测试
npm run test:integration

# 覆盖率
npm run test:coverage
```

---

**文档版本**: v1.0  
**最后更新**: 2026-03-07  
**维护者**: AI Agent Team
