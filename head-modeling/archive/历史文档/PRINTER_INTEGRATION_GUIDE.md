# 3D 打印机对接指南

> 本文档描述如何将 3D 打印机集成到多 Agent 管理系统

---

## 目录

1. [支持的打印机类型](#支持的打印机类型)
2. [OctoPrint 对接方案](#octoprint-对接方案)
3. [API 接口定义](#api-接口定义)
4. [配置步骤](#配置步骤)
5. [代码示例](#代码示例)
6. [故障排查](#故障排查)
7. [高级功能](#高级功能)
8. [后续扩展](#后续扩展)

---

## 支持的打印机类型

### 1. OctoPrint 兼容打印机（推荐）

**支持型号**:
- 所有运行 OctoPrint 的 FDM 打印机
- 所有运行 OctoPrint 的 SLA 打印机
- 支持 USB/WiFi 连接的 DIY 打印机

**前置要求**:
- OctoPrint 1.8.0+
- 网络可达（同一局域网）
- API 密钥配置

### 2. 品牌打印机（需定制）

**支持型号**（需额外驱动）:
- 创想三维（Creality）- Ender 系列
- Anycubic - Photon 系列
- Prusa - i3 系列

**注意事项**:
- 需要特定品牌通信协议
- 可能需要专用软件
- 建议优先使用 OctoPrint 方案

---

## OctoPrint 对接方案

### 架构概述

```
┌─────────────────┐      HTTP API      ┌─────────────────┐
│   多 Agent 系统   │ ◄──────────────► │    OctoPrint    │
│                 │                    │                 │
│  - 订单管理     │                    │  - 打印机控制   │
│  - 任务分配     │                    │  - G-code 发送    │
│  - 状态监控     │                    │  - 进度读取     │
└─────────────────┘                    └─────────────────┘
```

### 通信协议

| 项目 | 配置 |
|------|------|
| 协议 | HTTP REST API |
| 端口 | 5000（默认） |
| 认证 | API Key（X-Api-Key header） |
| 数据格式 | JSON |

### API 端点映射

| 系统操作 | OctoPrint API | 说明 |
|---------|--------------|------|
| 开始打印 | `POST /api/files/local/:path` | 发送 G-code 文件 |
| 停止打印 | `POST /api/job` (command: cancel) | 取消当前任务 |
| 暂停打印 | `POST /api/job` (command: pause) | 暂停打印 |
| 继续打印 | `POST /api/job` (command: start) | 继续打印 |
| 获取状态 | `GET /api/job` | 打印进度、状态 |
| 获取温度 | `GET /api/printer` | 喷头/热床温度 |
| 获取相机 | `GET /webcam/?action=snapshot` | 实时照片 |

---

## API 接口定义

### 系统内部 API（待实现）

#### 注册打印机

```http
POST /api/printers
Content-Type: application/json

{
  "name": "Printer-001",
  "type": "fdm",
  "connection": {
    "type": "octoprint",
    "url": "http://192.168.1.100:5000",
    "apiKey": "your-api-key-here"
  },
  "capabilities": {
    "buildVolume": {
      "x": 220,
      "y": 220,
      "z": 250
    },
    "materials": ["PLA", "ABS", "PETG"],
    "nozzleDiameter": 0.4
  }
}
```

#### 获取打印机列表

```http
GET /api/printers
```

**响应**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "printer_001",
        "name": "Printer-001",
        "type": "fdm",
        "status": "idle",
        "connection": {
          "type": "octoprint",
          "url": "http://192.168.1.100:5000"
        },
        "currentJob": null,
        "lastSeen": "2026-03-07T10:30:00Z"
      }
    ],
    "total": 1
  }
}
```

#### 分配任务到打印机

```http
POST /api/printers/:id/job
Content-Type: application/json

{
  "orderId": "order_123",
  "gcodeFile": "path/to/file.gcode",
  "parameters": {
    "nozzleTemp": 200,
    "bedTemp": 60,
    "printSpeed": 50
  }
}
```

---

## 配置步骤

### 步骤 1：安装 OctoPrint

**树莓派安装**:

```bash
# 下载 OctoPi 镜像
wget https://github.com/guysoft/OctoPi/releases/download/1.0.0/octopi-1.0.0.img.gz

# 写入 SD 卡
gunzip octopi-1.0.0.img.gz
sudo dd if=octopi-1.0.0.img of=/dev/sdX bs=4M

# 配置 WiFi
# 编辑 boot/octopi-network.txt
```

**Docker 安装**:

```bash
docker run -d \
  --name octoprint \
  --privileged \
  -p 5000:5000 \
  -v ~/octoprint_data:/octoprint \
  octoprint/octoprint
```

### 步骤 2：配置 API 密钥

1. 访问 `http://<printer-ip>:5000`
2. 设置管理员账号
3. 进入 Settings → API
4. 生成 API Key
5. 记录 API Key 备用

### 步骤 3：连接打印机

1. USB 连接打印机
2. Settings → Serial Connection
3. 选择正确的端口和波特率
4. 点击 Connect 测试

### 步骤 4：在系统中注册打印机

```javascript
// 调用系统 API 注册打印机
POST /api/printers
{
  "name": "Printer-001",
  "type": "fdm",
  "connection": {
    "type": "octoprint",
    "url": "http://192.168.1.100:5000",
    "apiKey": "your-api-key-here"
  }
}
```

---

## 代码示例

### OctoPrint 客户端封装

```javascript
const axios = require('axios');

class OctoPrintClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: { 
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  // 上传 G-code 文件
  async uploadGcode(filePath, fileStream) {
    const formData = new FormData();
    formData.append('file', fileStream);
    
    const response = await this.client.post('/api/files/local', formData, {
      headers: {
        ...this.client.defaults.headers,
        'Content-Type': 'multipart/form-data'
      }
    });
    
    return response.data;
  }

  // 开始打印
  async startPrint(filename) {
    // 选择文件
    await this.client.post(`/api/files/local/${filename}`, {
      command: 'select'
    });
    
    // 开始打印
    await this.client.post('/api/job', {
      command: 'start'
    });
    
    return { success: true, filename };
  }

  // 获取打印状态
  async getJobStatus() {
    const response = await this.client.get('/api/job');
    return response.data;
  }

  // 获取打印机状态
  async getPrinterStatus() {
    const response = await this.client.get('/api/printer');
    return response.data;
  }

  // 取消打印
  async cancelPrint() {
    const response = await this.client.post('/api/job', {
      command: 'cancel'
    });
    return response.data;
  }

  // 暂停/继续打印
  async togglePause() {
    const status = await this.getJobStatus();
    const command = status.state === 'Paused' ? 'start' : 'pause';
    
    const response = await this.client.post('/api/job', {
      command
    });
    return response.data;
  }

  // 获取实时温度
  async getTemperature() {
    const response = await this.client.get('/api/printer');
    const { tool0, bed } = response.data.current;
    
    return {
      nozzle: {
        actual: tool0.actual,
        target: tool0.target
      },
      bed: {
        actual: bed.actual,
        target: bed.target
      }
    };
  }

  // 获取相机快照
  async getWebcamSnapshot() {
    const response = await this.client.get('/webcam/?action=snapshot', {
      responseType: 'arraybuffer'
    });
    return response.data;
  }
}

module.exports = OctoPrintClient;
```

### 在 OrderService 中使用

```javascript
const OctoPrintClient = require('./OctoPrintClient');

class OrderService {
  async assignOrderToDevice(orderId, deviceId) {
    const order = await Order.findById(orderId);
    const device = await Device.findById(deviceId);
    
    if (!order || !device) {
      throw new Error('订单或设备不存在');
    }
    
    if (device.status !== 'idle') {
      throw new Error('设备当前不可用');
    }
    
    if (device.connection.type === 'octoprint') {
      const client = new OctoPrintClient(
        device.connection.url, 
        device.connection.apiKey
      );
      
      try {
        // 上传 G-code
        const gcodeStream = await this.getGcodeStream(order.gcodeFile);
        await client.uploadGcode(order.gcodeFile, gcodeStream);
        
        // 开始打印
        await client.startPrint(order.gcodeFile);
        
        // 更新订单和设备状态
        order.status = 'printing';
        order.device = deviceId;
        order.startedAt = new Date();
        await order.save();
        
        device.status = 'busy';
        device.currentJob = orderId;
        await device.save();
        
        return { order, device };
      } catch (error) {
        // 打印失败，回滚状态
        device.status = 'error';
        await device.save();
        throw error;
      }
    }
    
    throw new Error('不支持的连接类型');
  }
  
  async completeOrder(orderId) {
    const order = await Order.findById(orderId);
    const device = await Device.findById(order.device);
    
    order.status = 'completed';
    order.completedAt = new Date();
    await order.save();
    
    device.status = 'idle';
    device.currentJob = null;
    await device.save();
    
    // 扣减库存
    await this.deductMaterialStock(order.material, order.volume);
    
    return { order, device };
  }
}

module.exports = OrderService;
```

### 打印机池管理

```javascript
class PrinterPool {
  constructor() {
    this.printers = new Map();
  }

  addPrinter(id, config) {
    const client = new OctoPrintClient(config.url, config.apiKey);
    this.printers.set(id, { client, config, lastSeen: null });
  }

  removePrinter(id) {
    this.printers.delete(id);
  }

  async getPrinterStatus(id) {
    const printer = this.printers.get(id);
    if (!printer) return null;
    
    try {
      const status = await printer.client.getJobStatus();
      printer.lastSeen = new Date();
      return status;
    } catch (error) {
      console.error(`获取打印机 ${id} 状态失败:`, error);
      return null;
    }
  }

  async getAvailablePrinter() {
    // 查找空闲打印机
    for (const [id, printer] of this.printers) {
      try {
        const status = await printer.client.getJobStatus();
        if (status.state === 'Operational') {
          return { id, client: printer.client };
        }
      } catch (error) {
        continue;
      }
    }
    return null;
  }

  async broadcastStatus() {
    const statuses = {};
    for (const [id, printer] of this.printers) {
      try {
        statuses[id] = await printer.client.getJobStatus();
        printer.lastSeen = new Date();
      } catch (error) {
        statuses[id] = { error: error.message };
      }
    }
    return statuses;
  }
}

module.exports = PrinterPool;
```

---

## 故障排查

### 问题 1：无法连接打印机

**症状**: API 调用返回 404 或连接超时

**解决步骤**:

1. 检查打印机 IP 是否正确
2. 确认 OctoPrint 服务运行中
3. 验证 API Key 是否正确
4. 检查防火墙设置

```bash
# 测试连接
curl -H "X-Api-Key: YOUR_KEY" http://<printer-ip>:5000/api/version

# 检查 OctoPrint 服务状态（Docker）
docker ps | grep octoprint

# 查看 OctoPrint 日志
docker logs octoprint
```

### 问题 2：打印失败

**症状**: 打印开始后立即停止

**解决步骤**:

1. 检查 SD 卡空间
2. 确认 G-code 文件完整
3. 查看 OctoPrint 日志
4. 验证打印机温度设置

```bash
# 查看 OctoPrint 日志
tail -f ~/octoprint_data/logs/octoprint.log

# 检查 G-code 文件
ls -lh /path/to/gcode
```

### 问题 3：进度读取失败

**症状**: 系统显示进度为 0%

**解决步骤**:

1. 确认已选择文件
2. 检查打印状态
3. 验证 OctoPrint 插件兼容性

```javascript
// 调试代码
const status = await client.getJobStatus();
console.log('Job Status:', status);
// 检查 status.state 和 status.progress
```

### 问题 4：文件上传失败

**症状**: 上传返回 413 或超时

**解决步骤**:

1. 检查文件大小限制
2. 增加超时时间
3. 验证磁盘空间

```javascript
// 增加 axios 超时
const client = axios.create({
  baseURL: baseUrl,
  timeout: 300000, // 5 分钟
  maxContentLength: 100 * 1024 * 1024 // 100MB
});
```

---

## 高级功能

### 实时视频监控

```javascript
// 获取实时相机画面
async function getWebcamSnapshot(baseUrl, apiKey) {
  const response = await axios.get(`${baseUrl}/webcam/?action=snapshot`, {
    headers: { 'X-Api-Key': apiKey },
    responseType: 'arraybuffer'
  });
  return response.data;
}

// 在系统中显示
// <img src="/api/printers/:id/webcam" alt="Live View" />
```

### 温度监控与告警

```javascript
// 定期检查温度
class TemperatureMonitor {
  constructor(client, thresholds) {
    this.client = client;
    this.thresholds = thresholds;
    this.interval = null;
  }

  start(intervalMs = 5000) {
    this.interval = setInterval(async () => {
      const status = await this.client.getPrinterStatus();
      const toolTemp = status.current.tool0.actual;
      const bedTemp = status.current.bed.actual;
      
      console.log(`喷头：${toolTemp}°C, 热床：${bedTemp}°C`);
      
      // 检查温度异常
      if (toolTemp > this.thresholds.nozzleMax) {
        console.warn('警告：喷头温度过高！');
      }
      if (bedTemp > this.thresholds.bedMax) {
        console.warn('警告：热床温度过高！');
      }
    }, intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
}

// 使用示例
const monitor = new TemperatureMonitor(client, {
  nozzleMax: 250,
  bedMax: 100
});
monitor.start();
```

### 打印进度推送（WebSocket）

```javascript
const WebSocket = require('ws');

class OctoPrintWebSocket {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.ws = null;
    this.callbacks = new Map();
  }

  connect() {
    const wsUrl = this.baseUrl.replace('http', 'ws') + '/socket.io/';
    this.ws = new WebSocket(wsUrl);
    
    this.ws.on('open', () => {
      console.log('WebSocket 连接成功');
      // 发送认证
      this.ws.send(JSON.stringify({
        type: 'auth',
        apiKey: this.apiKey
      }));
    });
    
    this.ws.on('message', (data) => {
      const message = JSON.parse(data);
      this.handleMessage(message);
    });
  }

  handleMessage(message) {
    if (message.type === 'progress') {
      this.callbacks.get('progress')?.(message.data);
    }
    if (message.type === 'status') {
      this.callbacks.get('status')?.(message.data);
    }
  }

  on(event, callback) {
    this.callbacks.set(event, callback);
  }

  disconnect() {
    this.ws?.close();
  }
}
```

---

## 后续扩展

### 支持的云打印服务

| 服务 | 功能 | 官网 |
|------|------|------|
| Printoid | 移动端管理 | https://printoid.net |
| Obico | AI 失败检测 | https://obico.io |
| SimplyPrint | 多打印机管理 | https://simplyprint.io |

### 本地部署方案

| 方案 | 特点 | 适用场景 |
|------|------|----------|
| Klipper | 高性能固件 | 高速打印 |
| Mainsail | Web 界面 | Klipper 配套 |
| Fluidd | 轻量界面 | 低配置设备 |

### 未来计划

1. **多打印机负载均衡** - 自动分配订单到最优打印机
2. **打印质量 AI 检测** - 集成 Obico 等 AI 服务
3. **耗材自动补给** - 低库存自动订购
4. **远程固件升级** - OTA 更新打印机固件

---

## 附录

### OctoPrint API 完整参考

详细 API 文档请参考：https://docs.octoprint.org/en/master/api/

### 常用 G-code 命令

```gcode
; 设置喷头温度
M104 S200

; 设置热床温度
M140 S60

; 等待喷头温度
M109 S200

; 等待热床温度
M190 S60

; 归零
G28

; 移动到指定位置
G1 X100 Y100 F3000

; 挤出
G1 E10 F100
```

---

**文档版本**: v1.0  
**最后更新**: 2026-03-07  
**维护者**: AI Agent Team
