/**
 * 决策日志系统测试脚本
 * 
 * 测试决策日志服务、分析工具和 API 的完整功能
 * 使用方法：node scripts/test-decision-logs.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { decisionLogService } = require('../src/services/DecisionLogService');
const { DecisionAnalyzer } = require('../src/utils/DecisionAnalyzer');
const AgentDecision = require('../src/models/AgentDecision');

// 测试配置
const CONFIG = {
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/agent-3dprint-test',
  testOrderId: 'test_order_' + Date.now(),
  testAgents: ['coordinator_agent', 'scheduler_agent', 'inventory_agent']
};

// 分析器实例
const analyzer = new DecisionAnalyzer({
  lowConfidenceThreshold: 0.5,
  highConfidenceThreshold: 0.8,
  longDecisionTimeMs: 5000,
  enableLogging: true
});

/**
 * 测试决策记录功能
 */
async function testRecordDecision() {
  console.log('\n=== 测试 1: 记录决策 ===\n');
  
  const testDecisions = [
    {
      orderId: CONFIG.testOrderId,
      agentId: 'coordinator_agent',
      agentName: '协调 Agent',
      decisionType: 'scheduling',
      decisionResult: 'approved',
      confidence: 0.95,
      inputSnapshot: {
        photoQuality: 0.92,
        materialStock: 500,
        deviceAvailability: 3
      },
      rationale: '所有条件满足：照片质量优秀（0.92），库存充足（500g），3 台设备可用',
      alternatives: [
        { option: 'manual_review', score: 0.3, reason: '照片质量接近阈值' }
      ],
      impact: {
        estimatedTime: 120,
        estimatedCost: 150,
        qualityScore: 0.9
      },
      rulesMatched: ['rule_photo_quality_high', 'rule_stock_sufficient']
    },
    {
      orderId: CONFIG.testOrderId,
      agentId: 'scheduler_agent',
      agentName: '调度 Agent',
      decisionType: 'device_selection',
      decisionResult: 'device_001',
      confidence: 0.88,
      inputSnapshot: {
        orderId: CONFIG.testOrderId,
        deviceType: 'sla',
        strategy: 'optimal',
        availableDevicesCount: 3
      },
      rationale: '设备评分最高，device_001 为最优选择',
      alternatives: [
        { option: 'device_002', score: 0.75, reason: '评分次高' },
        { option: 'device_003', score: 0.65, reason: '评分第三' }
      ],
      impact: {
        estimatedTime: 90,
        estimatedCost: 120,
        qualityScore: 0.88
      },
      rulesMatched: ['rule_device_optimal']
    },
    {
      orderId: CONFIG.testOrderId,
      agentId: 'inventory_agent',
      agentName: '库存 Agent',
      decisionType: 'quality_check',
      decisionResult: 'sufficient',
      confidence: 1.0,
      inputSnapshot: {
        materialId: 'material_001',
        materialName: '光敏树脂 - 白色',
        materialType: 'resin',
        currentStock: 500,
        requiredAmount: 150,
        threshold: 100
      },
      rationale: '库存充足，当前库存：500g，需求：150g',
      alternatives: [],
      impact: {
        estimatedTime: null,
        estimatedCost: null,
        qualityScore: 1.0
      },
      rulesMatched: ['rule_stock_sufficient']
    },
    {
      orderId: CONFIG.testOrderId,
      agentId: 'coordinator_agent',
      agentName: '协调 Agent',
      decisionType: 'scheduling',
      decisionResult: 'manual_review',
      confidence: 0.45,
      inputSnapshot: {
        photoQuality: 0.52,
        materialStock: 80,
        deviceAvailability: 1
      },
      rationale: '照片质量接近阈值，库存偏低，需要人工审核',
      alternatives: [
        { option: 'auto_approve', score: 0.4, reason: '勉强满足条件' }
      ],
      impact: {
        estimatedTime: 240,
        estimatedCost: 200,
        qualityScore: 0.45
      },
      rulesMatched: ['rule_photo_quality_medium']
    }
  ];
  
  const results = [];
  
  for (const decisionData of testDecisions) {
    try {
      const result = await decisionLogService.record(decisionData);
      results.push(result);
      console.log(`✓ 决策记录成功: ${result._id} (${decisionData.agentId})`);
    } catch (error) {
      console.error(`✗ 决策记录失败: ${error.message}`);
    }
  }
  
  console.log(`\n共记录 ${results.length} 条决策`);
  return results;
}

/**
 * 测试决策查询功能
 */
async function testQueryDecisions() {
  console.log('\n=== 测试 2: 查询决策 ===\n');
  
  // 测试按订单 ID 查询
  console.log('测试按订单 ID 查询...');
  const byOrderId = await decisionLogService.findByOrderId(CONFIG.testOrderId);
  console.log(`✓ 按订单查询：${byOrderId.length} 条结果`);
  
  // 测试按 Agent ID 查询
  console.log('\n测试按 Agent ID 查询...');
  for (const agentId of CONFIG.testAgents) {
    const byAgent = await decisionLogService.findByAgentId(agentId);
    console.log(`✓ Agent ${agentId}: ${byAgent.length} 条结果`);
  }
  
  // 测试按决策类型查询
  console.log('\n测试按决策类型查询...');
  const byType = await decisionLogService.findByDecisionType('scheduling');
  console.log(`✓ 决策类型 scheduling: ${byType.length} 条结果`);
  
  // 测试低置信度查询
  console.log('\n测试低置信度查询...');
  const lowConfidence = await decisionLogService.findLowConfidence(0.5);
  console.log(`✓ 低置信度决策：${lowConfidence.length} 条结果`);
  
  return { byOrderId, byAgent: CONFIG.testAgents.length, byType, lowConfidence };
}

/**
 * 测试统计功能
 */
async function testStats() {
  console.log('\n=== 测试 3: 统计功能 ===\n');
  
  const stats = await decisionLogService.getStats();
  
  console.log('统计结果:');
  console.log(`  总决策数：${stats.total}`);
  console.log(`  平均置信度：${stats.avgConfidence}`);
  console.log(`  低置信度决策数：${stats.lowConfidenceCount}`);
  console.log(`  低置信度比率：${(stats.lowConfidenceRate * 100).toFixed(2)}%`);
  
  console.log('\n按决策类型统计:');
  stats.byType.forEach(item => {
    console.log(`  ${item.type}: ${item.count} 条，平均置信度 ${item.avgConfidence}`);
  });
  
  console.log('\n置信度分布:');
  stats.confidenceDistribution.forEach(item => {
    console.log(`  ${item.level}: ${item.count} 条`);
  });
  
  return stats;
}

/**
 * 测试分析功能
 */
async function testAnalysis() {
  console.log('\n=== 测试 4: 分析功能 ===\n');
  
  // 置信度分布分析
  console.log('测试置信度分布分析...');
  const confidenceAnalysis = await analyzer.analyzeConfidenceDistribution();
  console.log(`✓ 置信度分布分析完成`);
  console.log(`  高置信度：${confidenceAnalysis.distribution.find(d => d.level === 'high')?.count || 0} 条`);
  console.log(`  中置信度：${confidenceAnalysis.distribution.find(d => d.level === 'medium')?.count || 0} 条`);
  console.log(`  低置信度：${confidenceAnalysis.distribution.find(d => d.level === 'low')?.count || 0} 条`);
  
  // 决策类型统计
  console.log('\n测试决策类型统计...');
  const typeAnalysis = await analyzer.analyzeDecisionTypes();
  console.log(`✓ 决策类型统计完成`);
  typeAnalysis.byType.forEach(item => {
    console.log(`  ${item.type}: ${item.count} 条 (${item.percentage}%)`);
  });
  
  // 规则命中率分析
  console.log('\n测试规则命中率分析...');
  const ruleAnalysis = await analyzer.analyzeRuleMatchRate();
  console.log(`✓ 规则命中率分析完成`);
  console.log(`  规则命中率：${ruleAnalysis.ruleMatchRate}%`);
  console.log(`  唯一规则数：${ruleAnalysis.uniqueRulesCount}`);
  
  // 异常检测
  console.log('\n测试异常检测...');
  const anomalies = await analyzer.detectAnomalies();
  console.log(`✓ 异常检测完成`);
  console.log(`  低置信度决策：${anomalies.anomalies.lowConfidence.length} 条`);
  console.log(`  低置信度比率：${anomalies.summary.lowConfidenceRate}%`);
  
  // Agent 性能分析
  console.log('\n测试 Agent 性能分析...');
  const agentAnalysis = await analyzer.analyzeAgentPerformance();
  console.log(`✓ Agent 性能分析完成`);
  agentAnalysis.agents.forEach(agent => {
    console.log(`  ${agent.agentId}: ${agent.totalDecisions} 条决策，平均置信度 ${agent.avgConfidence}`);
  });
  
  return { confidenceAnalysis, typeAnalysis, ruleAnalysis, anomalies, agentAnalysis };
}

/**
 * 测试综合报告
 */
async function testReport() {
  console.log('\n=== 测试 5: 综合报告 ===\n');
  
  const report = await analyzer.generateReport();
  
  console.log('综合报告摘要:');
  console.log(`  生成时间：${report.generatedAt}`);
  console.log(`  总决策数：${report.summary.totalDecisions}`);
  console.log(`  平均置信度：${report.summary.avgConfidence}`);
  console.log(`  低置信度比率：${report.summary.lowConfidenceRate}%`);
  console.log(`  长时间决策比率：${report.summary.longDecisionRate}%`);
  
  return report;
}

/**
 * 测试导出功能
 */
async function testExport() {
  console.log('\n=== 测试 6: 导出功能 ===\n');
  
  // 测试 JSON 导出
  console.log('测试 JSON 导出...');
  const jsonData = await decisionLogService.exportAsJSON();
  console.log(`✓ JSON 导出完成：${jsonData.length} 条记录`);
  
  // 测试 CSV 导出
  console.log('\n测试 CSV 导出...');
  const csvData = await decisionLogService.exportAsCSV();
  const csvLines = csvData.split('\n');
  console.log(`✓ CSV 导出完成：${csvLines.length} 行（包含表头）`);
  console.log(`  CSV 表头：${csvLines[0]}`);
  
  return { jsonData, csvData };
}

/**
 * 测试内存历史
 */
async function testMemoryHistory() {
  console.log('\n=== 测试 7: 内存历史 ===\n');
  
  const history = decisionLogService.getHistory(10);
  console.log(`✓ 内存历史：${history.length} 条记录`);
  
  if (history.length > 0) {
    console.log('最近决策:');
    history.slice(-3).forEach(item => {
      console.log(`  - ${item.agentId}: ${item.decisionType} (${item.confidence})`);
    });
  }
  
  return history;
}

/**
 * 清理测试数据
 */
async function cleanupTestData() {
  console.log('\n=== 清理测试数据 ===\n');
  
  try {
    const result = await AgentDecision.deleteMany({
      orderId: { $regex: '^test_order_' }
    });
    console.log(`✓ 已删除 ${result.deletedCount} 条测试数据`);
  } catch (error) {
    console.error('✗ 清理测试数据失败:', error.message);
  }
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log('===========================================');
  console.log('     决策日志系统测试');
  console.log('===========================================');
  console.log('MongoDB URI:', CONFIG.mongoUri);
  console.log('测试订单 ID:', CONFIG.testOrderId);
  
  try {
    // 连接数据库
    console.log('\n正在连接 MongoDB...');
    await mongoose.connect(CONFIG.mongoUri);
    console.log('✓ MongoDB 连接成功');
    
    // 运行测试
    await testRecordDecision();
    await testQueryDecisions();
    await testStats();
    await testAnalysis();
    await testReport();
    await testExport();
    await testMemoryHistory();
    
    // 清理测试数据（可选）
    const keepData = process.env.KEEP_TEST_DATA === 'true';
    if (!keepData) {
      await cleanupTestData();
    } else {
      console.log('\n⚠ 保留测试数据（KEEP_TEST_DATA=true）');
    }
    
    console.log('\n===========================================');
    console.log('     所有测试完成 ✓');
    console.log('===========================================\n');
    
  } catch (error) {
    console.error('\n===========================================');
    console.error('     测试失败 ✗');
    console.error('===========================================');
    console.error('错误:', error.message);
    console.error('堆栈:', error.stack);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await mongoose.connection.close();
    console.log('MongoDB 连接已关闭\n');
    process.exit(0);
  }
}

// 运行测试
runTests();
