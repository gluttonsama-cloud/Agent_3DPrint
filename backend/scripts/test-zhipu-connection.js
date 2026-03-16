/**
 * 智谱 AI 连接测试脚本
 * 
 * 用于测试智谱 AI LLM 的连接和调用
 */

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
