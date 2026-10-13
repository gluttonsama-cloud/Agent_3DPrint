const path = require('path');

// 从服务目录加载环境文件，避免启动位置改变后读取错误配置。
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(requestId);
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', scope: 'head-modeling' });
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/status', require('./routes/status'));
app.use('/api/download', require('./routes/download'));
app.use('/api/remove-background', require('./routes/backgroundRemoval'));
app.use('/api/health', require('./routes/health'));

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    requestId: req.requestId
  });
});
app.use(errorHandler);

// 测试导入时不启动监听；唯一正式启动入口是本文件。
if (require.main === module) {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => {
    console.log(`头部建模 API 已启动：http://localhost:${port}`);
  });
}

module.exports = app;
