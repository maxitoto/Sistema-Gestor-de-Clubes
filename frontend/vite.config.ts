import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteAliases } from './vite.ts.config.paths.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: viteAliases,
  }
})
