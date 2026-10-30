import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { positiveBearer } from './positive-api.mjs';
const root = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
const sharedHost = resolve(root, 'docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/probe.tsx');
const scopedMock = fileURLToPath(new URL('./positive-api.mjs', import.meta.url));
const server = await createServer({ root, configFile: false,
  plugins: [{ name: 'selected-source-current-record-adapter', enforce: 'pre',
    resolveId(specifier, importer) { return specifier === './mock-api.mjs' && importer?.split('?')[0] === sharedHost ? scopedMock : null; },
    transform(code, id) {
      if (id.split('?')[0] !== sharedHost) return null;
      return { code: code.replace("'synthetic-assembly-browser-session'", JSON.stringify(positiveBearer())), map: null };
    } }],
  resolve: { alias: { '@': root + '/client/src', '@shared': root + '/shared', react: root + '/node_modules/react',
    'react-dom': root + '/node_modules/react-dom', '@tanstack/react-query': root + '/node_modules/@tanstack/react-query' } },
  server: { host: '127.0.0.1', port: 5216, strictPort: true, watch: null },
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query'] } });
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
process.stdout.write(`Selected-source chooser audit pid ${process.pid} http://127.0.0.1:5216\n`);
