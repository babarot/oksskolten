import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    coverage: {
      exclude: [
        'src/pages/**',
        'src/components/settings/**',
        'src/components/chat/**',
        'src/components/layout/**',
        'src/App.tsx',
        'src/components/ui/Mascot.tsx',
        'src/data/aiModels.ts',
        'src/lib/articleFonts.ts',
      ],
    },
    projects: [
      {
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
        test: {
          name: 'server',
          include: ['server/**/*.test.ts'],
          environment: 'node',
          env: { DATABASE_URL: ':memory:', AUTH_DISABLED: '1', NODE_ENV: 'test' },
          setupFiles: ['server/__tests__/setup.ts'],
        },
      },
      {
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
        },
        test: {
          name: 'client',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          environmentOptions: {
            jsdom: { url: 'http://localhost' },
          },
          setupFiles: ['src/__tests__/setup.ts'],
        },
      },
    ],
  },
})
