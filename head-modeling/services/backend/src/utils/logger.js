const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

class Logger {
  constructor(context = 'App') {
    this.context = context;
  }

  _format(level, message, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...meta
    };
    return JSON.stringify(logEntry);
  }

  debug(message, meta = {}) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(this._format(LogLevel.DEBUG, message, meta));
    }
  }

  info(message, meta = {}) {
    console.log(this._format(LogLevel.INFO, message, meta));
  }

  warn(message, meta = {}) {
    console.warn(this._format(LogLevel.WARN, message, meta));
  }

  error(message, meta = {}) {
    console.error(this._format(LogLevel.ERROR, message, meta));
  }

  request(req, message = 'Request') {
    this.info(message, {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined
    });
  }

  response(req, statusCode, duration) {
    this.info('Response', {
      requestId: req.requestId,
      statusCode,
      duration: `${duration}ms`
    });
  }
}

function createLogger(context) {
  return new Logger(context);
}

module.exports = {
  Logger,
  createLogger,
  LogLevel
};