import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { aiLayoutHandler } from './server/aiLayout'

/** Mounts the server-side Claude endpoint on both `vite` (dev) and `vite preview`. */
function aiApi(): Plugin {
  return {
    name: 'aangan-ai-api',
    configureServer(server) {
      server.middlewares.use('/api/ai-layout', (req, res) => void aiLayoutHandler(req, res))
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai-layout', (req, res) => void aiLayoutHandler(req, res))
    },
  }
}

export default defineConfig({
  plugins: [react(), aiApi()],
  build: { chunkSizeWarningLimit: 1200 },
})
