import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const OUT_DIR = 'dist'

function cleanOldAssets(): Plugin {
  return {
    name: 'clean-old-assets',
    async writeBundle(_options, bundle) {
      const fs = await import('fs/promises')
      const outDir = path.resolve(import.meta.dirname, OUT_DIR)
      const assetsDir = path.join(outDir, 'assets')
      const emitted = new Set<string>(Object.keys(bundle))
      const files = await fs.readdir(assetsDir).catch(() => [] as string[])
      for (const file of files) {
        if (!file.match(/-[A-Za-z0-9_-]+\.(js|css)$/)) continue
        if (!emitted.has(`assets/${file}`)) {
          await fs.unlink(path.join(assetsDir, file))
        }
      }
    },
  }
}


export default defineConfig({
  plugins: [react(), cleanOldAssets()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    modulePreload: {
      polyfill: false,
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => /(?:rolldown-runtime|mui-vendor|react-vendor|index-|client-|siteStore-|useMusicPlayer-)/.test(dep));
      },
    },
    rollupOptions: {
      output: {
        // 把会被大量页面共享的依赖收成少量稳定包，减少首屏 HTTP 往返。
        // 业务页面仍由路由级 dynamic import 懒加载，不进入 vendor。
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor'
          }
          if (id.includes('/@emotion/')) return 'mui-vendor'
          // 首屏框架和首页当前实际会加载的 MUI 基础/交互组件放进两个稳定包，
          // 避免 Rolldown 把它们拆成几十个首屏小请求；后台页面仍按路由懒加载。
          if (id.includes('/@mui/material/')) {
            const entryComponents = [
              '/AppBar/', '/Box/', '/Button/', '/CssBaseline/', '/GlobalStyles/',
              '/Link/', '/Paper/', '/Typography/', '/styles/', '/colors.js',
              '/Toolbar/', '/Container/', '/Chip/', '/Skeleton/', '/InputBase/',
              '/IconButton/', '/Tooltip/', '/Menu/', '/MenuItem/', '/Popper/',
              '/Fade/', '/Grow/', '/Slider/', '/Dialog/', '/Modal/',
            ]
            if (entryComponents.some((part) => id.includes(part))) return 'mui-vendor'
            if (id.includes('/@mui/material/')) return 'mui-vendor'
          }
        },
      },
    },
  },
})
