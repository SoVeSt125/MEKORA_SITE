import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: process.env.MEKORA_BACKEND_URL || 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: { output: { manualChunks: { charts: ['recharts'], query: ['@tanstack/react-query'] } } },
  },
})
