import path from 'path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

/**
 * Vite plugin that redirects module imports to their .demo counterparts.
 * Works with relative imports by hooking into resolveId after Vite resolves
 * the relative path to an absolute path.
 */
function demoAlias(mappings: Record<string, string>): Plugin {
  return {
    name: 'demo-alias',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved) return null
      const replacement = mappings[resolved.id]
      return replacement ?? null
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const port = Number(env.VITE_PORT || 5173)
  const libDir = path.resolve(__dirname, 'src/lib')

  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        onwarn(warning, defaultHandler) {
          // Suppress font resolution warnings (tex-gyre-pagella legacy formats)
          if (warning.message?.includes("didn't resolve at build time")) return
          // Suppress dynamic/static import mixing warnings
          if (warning.code === 'MIXED_DYNAMIC_STATIC') return
          defaultHandler(warning)
        },
      },
    },
    plugins: [
      ...(mode === 'demo' ? [demoAlias({
        [path.join(libDir, 'fetcher.ts')]: path.join(libDir, 'fetcher.demo.ts'),
        [path.join(libDir, 'search.ts')]: path.join(libDir, 'search.demo.ts'),
        [path.join(libDir, 'auth-shell.tsx')]: path.join(libDir, 'auth-shell.demo.tsx'),
      })] : []),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/favicon-black.png', 'icons/favicon-white.png', 'apple-touch-icon-180x180.png'],
        manifest: {
          name: 'Oksskolten',
          short_name: 'Oksskolten',
          description: 'Personal RSS Reader',
          lang: 'en',
          theme_color: '#ffffff',
          background_color: '#4D6782',
          display: 'standalone',
          scope: '/',
          start_url: '/inbox',
          icons: [
            {
              src: 'pwa-64x64.png',
              sizes: '64x64',
              type: 'image/png',
            },
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'icons/favicon-black.png',
              sizes: '64x64',
              type: 'image/png',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: mode === 'demo' ? 5 * 1024 * 1024 : 2 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /google\.com\/s2\/favicons/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'favicons',
                expiration: { maxEntries: 200, maxAgeSeconds: 2592000 },
              },
            },
            {
              urlPattern: /\/api\/articles\/by-url/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'article-detail',
                expiration: { maxEntries: 200, maxAgeSeconds: 604800 },
              },
            },
            {
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/api/')
                && url.pathname !== '/api/health'
                && url.pathname !== '/api/me'
                && url.pathname !== '/api/login'
                && url.pathname !== '/api/logout'
                && !url.pathname.startsWith('/api/auth/')
                && !url.pathname.startsWith('/api/oauth/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api',
                expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
                networkTimeoutSeconds: 5,
              },
            },
            {
              urlPattern: /\.(png|jpg|jpeg|webp|gif)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: { maxEntries: 100, maxAgeSeconds: 2592000 },
              },
            },
          ],
        },
      }),
    ],
    server: {
      host: '0.0.0.0',
      port,
      watch: env.CHOKIDAR_USEPOLLING === 'true'
        ? { usePolling: true, interval: 300 }
        : undefined,
      proxy: {
        '/api': env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:13000',
      },
    },
  }
})
