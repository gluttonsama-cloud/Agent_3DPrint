import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AgentNode from './AgentNode';
import DataFlowEdge from './DataFlowEdge';

const initialNodes: Node[] = [
  {
    id: 'coordinator',
    type: 'agent',
    data: { label: '协调 Agent (Coordinator)', stats: { load: '12%', processed: 142 } },
    position: { x: 250, y: 50 },
  },
  {
    id: 'scheduler',
    type: 'agent',
    data: { label: '调度 Agent (Scheduler)', stats: { load: '45%', processed: 89 } },
    position: { x: 100, y: 200 },
  },
  {
    id: 'inventory',
    type: 'agent',
    data: { label: '库存 Agent (Inventory)', stats: { load: '5%', processed: 210 } },
    position: { x: 400, y: 200 },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: 'coordinator', target: 'scheduler', type: 'dataFlow' },
  { id: 'e1-3', source: 'coordinator', target: 'inventory', type: 'dataFlow' },
];

export interface AgentState {
  status: 'idle' | 'processing' | 'error';
  active?: boolean;
}

export interface EdgeState {
  isAnimating: boolean;
  payload: string;
}

interface AgentFlowProps {
  onNodeClick: (nodeId: string) => void;
  agentStates?: Record<string, AgentState>;
  agentThoughts?: Record<string, string[]>;
  edgeStates?: Record<string, EdgeState>;
}

const AgentFlow: React.FC<AgentFlowProps> = ({ onNodeClick, agentStates = {}, agentThoughts = {}, edgeStates = {} }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const nodeTypes = useMemo(() => ({ agent: AgentNode }), []);
  const edgeTypes = useMemo(() => ({ dataFlow: DataFlowEdge }), []);

  const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  // Merge agentStates and thoughts into nodes
  const nodesWithState = nodes.map(n => {
    const state = agentStates[n.id] || { status: 'idle', active: false };
    const thoughts = agentThoughts[n.id] || [];
    return {
      ...n,
      data: {
        ...n.data,
        ...state,
        thoughts
      }
    };
  });

  // Merge edge states into edges
  const edgesWithState = edges.map(e => {
    const state = edgeStates[e.id] || { isAnimating: false, payload: '' };
    return {
      ...e,
      data: {
        ...e.data,
        ...state
      }
    };
  });

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodesWithState}
        edges={edgesWithState}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => onNodeClick(node.id)}
        connectionLineStyle={{ stroke: '#2D2D2D', strokeWidth: 3 }}
        defaultEdgeOptions={{ style: { stroke: '#2D2D2D', strokeWidth: 3 } }}
        fitView
      >
        <Controls position="bottom-left" style={{ marginBottom: 24, marginLeft: 24, border: '3px solid #2D2D2D', borderRadius: 0, boxShadow: '4px 4px 0px 0px #2D2D2D' }} />
        <MiniMap position="top-right" style={{ marginTop: 80, marginRight: 24, border: '3px solid #2D2D2D', borderRadius: 0, boxShadow: '4px 4px 0px 0px #2D2D2D' }} />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  );
};

export default AgentFlow;
