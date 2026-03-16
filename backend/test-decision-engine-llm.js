process.env.QINIU_AI_API_KEY = 'sk-ade295a43028dab39ad35d7fd61956ef5fc7ebf10b7e1c357bd55ce92f79c5e0';
process.env.QINIU_AI_BASE_URL = 'https://api.qnaigc.com/v1';
process.env.QINIU_AI_MODEL = 'z-ai/glm-5';
process.env.LLM_TIMEOUT = '15000';

const { DecisionEngine, Decision } = require('./src/agents/DecisionEngine');

async function test() {
  console.log('=== 测试 DecisionEngine LLM 集成 ===\n');
  
  const engine = new DecisionEngine({
    enableLogging: true,
    enableLLM: true
  });
  
  console.log('\n--- 测试 1: 标准订单 ---');
  const order1 = {
    _id: 'test_order_001',
    customerName: '张三',
    modelName: '手机支架',
    material: '白色 PLA',
    volume: 50,
    status: 'pending_review',
    items: [{ name: '手机支架', quantity: 1 }]
  };
  
  const decision1 = await engine.makeDecision(order1, {
    stock: { white_pla: 1000 },
    devices: [{ id: 'printer_1', status: 'idle' }]
  });
  
  console.log('决策结果:', decision1.toJSON());
  
  console.log('\n--- 测试 2: 边界订单 ---');
  const order2 = {
    _id: 'test_order_002',
    customerName: '李四',
    modelName: '复杂雕塑',
    material: '透明树脂',
    volume: 200,
    status: 'pending_review',
    metadata: {
      photoQuality: 'poor',
      specialRequirements: '需要高精度打印'
    }
  };
  
  const decision2 = await engine.makeDecision(order2, {
    stock: { resin_clear: 500 },
    devices: [{ id: 'sla_1', status: 'busy' }]
  });
  
  console.log('决策结果:', decision2.toJSON());
  
  console.log('\n=== 测试完成 ===');
  process.exit(0);
}

test().catch(err => {
  console.error('测试失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
