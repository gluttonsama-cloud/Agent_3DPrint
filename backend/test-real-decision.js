/**
 * 测试脚本：触发 Agent 真实决策并打印结果
 */

process.env.QINIU_AI_API_KEY = 'sk-ade295a43028dab39ad35d7fd61956ef5fc7ebf10b7e1c357bd55ce92f79c5e0';
process.env.QINIU_AI_BASE_URL = 'https://api.qnaigc.com/v1';
process.env.QINIU_AI_MODEL = 'deepseek/deepseek-v3.2-251201';
process.env.LLM_TIMEOUT = '15000';
process.env.MOCK_DB = 'true';

const { DecisionEngine } = require('./src/agents/DecisionEngine');

async function testRealDecision() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║  测试真实 LLM 决策流程                            ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  const engine = new DecisionEngine({ enableLogging: true, enableLLM: true });
  
  const order = {
    _id: `ORD-${Date.now()}`,
    customerName: '测试客户',
    modelName: '手机支架',
    material: '白色 PLA',
    volume: 50,
    status: 'pending_review',
    deviceType: 'fdm',
    metadata: {
      photoQuality: 'good',
      completeParams: true,
      hasModelFile: true,
      validDimensions: true
    }
  };
  
  const context = {
    stock: { white_pla: 1000 },
    devices: [
      { id: 'printer_1', status: 'idle' },
      { id: 'printer_2', status: 'idle' }
    ]
  };
  
  console.log('\n📦 订单信息:');
  console.log(`   订单 ID: ${order._id}`);
  console.log(`   客户：${order.customerName}`);
  console.log(`   材料：${order.material}`);
  console.log(`   体积：${order.volume}cm³\n`);
  
  const startTime = Date.now();
  const decision = await engine.makeDecision(order, context);
  const elapsed = Date.now() - startTime;
  
  console.log('\n✅ 决策完成！');
  console.log(`   耗时：${elapsed}ms`);
  console.log(`   结果：${decision.result}`);
  console.log(`   置信度：${(decision.confidence * 100).toFixed(1)}%`);
  console.log(`   来源：${decision.metadata?.source || 'rules'}`);
  console.log(`\n💡 决策解释:`);
  console.log(`   ${decision.rationale}\n`);
  
  if (decision.metadata?.llmEvaluation) {
    console.log(`🤖 LLM 评估:`);
    console.log(`   同意算法：${decision.metadata.llmEvaluation.agree ? '✓ 是' : '✗ 否'}`);
    console.log(`   LLM 置信度：${(decision.metadata.llmEvaluation.confidence * 100).toFixed(1)}%`);
  }
  
  return {
    orderId: order._id,
    decision: decision.toJSON(),
    elapsed
  };
}

testRealDecision()
  .then(result => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  测试通过！结果已生成                            ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('\n完整结果:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ 测试失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
