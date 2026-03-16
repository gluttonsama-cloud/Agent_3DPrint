import React, { useState } from 'react';
import { Layout, Menu, Breadcrumb, Avatar, Dropdown, theme } from 'antd';
import {
  DashboardOutlined,
  UnorderedListOutlined,
  PrinterOutlined,
  DatabaseOutlined,
  RobotOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const { Header, Content, Sider } = Layout;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const menuItems = [
    { key: '/agents', icon: <RobotOutlined />, label: 'Agent 可视化' },
    { key: '/agent-management', icon: <RobotOutlined />, label: 'Agent 管理' },
    { key: '/dashboard', icon: <DashboardOutlined />, label: '数据看板' },
    { key: '/orders', icon: <UnorderedListOutlined />, label: '订单管理' },
    { key: '/devices', icon: <PrinterOutlined />, label: '设备管理' },
    { key: '/inventory', icon: <DatabaseOutlined />, label: '库存管理' },
  ];

  const getBreadcrumbName = (path: string) => {
    if (path.startsWith('/orders/')) return '订单详情';
    const item = menuItems.find((m) => m.key === path);
    return item ? item.label : '首页';
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)} theme="light">
        <div style={{ height: 32, margin: 16, background: 'rgba(0, 0, 0, 0.05)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
          {collapsed ? '3D' : '3D 打印母端系统'}
        </div>
        <Menu
          theme="light"
          selectedKeys={[location.pathname.replace(/\/\d+$/, '')]}
          mode="inline"
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>
            {getBreadcrumbName(location.pathname)}
          </div>
          <div>
            <Dropdown menu={{ items: [{ key: 'logout', label: '退出登录' }] }}>
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar icon={<UserOutlined />} />
                <span>管理员</span>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ margin: '0 16px', display: 'flex', flexDirection: 'column' }}>
          <Breadcrumb 
            style={{ margin: '16px 0' }}
            items={[
              { title: '首页' },
              { title: getBreadcrumbName(location.pathname) }
            ]}
          />
          <div
            style={{
              padding: 24,
              flex: 1,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: location.pathname === '/agents' ? 'hidden' : 'auto'
            }}
          >
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
