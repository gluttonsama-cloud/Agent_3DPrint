/**
 * 七牛云 AI 连接测试脚本
 * 
 * 测试 GLM-5 和 DeepSeek 模型的连接
 */

require('dotenv').config();
const { createLLM, LLMProvider } = require('../src/config/llm');

async function testQiniuAI() {
  console.log('🔍 开始测试七牛云 AI 连接...\n');
  console.log('📋 测试配置:');
  console.log(`   - 提供商：七牛云 AI`);
  console.log(`   - 主模型：${process.env.QINIU_AI_MODEL || 'z-ai/glm-5'}`);
  console.log(`   - 备用模型：${process.env.QINIU_AI_FALLBACK_MODEL || 'deepseek/deepseek-v3.2-251201'}`);
  console.log(`   - Base URL: ${process.env.QINIU_AI_BASE_URL || 'https://api.qnaigc.com/v1'}`);
  console.log('');
  
  // 创建 LLM 实例
  const llm = createLLM({
    provider: LLMProvider.QINIU,
    apiKey: process.env.QINIU_AI_API_KEY,
    model: process.env.QINIU_AI_MODEL || 'z-ai/glm-5',
    baseUrl: process.env.QINIU_AI_BASE_URL || 'https://api.qnaigc.com/v1',
    fallbackModel: process.env.QINIU_AI_FALLBACK_MODEL
  });
  
  console.log('✅ LLM 实例创建成功\n');
  
  // 测试调用
  try {
    console.log('📤 发送测试消息（GLM-5）...');
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
    
    // 如果是 GLM-5 失败，尝试 DeepSeek
    if (error.message.includes('GLM-5') || error.message.includes('glm-5')) {
      console.log('\n⚠️  尝试使用备用模型（DeepSeek）...\n');
      
      try {
        const llmDeepSeek = createLLM({
          provider: LLMProvider.QINIU,
          apiKey: process.env.QINIU_AI_API_KEY,
          model: process.env.QINIU_AI_FALLBACK_MODEL,
          baseUrl: process.env.QINIU_AI_BASE_URL
        });
        
        const response = await llmDeepSeek.invoke('你好，请用一句话介绍你自己');
        
        console.log('✅ DeepSeek 连接测试成功！\n');
        console.log('📝 模型回复：');
        console.log('---');
        console.log(response.content);
        console.log('---\n');
      } catch (deepSeekError) {
        console.error('❌ DeepSeek 也失败了');
        console.error('错误详情:', deepSeekError.message);
      }
    }
    
    process.exit(1);
  }
}

testQiniuAI();
