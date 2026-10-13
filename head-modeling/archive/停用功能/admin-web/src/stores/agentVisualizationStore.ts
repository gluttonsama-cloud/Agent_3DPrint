import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AgentEvent {
  id: string;
  agent: string;
  action: string;
  timestamp: string;
  data?: any; // For backward compatibility with existing components
  details?: {
    inputs?: Record<string, any>;
    rules?: any[];
    confidence?: number;
    explanation?: string;
    rationale?: string;
    protocol?: any;
    scores?: any;
    forecast?: any;
    llmResponse?: string;
    [key: string]: any;
  };
  type: string;
  orderId?: string;
  decision?: string;
}

export interface AgentState {
  status: 'idle' | 'processing' | 'error';
  active: boolean;
}

export interface EdgeState {
  message: string;
  animating: boolean;
  isAnimating?: boolean; // For component compatibility
  payload?: string; // For component compatibility
}

interface AgentVisualizationState {
  events: AgentEvent[];
  agentStates: Record<string, AgentState>;
  agentThoughts: Record<string, string[]>;
  edgeStates: Record<string, EdgeState>;
  lastWorkflowResult: {
    decision?: { result: string; confidence: number; rationale: string };
    summary?: {
      deviceAllocated?: { id: string; type: string; status: string } | null;
      inventoryDeducted?: { material: string; amount: number } | null;
      autoApproved: boolean;
    };
  } | null;
  
  addEvent: (agent: string, action: string, details?: AgentEvent['details'], type?: string) => void;
  clearEvents: () => void;
  updateAgentState: (agent: string, state: Partial<AgentState>) => void;
  addThought: (agent: string, thought: string) => void;
  clearThoughts: (agent: string) => void;
  setEdgeAnimation: (edgeId: string, message: string, animating: boolean) => void;
  setLastWorkflowResult: (result: AgentVisualizationState['lastWorkflowResult']) => void;
  reset: () => void;
}

const initialState: {
  events: AgentEvent[];
  agentStates: Record<string, AgentState>;
  agentThoughts: Record<string, string[]>;
  edgeStates: Record<string, EdgeState>;
  lastWorkflowResult: any;
} = {
  events: [],
  agentStates: {
    coordinator: { status: 'idle', active: false },
    scheduler: { status: 'idle', active: false },
    inventory: { status: 'idle', active: false },
  },
  agentThoughts: {
    coordinator: [],
    scheduler: [],
    inventory: [],
  },
  edgeStates: {},
  lastWorkflowResult: null,
};

export const useAgentVisualizationStore = create<AgentVisualizationState>()(
  persist(
    (set, get) => ({
      ...initialState,
      
      addEvent: (agent, action, details, type) => {
        const newEvent: AgentEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          agent,
          action,
          timestamp: new Date().toISOString(),
          details,
          type,
        };
        set((state) => ({
          events: [newEvent, ...state.events].slice(0, 100),
        }));
      },
      
      clearEvents: () => set({ events: [] }),
      
      updateAgentState: (agent, stateUpdate) => {
        set((state) => ({
          agentStates: {
            ...state.agentStates,
            [agent]: { ...state.agentStates[agent], ...stateUpdate } as AgentState,
          },
        }));
      },
      
      addThought: (agent, thought) => {
        set((state) => ({
          agentThoughts: {
            ...state.agentThoughts,
            [agent]: [...(state.agentThoughts[agent] || []), thought],
          },
        }));
      },
      
      clearThoughts: (agent) => {
        set((state) => ({
          agentThoughts: {
            ...state.agentThoughts,
            [agent]: [],
          },
        }));
      },
      
      setEdgeAnimation: (edgeId, message, animating) => {
        set((state) => ({
          edgeStates: {
            ...state.edgeStates,
            [edgeId]: { message, animating },
          },
        }));
      },
      
      setLastWorkflowResult: (result) => {
        set({ lastWorkflowResult: result });
      },
      
      reset: () => set(initialState),
    }),
    {
      name: 'agent-visualization-storage',
      partialize: (state) => ({
        events: state.events.slice(0, 50), // 只持久化最近50条
        lastWorkflowResult: state.lastWorkflowResult,
      }),
    }
  )
);