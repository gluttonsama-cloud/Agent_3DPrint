import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // 后端 API 代理配置
      proxy: {
        // 代理后端 REST API 请求
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        // 代理 Socket.IO WebSocket 连接
        '/socket.io': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          ws: true, // 启用 WebSocket 代理
        },
      },
    },
  };
});
