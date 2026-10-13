const { createLogger } = require('../utils/logger');

const logger = createLogger('HTTP');

function requestLogger(req, res, next) {
  const startTime = Date.now();
  
  logger.request(req);
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.response(req, res.statusCode, duration);
  });
  
  next();
}

module.exports = requestLogger;