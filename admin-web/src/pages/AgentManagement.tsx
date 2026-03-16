import React, { useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const { Title } = Typography;
const { TextArea } = Input;

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'inactive' | 'error';
  capabilities: string[];
  systemPrompt: string;
}

const initialAgents: Agent[] = [
  {
    id: 'coordinator',
    name: '协调 Agent',
    role: 'System Orchestrator',
    status: 'active',
    capabilities: ['Order Routing', 'Global State Management', 'Error Handling'],
    systemPrompt: 'You are the Coordinator Agent for a 3D printing farm. Your primary responsibility is to receive incoming orders, validate their parameters, and route them to the appropriate specialized agents (Scheduler or Inventory).',
  },
  {
    id: 'scheduler',
    name: '调度 Agent',
    role: 'Resource Allocator',
    status: 'active',
    capabilities: ['Printer Assignment', 'Time Estimation', 'Queue Management'],
    systemPrompt: 'You are the Scheduler Agent. Your job is to assign 3D printing tasks to the most optimal available printer based on material compatibility and availability.',
  },
  {
    id: 'inventory',
    name: '库存 Agent',
    role: 'Material Manager',
    status: 'active',
    capabilities: ['Stock Tracking', 'Procurement Alerts', 'Material Deduction'],
    systemPrompt: 'You are the Inventory Agent. You manage the stock levels of all 3D printing filaments. Deduct stock when a print starts and alert the Coordinator if stock falls below the 20% threshold.',
  },
];

const AgentManagement: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [form] = Form.useForm();

  const columns = [
    {
      title: 'Agent 名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <strong style={{ color: '#2D2D2D' }}>{text}</strong>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        let color = status === 'active' ? '#52c41a' : status === 'error' ? '#f5222d' : '#d9d9d9';
        return <Tag color={color} style={{ borderRadius: 0, border: '2px solid #2D2D2D', color: '#2D2D2D', fontWeight: 'bold' }}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: '能力 (Capabilities)',
      dataIndex: 'capabilities',
      key: 'capabilities',
      render: (capabilities: string[]) => (
        <>
          {capabilities.map(cap => (
            <Tag key={cap} style={{ borderRadius: 0, border: '1px solid #2D2D2D', background: '#F5F5F0', color: '#2D2D2D', marginBottom: 4 }}>
              {cap}
            </Tag>
          ))}
        </>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Agent) => (
        <Space size="middle">
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
            style={{ color: '#708090', fontWeight: 'bold' }}
          >
            编辑
          </Button>
          <Button 
            type="text" 
            danger 
            icon={<DeleteOutlined />} 
            onClick={() => handleDelete(record.id)}
            style={{ fontWeight: 'bold' }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const handleAdd = () => {
    setEditingAgent(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: Agent) => {
    setEditingAgent(record);
    form.setFieldsValue({
      ...record,
      capabilities: record.capabilities.join(', '),
    });
    setIsModalVisible(true);
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '您确定要删除这个 Agent 吗？此操作不可逆。',
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        setAgents(agents.filter(a => a.id !== id));
        message.success('Agent 已删除');
      },
      className: 'brutalist-modal',
    });
  };

  const handleModalOk = () => {
    form.validateFields().then(values => {
      const newAgent: Agent = {
        id: editingAgent ? editingAgent.id : `agent_${Date.now()}`,
        name: values.name,
        role: values.role,
        status: values.status,
        capabilities: values.capabilities.split(',').map((s: string) => s.trim()).filter((s: string) => s),
        systemPrompt: values.systemPrompt,
      };

      if (editingAgent) {
        setAgents(agents.map(a => a.id === editingAgent.id ? newAgent : a));
        message.success('Agent 已更新');
      } else {
        setAgents([...agents, newAgent]);
        message.success('Agent 已添加');
      }
      setIsModalVisible(false);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2} style={{ margin: 0, color: '#2D2D2D' }}>Agent 管理</Title>
          <Typography.Text type="secondary" style={{ color: '#708090' }}>
            管理多智能体系统中的各个 Agent 角色及其配置
          </Typography.Text>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={handleAdd}
          style={{ background: '#708090', borderColor: '#2D2D2D', color: '#F5F5F0', fontWeight: 'bold' }}
        >
          添加 Agent
        </Button>
      </div>

      <Table 
        columns={columns} 
        dataSource={agents} 
        rowKey="id" 
        pagination={false}
      />

      <Modal
        title={<span style={{ fontWeight: 'bold', fontSize: 18, color: '#2D2D2D' }}>{editingAgent ? '编辑 Agent' : '添加 Agent'}</span>}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={600}
        className="brutalist-modal"
        okButtonProps={{ style: { background: '#708090', borderColor: '#2D2D2D', color: '#F5F5F0', fontWeight: 'bold', borderRadius: 0, boxShadow: '2px 2px 0px 0px #2D2D2D' } }}
        cancelButtonProps={{ style: { borderColor: '#2D2D2D', color: '#2D2D2D', fontWeight: 'bold', borderRadius: 0, boxShadow: '2px 2px 0px 0px #2D2D2D' } }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item name="name" label={<span style={{ fontWeight: 'bold', color: '#2D2D2D' }}>Agent 名称</span>} rules={[{ required: true, message: '请输入 Agent 名称' }]}>
            <Input style={{ border: '2px solid #2D2D2D', borderRadius: 0 }} placeholder="例如：质检 Agent" />
          </Form.Item>
          <Form.Item name="role" label={<span style={{ fontWeight: 'bold', color: '#2D2D2D' }}>角色描述</span>} rules={[{ required: true, message: '请输入角色描述' }]}>
            <Input style={{ border: '2px solid #2D2D2D', borderRadius: 0 }} placeholder="例如：Quality Inspector" />
          </Form.Item>
          <Form.Item name="status" label={<span style={{ fontWeight: 'bold', color: '#2D2D2D' }}>状态</span>} initialValue="active">
            <Select style={{ borderRadius: 0 }}>
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="inactive">Inactive</Select.Option>
              <Select.Option value="error">Error</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="capabilities" label={<span style={{ fontWeight: 'bold', color: '#2D2D2D' }}>能力 (用逗号分隔)</span>} rules={[{ required: true, message: '请输入至少一项能力' }]}>
            <Input style={{ border: '2px solid #2D2D2D', borderRadius: 0 }} placeholder="例如：Image Analysis, Defect Detection" />
          </Form.Item>
          <Form.Item name="systemPrompt" label={<span style={{ fontWeight: 'bold', color: '#2D2D2D' }}>System Prompt</span>} rules={[{ required: true, message: '请输入 System Prompt' }]}>
            <TextArea 
              rows={4} 
              style={{ border: '2px solid #2D2D2D', borderRadius: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }} 
              placeholder="You are the Quality Inspector Agent..." 
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AgentManagement;
