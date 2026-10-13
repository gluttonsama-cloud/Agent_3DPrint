const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '3D 头部建模 API',
      version: '2.0.0',
      description: '照片上传、图像预处理、3D 生成与模型下载 API',
      contact: {
        name: 'API Support'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: '开发服务器'
      }
    ],
    tags: [
      { name: 'Upload', description: '文件上传' },
      { name: 'Health', description: '健康检查' }
    ]
  },
  apis: [
    path.join(__dirname, '../routes/*.js').replace(/\\/g, '/')
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
