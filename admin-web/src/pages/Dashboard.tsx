import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic } from 'antd';
import { ShoppingCartOutlined, ClockCircleOutlined, PrinterOutlined, CheckCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { getDashboardStats, getDeviceTimeline, getDeviceUtilization, getInventoryPrediction } from '../services/dashboardService';
import type { DeviceTimeline } from '../services/dashboardService';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<any>({});
  const [deviceTimeline, setDeviceTimeline] = useState<DeviceTimeline>({ devices: [], timeRange: { start: '', end: '' } });
  const [deviceUtil, setDeviceUtil] = useState<any>({});
  const [inventoryRadar, setInventoryRadar] = useState<any>({});

  useEffect(() => {
    const fetchData = async () => {
      const [s, dt, du, ir] = await Promise.all([
        getDashboardStats(),
        getDeviceTimeline(),
        getDeviceUtilization(),
        getInventoryPrediction(),
      ]);
      setStats(s);
      setDeviceTimeline(dt);
      setDeviceUtil(du);
      setInventoryRadar(ir);
    };
    fetchData();
  }, []);

  // Gantt chart for device timeline
  const deviceTimelineOption = {
    title: { text: '设备时间线' },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const { name, value } = params;
        const [start, end] = value;
        const startStr = new Date(start).toLocaleString('zh-CN');
        const endStr = new Date(end).toLocaleString('zh-CN');
        return `${name}<br/>开始: ${startStr}<br/>结束: ${endStr}`;
      }
    },
    grid: { left: '15%', right: '5%', top: '15%', bottom: '15%' },
    xAxis: {
      type: 'time',
      name: '时间',
      min: deviceTimeline.timeRange.start || undefined,
      max: deviceTimeline.timeRange.end || undefined,
    },
    yAxis: {
      type: 'category',
      data: deviceTimeline.devices.map(d => d.name),
      inverse: true,
    },
    series: deviceTimeline.devices.map((device, idx) => ({
      type: 'custom',
      renderItem: (params: any, api: any) => {
        const categoryIndex = api.value(0);
        const start = api.coord([api.value(1), categoryIndex]);
        const end = api.coord([api.value(2), categoryIndex]);
        const height = 20;
        return {
          type: 'rect',
          shape: { x: start[0], y: start[1] - height / 2, width: end[0] - start[0], height },
          style: api.style(),
        };
      },
      encode: { x: [1, 2], y: 0 },
      data: device.timeline.map((item: any) => [
        idx,
        new Date(item.start).getTime(),
        new Date(item.end).getTime(),
        item.type,
      ]),
    })),
    color: ['#1890ff', '#52c41a', '#faad14', '#f5222d'],
  };

  const deviceUtilOption = {
    title: { text: '设备利用率' },
    tooltip: { trigger: 'axis', formatter: '{b}: {c}%' },
    xAxis: { type: 'category', data: deviceUtil.devices || [] },
    yAxis: { type: 'value', max: 100 },
    series: [{ data: deviceUtil.utilization || [], type: 'bar', barWidth: '40%' }],
    color: ['#52c41a'],
  };

  // Inventory Radar chart - current vs predicted
  const inventoryRadarOption = {
    title: { text: '库存预测分析' },
    tooltip: {},
    legend: { data: ['当前库存', '预测需求'], bottom: 0 },
    radar: {
      indicator: inventoryRadar.indicators && inventoryRadar.indicators.length > 0
        ? inventoryRadar.indicators
        : [{ name: 'Loading', max: 100 }]
    },
    series: [{
      type: 'radar',
      data: [
        { value: inventoryRadar.current || [], name: '当前库存' },
        { value: inventoryRadar.predicted || [], name: '预测需求' },
      ]
    }],
    color: ['#1890ff', '#52c41a'],
  };

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="总订单数" value={stats.totalOrders} prefix={<ShoppingCartOutlined />} styles={{ content: { color: '#1890ff' } }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="待处理订单" value={stats.pendingOrders} prefix={<ClockCircleOutlined />} styles={{ content: { color: '#faad14' } }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="打印中订单" value={stats.printingOrders} prefix={<PrinterOutlined />} styles={{ content: { color: '#722ed1' } }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic title="今日完成" value={stats.completedToday} prefix={<CheckCircleOutlined />} styles={{ content: { color: '#52c41a' } }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card style={{ marginBottom: 16 }}>
            <ReactECharts option={deviceTimelineOption} style={{ height: 300 }} />
          </Card>
          <Card>
            <ReactECharts option={deviceUtilOption} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card style={{ height: '100%' }}>
            <ReactECharts option={inventoryRadarOption} style={{ height: 400 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
