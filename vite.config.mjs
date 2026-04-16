import { defineConfig } from 'vite'

export default defineConfig({
  base: '/raghaj/',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    minify: true,
    assetsInlineLimit: 0
  }
})
