import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@mindmapvault/mindmap-core': path.resolve(__dirname, '../packages/mindmap-core/src/index.ts'),
    },
  },
  base: command === 'serve' ? '/demo/' : './',
  server: {
    host: '127.0.0.1',
    port: 5275,
    strictPort: true,
    fs: {
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, '../frontend_app/src'),
        path.resolve(__dirname, '../packages'),
      ],
    },
  },
  optimizeDeps: {
    exclude: ['hash-wasm'],
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
}));
