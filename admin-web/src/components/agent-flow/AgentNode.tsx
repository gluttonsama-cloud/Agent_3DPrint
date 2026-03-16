import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Tooltip } from 'antd';

const AgentNode: React.FC<NodeProps> = ({ id, data, isConnectable }) => {
  const { label, status, thoughts, stats, active } = data as any;

  const statusColors: Record<string, string> = {
    idle: '#52c41a', // Green
    processing: '#faad14', // Yellow
    error: '#f5222d', // Red
  };

  const currentStatus = status || 'idle';
  const statusColor = statusColors[currentStatus];

  return (
    <div style={{ position: 'relative' }}>
      <Tooltip 
        title={
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
            <div>负载率: {stats?.load || '0%'}</div>
            <div>今日处理: {stats?.processed || 0} 单</div>
            <div>状态: {currentStatus.toUpperCase()}</div>
          </div>
        } 
        placement="right"
        color="#2D2D2D"
        styles={{ body: { border: '2px solid #F5F5F0', borderRadius: 0 } }}
      >
        <div style={{
          background: active ? '#708090' : '#E2E2D5',
          color: active ? '#F5F5F0' : '#2D2D2D',
          padding: 16,
          width: 200,
          textAlign: 'center',
          border: '3px solid #2D2D2D',
          boxShadow: active ? '8px 8px 0px 0px #2D2D2D' : '4px 4px 0px 0px #2D2D2D',
          transition: 'background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
          position: 'relative',
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 'bold',
          borderRadius: 0,
          zIndex: 10
        }}>
          <Handle 
            type="target" 
            position={Position.Top} 
            isConnectable={isConnectable} 
            style={{ background: '#2D2D2D', width: 12, height: 12, border: '2px solid #F5F5F0', borderRadius: 0 }} 
          />

          {/* Status Indicator (Breathing Light) */}
          <div style={{
            position: 'absolute', 
            top: -8, 
            right: -8, 
            width: 16, 
            height: 16,
            background: statusColor,
            border: '2px solid #2D2D2D',
            animation: currentStatus === 'processing' ? 'brutal-pulse 1.5s infinite' : 'none',
            zIndex: 5
          }} />

          <div>{label}</div>

          <Handle 
            type="source" 
            position={Position.Bottom} 
            isConnectable={isConnectable} 
            style={{ background: '#2D2D2D', width: 12, height: 12, border: '2px solid #F5F5F0', borderRadius: 0 }} 
          />
        </div>
      </Tooltip>

      {/* Mini Terminal for Chain of Thought */}
      {thoughts && thoughts.length > 0 && (
        <div style={{
          marginTop: 12,
          background: '#1e1e1e',
          color: '#52c41a',
          padding: '8px 12px',
          border: '3px solid #2D2D2D',
          textAlign: 'left',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          lineHeight: 1.5,
          width: 240,
          marginLeft: -20, // adjust width to be slightly wider than node
          boxShadow: '4px 4px 0px 0px #2D2D2D',
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 20
        }}>
          <div style={{ borderBottom: '2px solid #333', paddingBottom: 4, marginBottom: 4, color: '#888', fontSize: 10, fontWeight: 'bold' }}>
            TERMINAL // {id.toUpperCase()}
          </div>
          {thoughts.map((t: string, i: number) => (
            <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              <span style={{ color: '#faad14' }}>&gt;</span> {t}
            </div>
          ))}
          {active && (
            <div style={{ animation: 'terminal-blink 1s step-end infinite', display: 'inline-block', width: 8, height: 14, background: '#52c41a', verticalAlign: 'middle', marginLeft: 4 }} />
          )}
        </div>
      )}
    </div>
  );
};

export default AgentNode;
