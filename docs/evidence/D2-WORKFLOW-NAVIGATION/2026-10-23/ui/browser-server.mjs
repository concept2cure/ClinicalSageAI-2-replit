// Actual-component Vite fixture. Does not start the application backend.
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
const server = await createServer({
  root, configFile: false,
  resolve: { alias: { '@': `${root}/client/src`, '@shared': `${root}/shared` } },
  server: { host: '127.0.0.1', port: 5201, strictPort: true, watch: null },
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query'] },
});
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
process.stdout.write('Synthetic existing Apps component at http://127.0.0.1:5201\n');
