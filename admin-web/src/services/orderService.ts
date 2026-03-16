import api from './api';

export interface Order {
  id: string;
  userId: string;
  status: 'pending_review' | 'reviewing' | 'scheduled' | 'printing' | 'completed' | 'cancelled';
  deviceId?: string;
  createdAt: string;
  updatedAt: string;
  modelUrl: string;
  parameters: Record<string, any>;
}

export interface OrderQueryParams {
  page?: number;
  limit?: number;
  status?: string;
  userId?: string;
  deviceId?: string;
}

export const getOrders = async (params?: OrderQueryParams): Promise<{ data: Order[]; total: number }> => {
  const response = await api.get('/orders', { params });
  return {
    data: response.data?.data || response.data || [],
    total: response.data?.total || response.data?.length || 0,
  };
};

export const getOrder = async (id: string): Promise<Order> => {
  const response = await api.get(`/orders/${id}`);
  return response.data?.data || response.data;
};

export const createOrder = async (orderData: Partial<Order>): Promise<Order> => {
  const response = await api.post('/orders', orderData);
  return response.data?.data || response.data;
};

export const updateOrder = async (id: string, data: Partial<Order>): Promise<Order> => {
  const response = await api.put(`/orders/${id}`, data);
  return response.data?.data || response.data;
};

export const updateOrderStatus = async (id: string, status: string, notes?: string) => {
  const response = await api.patch(`/orders/${id}/status`, { status, notes });
  return response;
};

export const deleteOrder = async (id: string): Promise<void> => {
  await api.delete(`/orders/${id}`);
};

export const assignOrderToDevice = async (orderId: string, deviceId: string): Promise<Order> => {
  const response = await api.post(`/orders/${orderId}/assign`, { deviceId });
  return response.data?.data || response.data;
};

export const bulkUpdateOrderStatus = async (ids: string[], status: string) => {
  const response = await api.post('/orders/bulk-status', { ids, status });
  return response;
};
