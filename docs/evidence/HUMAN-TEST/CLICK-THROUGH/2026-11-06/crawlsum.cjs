// Summarise clickcrawl.cjs logs: every problem, grouped, with where it happened.
// Usage: node crawlsum.cjs <outDir> [<outDir> ...]   (env NOTHING=1 also lists clicks that changed nothing)
const fs = require('fs');
const rows = [];
for (const d of process.argv.slice(2)) {
  for (const f of fs.readdirSync(d).filter((f) => f.endsWith('.jsonl'))) {
    for (const line of fs.readFileSync(`${d}/${f}`, 'utf8').split('\n').filter(Boolean)) { try { rows.push(JSON.parse(line)); } catch { /* partial line */ } }
  }
}
const surf = (u) => (u || '').replace(/^\/concept2cure\/?/, '').replace(/\?.*$/, '') || 'home';
const prog = (u) => ((u || '').match(/program=([0-9a-f]{8})/) || [])[1] || '-';
const where = (r) => `${surf(r.stop.url)}[${prog(r.stop.url)}]${(r.stop.tabs || []).length ? ' › ' + r.stop.tabs.join(' › ') : ''}`;
const stops = rows.filter((r) => r.kind === 'stop');
const clicks = rows.filter((r) => r.kind === 'click');
console.log(`stops ${stops.length}, clicks ${clicks.length}, ends ${rows.filter((r) => r.kind === 'end').length}, fatal ${rows.filter((r) => r.kind === 'fatal').map((r) => r.error).join(' | ')}`);
const effects = {};
for (const c of clicks) effects[c.effect || c.outcome] = (effects[c.effect || c.outcome] || 0) + 1;
console.log('effects', JSON.stringify(effects));
console.log('\n== Stops that loaded with a problem');
for (const s of stops) {
  if (s.errors.length || s.api.length || s.fail.length || s.loading.length) {
    console.log(`- ${where(s)}: ${[...new Set(s.api)].join('; ')} ${[...new Set(s.errors)].join('; ').slice(0, 300)} ${s.fail.length ? 'TEXT ' + [...new Set(s.fail)].join(',') : ''} ${s.loading.length ? 'LOADING ' + [...new Set(s.loading)].join(',') : ''}`);
  }
}
console.log('\n== Clicks with errors, failed requests, failure text or loading that never ended');
const grouped = {};
for (const c of clicks.filter((c) => (c.errors || []).length || (c.api || []).length || (c.newFail || []).length || (c.stuck || []).length || c.effect === 'click-failed')) {
  const k = `${where(c)} :: ${c.control.name}`; (grouped[k] = grouped[k] || []).push(c);
}
for (const [k, cs] of Object.entries(grouped)) {
  const c = cs[0];
  console.log(`- ${k} → ${c.effect}\n    ${[...new Set(c.api)].join('; ')} ${[...new Set(c.errors)].join(' | ').slice(0, 400)} ${c.newFail.length ? 'TEXT ' + [...new Set(c.newFail)].join(',') : ''} ${c.stuck.length ? 'STUCK ' + c.stuck.join(',') : ''} ${c.clickErr ? 'CLICKERR ' + c.clickErr : ''}`);
}
if (process.env.NOTHING) {
  console.log('\n== Clicks that changed nothing');
  for (const c of clicks.filter((c) => c.effect === 'nothing')) console.log(`- ${where(c)} :: ${c.control.name}`);
}
