import React, { useEffect, useRef } from 'react';
import { AgentEvent } from '../../services/agentService';
import dayjs from 'dayjs';

interface AgentChatPanelProps {
  events: AgentEvent[];
  onEventClick: (event: AgentEvent) => void;
}

const AgentChatPanel: React.FC<AgentChatPanelProps> = ({ events, onEventClick }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const getAgentColor = (agent: string) => {
    if (agent === 'Coordinator') return '#708090'; // Slate
    if (agent === 'Scheduler') return '#2D2D2D'; // Charcoal
    return '#5A5A40'; // Olive/Inventory
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      {events.map((evt) => {
        const isCoordinator = evt.agent === 'Coordinator';
        return (
          <div 
            key={evt.id} 
            style={{ 
              display: 'flex', 
              flexDirection: isCoordinator ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
              gap: 12,
              cursor: 'pointer'
            }}
            onClick={() => onEventClick(evt)}
          >
            {/* Avatar */}
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: getAgentColor(evt.agent), color: '#F5F5F0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 'bold', fontSize: 16, border: '2px solid #2D2D2D',
              flexShrink: 0
            }}>
              {evt.agent.charAt(0)}
            </div>
            
            {/* Message Bubble */}
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: isCoordinator ? 'flex-end' : 'flex-start',
              maxWidth: '80%'
            }}>
              <div style={{ fontSize: 12, color: '#708090', marginBottom: 4, fontWeight: 'bold' }}>
                {evt.agent} • {dayjs(evt.timestamp).format('HH:mm:ss')}
              </div>
              <div style={{
                background: isCoordinator ? '#708090' : '#E2E2D5',
                color: isCoordinator ? '#F5F5F0' : '#2D2D2D',
                padding: '10px 14px',
                border: '3px solid #2D2D2D',
                boxShadow: '4px 4px 0px 0px #2D2D2D',
                borderRadius: isCoordinator ? '12px 0 12px 12px' : '0 12px 12px 12px',
                fontWeight: 500,
                lineHeight: 1.5
              }}>
                {evt.message || evt.decision}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
};

export default AgentChatPanel;
