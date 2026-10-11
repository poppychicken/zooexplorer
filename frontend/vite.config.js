import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev mirrors prod: the SPA and the API share an origin. In prod one
// uvicorn serves both; in dev this proxy fakes it. That is why there is no
// CORS middleware in the backend and no cookie/credentials handling here.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
})
