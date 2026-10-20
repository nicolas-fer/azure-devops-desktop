import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// realpath evita divergência de caminhos em pastas virtualizadas do Windows
const root = realpathSync.native(__dirname)

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: resolve(root, 'src/renderer'),
    resolve: { alias: { '@': resolve(root, 'src/renderer/src') } },
    build: { rollupOptions: { input: resolve(root, 'src/renderer/index.html') } },
    plugins: [react(), tailwindcss()]
  }
})
