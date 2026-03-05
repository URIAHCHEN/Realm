import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/Realm/', // ← 改成你的仓库名！必须以 / 开头和结尾
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})