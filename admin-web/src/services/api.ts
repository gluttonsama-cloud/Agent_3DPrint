import axios from 'axios';

// 从环境变量读取配置
const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL,
  timeout: 60000, // 60 秒超时（LLM 决策可能需要较长时间）
});

// 请求拦截器 - 添加错误处理
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error.message);
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    console.log(`[API] Response: ${response.status}`);
    return response.data;
  },
  (error) => {
    console.error('[API] Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;
