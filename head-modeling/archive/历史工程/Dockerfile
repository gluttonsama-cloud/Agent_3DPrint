FROM node:18-alpine

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制应用代码
COPY . .

# 创建必要的目录
RUN mkdir -p uploads

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]