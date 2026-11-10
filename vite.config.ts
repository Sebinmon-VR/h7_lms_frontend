import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Lets a teacher see every student in the call's main grid.
 *
 * The Azure call screen keeps its grid to the "optimal video count" (about four)
 * as soon as anyone's camera is on, and to nine otherwise; everybody else goes into
 * a small paged strip, so a teacher sees four students out of a class. It also plays
 * only that many videos. It has no option for either, so its two gallery layouts are
 * changed here, in the production build. When the page sets them (the call page does,
 * for a teacher):
 *   - `globalThis.__H7_CLASS_GRID__`   - how many people the grid holds (everyone);
 *   - `globalThis.__H7_CLASS_VIDEOS__` - how many of them play live video. Desktop
 *     browsers may show 16 videos at once, so this stays under that; the rest of the
 *     grid shows each person's name tile.
 * Narrow or short windows - phones - keep the library's own limits.
 *
 * If a library update moves the code, the build fails here rather than quietly
 * shrinking teachers' grids again.
 */
function classGallery(): Plugin {
  const wide = '(!isNarrow && !isShort && typeof globalThis.__H7_CLASS_GRID__ === "number")'
  const edits: [string, string][] = [
    [
      'maxGridParticipants: remoteVideosOn ? maxRemoteVideoStreams : MAX_GRID_PARTICIPANTS_NOT_LARGE_GALLERY,',
      `maxGridParticipants: ${wide} ? globalThis.__H7_CLASS_GRID__ : (remoteVideosOn ? maxRemoteVideoStreams : MAX_GRID_PARTICIPANTS_NOT_LARGE_GALLERY),`,
    ],
    [
      'renderTiles(gridParticipants, onRenderRemoteParticipant, maxRemoteVideoStreams,',
      `renderTiles(gridParticipants, onRenderRemoteParticipant, (${wide} && typeof globalThis.__H7_CLASS_VIDEOS__ === "number") ? globalThis.__H7_CLASS_VIDEOS__ : maxRemoteVideoStreams,`,
    ],
  ]
  const files = /communication-react[\\/].*VideoGallery[\\/](DefaultLayout|FloatingLocalVideoLayout)\.js$/
  return {
    name: 'h7-class-gallery',
    enforce: 'pre',
    transform(code, id) {
      if (!files.test(id.split('?')[0])) return null
      let out = code
      for (const [from, to] of edits) {
        if (!out.includes(from)) {
          this.error(`h7-class-gallery: "${from.slice(0, 40)}…" was not found in ${id}; the Azure call UI has changed.`)
        }
        out = out.replace(from, to)
      }
      return { code: out, map: null }
    },
  }
}

export default defineConfig(({ command, mode }) => {
  // `loadEnv` reads the .env files *and* matching `process.env` entries, which
  // is how CI supplies these. Checked here rather than in `src/lib/env.ts`
  // because only this file runs in Node at build time — a throw in app code
  // would not fail the build, it would just white-screen the browser.
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // Where the dev server proxies /api, /uploads and /files. Read through
  // `loadEnv`, not `process.env`: Vite does not copy .env files into
  // `process.env` before evaluating this file, so a value set only in .env
  // would be silently ignored and the proxy would always hit localhost.
  const BACKEND = (env.VITE_BACKEND_ORIGIN ?? '').trim() || 'http://127.0.0.1:8000'
  if (command === 'build') {
    const apiBase = (env.VITE_API_BASE ?? '').trim()
    const hint =
      'Set it in the build environment (GitHub repo Settings > Secrets and\n' +
      'variables > Actions > Variables), e.g.\n' +
      '  VITE_API_BASE=https://my-api.azurewebsites.net'

    if (!apiBase) {
      throw new Error(
        'VITE_API_BASE is empty. A production build must point at the absolute\n' +
          'origin of the API — the dev server proxy that makes an empty value\n' +
          'work locally does not exist in a build, so every request would fall\n' +
          `back to the site's own origin.\n${hint}`,
      )
    }
    // Without a scheme this is a *relative* URL, so requests resolve against
    // the static site instead: https://<site>/my-api.azurewebsites.net/api/v1.
    // That fails as 404s rather than anything that names the real problem.
    if (!/^https?:\/\//i.test(apiBase)) {
      throw new Error(
        `VITE_API_BASE is missing its scheme: "${apiBase}".\n` +
          'A bare hostname is treated as a relative path, so requests would go\n' +
          `to https://<this-site>/${apiBase}/api/v1/... and 404.\n${hint}`,
      )
    }
    try {
      const url = new URL(apiBase)
      if (url.pathname !== '/' || url.search || url.hash) {
        throw new Error(
          `VITE_API_BASE must be an origin only: "${apiBase}".\n` +
            'src/lib/env.ts appends /api/v1 itself, so any path, query or\n' +
            `fragment here produces a malformed URL.\n${hint}`,
        )
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('VITE_API_BASE')) throw error
      throw new Error(`VITE_API_BASE is not a valid URL: "${apiBase}".\n${hint}`)
    }
  }

  return {
    plugins: [react(), classGallery()],
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
        // School files, profile photos included: the backend redirects these
        // to a short-lived storage link.
        '/files': { target: BACKEND, changeOrigin: true },
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
            // The Azure calling UI is deliberately NOT listed: left to the
            // lazy /call route it is only downloaded by somebody joining a class.
          },
        },
      },
    },
  }
})
