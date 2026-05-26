import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  envDir: '..',
  plugins: [react()],
  resolve: {
    alias: {
      '@mindmapvault/connectors': fileURLToPath(new URL('../packages/connectors/src/index.ts', import.meta.url)),
    },
  },
  optimizeDeps: {
    // hash-wasm loads its own WASM files at runtime — exclude from pre-bundling
    exclude: ['hash-wasm'],
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('lucide-react')) {
            return 'lucide-icons';
          }
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5274,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
});
