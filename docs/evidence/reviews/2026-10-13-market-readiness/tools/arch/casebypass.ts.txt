import express from '<repo>/node_modules/express/index.js';
import { moduleEntitlementGate } from '<repo>/server/middleware/moduleEntitlementGate.ts';
const app = express();
app.use(moduleEntitlementGate(undefined, { launchScope: 'on', unattributed: 'enforce' }));
const r = express.Router();
r.get('/ping', (_req, res) => res.json({ reached: 'regulatory-digital-twin router' }));
app.use('/api/regulatory-digital-twin', r);
const r2 = express.Router();
r2.get('/ping', (_req, res) => res.json({ reached: 'cmc router' }));
app.use('/api/cmc', r2);
const srv = app.listen(0, async () => {
  const port = (srv.address() as any).port;
  for (const p of ['/api/regulatory-digital-twin/ping', '/API/regulatory-digital-twin/ping', '/api/cmc/ping', '/Api/cmc/ping', '/API/CMC/ping']) {
    const res = await fetch(`http://127.0.0.1:${port}${p}`);
    console.log(p, res.status, (await res.text()).slice(0, 90));
  }
  srv.close(); process.exit(0);
});
