// Deterministically list finding IDs, severity and title per lane report.
import fs from 'node:fs';
const dir = process.argv[2];
const out = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
  const lane = f.replace(/\.md$/, '');
  const seen = new Map();
  for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n')) {
    const m = line.match(/^\s*\*\*([A-Z][A-Z0-9]*-\d+[A-Z]?)\b(.{0,60})/);
    if (!m) continue;
    const sev = (m[2].match(/P[0-3]/) || [])[0];
    if (!sev || seen.has(m[1])) continue;
    const title = line.replace(/^\s*\*\*/, '').replace(/\*\*.*$/, '').replace(/^[A-Z0-9-]+\s*[·—(:]\s*/, '').slice(0, 140);
    seen.set(m[1], { id: m[1], sev, title });
  }
  out[lane] = [...seen.values()];
}
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
for (const [lane, items] of Object.entries(out)) {
  const c = items.reduce((a, i) => ((a[i.sev] = (a[i.sev] || 0) + 1), a), {});
  console.log(lane.padEnd(11), items.length, JSON.stringify(c));
}
