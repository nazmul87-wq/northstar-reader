import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs are required for Tauri’s custom protocol; absolute `/assets/...`
  // paths load in the browser but fail in the desktop WebView, yielding a blank window.
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  clearScreen: false,
})
