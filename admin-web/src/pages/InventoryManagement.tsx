import React, { useState, useEffect } from 'react';
import { Table, Tag, Progress, Button, Space, message, Modal, InputNumber, Form, Input } from 'antd';
import { PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { getMaterials, Material, updateMaterialQuantity, addMaterial } from '../services/inventoryService';

const statusColors: Record<string, string> = {
  normal: 'green',
  low: 'orange',
  out_of_stock: 'red',
};

const statusLabels: Record<string, string> = {
  normal: '正常',
  low: '库存不足',
  out_of_stock: '缺货',
};

const InventoryManagement: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [quantityChange, setQuantityChange] = useState<number | null>(0);
  const [form] = Form.useForm();

  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const data = await getMaterials();
      setMaterials(data);
    } catch (error) {
      message.error('获取库存列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  const handleUpdateQuantity = async () => {
    if (!selectedMaterial || quantityChange === null) return;
    try {
      // API 期望增量值，直接传递 quantityChange
      await updateMaterialQuantity(selectedMaterial.id, quantityChange);
      message.success('库存更新成功');
      setUpdateModalVisible(false);
      fetchMaterials();
    } catch (error) {
      message.error('库存更新失败');
    }
  };

  const openUpdateModal = (material: Material) => {
    setSelectedMaterial(material);
    setQuantityChange(0);
    setUpdateModalVisible(true);
  };

  const handleAddMaterial = async () => {
    try {
      const values = await form.validateFields();
      await addMaterial(values);
      message.success('材料添加成功');
      setAddModalVisible(false);
      form.resetFields();
      fetchMaterials();
    } catch (error) {
      // Form validation error or API error
      if (error && (error as any).errorFields) {
        return;
      }
      message.error('材料添加失败');
    }
  };

  const columns = [
    { title: '材料 ID', dataIndex: 'id', key: 'id' },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'type', key: 'type' },
    { title: '颜色', dataIndex: 'color', key: 'color' },
    {
      title: '库存量',
      key: 'quantity',
      render: (_: any, record: Material) => {
        const percent = Math.min(100, (record.quantity / (record.threshold * 3)) * 100);
        return (
          <div style={{ width: 150 }}>
            <Progress
              percent={percent}
              showInfo={false}
              status={record.status === 'out_of_stock' ? 'exception' : record.status === 'low' ? 'active' : 'normal'}
              strokeColor={record.status === 'low' ? '#faad14' : undefined}
            />
            <div style={{ fontSize: 12, color: record.status !== 'normal' ? 'red' : 'inherit' }}>
              {record.quantity} {record.unit} {record.status !== 'normal' && `(阈值: ${record.threshold})`}
            </div>
          </div>
        );
      },
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: Material) => (
        <Tag color={statusColors[record.status]}>{statusLabels[record.status]}</Tag>
      ),
    },
    {
      title: '补货建议',
      dataIndex: 'suggestion',
      key: 'suggestion',
      render: (text: string) => text ? <span style={{ color: '#faad14' }}>{text}</span> : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Material) => (
        <Space size="middle">
          <Button type="link" onClick={() => openUpdateModal(record)}>更新库存</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h2>库存管理</h2>
        <Button type="primary" onClick={() => setAddModalVisible(true)}>添加材料</Button>
      </div>

      <Table
        columns={columns}
        dataSource={materials}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title="更新库存"
        open={updateModalVisible}
        onOk={handleUpdateQuantity}
        onCancel={() => setUpdateModalVisible(false)}
      >
        <div style={{ marginBottom: 16 }}>
          <span>当前材料: {selectedMaterial?.name}</span>
          <br />
          <span>当前库存: {selectedMaterial?.quantity} {selectedMaterial?.unit}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>增减数量:</span>
          <Space.Compact>
            <Button icon={<MinusOutlined />} onClick={() => setQuantityChange((prev) => (prev || 0) - 100)} />
            <InputNumber
              value={quantityChange}
              onChange={(val) => setQuantityChange(val)}
              style={{ width: 120, textAlign: 'center' }}
            />
            <Button icon={<PlusOutlined />} onClick={() => setQuantityChange((prev) => (prev || 0) + 100)} />
          </Space.Compact>
          <span>{selectedMaterial?.unit}</span>
        </div>
        <div style={{ marginTop: 16, color: '#999' }}>
          更新后库存: {(selectedMaterial?.quantity || 0) + (quantityChange || 0)} {selectedMaterial?.unit}
        </div>
      </Modal>

      <Modal
        title="添加材料"
        open={addModalVisible}
        onOk={handleAddMaterial}
        onCancel={() => {
          setAddModalVisible(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="材料名称" rules={[{ required: true, message: '请输入材料名称' }]}>
            <Input placeholder="例如: PLA 白色" />
          </Form.Item>
          <Form.Item name="type" label="材料类型" rules={[{ required: true, message: '请输入材料类型' }]}>
            <Input placeholder="例如: PLA, ABS, PETG" />
          </Form.Item>
          <Form.Item name="color" label="颜色" rules={[{ required: true, message: '请输入颜色' }]}>
            <Input placeholder="例如: White, Black, Red" />
          </Form.Item>
          <Form.Item name="quantity" label="初始库存数量" rules={[{ required: true, message: '请输入初始数量' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unit" label="单位" initialValue="g" rules={[{ required: true, message: '请输入单位' }]}>
            <Input placeholder="例如: g, kg, 卷" />
          </Form.Item>
          <Form.Item name="threshold" label="库存预警阈值" rules={[{ required: true, message: '请输入预警阈值' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default InventoryManagement;
