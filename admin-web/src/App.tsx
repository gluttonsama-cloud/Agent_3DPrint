/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import OrderList from './pages/OrderList';
import OrderDetail from './pages/OrderDetail';
import DeviceManagement from './pages/DeviceManagement';
import InventoryManagement from './pages/InventoryManagement';
import AgentVisualization from './pages/AgentVisualization';
import AgentManagement from './pages/AgentManagement';

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#708090',
          colorBgBase: '#F5F5F0',
          colorTextBase: '#2D2D2D',
          colorBorder: '#2D2D2D',
          colorBorderSecondary: '#2D2D2D',
          colorBgContainer: '#E2E2D5',
          colorBgElevated: '#E2E2D5',
          borderRadius: 0,
          borderRadiusLG: 0,
          borderRadiusSM: 0,
          lineWidth: 3,
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
        },
        components: {
          Layout: {
            bodyBg: '#F5F5F0',
            headerBg: '#E2E2D5',
            siderBg: '#E2E2D5',
          },
          Card: {
            colorBgContainer: '#E2E2D5',
          },
          Menu: {
            itemBg: '#E2E2D5',
            itemSelectedBg: '#708090',
            itemSelectedColor: '#F5F5F0',
          }
        }
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Navigate to="/agents" replace />} />
            <Route path="agents" element={<AgentVisualization />} />
            <Route path="agent-management" element={<AgentManagement />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="orders" element={<OrderList />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="devices" element={<DeviceManagement />} />
            <Route path="inventory" element={<InventoryManagement />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
