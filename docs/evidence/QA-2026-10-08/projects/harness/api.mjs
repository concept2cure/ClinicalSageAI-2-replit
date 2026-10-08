// Authenticated API helper from the saved browser session. Usage: node api.mjs GET /api/...
import fs from 'node:fs';
const BASE = process.env.APP_URL || 'http://localhost:5078';
const st = JSON.parse(fs.readFileSync(process.env.STATE, 'utf8'));
const origin = st.origins.find((o) => o.origin === BASE);
const ls = Object.fromEntries((origin?.localStorage || []).map((x) => [x.name, x.value]));
const token = ls['trialsage_access_token'];
const orgId = ls.currentOrganizationId;
const cookieHeader = st.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const [method, path, body] = process.argv.slice(2);
const res = await fetch(BASE + path, {
  method,
  headers: { Authorization: 'Bearer ' + token, 'x-organization-id': orgId || '1', Cookie: cookieHeader, 'content-type': 'application/json' },
  body: body ?? undefined,
});
const text = await res.text();
console.info(res.status);
console.info(text.slice(0, Number(process.env.MAX || 6000)));
