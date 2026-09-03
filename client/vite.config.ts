import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    // Same-origin in development so the auth cookies behave exactly as in production.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true },
      '/sitemap.xml': { target: 'http://localhost:4000' },
      '/robots.txt': { target: 'http://localhost:4000' },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the vendor bundle separate so app updates do not bust it.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
});
