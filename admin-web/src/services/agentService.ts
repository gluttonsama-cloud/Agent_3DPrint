import api from './api';

export interface AgentEvent {
  id: string;
  type: string;
  agent: string;
  orderId: string;
  decision: string;
  message?: string;
  cot?: string[];
  timestamp: string;
  details: any;
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  memory: string[];
  tokenUsage: number;
  successRate: number;
  status: 'idle' | 'processing' | 'error';
}

/**
 * 获取 Agent 决策历史
 * 从后端 API 获取真实数据
 */
export const getAgentDecisions = async (limit: number = 50): Promise<AgentEvent[]> => {
  try {
    // 调用后端 API：GET /api/agent-decisions?limit=50
    const response = await api.get('/agent-decisions', {
      params: { limit }
    });
    
    // 适配后端响应格式
    if (response.data && response.data.data) {
      return response.data.data.map((decision: any) => ({
        id: decision._id || decision.decisionId,
        type: 'decision',
        agent: decision.agentId.replace('_agent', ''),
        orderId: decision.orderId,
        decision: decision.decisionResult,
        timestamp: decision.createdAt,
        details: {
          inputs: decision.inputSnapshot,
          rules: decision.rulesMatched || [],
          confidence: decision.confidence,
          explanation: decision.rationale
        }
      }));
    }
    
    return [];
  } catch (error) {
    console.error('获取 Agent 决策历史失败:', error);
    return [];
  }
};

/**
 * 获取单个 Agent 的配置信息
 * 从后端 API 获取真实数据
 */
export const getAgentProfile = async (agentId: string): Promise<AgentProfile> => {
  try {
    // 调用后端 API：GET /api/agents/:agentId/status
    const response = await api.get(`/agents/${agentId}/status`);
    
    if (response.data && response.data.data) {
      const data = response.data.data;
      
      return {
        id: agentId,
        name: data.name || mapAgentIdToName(agentId),
        role: data.role || getAgentRole(agentId),
        systemPrompt: data.systemPrompt || getDefaultSystemPrompt(agentId),
        memory: data.memory || data.recentDecisions || [],
        tokenUsage: data.tokenUsage || 0,
        successRate: data.successRate || data.decisionEngine?.rulesCount ? 95 : 0,
        status: mapAgentState(data.state)
      };
    }
    
    // 如果 API 失败，返回默认值
    return getDefaultProfile(agentId);
  } catch (error) {
    console.error('获取 Agent Profile 失败:', error);
    return getDefaultProfile(agentId);
  }
};

/**
 * 触发 Agent 决策
 * 调用后端 API 执行真实的 Agent 决策
 */
export const triggerAgentDecision = async (
  agentType: 'coordinator' | 'scheduler' | 'inventory',
  action: string,
  data: any
): Promise<any> => {
  try {
    if (agentType === 'coordinator' && action === 'evaluate_order') {
      const response = await api.post('/simple-decision/coordinator', {
        orderId: data.orderId,
        customerName: data.customerName,
        material: data.material,
        volume: data.volume
      });
      return response.data;
    }
    
    const response = await api.post('/agent-decisions/decide', {
      agentType,
      action,
      data
    });
    
    return response.data;
  } catch (error) {
    console.error('触发 Agent 决策失败:', error);
    throw error;
  }
};

/**
 * 触发完整的 Agent 协作工作流
 * 包含设备分配、库存扣减等真实操作
 */
export const triggerAgentWorkflow = async (orderData: {
  orderId?: string;
  customerName?: string;
  material: string;
  volume: number;
  deviceType?: string;
}): Promise<AgentWorkflowResult> => {
  const response = await api.post('/agent-workflow/process-order', orderData);
  return response.data?.data || response.data;
};

export interface AgentWorkflowResult {
  workflowId: string;
  orderId: string;
  elapsed: number;
  decision: {
    result: string;
    confidence: number;
    rationale: string;
  };
  steps: WorkflowStep[];
  summary: {
    deviceAllocated?: {
      id: string;
      type: string;
      status: string;
    } | null;
    inventoryDeducted?: {
      material: string;
      amount: number;
    } | null;
    autoApproved: boolean;
  };
}

export interface WorkflowStep {
  step: number;
  agent: string;
  agentName: string;
  action: string;
  status: 'processing' | 'completed' | 'failed' | 'warning';
  timestamp: string;
  thoughts: string[];
  data?: any;
  messagePayload?: {
    from: string;
    to: string;
    type: string;
    content: any;
  };
}

/**
 * 查询订单的决策历史
 */
export const getOrderDecisions = async (orderId: string): Promise<AgentEvent[]> => {
  try {
    const response = await api.get(`/agent-decisions/order/${orderId}`);
    
    if (response.data && response.data.data && response.data.data.decisions) {
      return response.data.data.decisions.map((decision: any) => ({
        id: decision._id,
        type: 'decision',
        agent: decision.agentId.replace('_agent', ''),
        orderId: decision.orderId,
        decision: decision.decisionResult,
        timestamp: decision.createdAt,
        details: {
          inputs: decision.inputSnapshot,
          rules: decision.rulesMatched || [],
          confidence: decision.confidence,
          explanation: decision.rationale
        }
      }));
    }
    
    return [];
  } catch (error) {
    console.error('查询订单决策历史失败:', error);
    return [];
  }
};

// ============ 辅助函数 ============

function mapAgentIdToName(agentId: string): string {
  const mapping: Record<string, string> = {
    'coordinator': '协调 Agent',
    'scheduler': '调度 Agent',
    'inventory': '库存 Agent'
  };
  return mapping[agentId.toLowerCase()] || 'Agent';
}

function getAgentRole(agentId: string): string {
  const roles: Record<string, string> = {
    'coordinator': 'System Orchestrator',
    'scheduler': 'Resource Allocator',
    'inventory': 'Material Manager'
  };
  return roles[agentId.toLowerCase()] || 'Agent';
}

function getDefaultSystemPrompt(agentId: string): string {
  const prompts: Record<string, string> = {
    'coordinator': `You are the Coordinator Agent for a 3D printing farm.
Your primary responsibility is to receive incoming orders, validate their parameters, and route them to the appropriate specialized agents (Scheduler or Inventory).
Rules:
1. If order is NEW -> Send to Scheduler.
2. If order lacks material -> Send to Inventory.
3. Always maintain a global state of active orders.`,
    
    'scheduler': `You are the Scheduler Agent.
Your job is to assign 3D printing tasks to the most optimal available printer.
Considerations:
- Printer availability (Idle vs Printing).
- Material compatibility (Nozzle temp, bed temp).
- Estimated print time vs deadline.
Output format: JSON containing { "assignedPrinter": "string", "estimatedCompletion": "ISO8601" }`,
    
    'inventory': `You are the Inventory Agent.
You manage the stock levels of all 3D printing filaments (PLA, ABS, PETG, etc.).
Responsibilities:
1. Deduct stock when a print starts.
2. Alert the Coordinator if stock falls below the 20% threshold.
3. Generate procurement requests for depleted materials.`
  };
  
  return prompts[agentId.toLowerCase()] || 'You are a helpful AI assistant.';
}

function mapAgentState(state: string): 'idle' | 'processing' | 'error' {
  const mapping: Record<string, 'idle' | 'processing' | 'error'> = {
    'ready': 'idle',
    'idle': 'idle',
    'busy': 'processing',
    'processing': 'processing',
    'error': 'error'
  };
  return mapping[state] || 'idle';
}

function getDefaultProfile(agentId: string): AgentProfile {
  return {
    id: agentId,
    name: mapAgentIdToName(agentId),
    role: getAgentRole(agentId),
    systemPrompt: getDefaultSystemPrompt(agentId),
    memory: ['[System] Agent initialized'],
    tokenUsage: 0,
    successRate: 0,
    status: 'idle'
  };
}
