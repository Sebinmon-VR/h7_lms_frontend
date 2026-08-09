import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const BACKEND = process.env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:8000'

export default defineConfig(({ command, mode }) => {
  // `loadEnv` reads the .env files *and* matching `process.env` entries, which
  // is how CI supplies these. Checked here rather than in `src/lib/env.ts`
  // because only this file runs in Node at build time — a throw in app code
  // would not fail the build, it would just white-screen the browser.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (command === 'build' && !(env.VITE_API_BASE ?? '').trim()) {
    throw new Error(
      'VITE_API_BASE is empty. A production build must point at the absolute\n' +
        'origin of the API (e.g. https://my-api.azurewebsites.net) — the dev\n' +
        'server proxy that makes an empty value work locally does not exist in\n' +
        'a build, so requests would fall back to the site\'s own origin.\n' +
        'Set it in the build environment (GitHub repo Settings > Variables).',
    )
  }

  return {
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
  }
})
