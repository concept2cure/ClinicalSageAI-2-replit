import { open, goto, settle, apiGet, w2, sleep } from '../walk-2/h.mjs';
const { page, ctx, done } = await open('idle-diag', w2('invitee2'));
await ctx.addInitScript(() => {
  window.__acts = [];
  for (const n of ['pointerdown','keydown','touchstart','wheel','scroll']) {
    window.addEventListener(n, (e) => { const t = e.target; window.__acts.push({ n, at: Date.now(), trusted: e.isTrusted, target: t === document ? 'document' : (t && t.tagName ? t.tagName + '.' + (t.className && t.className.baseVal === undefined ? String(t.className).slice(0,60) : '') : String(t)) }); }, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => window.__acts.push({ n: 'visibility:' + document.visibilityState, at: Date.now() }));
});
const reqs = [];
page.on('request', (r) => { if (r.url().includes('/api/')) reqs.push(`${new Date().toISOString().slice(11,19)} ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0,120)}`); });
await goto(page, '/concept2cure/projects');
await settle(page, 2000);
const s = await apiGet(page, '/api/v1/auth/session');
console.info('session policy', JSON.stringify(s.body?.session));
const MIN = Number(process.env.MIN || 4);
await sleep(MIN * 60_000);
const acts = await page.evaluate(() => window.__acts);
console.info('activity events during idle:', acts.length);
console.info(JSON.stringify(acts.slice(0, 40), null, 0));
const after = reqs.filter(Boolean);
console.info('API requests total', after.length);
const counts = {}; for (const r of after) { const k = r.split(' ').slice(1).join(' ').replace(/\?.*/, ''); counts[k] = (counts[k]||0)+1; }
console.info(JSON.stringify(counts, null, 1));
console.info('url', page.url());
await done();
