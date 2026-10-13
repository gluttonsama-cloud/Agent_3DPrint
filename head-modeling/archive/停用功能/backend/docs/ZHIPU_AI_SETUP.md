# 智谱 AI 集成快速指南

> 3D 打印多 Agent 系统 - LLM 接入指南  
> 创建时间：2026-03-06  
> 推荐度：⭐⭐⭐⭐⭐（比赛项目首选）

---

## 📋 目录

1. [为什么选择智谱 AI](#为什么选择智谱 ai)
2. [注册与获取 API Key](#注册与获取 api-key)
3. [安装与配置](#安装与配置)
4. [测试连接](#测试连接)
5. [使用示例](#使用示例)
6. [故障排查](#故障排查)

---

## 🎯 为什么选择智谱 AI

### 核心优势

| 对比项 | 智谱 AI | OpenAI | Claude |
|--------|---------|--------|--------|
| **免费额度** | **2000 万 tokens** | 无 | ~$5 |
| **月成本**（中用量） | **¥0** | ¥163 | ¥326 |
| **访问速度**（国内） | **20-50ms** | 300-800ms | 300-800ms |
| **支付方式** | **支付宝/微信** | 国际信用卡 | 国际信用卡 |
| **网络要求** | **国内直连** | 需要 VPN | 需要 VPN |
| **模型能力** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

### 推荐理由

✅ **零成本**：2000 万免费 tokens，足够支撑整个比赛周期（90 天）  
✅ **无门槛**：国内直连、支付宝/微信支付、中文文档  
✅ **能力足够**：GLM-4-Flash 逻辑推理和中文理解满足 Agent 决策需求  
✅ **接入简单**：官方提供 Node.js SDK，5 分钟可完成接入

---

## 🚀 注册与获取 API Key

### 步骤 1：访问智谱 AI 开放平台

打开浏览器访问：https://open.bigmodel.cn/

### 步骤 2：注册账号

1. 点击右上角"注册"按钮
2. 使用手机号或邮箱注册
3. 完成实名认证（需要上传身份证）

### 步骤 3：创建 API Key

1. 登录后进入控制台：https://open.bigmodel.cn/usercenter/proj-mgr/apikeys
2. 点击"创建 API Key"
3. 填写名称（如：3D-Printing-Agent）
4. 复制并保存 API Key（只显示一次！）

### 步骤 4：领取免费额度

1. 进入"费用中心" → "优惠券"
2. 领取新用户优惠券（2000 万 tokens）
3. 有效期 90 天

---

## 📦 安装与配置

### 步骤 1：安装智谱 AI SDK

```bash
cd D:\AAAwork\Agent_3DPrint\backend
npm install zhipuai
```

### 步骤 2：更新环境变量

编辑 `backend/.env` 文件：

```bash
# 设置 LLM 提供商为智谱 AI
LLM_PROVIDER=zhipu

# 填写你的智谱 AI API Key
ZHIPU_API_KEY=your_api_key_here  # 替换为实际 API Key

# 设置模型名称
ZHIPU_MODEL=glm-4-flash  # 推荐使用 GLM-4-Flash（免费）
```

### 步骤 3：验证配置

```bash
# 验证 .env 文件
cat backend/.env | grep ZHIPU
```

输出应包含：
```bash
ZHIPU_API_KEY=xxxxxxxxxx
ZHIPU_MODEL=glm-4-flash
LLM_PROVIDER=zhipu
```

---

## 🧪 测试连接

### 方法 1：使用测试脚本

创建 `backend/scripts/test-zhipu-connection.js`：

```javascript
require('dotenv').config();
const { createLLM, LLMProvider } = require('../src/config/llm');

async function testZhipuConnection() {
  console.log('🔍 开始测试智谱 AI 连接...\n');
  
  // 创建 LLM 实例
  const llm = createLLM({
    provider: LLMProvider.ZHIPU,
    apiKey: process.env.ZHIPU_API_KEY,
    model: process.env.ZHIPU_MODEL || 'glm-4-flash'
  });
  
  console.log('✅ LLM 实例创建成功\n');
  
  // 测试调用
  try {
    console.log('📤 发送测试消息...');
    const response = await llm.invoke('你好，请用一句话介绍你自己');
    
    console.log('✅ 连接测试成功！\n');
    console.log('📝 模型回复：');
    console.log('---');
    console.log(response.content);
    console.log('---\n');
    
    if (response.usage) {
      console.log('📊 Token 使用统计：');
      console.log(`   - 输入：${response.usage.prompt_tokens} tokens`);
      console.log(`   - 输出：${response.usage.completion_tokens} tokens`);
      console.log(`   - 总计：${response.usage.total_tokens} tokens`);
    }
    
  } catch (error) {
    console.error('❌ 连接测试失败！');
    console.error('错误详情:', error.message);
    process.exit(1);
  }
}

testZhipuConnection();
```

运行测试：

```bash
cd backend
node scripts/test-zhipu-connection.js
```

**预期输出：**
```
🔍 开始测试智谱 AI 连接...

✅ LLM 实例创建成功

📤 发送测试消息...
✅ 连接测试成功！

📝 模型回复：
---
我是一个 AI 助手，可以帮助你回答问题、撰写文本、编程等。
---

📊 Token 使用统计：
   - 输入：15 tokens
   - 输出：28 tokens
   - 总计：43 tokens
```

### 方法 2：测试 Agent 决策

```bash
# 启动后端服务
npm run dev

# 在另一个终端测试决策 API
curl -X POST http://localhost:3001/api/agent-decisions/decide \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "coordinator",
    "action": "review_order",
    "data": {
      "orderId": "TEST_ORDER_001",
      "context": {
        "priority": "normal"
      }
    }
  }'
```

---

## 📚 使用示例

### 示例 1：直接使用智谱 AI SDK

```javascript
const { ZhipuAI } = require('zhipuai');

const client = new ZhipuAI({
  apiKey: 'your_api_key'
});

async function main() {
  const response = await client.chat.completions.create({
    model: 'glm-4-flash',
    messages: [
      { role: 'system', content: '你是一个专业的 3D 打印订单审核助手' },
      { role: 'user', content: '请审核这个订单：数量 10 个，材料 PLA，尺寸 100x100mm' }
    ]
  });
  
  console.log(response.choices[0].message.content);
}

main();
```

### 示例 2：在 Agent 中使用

```javascript
// backend/src/agents/CoordinatorAgent.js
const { createLLM, LLMProvider } = require('../config/llm');

class CoordinatorAgent extends BaseAgent {
  async initialize() {
    // 创建智谱 AI LLM 实例
    this.llm = createLLM({
      provider: LLMProvider.ZHIPU,
      apiKey: process.env.ZHIPU_API_KEY,
      model: process.env.ZHIPU_MODEL || 'glm-4-flash'
    });
    
    await super.initialize();
  }
  
  async makeDecision(orderId, context) {
    // 调用 LLM 进行决策
    const response = await this.invokeLLM(`
      你是一个 3D 打印订单审核 Agent。
      
      订单信息：
      - 订单 ID: ${orderId}
      - 数量：${context.quantity}
      - 材料：${context.material}
      - 尺寸：${context.size}
      
      请判断这个订单是否应该：
      1. 自动通过
      2. 转人工审核
      
      返回 JSON 格式：
      {
        "result": "auto_approve" | "manual_review",
        "confidence": 0.0-1.0,
        "reason": "决策理由"
      }
    `);
    
    return JSON.parse(response.content);
  }
}
```

---

## 🐛 故障排查

### 问题 1：无法连接到智谱 AI

**错误信息：** `Connection timeout`

**解决方案：**
1. 检查网络连接
2. 验证 API Key 是否正确
3. 检查防火墙设置
4. 尝试使用代理

### 问题 2：余额不足

**错误信息：** `Insufficient balance`

**解决方案：**
1. 登录智谱 AI 控制台
2. 检查余额和优惠券
3. 领取新用户优惠券
4. 确认使用的是 GLM-4-Flash（免费模型）

### 问题 3：模型返回异常

**错误信息：** `Invalid response format`

**解决方案：**
1. 检查 prompt 格式
2. 确保返回 JSON 格式的 prompt 清晰明确
3. 添加输出格式示例
4. 降低 temperature 参数（建议 0.3-0.7）

### 问题 4：Token 使用过快

**解决方案：**
1. 优化 prompt，减少不必要的 token 消耗
2. 使用流式输出
3. 设置 max_tokens 限制
4. 监控用量：https://open.bigmodel.cn/usercenter/proj-mgr/usage

---

## 📊 成本估算

### 免费额度（2000 万 tokens）使用时长

| 场景 | 单次消耗 | 日均次数 | 月消耗 | 可用月数 |
|------|----------|----------|--------|----------|
| **比赛演示** | 2,000 tokens | 50 次 | 300 万 | **6-7 个月** |
| **日常开发** | 2,000 tokens | 200 次 | 1,200 万 | **1.5 个月** |
| **高强度测试** | 3,000 tokens | 500 次 | 4,500 万 | **13 天** |

> 💡 **提示**：GLM-4-Flash 完全免费，比赛期间可放心使用！

### 付费方案（如果超出免费额度）

| 模型 | 价格（每 100 万 tokens） | 月成本（中用量） |
|------|------------------------|------------------|
| GLM-4-Flash | **¥0** | **¥0** |
| GLM-4.5 | ¥0.8 / ¥2.0 | ¥72 |
| GLM-4-Long | ¥1.0 / ¥1.0 | ¥45 |

---

## 🔗 相关链接

- **智谱 AI 开放平台**：https://open.bigmodel.cn/
- **API 文档**：https://open.bigmodel.cn/dev/api
- **SDK 下载**：https://github.com/zhipuai/zhipuai-node
- **费用说明**：https://open.bigmodel.cn/pricing
- **控制台**：https://open.bigmodel.cn/usercenter

---

## 🆘 获取帮助

### 官方支持
- **技术支持邮箱**：support@zhipuai.cn
- **社区论坛**：https://open.bigmodel.cn/community
- **GitHub Issues**：https://github.com/zhipuai/zhipuai-node/issues

### 项目内部支持
- **文档**：`backend/docs/API_IMPLEMENTATION_GUIDE.md`
- **测试脚本**：`backend/scripts/test-zhipu-connection.js`
- **配置示例**：`backend/.env.example`

---

**文档维护者**: AI Agent Team  
**最后更新**: 2026-03-06  
**版本**: v1.0.0
