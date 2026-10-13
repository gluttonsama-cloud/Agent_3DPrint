import React from 'react';
import { Timeline } from 'antd';
import dayjs from 'dayjs';
import { AgentEvent } from '../../services/agentService';

interface AgentTimelineProps {
  events: AgentEvent[];
  onEventClick: (event: AgentEvent) => void;
}

const AgentTimeline: React.FC<AgentTimelineProps> = ({ events, onEventClick }) => {
  return (
    <Timeline
      items={events.map((evt) => ({
        color: evt.agent === 'Coordinator' ? '#708090' : evt.agent === 'Scheduler' ? '#2D2D2D' : '#8c8c8c',
        content: (
          <div style={{ cursor: 'pointer' }} onClick={() => onEventClick(evt)}>
            <div><strong>{evt.agent}</strong> - {evt.orderId}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{dayjs(evt.timestamp).format('HH:mm:ss.SSS')}</div>
            <div>{evt.decision}</div>
          </div>
        ),
      }))}
    />
  );
};

export default AgentTimeline;
