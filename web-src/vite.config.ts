import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 9173,
    strictPort: true,
  },
  build: {
    outDir: '../web',
    emptyOutDir: true,
  },
  base: './',
})
