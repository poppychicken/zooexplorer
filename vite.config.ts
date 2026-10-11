/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/zooexplorer/ on GitHub Pages.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/zooexplorer/' : '/',
  plugins: [react()],
  build: {
    // Rapier ships its physics engine as inlined WASM, which dominates the bundle.
    chunkSizeWarningLimit: 4000,
  },
  test: {
    environment: 'node',
  },
}))
