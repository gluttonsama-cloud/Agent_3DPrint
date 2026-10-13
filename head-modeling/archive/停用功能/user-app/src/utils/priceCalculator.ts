/**
 * 价格计算器工具函数
 * 用于计算 3D 打印订单的总价
 * 
 * 价格公式：
 * 总价 = (基础价格 + 材料价格 + 尺寸加价 + 精度加价) × 数量 × 折扣系数
 */

// 材料类型定义
export type MaterialType = 'sla_resin' | 'fdm_pla' | 'sls_nylon' | 'sla_standard' | 'fdm_standard';

// 尺寸类型定义
export type SizeType = 'small' | 'medium' | 'large';

// 精度类型定义
export type PrecisionType = 'standard' | 'high';

// 价格配置接口
interface PriceConfig {
  basePrice: number; // 基础价格
  materials: Record<MaterialType, number>; // 材料价格
  sizes: Record<SizeType, number>; // 尺寸加价
  precisions: Record<PrecisionType, number>; // 精度加价
  discounts: Record<number, number>; // 数量折扣（数量：折扣系数）
}

// 价格配置表（单位：元）
const PRICE_CONFIG: PriceConfig = {
  basePrice: 50, // 基础价格
  
  // 材料价格（不同材料不同价格）
  materials: {
    sla_resin: 80,      // SLA 树脂
    fdm_pla: 30,        // FDM PLA
    sls_nylon: 120,     // SLS 尼龙
    sla_standard: 60,   // SLA 标准树脂
    fdm_standard: 25,   // FDM 标准材料
  },
  
  // 尺寸加价
  sizes: {
    small: 0,    // 小尺寸（0-10cm）不加价
    medium: 50,  // 中尺寸（10-20cm）加价 50 元
    large: 150,  // 大尺寸（20cm+）加价 150 元
  },
  
  // 精度加价
  precisions: {
    standard: 0,  // 标准精度不加价
    high: 100,    // 高精度加价 100 元
  },
  
  // 数量折扣
  discounts: {
    1: 1.0,   // 1 个，无折扣
    2: 0.95,  // 2 个，95 折
    3: 0.90,  // 3 个，9 折
    5: 0.85,  // 5 个，85 折
    10: 0.80, // 10 个，8 折
  },
};

/**
 * 获取数量对应的折扣系数
 * @param quantity 数量
 * @returns 折扣系数
 */
export function getDiscount(quantity: number): number {
  const discountLevels = Object.keys(PRICE_CONFIG.discounts)
    .map(Number)
    .sort((a, b) => b - a); // 降序排列
  
  for (const level of discountLevels) {
    if (quantity >= level) {
      return PRICE_CONFIG.discounts[level];
    }
  }
  
  return 1.0; // 默认无折扣
}

/**
 * 计算单价
 * @param material 材料类型
 * @param size 尺寸类型
 * @param precision 精度类型
 * @returns 单价
 */
export function calculateUnitPrice(
  material: MaterialType,
  size: SizeType,
  precision: PrecisionType
): number {
  const materialPrice = PRICE_CONFIG.materials[material];
  const sizePrice = PRICE_CONFIG.sizes[size];
  const precisionPrice = PRICE_CONFIG.precisions[precision];
  
  return PRICE_CONFIG.basePrice + materialPrice + sizePrice + precisionPrice;
}

/**
 * 计算总价
 * @param material 材料类型
 * @param size 尺寸类型
 * @param precision 精度类型
 * @param quantity 数量
 * @returns 价格详情对象
 */
export function calculateTotalPrice(
  material: MaterialType,
  size: SizeType,
  precision: PrecisionType,
  quantity: number
) {
  const unitPrice = calculateUnitPrice(material, size, precision);
  const discount = getDiscount(quantity);
  const totalPrice = unitPrice * quantity * discount;
  
  return {
    basePrice: PRICE_CONFIG.basePrice,
    materialPrice: PRICE_CONFIG.materials[material],
    sizePrice: PRICE_CONFIG.sizes[size],
    precisionPrice: PRICE_CONFIG.precisions[precision],
    unitPrice,
    quantity,
    discount,
    totalPrice: Math.round(totalPrice), // 四舍五入取整
  };
}

/**
 * 获取材料名称
 * @param material 材料类型
 * @returns 材料中文名称
 */
export function getMaterialName(material: MaterialType): string {
  const names: Record<MaterialType, string> = {
    sla_resin: 'SLA 树脂',
    fdm_pla: 'FDM PLA',
    sls_nylon: 'SLS 尼龙',
    sla_standard: 'SLA 标准树脂',
    fdm_standard: 'FDM 标准材料',
  };
  return names[material];
}

/**
 * 获取尺寸名称
 * @param size 尺寸类型
 * @returns 尺寸中文名称
 */
export function getSizeName(size: SizeType): string {
  const names: Record<SizeType, string> = {
    small: '小尺寸 (0-10cm)',
    medium: '中尺寸 (10-20cm)',
    large: '大尺寸 (20cm+)',
  };
  return names[size];
}

/**
 * 获取精度名称
 * @param precision 精度类型
 * @returns 精度中文名称
 */
export function getPrecisionName(precision: PrecisionType): string {
  const names: Record<PrecisionType, string> = {
    standard: '标准精度',
    high: '高精度',
  };
  return names[precision];
}

/**
 * 获取所有材料选项
 * @returns 材料选项列表
 */
export function getMaterialOptions() {
  return Object.keys(PRICE_CONFIG.materials).map((key) => ({
    value: key as MaterialType,
    label: getMaterialName(key as MaterialType),
    price: PRICE_CONFIG.materials[key as MaterialType],
  }));
}

/**
 * 获取所有尺寸选项
 * @returns 尺寸选项列表
 */
export function getSizeOptions() {
  return Object.keys(PRICE_CONFIG.sizes).map((key) => ({
    value: key as SizeType,
    label: getSizeName(key as SizeType),
    price: PRICE_CONFIG.sizes[key as SizeType],
  }));
}

/**
 * 获取所有精度选项
 * @returns 精度选项列表
 */
export function getPrecisionOptions() {
  return Object.keys(PRICE_CONFIG.precisions).map((key) => ({
    value: key as PrecisionType,
    label: getPrecisionName(key as PrecisionType),
    price: PRICE_CONFIG.precisions[key as PrecisionType],
  }));
}

/**
 * 获取折扣说明
 * @param quantity 数量
 * @returns 折扣说明文字
 */
export function getDiscountText(quantity: number): string {
  const discount = getDiscount(quantity);
  if (discount === 1.0) {
    return '无折扣';
  }
  return `${Math.round(discount * 10)} 折`;
}
