import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../../../../../../', import.meta.url)));
const server = await createServer({ root, configFile: false,
  resolve: { alias: { '@': root + '/client/src', '@shared': root + '/shared', react: root + '/node_modules/react',
    'react-dom': root + '/node_modules/react-dom', '@tanstack/react-query': root + '/node_modules/@tanstack/react-query' } },
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
  optimizeDeps: { include: ['react', 'react-dom/client'] } });
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
process.stdout.write(`Shared recovery fixture pid ${process.pid} http://127.0.0.1:5187\n`);
