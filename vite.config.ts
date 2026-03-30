import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import themePlugin from '@replit/vite-plugin-shadcn-theme-json';
import path from 'path';
export default defineConfig({
  plugins: [
    react(),
    themePlugin(),
    // Cartographer plugin for dev environment mapping (optional)
    ...(process.env.NODE_ENV !== 'production' && process.env.REPL_ID !== undefined
      ? [await import('@replit/vite-plugin-cartographer').then(m => m.cartographer())]
      : []),
    // Bundle analysis — run with ANALYZE=true to generate stats
    ...(process.env.ANALYZE === 'true'
      ? [await import('rollup-plugin-visualizer').then(m => m.visualizer({ open: true, filename: 'dist/bundle-stats.html', gzipSize: true }))]
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
  server: {
    hmr: {
      overlay: false,
    },
    watch: {
      // Ignore non-client files so server-side / DB edits don't trigger reloads
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/scripts/**',
        '**/server/**',
        '**/shared/**',
        '**/migrations/**',
        '**/backend/**',
        '**/*.md',
        '**/*.sh',
        '**/*.sql',
      ],
    },
  },
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

          // Radix UI components — split from main bundle
          if (id.includes('/@radix-ui/')) {
            return 'vendor-ui';
          }

          // Animation / motion libraries
          if (id.includes('/framer-motion')) {
            return 'vendor-motion';
          }

          // PDF generation libraries (heavy, used on-demand)
          if (id.includes('/pdfmake') || id.includes('/pdf-lib') || id.includes('jspdf')) {
            return 'vendor-pdf';
          }

          // Tiptap editor extensions — heavy, only needed in editor views
          if (id.includes('/@tiptap/') || id.includes('/prosemirror') || id.includes('/y-prosemirror')) {
            return 'vendor-tiptap';
          }

          // Real-time collaboration (Yjs, Socket.io client)
          if (id.includes('/yjs') || id.includes('/y-protocols') || id.includes('/socket.io-client')) {
            return 'vendor-realtime';
          }

          // Lucide icons — large icon set, split from main
          if (id.includes('/lucide-react')) {
            return 'vendor-icons';
          }
        },
      },
    },
  },
});
