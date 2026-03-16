process.env.QINIU_AI_API_KEY = 'sk-ade295a43028dab39ad35d7fd61956ef5fc7ebf10b7e1c357bd55ce92f79c5e0';
process.env.QINIU_AI_BASE_URL = 'https://api.qnaigc.com/v1';
process.env.QINIU_AI_MODEL = 'z-ai/glm-5';
process.env.LLM_TIMEOUT = '10000';

const { QiniuLLMClient } = require('./src/config/qiniuLLM');

async function test() {
  console.log('Creating client...');
  const client = new QiniuLLMClient();
  
  console.log('Testing invoke...');
  const start = Date.now();
  
  try {
    const result = await client.invoke('请回复 OK');
    const elapsed = Date.now() - start;
    console.log(`✅ SUCCESS (${elapsed}ms):`, result.content);
    process.exit(0);
  } catch (error) {
    const elapsed = Date.now() - start;
    console.error(`❌ FAIL (${elapsed}ms):`, error.message);
    process.exit(1);
  }
}

test();
