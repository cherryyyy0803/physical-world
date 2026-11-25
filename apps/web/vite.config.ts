import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  // 工作区内的包直接引用源码，交给 Vite 自己转译，不要预构建
  optimizeDeps: {
    exclude: ['@pw/physics-core', '@pw/contracts'],
  },
});
