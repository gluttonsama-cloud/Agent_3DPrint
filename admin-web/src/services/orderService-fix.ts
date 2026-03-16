export const getOrders = async (params?: OrderQueryParams): Promise<{ items: Order[]; total: number }> => {
  const response = await api.get('/orders', { params });
  return {
    items: response.data?.data?.items || response.data?.items || response.data || [],
    total: response.data?.data?.pagination?.total || response.data?.pagination?.total || response.data?.total || 0,
  };
};
