// Test-only host around shipped components, reused from the retained editor fixture.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
const server = await createServer({ root, configFile: false,
  resolve: { alias: { '@': `${root}/client/src`, '@shared': `${root}/shared` } },
  server: { host: '127.0.0.1', port: 5224, strictPort: true, watch: null },
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query'] } });
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
process.stdout.write('Actual shared editor fixture at http://127.0.0.1:5224\n');
