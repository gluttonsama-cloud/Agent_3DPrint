import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Space, Form, Select, DatePicker, Input, message, Modal } from 'antd';
import { EyeOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getOrders, Order, bulkUpdateOrderStatus } from '../services/orderService';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

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

const OrderList: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  const fetchOrders = async (values?: any) => {
    setLoading(true);
    try {
      const res = await getOrders({ ...pagination, ...values });
      setOrders(res.items || []);
      setTotal(res.total || 0);
    } catch (error) {
      message.error('获取订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [pagination.current, pagination.pageSize]);

  const handleSearch = (values: any) => {
    setPagination({ ...pagination, current: 1 });
    fetchOrders(values);
  };

  const handleBulkAction = async (action: 'approve' | 'cancel') => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择订单');
      return;
    }
    Modal.confirm({
      title: `确认批量${action === 'approve' ? '审核' : '取消'}?`,
      content: `已选择 ${selectedRowKeys.length} 个订单`,
      onOk: async () => {
        try {
          await bulkUpdateOrderStatus(selectedRowKeys as string[], action === 'approve' ? 'scheduled' : 'cancelled');
          message.success('操作成功');
          setSelectedRowKeys([]);
          fetchOrders(form.getFieldsValue());
        } catch (error) {
          message.error('操作失败');
        }
      },
    });
  };

  const columns = [
    { title: '订单 ID', dataIndex: 'id', key: 'id' },
    { title: '用户', dataIndex: 'userId', key: 'userId' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>,
    },
    { title: '设备', dataIndex: 'deviceId', key: 'deviceId', render: (text: string) => text || '-' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss') },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Order) => (
        <Space size="middle">
          <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/orders/${record.id}`)}>查看</Button>
          {record.status === 'pending_review' && (
            <>
              <Button type="link" icon={<CheckCircleOutlined />} style={{ color: 'green' }}>审核</Button>
              <Button type="link" icon={<CloseCircleOutlined />} danger>取消</Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Form form={form} layout="inline" onFinish={handleSearch}>
          <Form.Item name="status" label="状态">
            <Select placeholder="选择状态" style={{ width: 120 }} allowClear>
              {Object.entries(statusLabels).map(([key, label]) => (
                <Select.Option key={key} value={key}>{label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="dateRange" label="日期">
            <RangePicker />
          </Form.Item>
          <Form.Item name="search" label="搜索">
            <Input placeholder="订单 ID / 用户" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">查询</Button>
          </Form.Item>
        </Form>
        <Space>
          <Button onClick={() => handleBulkAction('approve')}>批量审核</Button>
          <Button danger onClick={() => handleBulkAction('cancel')}>批量取消</Button>
        </Space>
      </div>
      <Table
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        columns={columns}
        dataSource={orders}
        rowKey="id"
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
        }}
      />
    </div>
  );
};

export default OrderList;
