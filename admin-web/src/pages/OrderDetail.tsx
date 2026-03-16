import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Descriptions, Timeline, Button, Space, Tag, Modal, Input, message, Row, Col, Upload, Progress, Drawer, Avatar } from 'antd';
import { ArrowLeftOutlined, UploadOutlined, DeleteOutlined, ReloadOutlined, RobotOutlined, UserOutlined, SendOutlined } from '@ant-design/icons';
import ModelViewer from '../components/ModelViewer';
import dayjs from 'dayjs';
import { getOrders, updateOrderStatus } from '../services/orderService';

const statusColors: Record<string, string> = {
  pending_review: 'orange',
  reviewing: 'blue',
  scheduled: 'cyan',
  printing: 'purple',
  completed: 'green',
  cancelled: 'red',
};

const statusLabels: Record<string, string> = {
  pending_review: '待审核',
  reviewing: '审核中',
  scheduled: '已排期',
  printing: '打印中',
  completed: '已完成',
  cancelled: '已取消',
};

interface FileInfo {
  name: string;
  size: number;
  url: string;
  uid: string;
}

interface ChatMessage {
  role: 'ai' | 'user';
  content: React.ReactNode;
  action?: React.ReactNode;
}

const OrderDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [auditModalVisible, setAuditModalVisible] = useState(false);
  const [auditNotes, setAuditNotes] = useState('');
  const [auditAction, setAuditAction] = useState<'approve' | 'reject'>('approve');
  
  const [modelFile, setModelFile] = useState<FileInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // AI Copilot State
  const [aiDrawerVisible, setAiDrawerVisible] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => {
      setOrder({
        id,
        userId: 'user1',
        status: 'pending_review',
        createdAt: '2026-03-04T10:00:00Z',
        parameters: { material: 'PLA', color: 'White', infill: '20%' },
        timeline: [
          { status: 'pending_review', time: '2026-03-04T10:00:00Z', note: '订单已提交' },
        ],
        agentDecisions: [
          { agent: 'Coordinator', time: '2026-03-04T10:00:05Z', decision: '分配给审核 Agent' }
        ]
      });
      setLoading(false);
    }, 500);
  }, [id]);

  useEffect(() => {
    if (aiDrawerVisible && messages.length === 0 && order) {
      setMessages([
        {
          role: 'ai',
          content: (
            <div>
              <p>您好！我是您的 AI 审核助手。我已经对该订单的 3D 模型进行了初步分析：</p>
              <ul>
                <li><strong>拓扑结构：</strong> 存在两处悬垂角度 &gt; 45°，需要添加支撑。</li>
                <li><strong>预估时间：</strong> 约 4 小时 15 分钟。</li>
                <li><strong>材料消耗：</strong> 约 120g PLA。</li>
                <li><strong style={{ color: 'orange' }}>风险提示：</strong> 当前填充率 20% 对于该模型可能过高，建议降低至 15% 以节省时间和材料。</li>
              </ul>
            </div>
          ),
          action: (
            <Button size="small" type="primary" onClick={() => handleApplySuggestion('15%')}>
              采纳建议：修改填充率为 15%
            </Button>
          )
        }
      ]);
    }
  }, [aiDrawerVisible, order]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileChange = async (info: any) => {
    const { file } = info;
    
    const allowedTypes = ['.stl', '.obj', '.3mf'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      message.error('不支持的文件格式，请上传 .stl, .obj 或 .3mf 文件');
      return;
    }
    
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      message.error('文件大小超过 50MB 限制');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          setUploadProgress((prev) => {
            if (prev >= 100) {
              clearInterval(interval);
              resolve();
              return 100;
            }
            return prev + 10;
          });
        }, 200);
      });

      const fileUrl = URL.createObjectURL(file.originFileObj || file);
      
      setModelFile({
        name: file.name,
        size: file.size,
        url: fileUrl,
        uid: file.uid,
      });
      
      message.success('文件上传成功');
    } catch (error) {
      message.error('文件上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleReupload = () => {
    setModelFile(null);
    setUploadProgress(0);
  };

  const handleDelete = () => {
    Modal.confirm({
      title: '确认删除模型文件？',
      content: '删除后将无法恢复',
      onOk: () => {
        if (modelFile) {
          URL.revokeObjectURL(modelFile.url);
        }
        setModelFile(null);
        setUploadProgress(0);
        message.success('文件已删除');
      },
    });
  };

  const handleAudit = async () => {
    try {
      const newStatus = auditAction === 'approve' ? 'scheduled' : 'cancelled';
      await updateOrderStatus(id as string, newStatus, auditNotes);
      message.success('审核操作成功');
      setAuditModalVisible(false);
      setOrder({ ...order, status: newStatus });
    } catch (error) {
      message.error('审核操作失败');
    }
  };

  const handleApplySuggestion = (newInfill: string) => {
    setOrder((prev: any) => ({
      ...prev,
      parameters: { ...prev.parameters, infill: newInfill }
    }));
    setMessages(prev => [
      ...prev,
      { role: 'ai', content: `已为您将填充率修改为 ${newInfill}，并重新计算了打印时间（约 3 小时 40 分钟）。` }
    ]);
    message.success('参数已更新');
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');

    setTimeout(() => {
      if (userMsg.includes('填充') || userMsg.includes('infill')) {
        setMessages(prev => [
          ...prev,
          {
            role: 'ai',
            content: '好的，我已经分析了您的要求。建议将填充率调整为 10%。',
            action: <Button size="small" type="primary" onClick={() => handleApplySuggestion('10%')}>修改填充率为 10%</Button>
          }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'ai', content: '收到您的指示。如果您需要调整任何打印参数，请随时告诉我。' }
        ]);
      }
    }, 1000);
  };

  if (loading) return <div>加载中...</div>;
  if (!order) return <div>订单不存在</div>;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          <h2 style={{ margin: 0 }}>订单详情 - {order.id}</h2>
          <Tag color={statusColors[order.status]}>{statusLabels[order.status]}</Tag>
        </div>
        <Button type="primary" icon={<RobotOutlined />} onClick={() => setAiDrawerVisible(true)}>
          AI 审核助手
        </Button>
      </div>

      <Row gutter={24}>
        <Col span={16}>
          <Card title="订单信息" style={{ marginBottom: 24 }}>
            <Descriptions column={2}>
              <Descriptions.Item label="用户 ID">{order.userId}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{dayjs(order.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              <Descriptions.Item label="材料">{order.parameters.material}</Descriptions.Item>
              <Descriptions.Item label="颜色">{order.parameters.color}</Descriptions.Item>
              <Descriptions.Item label="填充率">{order.parameters.infill}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="3D 模型预览" style={{ marginBottom: 24 }}>
            {!modelFile ? (
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <Upload
                  accept=".stl,.obj,.3mf"
                  showUploadList={false}
                  beforeUpload={() => false}
                  onChange={handleFileChange}
                  disabled={uploading}
                >
                  <Button type="primary" icon={<UploadOutlined />} size="large">
                    上传 3D 模型文件
                  </Button>
                </Upload>
                <div style={{ marginTop: 16, color: '#999', fontSize: '14px' }}>
                  支持格式：.stl, .obj, .3mf（最大 50MB）
                </div>
              </div>
            ) : (
              <div>
                <ModelViewer
                  modelUrl={modelFile.url}
                  height="400px"
                  autoRotate={true}
                  showGrid={true}
                  backgroundColor="#f5f5f5"
                  onProgress={(progress) => setUploadProgress(Math.round(progress * 100))}
                  onLoad={() => console.log('模型加载完成')}
                  onError={(error) => message.error(`模型加载失败：${error.message}`)}
                />
                
                <div style={{ marginTop: 16, padding: '12px', background: '#f9f9f9', borderRadius: '4px' }}>
                  <div style={{ marginBottom: 8 }}>
                    <strong>文件名：</strong>{modelFile.name}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>大小：</strong>{(modelFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                  
                  {uploading && (
                    <div style={{ marginBottom: 12 }}>
                      <Progress percent={uploadProgress} size="small" />
                    </div>
                  )}
                  
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={handleReupload}>
                      重新上传
                    </Button>
                    <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
                      删除
                    </Button>
                  </Space>
                </div>
              </div>
            )}
          </Card>
        </Col>

        <Col span={8}>
          <Card title="状态时间线" style={{ marginBottom: 24 }}>
            <Timeline
              items={order.timeline.map((t: any) => ({
                color: statusColors[t.status],
                content: (
                  <>
                    <div><strong>{statusLabels[t.status]}</strong></div>
                    <div style={{ fontSize: 12, color: '#999' }}>{dayjs(t.time).format('YYYY-MM-DD HH:mm:ss')}</div>
                    <div>{t.note}</div>
                  </>
                ),
              }))}
            />
          </Card>

          <Card title="Agent 决策历史" style={{ marginBottom: 24 }}>
            <Timeline
              items={order.agentDecisions.map((d: any) => ({
                color: 'purple',
                content: (
                  <>
                    <div><strong>{d.agent}</strong></div>
                    <div style={{ fontSize: 12, color: '#999' }}>{dayjs(d.time).format('YYYY-MM-DD HH:mm:ss')}</div>
                    <div>{d.decision}</div>
                  </>
                ),
              }))}
            />
          </Card>

          {order.status === 'pending_review' && (
            <Card title="审核操作">
              <Space>
                <Button type="primary" onClick={() => { setAuditAction('approve'); setAuditModalVisible(true); }}>通过排期</Button>
                <Button danger onClick={() => { setAuditAction('reject'); setAuditModalVisible(true); }}>拒绝取消</Button>
              </Space>
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        title={auditAction === 'approve' ? '审核通过' : '审核拒绝'}
        open={auditModalVisible}
        onOk={handleAudit}
        onCancel={() => setAuditModalVisible(false)}
      >
        <Input.TextArea
          rows={4}
          placeholder="请输入审核备注（可选）"
          value={auditNotes}
          onChange={(e) => setAuditNotes(e.target.value)}
        />
      </Modal>

      <Drawer
        title={<div style={{ fontWeight: 800, fontSize: '16px' }}><RobotOutlined /> AI 审核助手</div>}
        placement="right"
        size="default"
        onClose={() => setAiDrawerVisible(false)}
        open={aiDrawerVisible}
        styles={{ 
          body: { display: 'flex', flexDirection: 'column', padding: 0, background: '#e4e3e0' },
          header: { borderBottom: '2px solid #141414', background: '#e4e3e0' }
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
          {messages.map((msg, index) => (
            <div key={index} style={{ padding: '8px 0', display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ display: 'flex', gap: 12, maxWidth: '90%', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                <Avatar 
                  icon={msg.role === 'ai' ? <RobotOutlined /> : <UserOutlined />} 
                  style={{ 
                    backgroundColor: msg.role === 'ai' ? '#fff' : '#141414',
                    color: msg.role === 'ai' ? '#141414' : '#fff',
                    border: '2px solid #141414',
                    borderRadius: '8px'
                  }} 
                />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: msg.role === 'user' ? '12px 0 12px 12px' : '0 12px 12px 12px',
                    backgroundColor: msg.role === 'user' ? '#141414' : '#fff',
                    color: msg.role === 'user' ? '#fff' : '#141414',
                    border: '2px solid #141414',
                    boxShadow: '4px 4px 0px rgba(20,20,20,1)',
                    wordBreak: 'break-word',
                    fontSize: '14px',
                    lineHeight: '1.6'
                  }}>
                    {msg.content}
                  </div>
                  {msg.action && <div style={{ marginTop: 12 }}>{msg.action}</div>}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div style={{ padding: '16px 24px', background: '#e4e3e0', borderTop: '2px solid #141414' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input 
              placeholder="输入指令，例如：降低填充率..." 
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onPressEnter={handleSendChat}
              style={{ border: '2px solid #141414', borderRadius: '8px', padding: '8px 12px' }}
            />
            <Button 
              type="primary" 
              icon={<SendOutlined />} 
              onClick={handleSendChat} 
              style={{ border: '2px solid #141414', borderRadius: '8px', height: 'auto', boxShadow: '2px 2px 0 #141414' }}
            />
          </div>
        </div>
      </Drawer>
    </div>
  );
};

export default OrderDetail;
