import React, { useEffect, useState } from 'react';
import { Drawer, Typography, Tag, Row, Col, Statistic, Spin } from 'antd';
import { getAgentProfile, AgentProfile } from '../../services/agentService';

const { Title, Text, Paragraph } = Typography;

interface AgentInsightDrawerProps {
  visible: boolean;
  onClose: () => void;
  agentId: string | null;
  latestCot?: string[];
}

const EMPTY_ARRAY: string[] = [];

const AgentInsightDrawer: React.FC<AgentInsightDrawerProps> = ({ visible, onClose, agentId, latestCot = EMPTY_ARRAY }) => {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [displayedCot, setDisplayedCot] = useState<string[]>([]);

  useEffect(() => {
    if (visible && agentId) {
      setLoading(true);
      getAgentProfile(agentId).then(data => {
        setProfile(data);
        setLoading(false);
      });
    }
  }, [visible, agentId]);

  // Typewriter effect for CoT
  useEffect(() => {
    if (!visible || latestCot.length === 0) {
      setDisplayedCot(prev => prev.length === 0 ? prev : []);
      return;
    }

    setDisplayedCot([]);
    let i = 0;
    const interval = setInterval(() => {
      if (i < latestCot.length) {
        setDisplayedCot(prev => [...prev, latestCot[i]]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 600); // Type a new line every 600ms

    return () => clearInterval(interval);
  }, [latestCot, visible]);

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 'bold', color: '#2D2D2D' }}>
            {profile?.name || 'Agent Insight'}
          </span>
          <Tag color="#708090" style={{ margin: 0, borderRadius: 0, border: '2px solid #2D2D2D' }}>
            {profile?.role}
          </Tag>
        </div>
      }
      placement="right"
      onClose={onClose}
      open={visible}
      size="large"
      className="brutalist-drawer"
      closeIcon={<span style={{ color: '#2D2D2D', fontSize: 18, fontWeight: 'bold' }}>X</span>}
    >
      {loading || !profile ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Live Thinking (CoT) Terminal */}
          {latestCot.length > 0 && (
            <div>
              <Title level={4} style={{ marginTop: 0, color: '#2D2D2D', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#52c41a', display: 'inline-block', animation: 'pulse 1.5s infinite' }}></span>
                Live Thinking
              </Title>
              <div style={{
                background: '#141414',
                color: '#52c41a',
                padding: 16,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                border: '3px solid #2D2D2D',
                boxShadow: '4px 4px 0px 0px #2D2D2D',
                minHeight: 120,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                {displayedCot.map((line, idx) => (
                  <div key={idx} style={{ opacity: 0, animation: 'fadeIn 0.3s forwards' }}>
                    {line}
                  </div>
                ))}
                {displayedCot.length < latestCot.length && (
                  <div style={{ animation: 'blink 1s infinite' }}>_</div>
                )}
              </div>
            </div>
          )}

          {/* System Prompt Section */}
          <div>
            <Title level={4} style={{ marginTop: 0, color: '#2D2D2D' }}>System Prompt</Title>
            <div style={{
              background: '#2D2D2D',
              color: '#F5F5F0',
              padding: 16,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              whiteSpace: 'pre-wrap',
              border: '3px solid #2D2D2D',
              boxShadow: '4px 4px 0px 0px rgba(0,0,0,0.2)'
            }}>
              {profile.systemPrompt}
            </div>
          </div>

          {/* Metrics Section */}
          <Row gutter={16}>
            <Col span={12}>
              <div style={{
                background: '#E2E2D5',
                padding: 16,
                border: '3px solid #2D2D2D',
                boxShadow: '4px 4px 0px 0px #2D2D2D'
              }}>
                <Statistic 
                  title={<span style={{ color: '#708090', fontWeight: 'bold' }}>Token 消耗估算</span>} 
                  value={profile.tokenUsage} 
                  valueStyle={{ color: '#2D2D2D', fontWeight: 'bold' }} 
                />
              </div>
            </Col>
            <Col span={12}>
              <div style={{
                background: '#E2E2D5',
                padding: 16,
                border: '3px solid #2D2D2D',
                boxShadow: '4px 4px 0px 0px #2D2D2D'
              }}>
                <Statistic 
                  title={<span style={{ color: '#708090', fontWeight: 'bold' }}>近期决策成功率</span>} 
                  value={profile.successRate} 
                  suffix="%" 
                  valueStyle={{ color: '#2D2D2D', fontWeight: 'bold' }} 
                />
              </div>
            </Col>
          </Row>

          {/* Context / Memory Section */}
          <div>
            <Title level={4} style={{ color: '#2D2D2D' }}>上下文记忆 (Context Memory)</Title>
            <div style={{
              background: '#F5F5F0',
              border: '3px solid #2D2D2D',
              padding: 16,
              boxShadow: '4px 4px 0px 0px #2D2D2D'
            }}>
              {profile.memory.map((log, index) => (
                <div key={index} style={{ 
                  marginBottom: index === profile.memory.length - 1 ? 0 : 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13,
                  color: log.includes('[Alert]') ? '#cf1322' : '#2D2D2D',
                  borderBottom: index === profile.memory.length - 1 ? 'none' : '1px dashed #708090',
                  paddingBottom: index === profile.memory.length - 1 ? 0 : 8
                }}>
                  {log}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </Drawer>
  );
};

export default AgentInsightDrawer;
