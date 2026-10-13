import React from 'react';
import { Descriptions, Tag, Progress, Typography, Card, Alert } from 'antd';
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
  const isLLMDecision = !!(details?.source === 'llm' || details?.source === 'llm_assisted' || details?.source === 'qiniu_glm5' || details?.llmResponse);

  return (
    <div style={{ padding: 24 }}>
      {isLLMDecision && (
        <Alert
          message="LLM 实时决策"
          description="此决策由大语言模型实时生成（非硬编码）。Agent 基于当前状态、历史数据和业务规则进行深度推理。"
          type="success"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 通信协议区块 */}
      {details?.protocol && (
        <>
          <Title level={4} style={{ marginTop: 0 }}>通信协议 (Protocol)</Title>
          <Card size="small" style={{ marginBottom: 24, background: '#F0F4F8', border: '2px solid #2D2D2D', boxShadow: '4px 4px 0px 0px #2D2D2D' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="消息 ID"><Text code>{details.protocol.messageId}</Text></Descriptions.Item>
              <Descriptions.Item label="类型"><Tag color="purple">{details.protocol.type}</Tag></Descriptions.Item>
              <Descriptions.Item label="路由">{details.protocol.from} → {details.protocol.to}</Descriptions.Item>
              <Descriptions.Item label="优先级"><Tag color={details.protocol.priority === 'high' ? 'red' : 'blue'}>{details.protocol.priority}</Tag></Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      )}

      {/* 算法评分区块 */}
      {details?.scores && (
        <>
          <Title level={4}>调度算法评分 (Scoring)</Title>
          <div style={{ marginBottom: 24, padding: 16, background: '#FCFCFA', border: '2px solid #2D2D2D', boxShadow: '4px 4px 0px 0px #2D2D2D' }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>负载均衡 (Load)</Text>
                <Text strong>{(details.scores.load * 100).toFixed(0)}分</Text>
              </div>
              <Progress percent={details.scores.load * 100} strokeColor="#708090" size="small" showInfo={false} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>预计耗时 (Time)</Text>
                <Text strong>{(details.scores.time * 100).toFixed(0)}分</Text>
              </div>
              <Progress percent={details.scores.time * 100} strokeColor="#708090" size="small" showInfo={false} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>打印质量 (Quality)</Text>
                <Text strong>{(details.scores.quality * 100).toFixed(0)}分</Text>
              </div>
              <Progress percent={details.scores.quality * 100} strokeColor="#708090" size="small" showInfo={false} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text>经济平衡 (Cost)</Text>
                <Text strong>{(details.scores.cost * 100).toFixed(0)}分</Text>
            </div>
            <Progress percent={details.scores.cost * 100} strokeColor="#708090" size="small" showInfo={false} />
          </div>
        </>
      )}

      {/* 库存预测区块 */}
      {details?.forecast && (
        <>
          <Title level={4}>库存趋势预测 (Forecast)</Title>
          <Card size="small" style={{ marginBottom: 24, background: '#FFF7E6', border: '2px solid #FAAD14', boxShadow: '4px 4px 0px 0px #FAAD14' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="预测周期">未来 7 天</Descriptions.Item>
              <Descriptions.Item label="预计总消耗">{details.forecast.predictedConsumption.toFixed(1)}g</Descriptions.Item>
              <Descriptions.Item label="预测信心">
                <Progress percent={Math.round(details.forecast.confidence * 100)} size="small" strokeColor="#FAAD14" />
              </Descriptions.Item>
              <Descriptions.Item label="趋势模型">{details.forecast.method || '线性回归'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      )}

      {/* 规则引擎区块 */}
      {details?.rules && (
        <>
          <Title level={4}>规则引擎评估 (Rules)</Title>
          <div style={{ marginBottom: 24 }}>
            {details.rules.map((rule: any, idx: number) => (
              <div key={idx} style={{ marginBottom: 16, borderLeft: '4px solid #2D2D2D', paddingLeft: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>{rule.name}</Text>
                  <Tag color={rule.result === 'REJECT' ? 'red' : 'green'}>{rule.result}</Tag>
                </div>
                <Text type="secondary" style={{ fontSize: 13 }}>{rule.rationale}</Text>
              </div>
            ))}
          </div>
        </>
      )}

      <Title level={4}>决策解释与判定</Title>
      <div style={{ 
        background: '#F5F5F0', 
        padding: 16, 
        border: '3px solid #2D2D2D',
        boxShadow: '4px 4px 0px 0px #2D2D2D',
        fontSize: 15,
        fontWeight: 500,
        marginBottom: 24
      }}>
        {details?.explanation || details?.rationale || '无决策解释'}
      </div>

      {details?.confidence !== undefined && (
        <div style={{ marginBottom: 24 }}>
          <Text strong>决策置信度 (Confidence)</Text>
          <Progress 
            percent={Math.round(details.confidence * 100)} 
            strokeColor="#2D2D2D" 
            railColor="#E2E2D5"
          />
        </div>
      )}

      {details?.llmResponse && (
        <>
          <Title level={5} style={{ marginTop: 24 }}>LLM 原始决策 Trace (Matrix Mode)</Title>
          <pre style={{ 
            background: '#0D0D0D', 
            color: '#00FF41', 
            padding: 16, 
            borderRadius: 4,
            fontSize: 11,
            overflow: 'auto',
            maxHeight: 300,
            fontFamily: 'Consolas, "Courier New", monospace',
            border: '2px solid #00FF41',
            boxShadow: '0 0 10px rgba(0, 255, 65, 0.2)'
          }}>
            {details.llmResponse}
          </pre>
        </>
      )}
    </div>
  );
};

export default DecisionPanel;
