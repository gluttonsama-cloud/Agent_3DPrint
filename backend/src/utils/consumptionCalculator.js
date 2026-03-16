/**
 * 消耗计算工具
 * 
 * 提供材料消耗计算、历史数据分析、预测基础数据准备等功能
 * 为库存预测算法提供计算支持
 */

const Order = require('../models/Order');
const Material = require('../models/Material');

/**
 * 计算单个订单的材料消耗量
 * 
 * @param {Object} order - 订单对象
 * @returns {Object} 消耗计算结果
 */
function calculateOrderConsumption(order) {
  // 基础消耗：根据订单重量计算
  const baseWeight = order.weight || 0; // 克
  
  // 考虑支撑材料（通常为模型重量的 20-40%）
  const supportRate = order.supportRate || 0.3;
  const supportWeight = baseWeight * supportRate;
  
  // 考虑损耗率（打印失败、清理等，通常 5-15%）
  const wasteRate = order.wasteRate || 0.1;
  const wasteWeight = (baseWeight + supportWeight) * wasteRate;
  
  // 总消耗量
  const totalConsumption = baseWeight + supportWeight + wasteWeight;
  
  return {
    baseWeight,           // 基础重量（模型本身）
    supportWeight,        // 支撑材料重量
    wasteWeight,          // 损耗重量
    totalConsumption,     // 总消耗量
    unit: 'g'            // 单位：克
  };
}

/**
 * 计算多个订单的总消耗量
 * 
 * @param {Array} orders - 订单数组
 * @param {Object} options - 选项
 * @returns {Object} 总消耗统计
 */
function calculateTotalConsumption(orders, options = {}) {
  const {
    groupBy = 'type',    // 分组方式：'type', 'material', 'none'
    startDate = null,    // 开始日期
    endDate = null       // 结束日期
  } = options;
  
  // 过滤日期范围
  let filteredOrders = orders;
  if (startDate || endDate) {
    filteredOrders = orders.filter(order => {
      const orderDate = new Date(order.createdAt || order.createAt);
      if (startDate && orderDate < new Date(startDate)) return false;
      if (endDate && orderDate > new Date(endDate)) return false;
      return true;
    });
  }
  
  // 计算每个订单的消耗
  const consumptionDetails = filteredOrders.map(order => ({
    orderId: order._id,
    materialId: order.materialId,
    materialType: order.materialType,
    ...calculateOrderConsumption(order)
  }));
  
  // 按类型分组统计
  if (groupBy === 'type') {
    const grouped = {};
    consumptionDetails.forEach(item => {
      const key = item.materialType || 'unknown';
      if (!grouped[key]) {
        grouped[key] = {
          type: key,
          totalConsumption: 0,
          baseWeight: 0,
          supportWeight: 0,
          wasteWeight: 0,
          orderCount: 0
        };
      }
      grouped[key].totalConsumption += item.totalConsumption;
      grouped[key].baseWeight += item.baseWeight;
      grouped[key].supportWeight += item.supportWeight;
      grouped[key].wasteWeight += item.wasteWeight;
      grouped[key].orderCount += 1;
    });
    
    return {
      totalConsumption: consumptionDetails.reduce((sum, item) => sum + item.totalConsumption, 0),
      orderCount: consumptionDetails.length,
      grouped,
      details: consumptionDetails
    };
  }
  
  // 不分组，返回总计
  const total = consumptionDetails.reduce((sum, item) => sum + item.totalConsumption, 0);
  return {
    totalConsumption: total,
    orderCount: consumptionDetails.length,
    details: consumptionDetails
  };
}

/**
 * 计算平均日消耗量
 * 
 * @param {Array} historicalData - 历史消耗数据数组 [{date, consumption}]
 * @param {number} days - 计算天数
 * @returns {Object} 平均消耗统计
 */
function calculateAverageDailyConsumption(historicalData, days = 7) {
  if (!historicalData || historicalData.length === 0) {
    return {
      averageDailyConsumption: 0,
      totalConsumption: 0,
      daysAnalyzed: 0
    };
  }
  
  // 按日期排序
  const sorted = [...historicalData].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
  
  // 取最近 N 天数据
  const recentData = sorted.slice(-days);
  
  // 计算总消耗和平均值
  const totalConsumption = recentData.reduce((sum, item) => sum + item.consumption, 0);
  const averageDailyConsumption = totalConsumption / Math.max(recentData.length, 1);
  
  return {
    averageDailyConsumption,
    totalConsumption,
    daysAnalyzed: recentData.length,
    trend: calculateTrend(recentData)
  };
}

/**
 * 计算消耗趋势（简单线性回归）
 * 
 * @param {Array} data - 数据数组 [{date, consumption}]
 * @returns {Object} 趋势分析结果
 */
function calculateTrend(data) {
  if (data.length < 2) {
    return { direction: 'stable', slope: 0, confidence: 0 };
  }
  
  // 转换为数值序列
  const y = data.map(d => d.consumption);
  const x = data.map((_, i) => i);
  
  // 计算线性回归
  const n = data.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
  
  // 斜率 = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  
  // 判断趋势方向
  let direction = 'stable';
  if (slope > 0.05) direction = 'increasing';
  else if (slope < -0.05) direction = 'decreasing';
  
  // 计算 R²（拟合度）
  const meanY = sumY / n;
  const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
  const intercept = (sumY - slope * sumX) / n;
  const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
  const rSquared = 1 - (ssRes / ssTot);
  
  return {
    direction,
    slope,
    confidence: isNaN(rSquared) ? 0 : rSquared,
    intercept
  };
}

/**
 * 从数据库获取历史消耗数据
 * 
 * @param {string} materialId - 材料 ID（可选，不传则获取所有材料）
 * @param {number} days - 获取多少天的数据
 * @returns {Promise<Array>} 历史消耗数据
 */
async function fetchHistoricalConsumption(materialId = null, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  // 构建查询条件
  const query = {
    status: { $in: ['completed', 'delivered'] },
    createdAt: { $gte: startDate }
  };
  
  if (materialId) {
    query.materialId = materialId;
  }
  
  try {
    const orders = await Order.find(query).select('materialId materialType weight createdAt').lean();
    
    // 按日期分组统计消耗
    const dailyConsumption = {};
    
    orders.forEach(order => {
      const date = new Date(order.createdAt).toISOString().split('T')[0];
      const consumption = calculateOrderConsumption(order).totalConsumption;
      
      if (!dailyConsumption[date]) {
        dailyConsumption[date] = {
          date,
          consumption: 0,
          orderCount: 0
        };
      }
      
      dailyConsumption[date].consumption += consumption;
      dailyConsumption[date].orderCount += 1;
    });
    
    // 转换为数组并排序
    return Object.values(dailyConsumption).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
  } catch (error) {
    console.error('[ConsumptionCalculator] 获取历史消耗数据失败:', error.message);
    throw error;
  }
}

/**
 * 计算安全库存量
 * 
 * @param {number} averageDailyConsumption - 平均日消耗量
 * @param {number} leadTimeDays - 交货周期（天）
 * @param {number} safetyFactor - 安全系数（通常 1.2-2.0）
 * @returns {number} 安全库存量
 */
function calculateSafetyStock(averageDailyConsumption, leadTimeDays = 7, safetyFactor = 1.5) {
  return averageDailyConsumption * leadTimeDays * safetyFactor;
}

/**
 * 计算建议补货量
 * 
 * @param {Object} material - 材料对象
 * @param {Object} forecast - 预测数据
 * @param {Object} options - 选项
 * @returns {Object} 补货建议
 */
function calculateReorderAmount(material, forecast, options = {}) {
  const {
    leadTimeDays = 7,        // 交货周期
    safetyFactor = 1.5,      // 安全系数
    minOrderQuantity = 1000, // 最小订货量（克）
    maxOrderQuantity = 50000 // 最大订货量（克）
  } = options;
  
  const currentStock = material.stock.quantity;
  const threshold = material.threshold;
  
  // 预测期消耗量
  const forecastConsumption = forecast.predictedConsumption || 0;
  
  // 安全库存
  const safetyStock = calculateSafetyStock(
    forecast.averageDailyConsumption,
    leadTimeDays,
    safetyFactor
  );
  
  // 计算需要补货的量
  const targetStock = forecastConsumption + safetyStock;
  let reorderAmount = targetStock - currentStock;
  
  // 如果当前库存已经低于阈值，增加紧急补货量
  if (currentStock <= threshold) {
    reorderAmount *= 1.2; // 增加 20% 紧急补货
  }
  
  // 确保不小于 0
  reorderAmount = Math.max(0, reorderAmount);
  
  // 应用最小/最大订货量限制
  if (reorderAmount > 0) {
    reorderAmount = Math.max(minOrderQuantity, Math.min(maxOrderQuantity, reorderAmount));
  }
  
  // 转换为材料的单位
  const unit = material.stock.unit || 'g';
  if (unit === 'kg') {
    reorderAmount = Math.round(reorderAmount / 1000 * 100) / 100; // 转换为 kg，保留 2 位小数
  }
  
  return {
    reorderAmount,
    unit,
    currentStock,
    targetStock,
    safetyStock,
    isUrgent: currentStock <= threshold,
    estimatedCost: reorderAmount * (material.costPerUnit || 0)
  };
}

/**
 * 计算库存可用天数
 * 
 * @param {number} currentStock - 当前库存量
 * @param {number} averageDailyConsumption - 平均日消耗量
 * @returns {number} 可用天数
 */
function calculateAvailableDays(currentStock, averageDailyConsumption) {
  if (averageDailyConsumption <= 0) {
    return Infinity; // 消耗为 0，理论上可用无限天
  }
  return Math.floor(currentStock / averageDailyConsumption);
}

module.exports = {
  calculateOrderConsumption,
  calculateTotalConsumption,
  calculateAverageDailyConsumption,
  calculateTrend,
  fetchHistoricalConsumption,
  calculateSafetyStock,
  calculateReorderAmount,
  calculateAvailableDays
};
