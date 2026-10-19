import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const server = await createServer({ root, configFile: false,
  resolve: { alias: { '@': root + '/client/src', '@shared': root + '/shared', react: root + '/node_modules/react',
    'react-dom': root + '/node_modules/react-dom', '@tanstack/react-query': root + '/node_modules/@tanstack/react-query' } },
  server: { host: '127.0.0.1', port: 5178, strictPort: true, watch: { usePolling: true } },
  optimizeDeps: { include: ['react', 'react-dom/client'] } });
await server.listen();
process.stdout.write(`Regional biotech templates eval Vite pid ${process.pid} listening at http://127.0.0.1:5178\n`);
