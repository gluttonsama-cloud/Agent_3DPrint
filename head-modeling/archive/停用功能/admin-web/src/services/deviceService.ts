import api from './api';

export interface Device {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'printing' | 'offline' | 'maintenance';
  currentOrderId?: string;
  progress?: number;
}

export interface DeviceCreateData {
  deviceId: string;
  type: string;
  location?: string;
  status?: string;
}

// 后端状态映射到前端状态
const mapStatus = (status: string): Device['status'] => {
  const statusMap: Record<string, Device['status']> = {
    idle: 'idle',
    busy: 'printing',      // 后端 busy 映射到前端 printing
    printing: 'printing',
    offline: 'offline',
    maintenance: 'maintenance',
  };
  return statusMap[status] || 'idle';
};

// 获取设备列表 - 后端返回分页格式 { items, pagination }
export const getDevices = async (): Promise<Device[]> => {
  const response = await api.get('/devices');
  // 后端 res.paginated() 返回 { success, data: { items, pagination }, message }
  const data = response.data?.data || response.data || {};
  const items = data.items || data || [];
  
  // 后端字段映射：deviceId → id, busy → printing
  return items.map((item: any) => ({
    id: item.deviceId || item._id || item.id,
    name: item.name || item.deviceId || '未知设备',
    type: item.type,
    status: mapStatus(item.status),
    currentOrderId: item.currentTask?.orderId,
    progress: item.currentTask?.progress,
  }));
};

export const getDevice = async (id: string): Promise<Device> => {
  const response = await api.get(`/devices/${id}`);
  return response.data?.data || response.data;
};

export const createDevice = async (deviceData: DeviceCreateData): Promise<Device> => {
  const response = await api.post('/devices', deviceData);
  return response.data?.data || response.data;
};

// 更新设备信息 - 后端定义 PATCH /devices/:id
export const updateDevice = async (id: string, data: Partial<Device>): Promise<Device> => {
  const response = await api.patch(`/devices/${id}`, data);
  return response.data?.data || response.data;
};

export const deleteDevice = async (id: string): Promise<void> => {
  await api.delete(`/devices/${id}`);
};

// 更新设备状态 - 后端定义 PUT /devices/:id/status
export const updateDeviceStatus = async (id: string, status: Device['status']) => {
  // 前端 printing 需要转换为后端 busy
  const backendStatus = status === 'printing' ? 'busy' : status;
  const response = await api.put(`/devices/${id}/status`, { status: backendStatus });
  return response;
};

export const addDevice = async (device: { deviceId: string; type: string; location?: string }): Promise<Device> => {
  const response = await api.post('/devices', {
    deviceId: device.deviceId,
    type: device.type.toLowerCase(),
    status: 'idle'
  });
  return response.data?.data || response.data;
};

// 完成设备当前任务 - 后端定义 POST /devices/:id/complete-task
export const completeDeviceTask = async (deviceId: string): Promise<void> => {
  await api.post(`/devices/${deviceId}/complete-task`);
};

// 为设备分配订单 - 后端定义 PUT /devices/:id/status
export const assignOrderToDevice = async (deviceId: string, orderId: string): Promise<void> => {
  // 后端使用 busy 状态，需要设置 currentOrderId
  await api.put(`/devices/${deviceId}/status`, {
    status: 'busy',
    currentOrderId: orderId
  });
};

// 更新设备打印进度 - 后端定义 PATCH /devices/:id
export const updateDeviceProgress = async (deviceId: string, progress: number): Promise<void> => {
  await api.patch(`/devices/${deviceId}`, { progress });
};
