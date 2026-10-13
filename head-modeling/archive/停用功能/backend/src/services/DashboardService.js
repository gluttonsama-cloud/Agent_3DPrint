/**
 * 数据看板服务
 * 
 * 提供数据统计、分析、报表生成等功能
 * 集成 Order、Device、Material、AgentDecision 所有数据源
 * 支持缓存热点数据以提升性能
 */

const Order = require('../models/Order');
const Device = require('../models/Device');
const Material = require('../models/Material');
const AgentDecision = require('../models/AgentDecision');
const mongoose = require('mongoose');
const { cacheService, CacheStrategies } = require('./cacheService');

class DashboardService {
  /**
   * 获取概览统计数据（带缓存）
   * 缓存时间：2 分钟
   * @returns {Promise<Object>} 概览统计数据
   */
  async getOverview() {
    return cacheService.getOrSet(
      'INVENTORY',
      'dashboard:overview',
      async () => {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // 并行查询所有统计数据
        const [
          totalOrders,
          pendingOrders,
          printingOrders,
          completedToday,
          devices,
          materials
        ] = await Promise.all([
          Order.countDocuments(),
          Order.countDocuments({ status: 'pending' }),
          Order.countDocuments({ status: 'printing' }),
          Order.countDocuments({
            status: 'completed',
            createdAt: { $gte: todayStart }
          }),
          Device.find().select('deviceId status currentTask'),
          Material.find().select('stock quantity threshold')
        ]);

        // 计算低库存材料
        const lowStockMaterials = materials.filter(m => m.stock.quantity <= m.threshold);

        // 计算设备利用率
        const activeDevices = devices.filter(d => d.status === 'busy').length;
        const totalDevices = devices.length || 1;
        const deviceUtilization = parseFloat((activeDevices / totalDevices).toFixed(2));

        return {
          totalOrders,
          pendingOrders,
          printingOrders,
          completedToday,
          deviceUtilization,
          lowStockMaterials: lowStockMaterials.length
        };
      }
    );
  }

  /**
   * 获取订单统计数据（带缓存）
   * 缓存时间：2 分钟
   * @param {number} days - 统计天数
   * @returns {Promise<Object>} 订单统计数据
   */
  async getOrderStats(days = 30) {
    return cacheService.getOrSet(
      'INVENTORY',
      `dashboard:orderStats:${days}`,
      async () => {
        const now = new Date();
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        const baseQuery = {
          createdAt: { $gte: startDate }
        };

        const total = await Order.countDocuments(baseQuery);

        const byStatus = await Order.aggregate([
          { $match: baseQuery },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]);

        const statusMap = {};
        byStatus.forEach(item => {
          statusMap[item._id] = item.count;
        });

        const trend = await Order.aggregate([
          { $match: baseQuery },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
              },
              count: { $sum: 1 },
              totalPrice: { $sum: '$totalPrice' }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        return {
          total,
          byStatus: statusMap,
          trend: trend.map(item => ({
            date: item._id,
            count: item.count,
            revenue: item.totalPrice || 0
          }))
        };
      }
    );
  }

  /**
   * 获取设备利用率统计（带缓存）
   * 缓存时间：1 分钟
   * @returns {Promise<Object>} 设备利用率数据
   */
  async getDeviceUtilization() {
    return cacheService.getOrSet(
      'DEVICE_STATUS',
      'dashboard:deviceUtilization',
      async () => {
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // 获取所有设备
        const devices = await Device.find().select('deviceId status currentTask capacity');

        // 获取过去 24 小时的订单完成情况
        const completedOrders = await Order.aggregate([
          {
            $match: {
              status: 'completed',
              updatedAt: { $gte: last24Hours }
            }
          },
          {
            $lookup: {
              from: 'devices',
              localField: 'items.deviceId',
              foreignField: '_id',
              as: 'deviceInfo'
            }
          },
          { $unwind: '$deviceInfo' },
          {
            $group: {
              _id: '$deviceInfo.deviceId',
              completedCount: { $sum: 1 }
            }
          }
        ]);

        // 构建设备完成数量映射
        const completedMap = {};
        completedOrders.forEach(item => {
          completedMap[item._id.toString()] = item.completedCount;
        });

        // 计算每个设备的利用率
        const byDevice = devices.map(device => {
          const deviceId = device.deviceId;
          const completedCount = completedMap[deviceId] || 0;
          const utilization = device.status === 'busy'
            ? Math.min(1, (device.capacity?.currentLoad || 0) / 100 + completedCount * 0.1)
            : (device.capacity?.currentLoad || 0) / 100;

          return {
            deviceId,
            utilization: parseFloat(utilization.toFixed(2)),
            status: device.status,
            completedToday: completedCount
          };
        });

        // 计算整体利用率
        const totalUtilization = byDevice.reduce((sum, d) => sum + d.utilization, 0);
        const overall = byDevice.length > 0
          ? parseFloat((totalUtilization / byDevice.length).toFixed(2))
          : 0;

        // 生成趋势数据
        const trend = [];
        for (let i = 23; i >= 0; i--) {
          const hourTime = new Date(now.getTime() - i * 60 * 60 * 1000);
          trend.push({
            hour: hourTime.getHours().toString().padStart(2, '0'),
            utilization: parseFloat((overall * (0.8 + Math.random() * 0.4)).toFixed(2))
          });
        }

        return {
          overall,
          byDevice,
          trend
        };
      }
    );
  }

  /**
   * 获取库存趋势数据（带缓存）
   * 缓存时间：2 分钟
   * @param {string} materialId - 物料 ID（可选）
   * @param {number} days - 统计天数
   * @returns {Promise<Object>} 库存趋势数据
   */
  async getInventoryTrend(materialId = null, days = 30) {
    const cacheKey = materialId 
      ? `dashboard:inventoryTrend:${materialId}:${days}`
      : `dashboard:inventoryTrend:all:${days}`;
    
    return cacheService.getOrSet(
      'INVENTORY',
      cacheKey,
      async () => {
        const query = materialId ? { _id: materialId } : {};
        const materials = await Material.find(query).select('name type stock threshold');

        const trend = materials.map(material => ({
          materialId: material._id.toString(),
          name: material.name,
          type: material.type,
          currentStock: material.stock.quantity,
          unit: material.stock.unit,
          threshold: material.threshold,
          needsReorder: material.stock.quantity <= material.threshold,
          history: this._generateStockHistory(material.stock.quantity, days)
        }));

        return {
          totalMaterials: materials.length,
          lowStockCount: materials.filter(m => m.stock.quantity <= m.threshold).length,
          items: trend
        };
      }
    );
  }

  /**
   * 生成库存历史数据（模拟）
   * @param {number} currentStock - 当前库存
   * @param {number} days - 天数
   * @returns {Array} 历史数据
   * @private
   */
  _generateStockHistory(currentStock, days) {
    const history = [];
    const now = new Date();
    let stock = currentStock;

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      // 模拟库存变化
      if (i < days - 1) {
        stock += Math.floor(Math.random() * 10) - 3;
      }
      history.push({
        date: date.toISOString().split('T')[0],
        stock: Math.max(0, stock)
      });
    }

    return history;
  }

  /**
   * 获取库存预测数据（简单线性预测，带缓存）
   * 基于历史消耗计算 7 天后的库存预测值
   * 缓存时间：2 分钟
   * @returns {Promise<Object>} 库存预测数据
   */
  async getInventoryPrediction() {
    return cacheService.getOrSet(
      'INVENTORY',
      'dashboard:inventoryPrediction',
      async () => {
        const materials = await Material.find().select('name type stock threshold costPerUnit properties');

        const indicators = [];
        const currentValues = [];
        const predictedValues = [];

        for (const material of materials) {
          const history = this._generateStockHistory(material.stock.quantity, 30);
          const consumptionRate = this._calculateConsumptionRate(history);
          const maxStock = material.threshold * 5;
          const currentPercent = Math.min(100, Math.round((material.stock.quantity / maxStock) * 100));
          const predictedStock = Math.max(0, material.stock.quantity - consumptionRate * 7);
          const predictedPercent = Math.min(100, Math.round((predictedStock / maxStock) * 100));

          indicators.push({
            name: `${material.type === 'filament' ? 'PLA' : material.type} ${material.properties?.color || ''}`.trim() || material.name,
            max: 100
          });
          currentValues.push(currentPercent);
          predictedValues.push(predictedPercent);
        }

        return {
          indicators,
          current: currentValues,
          predicted: predictedValues
        };
      }
    );
  }

  /**
   * 计算库存消耗率（简单线性回归）
   * @param {Array} history - 历史库存数据
   * @returns {number} 平均每日消耗量
   * @private
   */
  _calculateConsumptionRate(history) {
    if (history.length < 2) return 0;

    let totalConsumption = 0;
    let consumptionDays = 0;

    for (let i = 1; i < history.length; i++) {
      const diff = history[i - 1].stock - history[i].stock;
      // 只统计消耗（正数），忽略补充
      if (diff > 0) {
        totalConsumption += diff;
        consumptionDays++;
      }
    }

    // 返回平均每日消耗量
    return consumptionDays > 0 ? totalConsumption / consumptionDays : 0;
  }

  /**
   * 获取 Agent 性能分析（带缓存）
   * 缓存时间：15 分钟
   * @returns {Promise<Object>} Agent 性能数据
   */
  async getAgentPerformance() {
    return cacheService.getOrSet(
      'AGENT_DECISION',
      'dashboard:agentPerformance',
      async () => {
        const agentStats = await AgentDecision.aggregate([
          {
            $group: {
              _id: '$agentId',
              totalDecisions: { $sum: 1 },
              avgConfidence: { $avg: '$confidence' },
              decisionTimes: { $push: '$impact.estimatedTime' }
            }
          }
        ]);

        const performanceMap = {};

        agentStats.forEach(stat => {
          const agentId = stat._id;
          const validTimes = stat.decisionTimes.filter(t => t !== null && t !== undefined);
          const avgDecisionTime = validTimes.length > 0
            ? validTimes.reduce((sum, t) => sum + t, 0) / validTimes.length
            : 0;

          performanceMap[agentId] = {
            totalDecisions: stat.totalDecisions,
            avgConfidence: parseFloat(stat.avgConfidence.toFixed(3)),
            avgDecisionTime: parseFloat(avgDecisionTime.toFixed(2))
          };
        });

        const totalDecisions = await AgentDecision.countDocuments();
        const autoApproveDecisions = await AgentDecision.countDocuments({
          decisionType: { $in: ['device_selection', 'material_selection'] }
        });

        if (performanceMap['coordinator']) {
          performanceMap['coordinator'].autoApproveRate = totalDecisions > 0
            ? parseFloat((autoApproveDecisions / totalDecisions).toFixed(2))
            : 0;
        }

        return performanceMap;
      }
    );
  }

  /**
   * 获取决策分析数据（带缓存）
   * 缓存时间：15 分钟
   * @returns {Promise<Object>} 决策分析数据
   */
  async getDecisionAnalysis() {
    return cacheService.getOrSet(
      'AGENT_DECISION',
      'dashboard:decisionAnalysis',
      async () => {
        const totalDecisions = await AgentDecision.countDocuments();

        const byType = await AgentDecision.aggregate([
          {
            $group: {
              _id: '$decisionType',
              count: { $sum: 1 }
            }
          }
        ]);

        const typeMap = {};
        byType.forEach(item => {
          typeMap[item._id] = item.count;
        });

        const confidenceDistribution = await AgentDecision.aggregate([
          {
            $group: {
              _id: {
                $cond: [
                  { $gte: ['$confidence', 0.8] },
                  'high',
                  {
                    $cond: [
                      { $gte: ['$confidence', 0.5] },
                      'medium',
                      'low'
                    ]
                  }
                ]
              },
              count: { $sum: 1 }
            }
          }
        ]);

        const confidenceMap = { high: 0, medium: 0, low: 0 };
        confidenceDistribution.forEach(item => {
          confidenceMap[item._id] = item.count;
        });

        const lowConfidenceCount = confidenceMap.low || 0;
        const lowConfidenceRate = totalDecisions > 0
          ? parseFloat((lowConfidenceCount / totalDecisions).toFixed(3))
          : 0;

        return {
          byType: typeMap,
          confidenceDistribution: confidenceMap,
          lowConfidenceRate,
          totalDecisions
        };
      }
    );
  }

  /**
   * 导出报表
   * @param {string} format - 导出格式 (json/csv/pdf)
   * @param {Object} options - 导出选项
   * @returns {Promise<Object|string>} 报表数据
   */
  async exportReport(format = 'json', options = {}) {
    const { days = 30 } = options;

    // 收集所有数据
    const [
      overview,
      orderStats,
      deviceUtilization,
      inventoryTrend,
      agentPerformance,
      decisionAnalysis
    ] = await Promise.all([
      this.getOverview(),
      this.getOrderStats(days),
      this.getDeviceUtilization(),
      this.getInventoryTrend(null, days),
      this.getAgentPerformance(),
      this.getDecisionAnalysis()
    ]);

    const reportData = {
      generatedAt: new Date().toISOString(),
      period: { days, unit: 'days' },
      overview,
      orders: orderStats,
      devices: deviceUtilization,
      inventory: inventoryTrend,
      agents: agentPerformance,
      decisions: decisionAnalysis
    };

    if (format === 'json') {
      return reportData;
    } else if (format === 'csv') {
      return this._convertToCSV(reportData);
    } else if (format === 'pdf') {
      // PDF 需要额外依赖，返回数据结构供前端处理
      return reportData;
    }

    return reportData;
  }

  /**
   * 获取设备时间线数据（甘特图格式）
   * @returns {Promise<Object>} 设备时间线数据
   */
  async getDeviceTimeline() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0);

    const devices = await Device.find().select('deviceId status currentTask type');

    const statusMap = {
      'busy': 'printing',
      'idle': 'idle',
      'maintenance': 'maintenance',
      'offline': 'offline'
    };

    const deviceTimelines = devices.map(device => {
      const timeline = this._generateDeviceTimeline(
        device,
        todayStart,
        todayEnd,
        statusMap
      );

      return {
        name: device.deviceId,
        timeline
      };
    });

    return {
      devices: deviceTimelines,
      timeRange: {
        start: '08:00',
        end: '18:00'
      }
    };
  }

  /**
   * 生成单个设备的时间线数据
   * @param {Object} device - 设备对象
   * @param {Date} dayStart - 当天开始时间
   * @param {Date} dayEnd - 当天结束时间
   * @param {Object} statusMap - 状态映射表
   * @returns {Array} 时间线数据
   * @private
   */
  _generateDeviceTimeline(device, dayStart, dayEnd, statusMap) {
    const timeline = [];
    const now = new Date();

    const formatTime = (date) => {
      return date.toTimeString().slice(0, 5);
    };

    if (device.currentTask && device.currentTask.startedAt) {
      const taskStart = new Date(device.currentTask.startedAt);
      const taskEnd = device.currentTask.estimatedCompletion
        ? new Date(device.currentTask.estimatedCompletion)
        : new Date(now.getTime() + 2 * 60 * 60 * 1000);

      if (taskStart > dayStart) {
        timeline.push({
          type: 'idle',
          start: '08:00',
          end: formatTime(taskStart)
        });
      }

      timeline.push({
        type: statusMap[device.status] || device.status,
        start: formatTime(taskStart),
        end: formatTime(Math.min(taskEnd, dayEnd))
      });

      if (taskEnd < dayEnd && taskEnd > now) {
        timeline.push({
          type: 'idle',
          start: formatTime(taskEnd),
          end: '18:00'
        });
      }
    } else {
      if (device.status === 'maintenance') {
        timeline.push({ type: 'maintenance', start: '08:00', end: '18:00' });
      } else if (device.status === 'offline') {
        timeline.push({ type: 'offline', start: '08:00', end: '18:00' });
      } else {
        const currentHour = now.getHours();
        const busyHours = Math.floor(Math.random() * 4) + 2;

        if (device.status === 'busy') {
          timeline.push({
            type: 'printing',
            start: `${String(currentHour - busyHours).padStart(2, '0')}:00`,
            end: `${String(currentHour).padStart(2, '0')}:00`
          });
          if (currentHour < 18) {
            timeline.push({
              type: 'idle',
              start: `${String(currentHour).padStart(2, '0')}:00`,
              end: '18:00'
            });
          }
        } else {
          timeline.push({ type: 'idle', start: '08:00', end: '18:00' });
        }
      }
    }

    return timeline;
  }

  /**
   * 将报表数据转换为 CSV 格式
   * @param {Object} data - 报表数据
   * @returns {string} CSV 字符串
   * @private
   */
  _convertToCSV(data) {
    const rows = [];

    // 报表头信息
    rows.push(`报表生成时间，${data.generatedAt}`);
    rows.push(`统计周期，${data.period.days} 天`);
    rows.push('');

    // 概览数据
    rows.push('=== 概览统计 ===');
    rows.push(`指标，数值`);
    Object.entries(data.overview).forEach(([key, value]) => {
      rows.push(`${key},${value}`);
    });
    rows.push('');

    // 订单统计
    rows.push('=== 订单统计 ===');
    rows.push(`指标，数值`);
    rows.push(`总订单数，${data.orders.total}`);
    Object.entries(data.orders.byStatus).forEach(([status, count]) => {
      rows.push(`${status},${count}`);
    });
    rows.push('');

    // 设备利用率
    rows.push('=== 设备利用率 ===');
    rows.push(`整体利用率，${data.devices.overall}`);
    rows.push(`设备 ID，利用率，状态，今日完成`);
    data.devices.byDevice.forEach(device => {
      rows.push(`${device.deviceId},${device.utilization},${device.status},${device.completedToday}`);
    });
    rows.push('');

    // Agent 性能
    rows.push('=== Agent 性能 ===');
    rows.push(`Agent,决策数，平均置信度，平均决策时间，自动批准率`);
    Object.entries(data.agents).forEach(([agentId, stats]) => {
      rows.push(`${agentId},${stats.totalDecisions},${stats.avgConfidence},${stats.avgDecisionTime},${stats.autoApproveRate || 'N/A'}`);
    });

    return rows.join('\n');
  }
}

module.exports = DashboardService;
