import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/demo/',
  server: {
    host: '127.0.0.1',
    port: 5275,
    strictPort: true,
    fs: {
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, '../frontend_app/src'),
      ],
    },
  },
  optimizeDeps: {
    exclude: ['hash-wasm'],
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1500,
  },
});
