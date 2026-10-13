import api from './api';

export interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  printingOrders: number;
  completedToday: number;
  totalDevices?: number;
  activeDevices?: number;
  lowStockMaterials?: number;
}

export interface OrderTrend {
  dates: string[];
  values: number[];
}

export interface DeviceUtilization {
  devices: string[];
  utilization: number[];
}

export interface AgentPerformance {
  indicators: Array<{ name: string; max: number }>;
  coordinator: number[];
  scheduler: number[];
  inventory: number[];
}

export interface TimelineItem {
  type: string;
  start: string;
  end: string;
}

export interface DeviceTimelineData {
  name: string;
  timeline: TimelineItem[];
}

export interface DeviceTimeline {
  devices: DeviceTimelineData[];
  timeRange: {
    start: string;
    end: string;
  };
}

export interface InventoryPrediction {
  indicators: Array<{ name: string; max: number }>;
  current: number[];
  predicted: number[];
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await api.get('/dashboard/stats');
  return response.data?.data || response.data;
};

export const getOrderTrend = async (days: number = 7): Promise<OrderTrend> => {
  const response = await api.get('/dashboard/orders/trend', { params: { days } });
  return response.data?.data || response.data;
};

export const getDeviceUtilization = async (): Promise<DeviceUtilization> => {
  const response = await api.get('/dashboard/devices/utilization');
  return response.data?.data || response.data;
};

export const getAgentPerformance = async (): Promise<AgentPerformance> => {
  const response = await api.get('/dashboard/agents/performance');
  return response.data?.data || response.data;
};

export const getDeviceTimeline = async (): Promise<DeviceTimeline> => {
  try {
    const response = await api.get('/dashboard/devices/timeline');
    return response.data?.data || response.data;
  } catch (error) {
    console.error('获取设备时间线失败:', error);
    throw error;
  }
};

export const getInventoryPrediction = async (): Promise<InventoryPrediction> => {
  try {
    const response = await api.get('/dashboard/inventory/prediction');
    return response.data?.data || response.data;
  } catch (error) {
    console.error('获取库存预测失败:', error);
    throw error;
  }
};
