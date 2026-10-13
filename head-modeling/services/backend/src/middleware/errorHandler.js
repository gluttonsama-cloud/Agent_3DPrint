/**
 * 统一错误处理中间件
 * 捕获所有未处理的错误，格式化错误响应，记录错误日志
 */

const response = require('../utils/response');

/**
 * 错误类型枚举
 */
const ErrorTypes = {
  // 客户端错误（4xx）
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  
  // 服务端错误（5xx）
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  
  // 业务错误
  BUSINESS_ERROR: 'BUSINESS_ERROR',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED'
};

/**
 * 自定义应用错误类
 * 用于业务逻辑中抛出结构化的错误
 */
class AppError extends Error {
  constructor(message, errorCode = ErrorTypes.BUSINESS_ERROR, statusCode = 400, details = null) {
    super(message);
    this.name = 'AppError';
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // 标记为业务错误，非程序 bug
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 验证错误类（快捷方式）
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, ErrorTypes.VALIDATION_ERROR, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * 资源未找到错误类（快捷方式）
 */
class NotFoundError extends AppError {
  constructor(message = '资源未找到') {
    super(message, ErrorTypes.NOT_FOUND, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * 未授权错误类（快捷方式）
 */
class UnauthorizedError extends AppError {
  constructor(message = '未授权访问') {
    super(message, ErrorTypes.UNAUTHORIZED, 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * 格式化错误响应
 * @param {Error} err - 错误对象
 * @param {object} req - Express 请求对象
 * @returns {object} 格式化的错误响应
 */
function formatError(err, req) {
  const isDev = process.env.NODE_ENV === 'development';
  
  // 业务错误（已知错误）
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: {
        success: false,
        error: {
          code: err.errorCode,
          message: err.message,
          details: err.details,
          ...(isDev && { stack: err.stack })
        },
        timestamp: new Date().toISOString(),
        ...(isDev && { path: req.path })
      }
    };
  }
  
  // Mongoose 验证错误
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map(e => e.message)
      .join('; ');
    
    return {
      statusCode: 400,
      body: {
        success: false,
        error: {
          code: ErrorTypes.VALIDATION_ERROR,
          message: `数据验证失败：${message}`,
          ...(isDev && { details: err.errors })
        },
        timestamp: new Date().toISOString()
      }
    };
  }
  
  // Mongoose 重复键错误
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return {
      statusCode: 409,
      body: {
        success: false,
        error: {
          code: ErrorTypes.CONFLICT,
          message: `${field} 已存在`,
          details: { field, value: err.keyValue[field] }
        },
        timestamp: new Date().toISOString()
      }
    };
  }
  
  // Mongoose 类型转换错误
  if (err.name === 'CastError') {
    return {
      statusCode: 400,
      body: {
        success: false,
        error: {
          code: ErrorTypes.VALIDATION_ERROR,
          message: `无效的 ${err.path} 格式：${err.value}`
        },
        timestamp: new Date().toISOString()
      }
    };
  }
  
  // 未知错误（服务端错误）
  const statusCode = err.statusCode || err.status || 500;
  return {
    statusCode,
    body: {
      success: false,
      error: {
        code: statusCode === 500 ? ErrorTypes.INTERNAL_ERROR : (err.errorCode || 'ERROR'),
        message: err.message || '服务器内部错误',
        ...(isDev && { stack: err.stack, details: err.details })
      },
      timestamp: new Date().toISOString(),
      ...(isDev && { path: req.path })
    }
  };
}

/**
 * 记录错误日志
 * @param {Error} err - 错误对象
 * @param {object} req - Express 请求对象
 * @param {boolean} isOperational - 是否为业务错误
 */
function logError(err, req, isOperational = false) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.errorCode || err.code
    }
  };
  
  // 业务错误只记录警告
  if (isOperational) {
    console.warn(`[业务错误] ${timestamp} - ${err.name}: ${err.message}`);
  } else {
    // 程序 bug 记录错误并输出完整堆栈
    console.error(`[程序错误] ${timestamp}`);
    console.error(`路径：${req.method} ${req.path}`);
    console.error(`错误：${err.name}: ${err.message}`);
    console.error(`堆栈：${err.stack}`);
    console.error(`请求数据：`, JSON.stringify(logEntry, null, 2));
  }
}

/**
 * Express 错误处理中间件
 * 必须放在所有路由之后
 * @param {Error} err - 错误对象
 * @param {Request} req - Express 请求对象
 * @param {Response} res - Express 响应对象
 * @param {NextFunction} next - Express 下一个中间件
 */
function errorHandler(err, req, res, next) {
  const isOperational = err instanceof AppError || err.isOperational;
  
  // 记录错误日志
  logError(err, req, isOperational);
  
  // 格式化并发送错误响应
  const formatted = formatError(err, req);
  res.status(formatted.statusCode).json(formatted.body);
}

/**
 * 异步处理器包装器
 * 自动捕获 async 路由处理器中的错误并传递给 next()
 * @param {Function} fn - async 路由处理器函数
 * @returns {Function} Express 路由处理器
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  asyncHandler,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ErrorTypes,
  formatError,
  logError
};
