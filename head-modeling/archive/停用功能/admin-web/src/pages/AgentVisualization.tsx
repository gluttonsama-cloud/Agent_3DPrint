import React, { useState, useEffect } from 'react';
import { Card, message, Button, Typography, Dropdown, MenuProps, Switch, Space, Tag, Popconfirm } from 'antd';
import { PlayCircleOutlined, UpOutlined, DownOutlined, ThunderboltOutlined, WarningOutlined, ToolOutlined, CloudOutlined, ApiOutlined, ClearOutlined } from '@ant-design/icons';
import { io, Socket } from 'socket.io-client';
import AgentFlow from '../components/agent-flow/AgentFlow';
import AgentTimeline from '../components/agent-flow/AgentTimeline';
import DecisionPanel from '../components/agent-flow/DecisionPanel';
import AgentInsightDrawer from '../components/agent-flow/AgentInsightDrawer';
import { getAgentDecisions, triggerAgentWorkflow, WorkflowStep, AgentEvent as ServiceAgentEvent } from '../services/agentService';
import { useAgentVisualizationStore, AgentEvent as StoreAgentEvent } from '../stores/agentVisualizationStore';

const { Title, Text } = Typography;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const AgentVisualization: React.FC = () => {
  const {
    events,
    agentStates,
    agentThoughts,
    edgeStates,
    addEvent,
    updateAgentState,
    addThought,
    clearThoughts,
    setEdgeAnimation,
    setLastWorkflowResult,
    clearEvents,
    reset,
  } = useAgentVisualizationStore();

  const [selectedEvent, setSelectedEvent] = useState<StoreAgentEvent | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [useRealData, setUseRealData] = useState(false);
  
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  const [timelineCollapsed, setTimelineCollapsed] = useState(true);
  const [decisionCollapsed, setDecisionCollapsed] = useState(true);

  useEffect(() => {
    const fetchDecisions = async () => {
      try {
        const data = await getAgentDecisions();
        data.forEach((serviceEvent: ServiceAgentEvent) => {
          if (!events.find(e => e.id === serviceEvent.id)) {
            // Map ServiceAgentEvent to StoreAgentEvent
            addEvent(
              serviceEvent.agent, 
              serviceEvent.action || 'decision', 
              serviceEvent.details, 
              serviceEvent.type
            );
          }
        });
      } catch (error) {
        message.error('获取决策历史失败');
      }
    };
    
    if (useRealData) {
      fetchDecisions();
      
      const socketUrl = (import.meta as any).env?.VITE_SOCKET_SERVER || 'http://localhost:3000';
      const newSocket = io(socketUrl, {
        path: '/socket.io',
        transports: ['websocket'],
      });

      newSocket.on('connect', () => {
        console.log('Socket.IO connected');
        message.success('已连接到实时 Agent 事件流');
      });

      newSocket.on('agent-event', (event: any) => {
        addEvent(event.agent, event.action || 'system', event.details || event.data, event.type || 'decision');
      });
      
      newSocket.on('agent-state-change', (state: any) => {
        updateAgentState(state.agentId, { 
          status: state.state === 'busy' ? 'processing' : state.state === 'error' ? 'error' : 'idle',
          active: state.state !== 'idle'
        });
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    }
  }, [useRealData]);

  const handleNodeClick = (nodeId: string) => {
    setCurrentAgentId(nodeId);
    setDrawerVisible(true);
  };

  const handleEventClick = (event: StoreAgentEvent) => {
    setSelectedEvent(event);
    if (decisionCollapsed) {
      setDecisionCollapsed(false);
    }
  };

  const getStepTitle = (step: WorkflowStep): string => {
    const titles: Record<string, string> = {
      'initialize_workflow': '接收订单 & 初始化',
      'allocate_device': '设备调度评估',
      'check_inventory': '库存预测与预扣',
      'evaluate_rules': '业务规则引擎审核',
      'llm_decision': 'LLM 深度辅助决策',
      'finalize_execution': '执行决策 & 状态机流转'
    };
    return titles[step.action] || step.action;
  };

  const simulateNormalFlow = async () => {
    setIsSimulating(true);
    setTimelineCollapsed(false);
    
    ['coordinator', 'scheduler', 'inventory'].forEach(clearThoughts);
    
    updateAgentState('coordinator', { status: 'processing', active: true });
    addThought('coordinator', '正在分析订单 ORD-123...');
    await delay(800);
    addThought('coordinator', '发现材料需求：PLA');
    await delay(800);
    addThought('coordinator', '路由决策：分配给 Scheduler 和 Inventory');
    await delay(800);
    updateAgentState('coordinator', { status: 'idle', active: false });
    addEvent('Coordinator', '接收新订单，分配给 Scheduler', { explanation: '检测到新订单，根据路由规则分配给调度 Agent 进行排期。' }, 'decision');

    setEdgeAnimation('e1-2', '{"task": "schedule", "material": "PLA"}', true);
    await delay(1500);
    setEdgeAnimation('e1-2', '', false);

    updateAgentState('scheduler', { status: 'processing', active: true });
    addThought('scheduler', '收到排期任务 payload...');
    await delay(800);
    addThought('scheduler', '正在调用工具：check_device_status()...');
    await delay(1000);
    addThought('scheduler', '设备 A 空闲，决策完成。');
    await delay(800);
    updateAgentState('scheduler', { status: 'idle', active: false });
    addEvent('Scheduler', '分配打印机 A', { explanation: '打印机 A 当前空闲且支持该订单材料，已成功分配。' }, 'decision');

    setEdgeAnimation('e1-3', '{"task": "deduct", "amount": 50}', true);
    await delay(1500);
    setEdgeAnimation('e1-3', '', false);

    updateAgentState('inventory', { status: 'processing', active: true });
    addThought('inventory', '收到库存扣减请求...');
    await delay(800);
    addThought('inventory', '正在调用工具：update_db()...');
    await delay(1000);
    addThought('inventory', '扣减完成。');
    await delay(800);
    updateAgentState('inventory', { status: 'idle', active: false });
    addEvent('Inventory', '扣减 PLA 白色 50g', { explanation: '订单需要 50g PLA 白色材料，库存充足，已完成扣减。' }, 'decision');
    
    setIsSimulating(false);
  };

  const simulateInventoryShortage = async () => {
    setIsSimulating(true);
    setTimelineCollapsed(false);
    
    ['coordinator', 'scheduler', 'inventory'].forEach(clearThoughts);
    
    updateAgentState('coordinator', { status: 'processing', active: true });
    addThought('coordinator', '收到大额订单 ORD-999...');
    await delay(800);
    addThought('coordinator', '请求耗材校验...');
    await delay(800);
    updateAgentState('coordinator', { status: 'idle', active: false });

    setEdgeAnimation('e1-3', '{"task": "check", "material": "ABS", "amount": 500}', true);
    await delay(1500);
    setEdgeAnimation('e1-3', '', false);

    updateAgentState('inventory', { status: 'processing', active: true });
    addThought('inventory', '校验库存: ABS...');
    await delay(1000);
    updateAgentState('inventory', { status: 'error' });
    addThought('inventory', '警告：ABS材料不足！');
    await delay(800);
    addThought('inventory', '正在调用工具：generate_po()...');
    await delay(800);
    addThought('inventory', '生成采购单完成。');
    await delay(800);
    updateAgentState('inventory', { status: 'idle', active: false });
    addEvent('Inventory', '库存不足拦截', { explanation: 'ABS材料当前库存低于阈值，无法满足订单需求，已自动生成采购单。' }, 'error');

    setEdgeAnimation('e1-3', '{"status": "error", "reason": "out_of_stock"}', true);
    await delay(1500);
    setEdgeAnimation('e1-3', '', false);

    updateAgentState('coordinator', { status: 'error', active: true });
    addThought('coordinator', '收到库存警告...');
    await delay(800);
    addThought('coordinator', '订单挂起。');
    await delay(800);
    updateAgentState('coordinator', { status: 'idle', active: false });
    addEvent('Coordinator', '订单挂起', { explanation: '收到 Inventory Agent 的库存不足警告，订单状态更新为挂起。' }, 'error');

    setIsSimulating(false);
  };

  const executeRealWorkflow = async () => {
    setIsSimulating(true);
    setTimelineCollapsed(false);
    
    ['coordinator', 'scheduler', 'inventory'].forEach(clearThoughts);
    
    try {
      message.loading({ content: '正在启动 Agent 实时协作分析...', key: 'workflow' });
      
      const result = await triggerAgentWorkflow({
        orderId: `ORD-${Date.now()}`,
        customerName: '演示客户',
        material: '白色 PLA',
        volume: 120,
        deviceType: 'fdm',
        priority: 'high'
      });
      
      if (!result || !result.steps) {
        throw new Error('API 返回结果异常');
      }
      
      for (const step of result.steps) {
        const agentKey = step.agent as 'coordinator' | 'scheduler' | 'inventory';
        
        updateAgentState(agentKey, { 
          status: step.status === 'processing' ? 'processing' : step.status === 'failed' ? 'error' : 'idle', 
          active: true 
        });
        
        for (const thought of step.thoughts) {
          addThought(agentKey, thought);
          await delay(800);
        }
        
        if (step.protocol) {
          const edgeId = step.protocol.from === 'coordinator_agent' && step.protocol.to === 'scheduler_agent' 
            ? 'e1-2' 
            : step.protocol.from === 'coordinator_agent' && step.protocol.to === 'inventory_agent'
            ? 'e1-3'
            : '';
          
          if (edgeId) {
            setEdgeAnimation(edgeId, JSON.stringify({ action: step.action, id: step.protocol.messageId }), true);
            await delay(1200);
            setEdgeAnimation(edgeId, '', false);
          }
        }
        
        updateAgentState(agentKey, { status: 'idle', active: false });
        
        addEvent(
          step.agentName,
          getStepTitle(step),
          {
            ...step.data,
            protocol: step.protocol,
            explanation: step.thoughts.join('\n'),
            source: step.action === 'llm_decision' ? 'qiniu_glm5' : 'system',
            confidence: step.data?.confidence || 1.0,
            stepId: step.step
          },
          step.status === 'failed' || step.status === 'warning' ? 'error' : 'decision'
        );
        
        await delay(1000);
      }
      
      setLastWorkflowResult({
        decision: result.decision,
        summary: {
            ...result.summary,
            deviceAllocated: result.summary.deviceAllocated ? { ...result.summary.deviceAllocated, status: 'allocated' } : null,
            inventoryDeducted: null // Adapt to visual store interface
        }
      });
      
      message.success({ 
        content: `全流程 Agent 协作完成！状态: ${result.summary.autoApproved ? '自动核准' : '需人工干预'}`, 
        key: 'workflow',
        duration: 4
      });
      
    } catch (error) {
      console.error('[Workflow Error]:', error);
      message.error({ content: `工作流执行失败: ${(error as Error).message}`, key: 'workflow' });
    } finally {
      setIsSimulating(false);
    }
  };

  const simulateDeviceFailure = async () => {
    setIsSimulating(true);
    setTimelineCollapsed(false);
    
    ['coordinator', 'scheduler', 'inventory'].forEach(clearThoughts);
    
    updateAgentState('coordinator', { status: 'processing', active: true });
    addThought('coordinator', '接收加急订单 ORD-777...');
    await delay(800);
    updateAgentState('coordinator', { status: 'idle', active: false });

    setEdgeAnimation('e1-2', '{"task": "schedule", "priority": "high"}', true);
    await delay(1500);
    setEdgeAnimation('e1-2', '', false);

    updateAgentState('scheduler', { status: 'processing', active: true });
    addThought('scheduler', '尝试分配给打印机 A...');
    await delay(1000);
    
    updateAgentState('scheduler', { status: 'error' });
    addThought('scheduler', '错误：打印机 A 离线！');
    addEvent('Scheduler', '设备离线警告', { explanation: '尝试连接打印机 A 失败，设备处于离线状态。' }, 'error');
    await delay(1000);

    updateAgentState('scheduler', { status: 'processing' });
    addThought('scheduler', '触发容错机制，重新分配...');
    await delay(800);
    addThought('scheduler', '已成功分配给备用打印机 B。');
    await delay(800);
    
    updateAgentState('scheduler', { status: 'idle', active: false });
    addEvent('Scheduler', '重新分配设备', { explanation: '触发容错机制，已将任务重新分配给同等规格的备用打印机 B。' }, 'decision');

    setIsSimulating(false);
  };

  const scenarioMenu: MenuProps['items'] = [
    {
      key: 'normal',
      icon: <ThunderboltOutlined />,
      label: '正常订单流转',
      onClick: simulateNormalFlow,
      disabled: isSimulating
    },
    {
      key: 'inventory',
      icon: <WarningOutlined />,
      label: '库存不足触发采购',
      onClick: simulateInventoryShortage,
      disabled: isSimulating
    },
    {
      key: 'device',
      icon: <ToolOutlined />,
      label: '设备故障自动重试',
      onClick: simulateDeviceFailure,
      disabled: isSimulating
    }
  ];

  return (
    <div style={{ 
      position: 'relative', 
      margin: '-24px', 
      width: 'calc(100% + 48px)', 
      height: 'calc(100% + 48px)', 
      overflow: 'hidden',
      background: '#F5F5F0',
      flex: 1
    }}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <AgentFlow 
          onNodeClick={handleNodeClick} 
          agentStates={agentStates} 
          agentThoughts={agentThoughts} 
          edgeStates={edgeStates as any} // Forced cast due to index signature complexity
        />
      </div>

      <div style={{ 
        position: 'absolute', top: 24, left: 24, zIndex: 10,
        background: 'rgba(226, 226, 213, 0.85)', backdropFilter: 'blur(8px)',
        padding: '16px 24px', border: '3px solid #2D2D2D', boxShadow: '4px 4px 0px 0px #2D2D2D',
        pointerEvents: 'auto'
      }}>
        <Title level={3} style={{ margin: 0, color: '#2D2D2D' }}>Agent 协作中枢</Title>
        <Text style={{ color: '#708090', fontWeight: 600 }}>实时监控多智能体系统的决策流转与协作过程</Text>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          {events.length > 0 && (
            <>
              <Tag color="blue">已记录 {events.length} 条决策</Tag>
              <Popconfirm
                title="清空决策记录"
                description="确定要清空所有决策记录吗？此操作不可恢复。"
                onConfirm={() => {
                  clearEvents();
                  reset();
                  message.success('决策记录已清空');
                }}
                okText="确定清空"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button 
                  size="small" 
                  danger 
                  icon={<ClearOutlined />}
                  style={{ fontSize: 12 }}
                >
                  清空记录
                </Button>
              </Popconfirm>
            </>
          )}
        </div>
      </div>

      <div style={{ position: 'absolute', top: 24, right: 24, zIndex: 10, pointerEvents: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
        <Space direction="vertical" align="center" size="small">
          <Switch
            checked={useRealData}
            onChange={setUseRealData}
            checkedChildren={<><CloudOutlined /> 真实数据</>}
            unCheckedChildren={<><ApiOutlined /> 模拟数据</>}
            size="small"
          />
          <Tag color={useRealData ? 'green' : 'orange'} style={{ fontSize: 11 }}>
            {useRealData ? '已连接后端 API' : '本地演示模式'}
          </Tag>
        </Space>
        
        {useRealData && (
          <Button 
            type="primary" 
            size="large" 
            icon={<ThunderboltOutlined />}
            loading={isSimulating}
            onClick={executeRealWorkflow}
          >
            {isSimulating ? '工作流执行中...' : '触发 Agent 协作'}
          </Button>
        )}
        
        {!useRealData && (
          <Dropdown menu={{ items: scenarioMenu }} placement="bottomRight" trigger={['click']}>
            <Button type="primary" size="large" icon={<PlayCircleOutlined />} loading={isSimulating} style={{ fontWeight: 'bold' }}>
              {isSimulating ? '模拟运行中...' : '模拟场景运行'} <DownOutlined />
            </Button>
          </Dropdown>
        )}
      </div>

      <div style={{ 
        position: 'absolute', bottom: 32, left: 80, zIndex: 10, 
        width: 400, height: 414,
        minWidth: 300, minHeight: 150,
        resize: timelineCollapsed ? 'none' : 'both',
        overflow: 'hidden',
        pointerEvents: 'auto', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: timelineCollapsed ? 'translateY(calc(100% - 64px))' : 'translateY(0)',
        boxShadow: '4px 4px 0px 0px #2D2D2D',
        border: '3px solid #2D2D2D',
        background: 'rgba(226, 226, 213, 0.85)', backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderBottom: '3px solid #2D2D2D', height: 64, boxSizing: 'border-box' }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#2D2D2D' }}>实时决策时间线</span>
            <Button type="text" icon={timelineCollapsed ? <UpOutlined /> : <DownOutlined />} onClick={() => setTimelineCollapsed(!timelineCollapsed)} />
          </div>
          <div className="hide-scrollbar" style={{ flex: 1, padding: 24, overflow: 'auto', display: timelineCollapsed ? 'none' : 'block' }}>
            <AgentTimeline events={events as any} onEventClick={handleEventClick as any} />
          </div>
        </div>
      </div>

      <div style={{ 
        position: 'absolute', bottom: 32, right: 32, zIndex: 10, 
        width: 500, height: 414,
        minWidth: 300, minHeight: 150,
        resize: decisionCollapsed ? 'none' : 'both',
        overflow: 'hidden',
        direction: 'rtl',
        pointerEvents: 'auto', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: decisionCollapsed ? 'translateY(calc(100% - 64px))' : 'translateY(0)',
        boxShadow: '4px 4px 0px 0px #2D2D2D',
        border: '3px solid #2D2D2D',
        background: 'rgba(226, 226, 213, 0.85)', backdropFilter: 'blur(8px)',
      }}>
        <div style={{ direction: 'ltr', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', borderBottom: '3px solid #2D2D2D', height: 64, boxSizing: 'border-box' }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#2D2D2D' }}>决策解释面板</span>
            <Button type="text" icon={decisionCollapsed ? <UpOutlined /> : <DownOutlined />} onClick={() => setDecisionCollapsed(!decisionCollapsed)} />
          </div>
          <div className="hide-scrollbar" style={{ flex: 1, overflow: 'auto', display: decisionCollapsed ? 'none' : 'block' }}>
            <DecisionPanel event={selectedEvent as any} />
          </div>
        </div>
      </div>

      <AgentInsightDrawer 
        visible={drawerVisible} 
        onClose={() => setDrawerVisible(false)} 
        agentId={currentAgentId} 
      />
    </div>
  );
};

export default AgentVisualization;