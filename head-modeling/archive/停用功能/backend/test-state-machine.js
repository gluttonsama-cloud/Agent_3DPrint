/**
 * 订单状态机测试脚本
 * 
 * 测试状态机的基本功能、转换规则、钩子和事件
 */

const { createOrderStateMachine } = require('./src/states/OrderStateMachine');
const { OrderStates, getStateLabel, isTerminalState } = require('./src/constants/orderStates');
const { canTransition, getAvailableActions } = require('./src/states/transitions');
const { agentEventEmitter } = require('./src/utils/AgentEventEmitter');

// 测试计数器
let passedTests = 0;
let failedTests = 0;

/**
 * 断言辅助函数
 */
function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ ${message}`);
    failedTests++;
  }
}

/**
 * 异步断言辅助函数
 */
async function assertAsync(asyncFn, message) {
  try {
    await asyncFn();
    console.log(`  ✓ ${message}`);
    passedTests++;
  } catch (error) {
    console.error(`  ✗ ${message}`);
    console.error(`    错误：${error.message}`);
    failedTests++;
  }
}

/**
 * 测试 1：状态常量
 */
async function testStateConstants() {
  console.log('\n=== 测试 1: 状态常量 ===');
  
  assert(OrderStates.PENDING_REVIEW === 'pending_review', 'PENDING_REVIEW 值正确');
  assert(OrderStates.REVIEWING === 'reviewing', 'REVIEWING 值正确');
  assert(OrderStates.SCHEDULED === 'scheduled', 'SCHEDULED 值正确');
  assert(OrderStates.PRINTING === 'printing', 'PRINTING 值正确');
  assert(OrderStates.POST_PROCESSING === 'post_processing', 'POST_PROCESSING 值正确');
  assert(OrderStates.COMPLETED === 'completed', 'COMPLETED 值正确');
  assert(OrderStates.SHIPPED === 'shipped', 'SHIPPED 值正确');
  assert(OrderStates.CANCELLED === 'cancelled', 'CANCELLED 值正确');
  assert(OrderStates.REFUNDED === 'refunded', 'REFUNDED 值正确');
  
  // 测试中文标签
  assert(getStateLabel(OrderStates.PENDING_REVIEW) === '待审核', '待审核标签正确');
  assert(getStateLabel(OrderStates.PRINTING) === '打印中', '打印中标签正确');
  assert(getStateLabel(OrderStates.COMPLETED) === '已完成', '已完成标签正确');
  
  // 测试终端状态
  assert(isTerminalState(OrderStates.COMPLETED) === true, '已完成是终端状态');
  assert(isTerminalState(OrderStates.SHIPPED) === true, '已发货是终端状态');
  assert(isTerminalState(OrderStates.CANCELLED) === true, '已取消是终端状态');
  assert(isTerminalState(OrderStates.REFUNDED) === true, '已退款是终端状态');
  assert(isTerminalState(OrderStates.PENDING_REVIEW) === false, '待审核不是终端状态');
}

/**
 * 测试 2：状态转换规则
 */
async function testTransitionRules() {
  console.log('\n=== 测试 2: 状态转换规则 ===');
  
  // 测试允许的转换
  assert(canTransition(OrderStates.PENDING_REVIEW, OrderStates.REVIEWING) === true, '待审核 -> 审核中 允许');
  assert(canTransition(OrderStates.PENDING_REVIEW, OrderStates.CANCELLED) === true, '待审核 -> 已取消 允许');
  assert(canTransition(OrderStates.REVIEWING, OrderStates.SCHEDULED) === true, '审核中 -> 已排程 允许');
  assert(canTransition(OrderStates.REVIEWING, OrderStates.CANCELLED) === true, '审核中 -> 已取消 允许');
  assert(canTransition(OrderStates.SCHEDULED, OrderStates.PRINTING) === true, '已排程 -> 打印中 允许');
  assert(canTransition(OrderStates.PRINTING, OrderStates.POST_PROCESSING) === true, '打印中 -> 后处理 允许');
  assert(canTransition(OrderStates.POST_PROCESSING, OrderStates.COMPLETED) === true, '后处理 -> 已完成 允许');
  assert(canTransition(OrderStates.COMPLETED, OrderStates.SHIPPED) === true, '已完成 -> 已发货 允许');
  assert(canTransition(OrderStates.CANCELLED, OrderStates.REFUNDED) === true, '已取消 -> 已退款 允许');
  assert(canTransition(OrderStates.SHIPPED, OrderStates.REFUNDED) === true, '已发货 -> 已退款 允许');
  
  // 测试不允许的转换
  assert(canTransition(OrderStates.PENDING_REVIEW, OrderStates.SCHEDULED) === false, '待审核 -> 已排程 不允许');
  assert(canTransition(OrderStates.PENDING_REVIEW, OrderStates.PRINTING) === false, '待审核 -> 打印中 不允许');
  assert(canTransition(OrderStates.REVIEWING, OrderStates.PRINTING) === false, '审核中 -> 打印中 不允许');
  assert(canTransition(OrderStates.SCHEDULED, OrderStates.POST_PROCESSING) === false, '已排程 -> 后处理 不允许');
  assert(canTransition(OrderStates.PRINTING, OrderStates.COMPLETED) === false, '打印中 -> 已完成 不允许');
  assert(canTransition(OrderStates.COMPLETED, OrderStates.REFUNDED) === false, '已完成 -> 已退款 不允许');
  assert(canTransition(OrderStates.REFUNDED, OrderStates.PENDING_REVIEW) === false, '已退款 -> 待审核 不允许');
}

/**
 * 测试 3：状态机基本功能
 */
async function testStateMachineBasics() {
  console.log('\n=== 测试 3: 状态机基本功能 ===');
  
  const sm = createOrderStateMachine('TEST-ORDER-001');
  
  // 测试初始状态
  assert(sm.getCurrentState() === OrderStates.PENDING_REVIEW, '初始状态为待审核');
  assert(sm.getCurrentStateLabel() === '待审核', '初始状态标签正确');
  
  // 测试可用操作
  const actions = sm.getAvailableActions();
  assert(actions.length === 2, '待审核状态有 2 个可用操作');
  assert(actions.some(a => a.toState === OrderStates.REVIEWING), '包含审核中操作');
  assert(actions.some(a => a.toState === OrderStates.CANCELLED), '包含已取消操作');
  
  // 测试 canTransition
  assert(sm.canTransition(OrderStates.REVIEWING) === true, '可以转换到审核中');
  assert(sm.canTransition(OrderStates.SCHEDULED) === false, '不能转换到已排程');
  
  // 测试不是终端状态
  assert(sm.isTerminalState() === false, '待审核不是终端状态');
  assert(sm.canContinue() === true, '可以继续转换');
}

/**
 * 测试 4：状态转换流程
 */
async function testTransitionFlow() {
  console.log('\n=== 测试 4: 状态转换流程 ===');
  
  const sm = createOrderStateMachine('TEST-ORDER-002');
  
  // 完整转换流程
  await assertAsync(
    () => sm.transition(OrderStates.REVIEWING, { operator: 'admin-001' }),
    '转换到审核中'
  );
  assert(sm.getCurrentState() === OrderStates.REVIEWING, '当前状态为审核中');
  
  await assertAsync(
    () => sm.transition(OrderStates.SCHEDULED, { operator: 'admin-001', scheduledTime: '2025-01-02' }),
    '转换到已排程'
  );
  assert(sm.getCurrentState() === OrderStates.SCHEDULED, '当前状态为已排程');
  
  await assertAsync(
    () => sm.transition(OrderStates.PRINTING, { printerId: 'PRINTER-01' }),
    '转换到打印中'
  );
  assert(sm.getCurrentState() === OrderStates.PRINTING, '当前状态为打印中');
  
  await assertAsync(
    () => sm.transition(OrderStates.POST_PROCESSING, { operator: 'worker-001' }),
    '转换到后处理'
  );
  assert(sm.getCurrentState() === OrderStates.POST_PROCESSING, '当前状态为后处理');
  
  await assertAsync(
    () => sm.transition(OrderStates.COMPLETED, { operator: 'worker-001' }),
    '转换到已完成'
  );
  assert(sm.getCurrentState() === OrderStates.COMPLETED, '当前状态为已完成');
  
  await assertAsync(
    () => sm.transition(OrderStates.SHIPPED, { trackingNumber: 'SF123456' }),
    '转换到已发货'
  );
  assert(sm.getCurrentState() === OrderStates.SHIPPED, '当前状态为已发货');
  
  // 检查状态历史
  const history = sm.getHistory();
  assert(history.length === 7, '状态历史包含 7 条记录（初始 +6 次转换）');
  assert(history[0].state === OrderStates.PENDING_REVIEW, '历史第一条是待审核');
  assert(history[history.length - 1].state === OrderStates.SHIPPED, '历史最后一条是已发货');
}

/**
 * 测试 5：错误处理
 */
async function testErrorHandling() {
  console.log('\n=== 测试 5: 错误处理 ===');
  
  const sm = createOrderStateMachine('TEST-ORDER-003');
  
  // 测试无效状态
  try {
    await sm.transition('invalid_state');
    assert(false, '应该抛出无效状态错误');
  } catch (error) {
    assert(error.code === 'INVALID_STATE', '错误代码为 INVALID_STATE');
  }
  
  // 测试不允许的转换
  try {
    await sm.transition(OrderStates.SCHEDULED); // 跳过审核中
    assert(false, '应该抛出不允许转换错误');
  } catch (error) {
    assert(error.code === 'INVALID_TRANSITION', '错误代码为 INVALID_TRANSITION');
  }
  
  // 测试终端状态转换
  const sm2 = createOrderStateMachine('TEST-ORDER-004');
  await sm2.transition(OrderStates.REVIEWING, { operator: 'test' });
  await sm2.transition(OrderStates.SCHEDULED, { operator: 'test' });
  await sm2.transition(OrderStates.PRINTING, { printerId: 'P1' });
  await sm2.transition(OrderStates.POST_PROCESSING, { operator: 'test' });
  await sm2.transition(OrderStates.COMPLETED, { operator: 'test' });
  await sm2.transition(OrderStates.SHIPPED, { trackingNumber: 'SF123' });
  
  try {
    await sm2.transition(OrderStates.REFUNDED, { refundAmount: 100 });
    assert(true, '已发货可以转换到已退款');
  } catch (error) {
    assert(false, '已发货应该可以转换到已退款');
  }
}

/**
 * 测试 6：状态历史
 */
async function testStateHistory() {
  console.log('\n=== 测试 6: 状态历史 ===');
  
  const sm = createOrderStateMachine('TEST-ORDER-005');
  await sm.transition(OrderStates.REVIEWING, { operator: 'admin-001' });
  await sm.transition(OrderStates.SCHEDULED, { operator: 'admin-001' });
  
  // 获取全部历史
  const allHistory = sm.getHistory();
  assert(allHistory.length === 3, '完整历史包含 3 条记录');
  
  // 获取限制历史
  const limitedHistory = sm.getHistory(2);
  assert(limitedHistory.length === 2, '限制历史包含 2 条记录');
  
  // 测试上一个状态
  const previousState = sm.getPreviousState();
  assert(previousState === OrderStates.REVIEWING, '上一个状态是审核中');
  
  // 测试元数据
  sm.updateMetadata({ customerName: '张三', priority: 'high' });
  const metadata = sm.getMetadata();
  assert(metadata.customerName === '张三', '元数据包含客户名称');
  assert(metadata.priority === 'high', '元数据包含优先级');
}

/**
 * 测试 7：事件发射
 */
async function testEventEmission() {
  console.log('\n=== 测试 7: 事件发射 ===');
  
  const sm = createOrderStateMachine('TEST-ORDER-006');
  let stateChangedFired = false;
  let specificStateFired = false;
  
  // 监听状态变化
  sm.on('stateChanged', (data) => {
    stateChangedFired = true;
    assert(data.orderId === 'TEST-ORDER-006', '事件包含订单 ID');
    assert(data.toState === OrderStates.REVIEWING, '事件包含目标状态');
  });
  
  // 监听特定状态
  sm.on('state:reviewing', (data) => {
    specificStateFired = true;
  });
  
  // 执行转换
  await sm.transition(OrderStates.REVIEWING, { operator: 'test' });
  
  assert(stateChangedFired === true, 'stateChanged 事件已触发');
  assert(specificStateFired === true, 'state:reviewing 事件已触发');
  
  // 测试 AgentEventEmitter 集成
  let agentEventFired = false;
  agentEventEmitter.on('order_state_changed', (event) => {
    if (event.data.orderId === 'TEST-ORDER-007') {
      agentEventFired = true;
      assert(event.data.fromState === OrderStates.PENDING_REVIEW, 'Agent 事件包含源状态');
      assert(event.data.toState === OrderStates.REVIEWING, 'Agent 事件包含目标状态');
    }
  });
  
  const sm2 = createOrderStateMachine('TEST-ORDER-007');
  await sm2.transition(OrderStates.REVIEWING, { operator: 'test' });
  
  // 等待一小段时间确保事件处理完成
  await new Promise(resolve => setTimeout(resolve, 10));
  
  assert(agentEventFired === true, 'AgentEventEmitter 事件已触发');
}

/**
 * 测试 8：状态机快照
 */
async function testSnapshot() {
  console.log('\n=== 测试 8: 状态机快照 ===');
  
  const sm = createOrderStateMachine('TEST-ORDER-008');
  await sm.transition(OrderStates.REVIEWING, { operator: 'test' });
  
  const snapshot = sm.getSnapshot();
  
  assert(snapshot.orderId === 'TEST-ORDER-008', '快照包含订单 ID');
  assert(snapshot.currentState === OrderStates.REVIEWING, '快照包含当前状态');
  assert(snapshot.currentStateLabel === '审核中', '快照包含状态标签');
  assert(snapshot.isTerminal === false, '快照包含终端状态标志');
  assert(snapshot.canContinue === true, '快照包含可继续标志');
  assert(Array.isArray(snapshot.availableActions), '快照包含可用操作列表');
  assert(snapshot.historyLength === 2, '快照包含历史长度');
  assert(typeof snapshot.lastStateChange === 'string', '快照包含最后变更时间');
}

/**
 * 测试 9：重置功能
 */
async function testReset() {
  console.log('\n=== 测试 9: 重置功能 ===');
  
  const sm = createOrderStateMachine('TEST-ORDER-009');
  await sm.transition(OrderStates.REVIEWING, { operator: 'test' });
  await sm.transition(OrderStates.SCHEDULED, { operator: 'test' });
  
  assert(sm.getCurrentState() === OrderStates.SCHEDULED, '重置前状态为已排程');
  assert(sm.getHistory().length === 3, '重置前有 3 条历史记录');
  
  // 重置
  sm.reset();
  
  assert(sm.getCurrentState() === OrderStates.PENDING_REVIEW, '重置后状态为待审核');
  assert(sm.getHistory().length === 1, '重置后有 1 条历史记录');
  assert(sm.getMetadata().customerName === undefined, '重置后元数据已清空');
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('========================================');
  console.log('       订单状态机测试套件');
  console.log('========================================');
  
  try {
    await testStateConstants();
    await testTransitionRules();
    await testStateMachineBasics();
    await testTransitionFlow();
    await testErrorHandling();
    await testStateHistory();
    await testEventEmission();
    await testSnapshot();
    await testReset();
    
    console.log('\n========================================');
    console.log('                测试结果');
    console.log('========================================');
    console.log(`✓ 通过：${passedTests}`);
    console.log(`✗ 失败：${failedTests}`);
    console.log(`总计：${passedTests + failedTests}`);
    console.log('========================================\n');
    
    if (failedTests > 0) {
      console.error('测试失败！请检查上面的错误信息。');
      process.exit(1);
    } else {
      console.log('🎉 所有测试通过！');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n测试执行失败:', error);
    process.exit(1);
  }
}

// 运行测试
runAllTests();
