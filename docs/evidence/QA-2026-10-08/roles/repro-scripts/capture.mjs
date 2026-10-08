// Capture login + session responses for QA users. Secrets are never written:
// the password comes from env DPW, and every JWT is replaced by <JWT-REDACTED>.
const BASE = 'http://localhost:5077';
const PW = process.env.DPW;
if (!PW) throw new Error('DPW env var required');

const users = [
  ['emily.watson@concept2cure.pro', 'member'],
  ['sarah.chen@concept2cure.pro', 'manager'],
  ['jm.smith@concept2cure.pro', 'admin (control)'],
];

const redact = (s) => String(s).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<JWT-REDACTED>');

const out = [];
for (const [email, label] of users) {
  const loginReq = { method: 'POST', path: '/api/v1/auth/login', body: { email, password: '<DPW-REDACTED>' } };
  const lr = await fetch(BASE + loginReq.path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const lbody = await lr.json();
  out.push({ user: email, expectedRoleLabel: label, request: loginReq, status: lr.status, response: JSON.parse(redact(JSON.stringify({ ...lbody, accessToken: lbody.accessToken ? '<JWT-REDACTED>' : undefined, refreshToken: lbody.refreshToken ? '<JWT-REDACTED>' : undefined }))) });

  const token = lbody.accessToken;
  const sr = await fetch(BASE + '/api/v1/auth/session', { headers: { Authorization: `Bearer ${token}` } });
  const sbody = await sr.json();
  out.push({ user: email, request: { method: 'GET', path: '/api/v1/auth/session', headers: { Authorization: 'Bearer <JWT-REDACTED>' } }, status: sr.status, response: JSON.parse(redact(JSON.stringify(sbody))) });
}

console.info(JSON.stringify(out, null, 2));
