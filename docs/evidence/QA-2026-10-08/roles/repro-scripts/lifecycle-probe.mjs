// Non-writing probe of POST /api/regulatory/documents (the route behind "Send for review").
// Step 1: body {}: the role gate (requireRole) runs first; 403 = refused by role, 400 = role passed,
//         validation then refuses before any store call. Nothing is written in either case.
// Step 2: body with title + documentType: passes validation, then getDb() runs before any store call.
//         If getDb() throws, the route answers 500 and no row is written.
// Password comes from env DPW only; tokens are never printed.
const BASE = 'http://localhost:5077';
const PW = process.env.DPW;
if (!PW) throw new Error('DPW env var required');

const who = [
  ['emily.watson@concept2cure.pro', 'member'],
  ['sarah.chen@concept2cure.pro', 'manager'],
];
const out = [];
for (const [email, label] of who) {
  const lr = await fetch(BASE + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const { accessToken } = await lr.json();
  const post = async (body) => {
    const r = await fetch(BASE + '/api/regulatory/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    return { status: r.status, body: text.slice(0, 300) };
  };
  out.push({ email, label, emptyBody: await post({}), titledBody: await post({ title: 'QA-PROBE-NOWRITE', documentType: 'ind' }) });
}
console.log(JSON.stringify(out, null, 2));
