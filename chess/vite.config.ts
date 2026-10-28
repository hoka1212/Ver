/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works both at / and under /Ver/chess/ on GitHub Pages.
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Библиотеки отдельно от кода приложения — лучше кэшируются.
        advancedChunks: { groups: [{ name: 'vendor', test: /node_modules/ }] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
