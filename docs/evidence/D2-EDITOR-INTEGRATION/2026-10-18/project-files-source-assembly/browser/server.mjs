import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const server = await createServer({ root, configFile: false,
  resolve: { alias: { '@': root + '/client/src', '@shared': root + '/shared', react: root + '/node_modules/react',
    'react-dom': root + '/node_modules/react-dom', '@tanstack/react-query': root + '/node_modules/@tanstack/react-query' } },
  server: { host: '127.0.0.1', port: 5192, strictPort: true, watch: null },
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query'] } });
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
process.stdout.write(`Existing editor assembly fixture pid ${process.pid} http://127.0.0.1:5192\n`);
