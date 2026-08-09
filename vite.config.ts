import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const BACKEND = process.env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Same-origin in dev so the backend's root-relative `file_url`
      // values (`/uploads/...`) resolve without any rewriting.
      '/api': { target: BACKEND, changeOrigin: true },
      '/uploads': { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep the big, rarely-changing libraries in their own long-lived
        // chunks so an app change doesn't invalidate them.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          query: ['@tanstack/react-query', '@tanstack/react-table'],
          // The Auth SDK is needed on the login screen, so it cannot be
          // deferred — but it changes on its own release cadence and is worth
          // caching separately from app code.
          firebase: ['firebase/app', 'firebase/auth'],
        },
      },
    },
  },
})
