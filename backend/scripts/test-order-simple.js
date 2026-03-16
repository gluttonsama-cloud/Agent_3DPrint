/**
 * 订单 API 简化测试（无需 MongoDB/Redis）
 * 使用内存模拟测试核心逻辑
 */

const { OrderService } = require('../src/services/OrderService');
const { OrderStates, getStateLabel } = require('../src/constants/orderStates');
const { createOrderStateMachine } = require('../src/states/OrderStateMachine');

// 测试颜色
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n🧪 ${name}`, 'cyan');
  log('─'.repeat(50), 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

// 测试状态
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    logSuccess(message);
    return true;
  } else {
    failed++;
    logError(message);
    return false;
  }
}

// 测试 1: 状态机创建
logTest('测试 1: 状态机创建');
try {
  const stateMachine = createOrderStateMachine('test_order_001', OrderStates.PENDING_REVIEW);
  assert(stateMachine.getCurrentState() === OrderStates.PENDING_REVIEW, '初始状态应该是待审核');
  assert(stateMachine.getCurrentStateLabel() === '待审核', '状态标签应该是"待审核"');
  log(`当前状态：${stateMachine.getCurrentStateLabel()}`);
} catch (error) {
  logError(`状态机创建失败：${error.message}`);
}

// 测试 2: 状态转换验证
logTest('测试 2: 状态转换验证');
try {
  const stateMachine = createOrderStateMachine('test_order_002', OrderStates.PENDING_REVIEW);
  
  // 验证可以转换到 reviewing
  assert(stateMachine.canTransition(OrderStates.REVIEWING), '应该可以转换到审核中');
  
  // 验证不能转换到 printing
  assert(!stateMachine.canTransition(OrderStates.PRINTING), '不能直接转换到打印中');
  
  // 获取可用操作
  const actions = stateMachine.getAvailableActions();
  log(`可用操作：${actions.map(a => a.label).join(', ')}`);
  assert(actions.length > 0, '应该有可用的操作');
} catch (error) {
  logError(`状态转换验证失败：${error.message}`);
}

// 测试 3: 执行状态转换
logTest('测试 3: 执行状态转换');
(async () => {
  try {
    const stateMachine = createOrderStateMachine('test_order_003', OrderStates.PENDING_REVIEW);
    
    log('执行转换：待审核 -> 审核中');
    const result = await stateMachine.transition(OrderStates.REVIEWING, {
      reason: '开始审核',
      operator: 'test_user'
    });
    
    assert(result.success === true, '状态转换应该成功');
    assert(result.toState === OrderStates.REVIEWING, '目标状态应该是审核中');
    log(`转换结果：${result.fromStateLabel} -> ${result.toStateLabel}`);
    
    // 查看状态历史
    const history = stateMachine.getHistory();
    log(`状态历史数量：${history.length}`);
    assert(history.length >= 2, '应该有至少 2 条历史记录');
    
  } catch (error) {
    logError(`状态转换失败：${error.message}`);
  } finally {
    // 输出测试结果
    log('\n' + '═'.repeat(50), 'cyan');
    log('📊 测试结果', 'cyan');
    log('─'.repeat(50), 'cyan');
    logSuccess(`通过：${passed}`);
    logError(`失败：${failed}`);
    
    if (failed === 0) {
      log('\n🎉 所有测试通过！', 'green');
    } else {
      log('\n⚠️  部分测试失败', 'yellow');
    }
    
    log('\n💡 提示：完整 API 测试需要 MongoDB 和 Redis');
    log('使用以下命令启动服务：');
    log('  docker run -d -p 6379:6379 redis:latest');
    log('  docker run -d -p 27017:27017 mongo:latest');
  }
})();
