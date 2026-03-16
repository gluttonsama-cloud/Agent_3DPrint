/**
 * 统一响应格式工具
 * 提供标准化的 API 响应格式，确保所有接口返回一致的数据结构
 */

/**
 * 生成标准成功响应
 * @param {any} data - 响应数据
 * @param {string} message - 成功消息
 * @param {number} statusCode - HTTP 状态码（默认 200）
 * @returns {object} 标准响应对象
 */
function success(data = null, message = '操作成功', statusCode = 200) {
  return {
    statusCode,
    body: {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * 生成标准错误响应
 * @param {string} message - 错误消息
 * @param {string} errorCode - 错误代码
 * @param {number} statusCode - HTTP 状态码（默认 400）
 * @param {any} details - 详细错误信息（可选）
 * @returns {object} 标准响应对象
 */
function error(message = '操作失败', errorCode = 'ERROR', statusCode = 400, details = null) {
  return {
    statusCode,
    body: {
      success: false,
      error: {
        code: errorCode,
        message,
        details
      },
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * 生成标准分页响应
 * @param {Array} items - 数据列表
 * @param {object} pagination - 分页信息 {page, limit, total, totalPages}
 * @param {string} message - 成功消息
 * @returns {object} 标准分页响应对象
 */
function paginated(items = [], pagination = {}, message = '获取成功') {
  return {
    statusCode: 200,
    body: {
      success: true,
      data: {
        items,
        pagination: {
          page: pagination.page || 1,
          limit: pagination.limit || 10,
          total: pagination.total || 0,
          totalPages: pagination.totalPages || 0
        }
      },
      message,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Express 中间件形式的响应助手
 * 自动处理响应格式化和状态码设置
 * @returns {Function} Express 中间件函数
 */
function responseMiddleware() {
  return (req, res, next) => {
    // 扩展 res 对象，添加便捷方法
    res.success = (data, message, statusCode = 200) => {
      const response = success(data, message, statusCode);
      res.status(statusCode).json(response.body);
    };

    res.error = (message, errorCode, statusCode = 400, details = null) => {
      const response = error(message, errorCode, statusCode, details);
      res.status(statusCode).json(response.body);
    };

    res.paginated = (items, pagination, message) => {
      const response = paginated(items, pagination, message);
      res.status(200).json(response.body);
    };

    next();
  };
}

module.exports = {
  success,
  error,
  paginated,
  responseMiddleware
};
