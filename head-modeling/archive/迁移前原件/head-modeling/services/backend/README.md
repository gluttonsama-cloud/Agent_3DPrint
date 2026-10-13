# 3D 头部建模 API - 后端服务

> 版本：v2.0.0 (混元 + 七牛云版)

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 API 密钥
```

### 3. 启动服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 4. 测试
访问 http://localhost:3000/health

## API 文档

### 上传照片
```
POST /api/upload
Content-Type: multipart/form-data

参数：
- photos: 图片文件数组（3-5 张）
```

### 查询状态
```
GET /api/status/:taskId
```

## 技术栈
- Node.js + Express
- 腾讯混元 3D API
- 七牛云 Kodo
