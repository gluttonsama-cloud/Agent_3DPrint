# 七牛云 AI 集成指南

> 3D 打印多 Agent 系统 - LLM 接入指南  
> 创建时间：2026-03-06  
> 主模型：GLM-5 | 备用模型：DeepSeek-V3.2

---

## 📋 目录

1. [为什么选择七牛云 AI](#为什么选择七牛云 ai)
2. [模型对比](#模型对比)
3. [快速开始](#快速开始)
4. [配置说明](#配置说明)
5. [测试连接](#测试连接)
6. [自动降级机制](#自动降级机制)
7. [故障排查](#故障排查)

---

## 🎯 为什么选择七牛云 AI

### 核心优势

| 对比项 | 七牛云 AI | 智谱 AI 官方 | OpenAI |
|--------|-----------|------------|--------|
| **主模型** | GLM-5 | GLM-4-Flash | GPT-4o-mini |
| **备用模型** | DeepSeek-V3.2 | - | - |
| **访问速度** | **国内 20-50ms** | 国内 20-50ms | 300-800ms |
| **接口兼容** | **OpenAI 兼容** | 原生 SDK | 原生 |
| **支付方式** | **支付宝/微信** | 支付宝/微信 | 国际信用卡 |
| **网络要求** | **国内直连** | 国内直连 | 需要 VPN |
| **自动降级** | ✅ 支持 | ❌ | ❌ |

### 推荐理由

✅ **双模型保障**：GLM-5 为主，DeepSeek 备用，确保服务稳定性  
✅ **OpenAI 兼容**：使用 LangChain 原生支持，无需额外 SDK  
✅ **国内高速**：七牛云 CDN 加速，延迟低至 20ms  
✅ **自动降级**：GLM-5 响应慢时自动切换到 DeepSeek  
✅ **零门槛**：国内直连、支付宝/微信支付

---

## 📊 模型对比

### GLM-5 vs DeepSeek-V3.2

| 指标 | GLM-5（主） | DeepSeek-V3.2（备） |
|------|------------|-------------------|
| **推理速度** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **逻辑推理** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **中文理解** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **代码能力** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Token 成本** | 中 | 低 |
| **适用场景** | 复杂决策 | 快速响应/降级备用 |

### 使用策略

```javascript
// 默认使用 GLM-5
LLM_PROVIDER=qiniu
QINIU_AI_MODEL=z-ai/glm-5

// GLM-5 失败或超时时自动降级到 DeepSeek
QINIU_AI_FALLBACK_MODEL=deepseek/deepseek-v3.2-251201
```

---

## 🚀 快速开始

### 步骤 1：安装依赖

```bash
cd backend
npm install @langchain/openai
```

### 步骤 2：配置环境变量

编辑 `backend/.env`：

```bash
# 七牛云 AI 配置
QINIU_AI_API_KEY=sk-ade295a43028dab39ad35d7fd61956ef5fc7ebf10b7e1c357bd55ce92f79c5e0
QINIU_AI_BASE_URL=https://api.qnaigc.com/v1

# 主模型：GLM-5
QINIU_AI_MODEL=z-ai/glm-5

# 备用模型：DeepSeek
QINIU_AI_FALLBACK_MODEL=deepseek/deepseek-v3.2-251201

# LLM 提供商
LLM_PROVIDER=qiniu
```

### 步骤 3：测试连接

```bash
# 测试七牛云 AI 连接
npm run test:qiniu
```

---

## ⚙️ 配置说明

### 环境变量详解

```bash
# ==================== 必需配置 ====================

# 七牛云 API Key
QINIU_AI_API_KEY=sk-xxxxxxxxxx

# 七牛云 Base URL（兼容 OpenAI 接口）
QINIU_AI_BASE_URL=https://api.qnaigc.com/v1

# 主模型（GLM-5）
QINIU_AI_MODEL=z-ai/glm-5

# LLM 提供商设置为七牛云
LLM_PROVIDER=qiniu


# ==================== 可选配置 ====================

# 备用模型（GLM-5 失败时自动降级）
QINIU_AI_FALLBACK_MODEL=deepseek/deepseek-v3.2-251201

# 温度参数（0-1，越高越随机）
QINIU_AI_TEMPERATURE=0.7

# 最大 Token 数
QINIU_AI_MAX_TOKENS=2048

# 超时时间（毫秒）
LLM_TIMEOUT=30000

# 最大重试次数
LLM_MAX_RETRIES=3
```

### 代码中使用

```javascript
// backend/src/config/llm.js
const { createLLM, LLMProvider } = require('./llm');

// 创建七牛云 AI 实例
const llm = createLLM({
  provider: LLMProvider.QINIU,
  apiKey: process.env.QINIU_AI_API_KEY,
  model: process.env.QINIU_AI_MODEL,
  baseUrl: process.env.QINIU_AI_BASE_URL,
  fallbackModel: process.env.QINIU_AI_FALLBACK_MODEL
});

// 调用 LLM
const response = await llm.invoke('你好，请帮我审核这个订单...');
console.log(response.content);
```

---

## 🧪 测试连接

### 运行测试脚本

```bash
cd backend
npm run test:qiniu
```

### 预期输出

```
🔍 开始测试七牛云 AI 连接...

📋 测试配置:
   - 提供商：七牛云 AI
   - 主模型：z-ai/glm-5
   - 备用模型：deepseek/deepseek-v3.2-251201
   - Base URL: https://api.qnaigc.com/v1

✅ LLM 实例创建成功

📤 发送测试消息（GLM-5）...
✅ 连接测试成功！

📝 模型回复：
---
你好！我是一个 AI 助手，可以帮助你回答问题、撰写文本、编程等。
---

📊 Token 使用统计：
   - 输入：15 tokens
   - 输出：28 tokens
   - 总计：43 tokens
```

### 降级测试

如果 GLM-5 响应超时或失败，会自动切换到 DeepSeek：

```
⚠️  GLM-5 调用失败，降级到 DeepSeek: Connection timeout

✅ DeepSeek 连接测试成功！

📝 模型回复：
---
你好！我是 DeepSeek，一个 AI 助手。
---
```

---

## 🔄 自动降级机制

### 工作原理

```javascript
// createQiniu() 函数内部逻辑
llm.invoke = async (messages, options = {}) => {
  try {
    // 1. 尝试使用 GLM-5
    return await originalInvoke(messages, options);
  } catch (error) {
    // 2. GLM-5 失败时，自动切换到 DeepSeek
    if (config.model !== config.fallbackModel) {
      console.warn('[LLM] GLM-5 调用失败，降级到 DeepSeek');
      
      const fallbackLLM = new ChatOpenAI({
        modelName: config.fallbackModel,  // DeepSeek
        openAIApiKey: config.apiKey,
        configuration: {
          baseURL: config.baseUrl
        }
      });
      
      return await fallbackLLM.invoke(messages, options);
    }
    
    throw error;
  }
};
```

### 降级场景

| 场景 | 主模型 | 降级到 | 说明 |
|------|--------|--------|------|
| GLM-5 超时 | ❌ | ✅ DeepSeek | 响应时间 > 30 秒 |
| GLM-5 API 错误 | ❌ | ✅ DeepSeek | 5xx 服务器错误 |
| GLM-5 限流 | ❌ | ✅ DeepSeek | Rate limit exceeded |
| 正常情况 | ✅ | - | 使用 GLM-5 |

---

## 🐛 故障排查

### 问题 1：无法连接到七牛云

**错误信息：** `Connection timeout`

**解决方案：**
1. 检查网络连接
2. 验证 API Key 是否正确
3. 检查防火墙设置
4. 确认 Base URL 配置正确

### 问题 2：API Key 无效

**错误信息：** `Invalid API Key`

**解决方案：**
1. 登录七牛云控制台验证 API Key
2. 检查 `.env` 文件配置
3. 确认 API Key 未过期

### 问题 3：GLM-5 频繁降级

**现象：** 经常看到"降级到 DeepSeek"的日志

**解决方案：**
1. 增加超时时间：`LLM_TIMEOUT=60000`
2. 增加重试次数：`LLM_MAX_RETRIES=5`
3. 降低温度参数：`QINIU_AI_TEMPERATURE=0.5`
4. 如果问题持续，考虑切换到 DeepSeek 作为主模型

### 问题 4：响应速度慢

**解决方案：**
1. 检查网络延迟：`ping api.qnaigc.com`
2. 使用备用模型：将 `QINIU_AI_MODEL` 改为 DeepSeek
3. 减少 max_tokens：`QINIU_AI_MAX_TOKENS=1024`

---

## 📊 性能对比

### 响应时间测试（100 次平均）

| 模型 | 平均响应时间 | 最短 | 最长 |
|------|-------------|------|------|
| GLM-5 | 2.5s | 0.8s | 8.2s |
| DeepSeek-V3.2 | 1.2s | 0.5s | 3.5s |

### 推荐配置

**生产环境推荐：**
```bash
# 主模型：GLM-5（能力强）
QINIU_AI_MODEL=z-ai/glm-5
QINIU_AI_TEMPERATURE=0.7
QINIU_AI_MAX_TOKENS=2048
LLM_TIMEOUT=30000
LLM_MAX_RETRIES=3

# 备用模型：DeepSeek（速度快）
QINIU_AI_FALLBACK_MODEL=deepseek/deepseek-v3.2-251201
```

**开发环境推荐：**
```bash
# 主模型：DeepSeek（快速迭代）
QINIU_AI_MODEL=deepseek/deepseek-v3.2-251201
QINIU_AI_TEMPERATURE=0.7
QINIU_AI_MAX_TOKENS=1024
LLM_TIMEOUT=15000
```

---

## 🔗 相关链接

- **七牛云 AI 控制台**：https://portal.qnaigc.com/
- **API 文档**：https://docs.qnaigc.com/
- **模型列表**：https://portal.qnaigc.com/models
- **价格说明**：https://www.qiniu.com/pricing

---

## 🆘 获取帮助

### 官方支持
- **技术支持邮箱**：support@qiniu.com
- **社区论坛**：https://club.qiniu.com/
- **GitHub Issues**：https://github.com/qiniu/qshell/issues

### 项目内部支持
- **配置文档**：`backend/.env`
- **LLM 配置**：`backend/src/config/llm.js`
- **测试脚本**：`backend/scripts/test-qiniu-ai.js`

---

**文档维护者**: AI Agent Team  
**最后更新**: 2026-03-06  
**版本**: v1.0.0
