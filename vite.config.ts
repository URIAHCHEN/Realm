import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 按依赖体积与变更频率拆包：
        // 1) 第三方依赖很少变动，单独成块可长期命中浏览器缓存；
        // 2) 业务代码改动时不会让整包缓存失效；
        // 3) 图表/Excel 只在对应页面用到，可按需加载。
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'vendor-charts';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('html2canvas')) return 'vendor-canvas';
          if (id.includes('@radix-ui')) return 'vendor-ui';
          // React 核心与其直接依赖（scheduler / react-is 等）必须和
          // 引用它们的 UI 库同块，否则会形成循环块（vendor-react ↔ vendor-misc），
          // 带来运行时初始化顺序风险。这些依赖都很稳定，合并不影响缓存收益。
          return 'vendor-core';
        },
      },
    },
    // 单块超过此值会告警，拆包后各块均低于该阈值
    chunkSizeWarningLimit: 600,
  },
});
