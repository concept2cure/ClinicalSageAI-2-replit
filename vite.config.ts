import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import themePlugin from '@replit/vite-plugin-shadcn-theme-json';
import path from 'path';
import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    themePlugin(),
    ...(process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined
      ? [await import('@replit/vite-plugin-cartographer').then(m => m.cartographer())]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'client', 'src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@assets': path.resolve(import.meta.dirname, 'attached_assets'),
    },
  },
  root: path.resolve(import.meta.dirname, 'client'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }

          if (id.includes('/@tanstack/')) {
            return 'vendor-tanstack';
          }

          if (id.includes('/d3') || id.includes('/recharts')) {
            return 'vendor-charts';
          }
        },
      },
    },
  },
});
