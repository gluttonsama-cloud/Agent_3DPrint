import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Tag, Progress, Button, Space, message, Modal, Select, Form, Input, Drawer, Avatar } from 'antd';
import { RobotOutlined, UserOutlined, SendOutlined, ToolOutlined } from '@ant-design/icons';
import { getDevices, Device, updateDeviceStatus, completeDeviceTask, addDevice } from '../services/deviceService';
import { connect, disconnect, onDeviceProgress, DeviceProgressEvent } from '../services/websocketService';

const statusColors: Record<string, string> = {
  idle: 'green',
  printing: 'blue',
  offline: 'red',
  maintenance: 'orange',
};

const statusLabels: Record<string, string> = {
  idle: '空闲中',
  printing: '打印中',
  offline: '离线',
  maintenance: '维护中',
};

interface ChatMessage {
  role: 'ai' | 'user';
  content: React.ReactNode;
  action?: React.ReactNode;
}

const DeviceManagement: React.FC = () => {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [form] = Form.useForm();

  // AI Assistant State
  const [aiDrawerVisible, setAiDrawerVisible] = useState(false);
  const [currentDiagnosingDevice, setCurrentDiagnosingDevice] = useState<Device | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const data = await getDevices();
      setDevices(data);
    } catch (error) {
      message.error('获取设备列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    
    connect().catch(console.error);
    
    const unsubscribe = onDeviceProgress((event: DeviceProgressEvent) => {
      setDevices(prev => prev.map(d => 
        d.id === event.deviceId 
          ? { ...d, progress: event.progress, status: event.status as any }
          : d
      ));
      
      if (event.progress >= 100) {
        completeDeviceTask(event.deviceId)
          .then(() => {
            message.success(`设备 ${event.deviceId} 打印完成`);
            fetchDevices();
          })
          .catch(err => message.error('完成任务失败: ' + err.message));
      }
    });
    
    return () => {
      unsubscribe();
      disconnect();
    };
  }, []);

  const handleUpdateStatus = async () => {
    if (!selectedDevice || !newStatus) return;
    try {
      await updateDeviceStatus(selectedDevice.id, newStatus);
      message.success('状态更新成功');
      setStatusModalVisible(false);
      fetchDevices();
    } catch (error) {
      message.error('状态更新失败');
    }
  };

  const openStatusModal = (device: Device) => {
    setSelectedDevice(device);
    setNewStatus(device.status);
    setStatusModalVisible(true);
  };

  const handleAddDevice = async () => {
    try {
      const values = await form.validateFields();
      await addDevice(values);
      message.success('设备添加成功');
      setAddModalVisible(false);
      form.resetFields();
      fetchDevices();
    } catch (error) {
      if (error && (error as any).errorFields) {
        return;
      }
      message.error('设备添加失败');
    }
  };

  const handleViewTask = (device: Device) => {
    if (device.currentOrderId) {
      navigate(`/orders/${device.currentOrderId}`);
    } else {
      message.info('该设备当前没有正在执行的任务');
    }
  };

  const openAiDiagnosis = (device: Device) => {
    setCurrentDiagnosingDevice(device);
    setAiDrawerVisible(true);
    
    let initialMessage: React.ReactNode = '';
    let initialAction: React.ReactNode = undefined;

    if (device.status === 'offline') {
      initialMessage = (
        <div>
          <p>检测到设备 <strong>{device.name}</strong> 已离线。</p>
          <ul>
            <li><strong>最后心跳：</strong> 15 分钟前</li>
            <li><strong>可能原因：</strong> 网络连接中断或电源故障。</li>
            <li><strong>建议：</strong> 请检查车间 C 区的路由器状态，以及设备的电源插头。</li>
          </ul>
        </div>
      );
    } else if (device.status === 'maintenance') {
      initialMessage = (
        <div>
          <p>设备 <strong>{device.name}</strong> 正在维护中。我查阅了历史日志：</p>
          <ul>
            <li><strong>错误代码：</strong> E-042 (挤出机加热异常)</li>
            <li><strong>诊断：</strong> 热敏电阻可能松动或损坏。</li>
          </ul>
          <p>需要我为您生成维修领料单（加热棒 x1）吗？</p>
        </div>
      );
      initialAction = (
        <Button size="small" type="primary" onClick={() => handleMockAction('已为您生成领料单：REQ-20260305，请前往仓库领取。')}>
          生成领料单
        </Button>
      );
    } else if (device.status === 'printing') {
      initialMessage = `设备 ${device.name} 正在正常打印中。各项遥测数据（温度、振动、耗材余量）均在正常阈值范围内。预计还需要 2 小时完成当前任务。`;
    } else {
      initialMessage = `设备 ${device.name} 当前空闲，状态良好，随时可以接收新的打印任务。`;
    }

    setMessages([
      {
        role: 'ai',
        content: initialMessage,
        action: initialAction
      }
    ]);
  };

  const handleMockAction = (replyText: string) => {
    setMessages(prev => [
      ...prev,
      { role: 'ai', content: replyText }
    ]);
    message.success('操作已执行');
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');

    setTimeout(() => {
      if (userMsg.includes('维修') || userMsg.includes('坏了') || userMsg.includes('修')) {
        setMessages(prev => [
          ...prev,
          {
            role: 'ai',
            content: '好的，我已经记录了您的反馈。是否需要我将该设备的状态切换为"维护中"，并通知维修团队？',
            action: (
              <Button size="small" type="primary" danger onClick={() => {
                if (currentDiagnosingDevice) {
                  updateDeviceStatus(currentDiagnosingDevice.id, 'maintenance').then(() => {
                    fetchDevices();
                    handleMockAction('已将设备状态更新为"维护中"并发送了维修通知。');
                  });
                }
              }}>
                切换为维护状态
              </Button>
            )
          }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'ai', content: '收到。如果您在排查过程中发现任何硬件损坏，请随时告诉我，我可以帮您查询库存备件。' }
        ]);
      }
    }, 1000);
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>设备管理</h2>
        <Button type="primary" onClick={() => setAddModalVisible(true)}>添加设备</Button>
      </div>

      <Row gutter={[16, 16]}>
        {devices.map((device) => (
          <Col xs={24} sm={12} md={8} lg={6} key={device.id}>
            <Card
              title={device.name}
              extra={<Tag color={statusColors[device.status]}>{statusLabels[device.status]}</Tag>}
              actions={[
                <Button type="link" onClick={() => openStatusModal(device)}>更新状态</Button>,
                <Button type="link" onClick={() => handleViewTask(device)}>查看任务</Button>
              ]}
              styles={{ body: { padding: 0 } }}
            >
              {(device.status === 'offline' || device.status === 'maintenance') && (
                <div 
                  style={{ 
                    padding: '12px 16px', 
                    background: '#fff2e8', 
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ color: '#d4380d', fontWeight: 500, fontSize: '13px' }}>
                    <ToolOutlined style={{ marginRight: 6 }} />
                    设备异常，建议诊断
                  </span>
                  <Button 
                    size="small" 
                    onClick={() => openAiDiagnosis(device)} 
                    style={{ 
                      border: '1px solid #d4380d', 
                      color: '#d4380d',
                      background: '#fff',
                      fontWeight: 600,
                      borderRadius: '4px'
                    }}
                  >
                    AI 诊断
                  </Button>
                </div>
              )}
              <div style={{ padding: '24px' }}>
                <p><strong>设备 ID:</strong> {device.id}</p>
                <p><strong>类型:</strong> {device.type}</p>
                {device.status === 'printing' && (
                  <div>
                    <p><strong>当前订单:</strong> {device.currentOrderId}</p>
                    <Progress percent={device.progress} size="small" />
                  </div>
                )}
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Modal
        title="更新设备状态"
        open={statusModalVisible}
        onOk={handleUpdateStatus}
        onCancel={() => setStatusModalVisible(false)}
      >
        <div style={{ marginBottom: 16 }}>
          <span>当前设备: {selectedDevice?.name}</span>
        </div>
        <div>
          <span style={{ marginRight: 8 }}>新状态:</span>
          <Select value={newStatus} onChange={setNewStatus} style={{ width: 120 }}>
            {Object.entries(statusLabels).map(([key, label]) => (
              <Select.Option key={key} value={key}>{label}</Select.Option>
            ))}
          </Select>
        </div>
      </Modal>

      <Modal
        title="添加设备"
        open={addModalVisible}
        onOk={handleAddDevice}
        onCancel={() => {
          setAddModalVisible(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="deviceId" label="设备 ID" rules={[{ required: true, message: '请输入设备 ID' }]}>
            <Input placeholder="例如: PRINTER-005" />
          </Form.Item>
          <Form.Item name="type" label="设备类型" rules={[{ required: true, message: '请选择设备类型' }]}>
            <Select placeholder="请选择设备类型">
              <Select.Option value="fdm">FDM</Select.Option>
              <Select.Option value="sla">SLA</Select.Option>
              <Select.Option value="sls">SLS</Select.Option>
              <Select.Option value="mjf">MJF</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={<div style={{ fontWeight: 800, fontSize: '16px' }}><RobotOutlined /> AI 设备诊断助理 - {currentDiagnosingDevice?.name}</div>}
        placement="right"
        size="default"
        onClose={() => setAiDrawerVisible(false)}
        open={aiDrawerVisible}
        styles={{ 
          body: { display: 'flex', flexDirection: 'column', padding: 0 },
          header: { borderBottom: '1px solid #f0f0f0' }
        }}
      >
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
          {messages.map((msg, index) => (
            <div key={index} style={{ padding: '8px 0', display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ display: 'flex', gap: 12, maxWidth: '90%', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                <Avatar 
                  icon={msg.role === 'ai' ? <RobotOutlined /> : <UserOutlined />} 
                  style={{ 
                    backgroundColor: msg.role === 'ai' ? '#1890ff' : '#52c41a'
                  }} 
                />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: msg.role === 'user' ? '12px 0 12px 12px' : '0 12px 12px 12px',
                    backgroundColor: msg.role === 'user' ? '#1890ff' : '#f5f5f5',
                    color: msg.role === 'user' ? '#fff' : '#333',
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
        <div style={{ padding: '16px 24px', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input 
              placeholder="描述设备现象，例如：喷头堵塞了..." 
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onPressEnter={handleSendChat}
            />
            <Button 
              type="primary" 
              icon={<SendOutlined />} 
              onClick={handleSendChat} 
            />
          </div>
        </div>
      </Drawer>
    </div>
  );
};

export default DeviceManagement;
