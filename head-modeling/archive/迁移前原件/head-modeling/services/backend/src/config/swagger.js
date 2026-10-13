const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '3D 头部建模 API',
      version: '2.0.0',
      description: '3D 头部建模打印系统后端 API 文档',
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
      { name: 'Orders', description: '订单管理' },
      { name: 'Devices', description: '设备管理' },
      { name: 'Materials', description: '材料管理' },
      { name: 'Dashboard', description: '仪表盘' },
      { name: 'Agents', description: 'Agent 管理' },
      { name: 'Upload', description: '文件上传' },
      { name: 'Health', description: '健康检查' }
    ]
  },
  apis: [
    './src/routes/*.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;