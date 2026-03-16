/**
 * 启动脚本 - 初始化 Agent 并启动服务器
 */

require('dotenv').config();

const { CoordinatorAgent } = require('./src/agents/CoordinatorAgent');
const { SchedulerAgent } = require('./src/agents/SchedulerAgent');
const { InventoryAgent } = require('./src/agents/InventoryAgent');
const { agentRegistry } = require('./src/agents/registry');

// 启动主应用
const app = require('./src/app');

// 初始化所有 Agent
async function initializeAgents() {
  try {
    console.log('\n🔄 正在初始化 Agent...\n');
    
    // 创建 Agent 实例
    const coordinator = new CoordinatorAgent();
    const scheduler = new SchedulerAgent();
    const inventory = new InventoryAgent();
    
    // 注册
    agentRegistry.register(coordinator, { type: 'coordinator' });
    agentRegistry.register(scheduler, { type: 'scheduler' });
    agentRegistry.register(inventory, { type: 'inventory' });
    
    console.log('✅ Agent 已注册');
    
    // 初始化
    await coordinator.initialize();
    await scheduler.initialize();
    await inventory.initialize();
    
    const agents = agentRegistry.list();
    console.log('\n✅ Agent 初始化完成:');
    agents.forEach(agent => {
      console.log(`   - ${agent.name} (${agent.id}): ${agent.state}`);
    });
    console.log('\n');
    
  } catch (error) {
    console.error('❌ Agent 初始化失败:', error.message);
    console.error(error.stack);
  }
}

// 等待服务器启动后初始化 Agent
setTimeout(() => {
  initializeAgents();
}, 2000);

// 保持进程运行
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭...');
  process.exit(0);
});
