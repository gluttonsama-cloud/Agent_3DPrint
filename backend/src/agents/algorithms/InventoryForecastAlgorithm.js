/**
 * 库存预测算法
 * 
 * 提供多种预测方法：简单移动平均、加权移动平均、线性回归
 * 用于预测未来材料消耗趋势
 */

const {
  calculateAverageDailyConsumption,
  calculateTrend,
  fetchHistoricalConsumption
} = require('../../utils/consumptionCalculator');

/**
 * 预测方法枚举
 */
const ForecastMethod = {
  SIMPLE_MOVING_AVERAGE: 'simple_moving_average',  // 简单移动平均
  WEIGHTED_MOVING_AVERAGE: 'weighted_moving_average', // 加权移动平均
  LINEAR_REGRESSION: 'linear_regression'           // 线性回归
};

/**
 * 库存预测算法类
 */
class InventoryForecastAlgorithm {
  /**
   * 创建预测算法实例
   * 
   * @param {Object} config - 配置选项
   */
  constructor(config = {}) {
    this.config = {
      defaultMethod: config.defaultMethod || ForecastMethod.SIMPLE_MOVING_AVERAGE,
      defaultDays: config.defaultDays || 7,
      historicalDays: config.historicalDays || 30,
      weights: config.weights || this._generateWeights(config.weightDays || 7)
    };
  }

  /**
   * 生成加权移动平均的权重
   * 越近的数据权重越大
   * 
   * @param {number} days - 天数
   * @returns {Array} 权重数组
   */
  _generateWeights(days) {
    const weights = [];
    for (let i = 0; i < days; i++) {
      weights.push(i + 1); // 1, 2, 3, ..., days
    }
    // 归一化
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => w / sum);
  }

  /**
   * 简单移动平均预测
   * 
   * @param {Array} historicalData - 历史数据 [{date, consumption}]
   * @param {number} forecastDays - 预测天数
   * @returns {Object} 预测结果
   */
  simpleMovingAverage(historicalData, forecastDays = 7) {
    const avgResult = calculateAverageDailyConsumption(
      historicalData,
      this.config.defaultDays
    );

    const predictedConsumption = avgResult.averageDailyConsumption * forecastDays;
    const trend = avgResult.trend;

    return {
      method: ForecastMethod.SIMPLE_MOVING_AVERAGE,
      predictedConsumption,
      averageDailyConsumption: avgResult.averageDailyConsumption,
      forecastDays,
      confidence: trend.confidence,
      trend: trend.direction,
      historicalDataPoints: historicalData.length
    };
  }

  /**
   * 加权移动平均预测
   * 越近的数据权重越大
   * 
   * @param {Array} historicalData - 历史数据 [{date, consumption}]
   * @param {number} forecastDays - 预测天数
   * @returns {Object} 预测结果
   */
  weightedMovingAverage(historicalData, forecastDays = 7) {
    if (!historicalData || historicalData.length === 0) {
      return {
        method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
        predictedConsumption: 0,
        averageDailyConsumption: 0,
        forecastDays,
        confidence: 0,
        trend: 'stable',
        historicalDataPoints: 0
      };
    }

    // 取最近的 N 天数据
    const recentData = historicalData.slice(-this.config.weights.length);
    
    // 计算加权和
    let weightedSum = 0;
    for (let i = 0; i < recentData.length; i++) {
      const weight = this.config.weights[i] || 1;
      weightedSum += recentData[i].consumption * weight;
    }
    
    // 计算权重和
    const weightSum = this.config.weights.slice(0, recentData.length).reduce((a, b) => a + b, 0);
    
    // 加权平均
    const weightedAverage = weightedSum / weightSum;
    const predictedConsumption = weightedAverage * forecastDays;
    
    // 计算趋势
    const trend = calculateTrend(recentData);

    return {
      method: ForecastMethod.WEIGHTED_MOVING_AVERAGE,
      predictedConsumption,
      averageDailyConsumption: weightedAverage,
      forecastDays,
      confidence: trend.confidence,
      trend: trend.direction,
      historicalDataPoints: recentData.length,
      weights: this.config.weights.slice(0, recentData.length)
    };
  }

  /**
   * 线性回归预测
   * 使用最小二乘法拟合趋势线
   * 
   * @param {Array} historicalData - 历史数据 [{date, consumption}]
   * @param {number} forecastDays - 预测天数
   * @returns {Object} 预测结果
   */
  linearRegression(historicalData, forecastDays = 7) {
    if (!historicalData || historicalData.length < 2) {
      return {
        method: ForecastMethod.LINEAR_REGRESSION,
        predictedConsumption: 0,
        averageDailyConsumption: 0,
        forecastDays,
        confidence: 0,
        trend: 'stable',
        historicalDataPoints: historicalData ? historicalData.length : 0,
        note: '数据不足，无法进行线性回归'
      };
    }

    const trend = calculateTrend(historicalData);
    
    // 使用回归方程预测
    // y = slope * x + intercept
    const lastX = historicalData.length - 1;
    const nextX = lastX + forecastDays;
    
    // 预测未来消耗（使用趋势外推）
    const lastConsumption = historicalData[historicalData.length - 1].consumption;
    const predictedDaily = trend.intercept + trend.slope * nextX;
    
    // 确保预测值不为负
    const predictedDailyConsumption = Math.max(0, predictedDaily);
    const predictedConsumption = predictedDailyConsumption * forecastDays;

    return {
      method: ForecastMethod.LINEAR_REGRESSION,
      predictedConsumption,
      averageDailyConsumption: predictedDailyConsumption,
      forecastDays,
      confidence: trend.confidence,
      trend: trend.direction,
      historicalDataPoints: historicalData.length,
      regression: {
        slope: trend.slope,
        intercept: trend.intercept,
        rSquared: trend.confidence
      }
    };
  }

  /**
   * 执行预测（统一入口）
   * 
   * @param {Array} historicalData - 历史数据
   * @param {Object} options - 选项
   * @returns {Object} 预测结果
   */
  forecast(historicalData, options = {}) {
    const {
      method = this.config.defaultMethod,
      forecastDays = this.config.defaultDays
    } = options;

    switch (method) {
      case ForecastMethod.WEIGHTED_MOVING_AVERAGE:
        return this.weightedMovingAverage(historicalData, forecastDays);
      case ForecastMethod.LINEAR_REGRESSION:
        return this.linearRegression(historicalData, forecastDays);
      case ForecastMethod.SIMPLE_MOVING_AVERAGE:
      default:
        return this.simpleMovingAverage(historicalData, forecastDays);
    }
  }

  /**
   * 从数据库获取数据并预测
   * 
   * @param {string} materialId - 材料 ID（可选）
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 预测结果
   */
  async forecastFromDB(materialId = null, options = {}) {
    const {
      method = this.config.defaultMethod,
      forecastDays = this.config.defaultDays,
      historicalDays = this.config.historicalDays
    } = options;

    // 获取历史数据
    const historicalData = await fetchHistoricalConsumption(materialId, historicalDays);
    
    // 执行预测
    const forecast = this.forecast(historicalData, { method, forecastDays });
    
    // 添加元数据
    return {
      ...forecast,
      materialId,
      generatedAt: new Date().toISOString(),
      historicalRange: {
        days: historicalDays,
        startDate: historicalData[0]?.date,
        endDate: historicalData[historicalData.length - 1]?.date
      }
    };
  }

  /**
   * 比较多种预测方法
   * 
   * @param {Array} historicalData - 历史数据
   * @param {number} forecastDays - 预测天数
   * @returns {Object} 各方法预测结果对比
   */
  compareMethods(historicalData, forecastDays = 7) {
    const methods = [
      ForecastMethod.SIMPLE_MOVING_AVERAGE,
      ForecastMethod.WEIGHTED_MOVING_AVERAGE,
      ForecastMethod.LINEAR_REGRESSION
    ];

    const results = {};
    
    methods.forEach(method => {
      results[method] = this.forecast(historicalData, { method, forecastDays });
    });

    // 推荐最佳方法（基于置信度）
    let bestMethod = methods[0];
    let bestConfidence = results[methods[0]].confidence;
    
    for (const method of methods) {
      if (results[method].confidence > bestConfidence) {
        bestConfidence = results[method].confidence;
        bestMethod = method;
      }
    }

    return {
      results,
      recommended: bestMethod,
      reason: `最高置信度：${bestConfidence.toFixed(3)}`
    };
  }

  /**
   * 更新配置
   * 
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // 如果权重配置变化，重新生成权重
    if (newConfig.weightDays) {
      this.config.weights = this._generateWeights(newConfig.weightDays);
    }
  }

  /**
   * 获取当前配置
   * 
   * @returns {Object} 当前配置
   */
  getConfig() {
    return { ...this.config };
  }
}

module.exports = {
  InventoryForecastAlgorithm,
  ForecastMethod
};
