import React from 'react';
import { Descriptions, Tag, Progress, Divider, Typography, Card, Alert } from 'antd';
import { AgentEvent } from '../../services/agentService';

const { Title, Text } = Typography;

interface DecisionPanelProps {
  event: AgentEvent | null;
}

const DecisionPanel: React.FC<DecisionPanelProps> = ({ event }) => {
  if (!event) {
    return <div style={{ textAlign: 'center', color: '#708090', padding: 60, fontSize: 16, fontWeight: 'bold' }}>点击时间线事件查看决策详情</div>;
  }

  const { details } = event;
  const isLLMDecision = details?.source === 'llm' || details?.source === 'llm_assisted' || details?.metadata?.source === 'llm_assisted';

  return (
    <div style={{ padding: 24 }}>
      {isLLMDecision && (
        <Alert
          message="LLM 辅助决策"
          description="此决策由 AI 大语言模型（七牛云 GLM-5/DeepSeek）生成，提供更智能的分析和建议"
          type="success"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      <Title level={4} style={{ marginTop: 0 }}>输入数据快照</Title>
      <Descriptions column={1} size="small" bordered style={{ marginBottom: 24 }}>
        {details?.inputs && Object.entries(details.inputs).map(([key, value]) => (
          <Descriptions.Item label={key} key={key}><strong>{String(value)}</strong></Descriptions.Item>
        ))}
        {(!details?.inputs || Object.keys(details.inputs).length === 0) && (
          <Descriptions.Item label="数据">无输入数据</Descriptions.Item>
        )}
      </Descriptions>

      <Title level={4}>匹配规则</Title>
      <div style={{ marginBottom: 24 }}>
        {details?.rules && details.rules.length > 0 ? (
          details.rules.map((rule: string, idx: number) => (
            <Tag color="#2D2D2D" key={idx} style={{ color: '#F5F5F0', padding: '4px 8px', fontSize: 14 }}>{rule}</Tag>
          ))
        ) : (
          <Text type="secondary">无规则匹配（LLM 直接决策）</Text>
        )}
      </div>

      <Title level={4}>置信度评分</Title>
      <div style={{ marginBottom: 24 }}>
        <Progress 
          percent={Math.round((details?.confidence || 0) * 100)} 
          strokeColor="#708090" 
          railColor="#E2E2D5"
          size={["100%", 12]}
          format={(percent) => `${percent}% ${isLLMDecision ? '(AI 生成)' : ''}`}
        />
      </div>

      {details?.llmEvaluation && (
        <>
          <Title level={4}>LLM 评估</Title>
          <Card size="small" style={{ marginBottom: 24, borderColor: '#708090' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="是否同意算法">{details.llmEvaluation.agree ? '✓ 同意' : '✗ 有不同建议'}</Descriptions.Item>
              {details.llmEvaluation.suggestedDeviceId && (
                <Descriptions.Item label="LLM 建议设备">{details.llmEvaluation.suggestedDeviceId}</Descriptions.Item>
              )}
              {details.llmEvaluation.topPriorityMaterial && (
                <Descriptions.Item label="LLM 建议优先补货">{details.llmEvaluation.topPriorityMaterial}</Descriptions.Item>
              )}
              <Descriptions.Item label="LLM 置信度">{Math.round(details.llmEvaluation.confidence * 100)}%</Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      )}

      <Title level={4}>决策解释</Title>
      <div style={{ 
        background: '#F5F5F0', 
        padding: 16, 
        border: '3px solid #2D2D2D',
        boxShadow: '4px 4px 0px 0px #2D2D2D',
        fontSize: 16,
        fontWeight: 500
      }}>
        {details?.explanation || details?.rationale || '无决策解释'}
      </div>

      {details?.llmResponse && (
        <>
          <Title level={5} style={{ marginTop: 24 }}>LLM 原始响应</Title>
          <pre style={{ 
            background: '#1a1a1a', 
            color: '#f0f0f0', 
            padding: 16, 
            borderRadius: 8,
            fontSize: 12,
            overflow: 'auto',
            maxHeight: 300
          }}>
            {details.llmResponse}
          </pre>
        </>
      )}
    </div>
  );
};

export default DecisionPanel;
