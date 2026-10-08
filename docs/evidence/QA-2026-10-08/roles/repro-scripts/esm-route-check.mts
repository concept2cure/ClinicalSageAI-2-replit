// Runs the real lifecycle router under tsx (the server's loader) with the real server/db module.
// The database URL points at a closed port, so no row can be written: a store call fails with a
// connection error, which proves getDb() resolved the db module without a bare require().
import express from 'express';
import { createDocumentLifecycleRouter } from '/home/user/ClinicalSageAI-2-replit/server/routes/document-lifecycle.ts';

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => {
  req.user = { id: 4, organizationId: 1, role: 'member', roles: ['member', 'regulatory-author'] };
  next();
});
app.use('/api/regulatory/documents', createDocumentLifecycleRouter());
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((res) => server.once('listening', () => res()));
const port = (server.address() as { port: number }).port;
const r = await fetch(`http://127.0.0.1:${port}/api/regulatory/documents`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'ESM-CHECK-NOWRITE', documentType: 'ind' }),
});
console.log('HTTP', r.status, await r.text());
server.close();
process.exit(0);
