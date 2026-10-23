// Reuses the existing actual-component Vite fixture pattern from the prior W5 identity packet.
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../../../../..', import.meta.url)));
const server = await createServer({ root, configFile: false,
  resolve: { alias: { '@': `${root}/client/src`, '@shared': `${root}/shared` } },
  server: { host: '127.0.0.1', port: 5199, strictPort: true, watch: null },
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query'] } });
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
process.stdout.write('Synthetic existing market identity component at http://127.0.0.1:5199\n');
