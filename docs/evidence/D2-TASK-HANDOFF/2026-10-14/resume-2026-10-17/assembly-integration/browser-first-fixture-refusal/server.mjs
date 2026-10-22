import { createServer } from '/workspace/concept2cure/node_modules/vite/dist/node/index.js';
import { resolve } from 'node:path';

const root = '/workspace/concept2cure';
const probe = resolve(root, 'docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/assembly-build/canonical-integration/browser/probe.tsx');
const server = await createServer({ root, configFile: false,
  plugins: [{ name: 'scratch-assembly-leave-host', enforce: 'pre', transform(code, id) {
    if (id.split('?')[0] !== probe) return null;
    const original = 'onBack: () => {}, hostShowsBack: true';
    if (!code.includes(original)) throw new Error('The retained probe host changed; inspect before adapting it.');
    return code.replace(original,
      "onBack: () => window.assemblyNavigation.push({ route: 'host-back', target: peekEditorTarget() }), hostShowsBack: false")
      + "\nimport { surfaceLeaveRefusal } from '/client/src/concept2cure/v2/navParams';\nObject.assign(window, { assemblyLeaveRefusal: surfaceLeaveRefusal });\n";
  } }],
  resolve: { alias: { '@': root + '/client/src', '@shared': root + '/shared', react: root + '/node_modules/react',
    'react-dom': root + '/node_modules/react-dom', '@tanstack/react-query': root + '/node_modules/@tanstack/react-query' } },
  server: { host: '127.0.0.1', port: 5193, strictPort: true, watch: null },
  optimizeDeps: { include: ['react', 'react-dom/client', '@tanstack/react-query'] } });
await server.listen();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0); });
process.stdout.write(`Scratch assembly leave fixture pid ${process.pid} http://127.0.0.1:5193\n`);
