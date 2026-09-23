import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    // Vite's preview server rejects requests whose Host header it doesn't
    // recognize by default. Railway serves this through a dynamically
    // assigned *.up.railway.app domain (or a custom domain added later),
    // so without this every request gets "Blocked request. This host is
    // not allowed" instead of the app.
    host: true,
    allowedHosts: true,
  },
  plugins: [react()],
})
