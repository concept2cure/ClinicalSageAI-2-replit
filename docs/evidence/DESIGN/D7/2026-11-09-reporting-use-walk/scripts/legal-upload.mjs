// Setup for the legal-companion ZIP walk: one letter of authorization into C2C-101's Vault through the product's own
// upload (POST /api/vault/ingest), as a person's upload would arrive.
import fs from 'node:fs';
const B = 'http://127.0.0.1:5100', PROGRAM = 'e89b7009-bb05-4060-8bc0-6da509648e95', FILE = process.argv[2];
const a = await (await fetch(`${B}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
const form = new FormData();
form.set('file', new Blob([fs.readFileSync(FILE)], { type: 'application/pdf' }), 'letter-of-authorization.pdf');
for (const [k, v] of Object.entries({ programId: PROGRAM, documentCode: 'LOA-WALK-001', documentTitle: 'Letter of Authorization (US agent)', documentType: 'CORRESPONDENCE' })) form.set(k, v);
const r = await fetch(`${B}/api/vault/ingest`, { method: 'POST', headers: { Authorization: `Bearer ${a.accessToken}`, 'x-organization-id': '1' }, body: form });
const j = await r.json().catch(() => null);
console.info(r.status, JSON.stringify(j).slice(0, 600));
