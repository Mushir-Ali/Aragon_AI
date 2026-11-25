import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Dev only: forward API calls to the Node server so there is no CORS in dev
  // and the client can use bare /api paths everywhere.
  server: {
    proxy: { '/api': 'http://localhost:4000' },
  },
})
