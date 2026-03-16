import api from './api';

export interface Material {
  id: string;
  name: string;
  type: string;
  color: string;
  quantity: number;
  unit: string;
  threshold: number;
  status: 'normal' | 'low' | 'out_of_stock';
  suggestion?: string;
}

export interface MaterialCreateData {
  name: string;
  type: string;
  color: string;
  quantity: number;
  unit: string;
  threshold: number;
  location?: string;
}

// 后端字段映射：stock.quantity → quantity, properties.color → color
const mapMaterial = (item: any): Material => {
  const quantity = item.stock?.quantity ?? item.quantity ?? 0;
  const threshold = item.threshold ?? item.reorderLevel ?? 0;
  // 确保 id 是字符串（MongoDB _id 可能是对象）
  const id = typeof item._id === 'object' ? (item._id.id || item._id.toString?.() || JSON.stringify(item._id)) : (item._id || item.id);
  return {
    id: String(id),
    name: item.name,
    type: item.type,
    color: item.properties?.color || item.color || '',
    quantity,
    unit: item.stock?.unit || item.unit || 'kg',
    threshold,
    status: quantity <= 0 ? 'out_of_stock' : quantity <= threshold ? 'low' : 'normal',
    suggestion: item.needsReorder ? '建议补货' : undefined
  };
};

export const getMaterials = async (): Promise<Material[]> => {
  const response = await api.get('/materials');
  const data = response.data?.data || response.data || {};
  const items = data.items || data || [];
  return Array.isArray(items) ? items.map(mapMaterial) : [];
};

export const getMaterial = async (id: string): Promise<Material> => {
  const response = await api.get(`/materials/${id}`);
  return response.data?.data || response.data;
};

export const createMaterial = async (materialData: MaterialCreateData): Promise<Material> => {
  const response = await api.post('/materials', materialData);
  return response.data?.data || response.data;
};

export const updateMaterial = async (id: string, data: Partial<Material>): Promise<Material> => {
  const response = await api.put(`/materials/${id}`, data);
  return response.data?.data || response.data;
};

export const deleteMaterial = async (id: string): Promise<void> => {
  await api.delete(`/materials/${id}`);
};

// 更新材料库存 - 调用后端 PATCH /materials/:id/stock
// 后端期望参数: { quantityChange, reason, orderId? }
export const updateMaterialQuantity = async (id: string, quantityChange: number, reason?: string) => {
  const response = await api.patch(`/materials/${id}/stock`, { 
    quantityChange,
    reason: reason || '手动更新'
  });
  return response;
};

export const addMaterial = async (material: Omit<Material, 'id' | 'status'>): Promise<Material> => {
  const response = await api.post('/materials', {
    name: material.name,
    type: material.type,
    stock: {
      quantity: material.quantity,
      unit: material.unit
    },
    threshold: material.threshold,
    costPerUnit: 0,
    properties: {
      color: material.color
    }
  });
  return mapMaterial(response.data?.data || response.data);
};
