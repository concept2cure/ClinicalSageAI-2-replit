import fs from 'node:fs'; import path from 'node:path';
const root = '<repo>';
const entry = path.join(root, 'server/index.ts');
const exts = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.js'];
function resolve(from, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('@shared') ) return null;
  let base = spec.startsWith('@shared') ? path.join(root, 'shared', spec.slice(8)) : path.resolve(path.dirname(from), spec);
  const cands = [];
  for (const e of exts) cands.push(base + e);
  if (base.endsWith('.js')) { const b = base.slice(0, -3); cands.push(b + '.ts', b + '.tsx', b + '/index.ts'); }
  for (const c of cands) { try { if (fs.statSync(c).isFile()) return c; } catch {} }
  return null;
}
const re = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
const seen = new Set(); const stack = [entry];
while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
  let src; try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
  for (const m of src.matchAll(re)) { const s = m[1]||m[2]||m[3]||m[4]; const r = resolve(f, s); if (r && !seen.has(r)) stack.push(r); } }
const dirs = process.argv.slice(2);
for (const d of dirs) {
  const all = []; (function walk(p){ for (const e of fs.readdirSync(p,{withFileTypes:true})) { const q=path.join(p,e.name); if (e.isDirectory()) { if (e.name==='__tests__') continue; walk(q);} else if (/\.(ts|js|tsx)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) all.push(q);} })(path.join(root,d));
  let rl=0, tl=0, rf=0; const dead=[];
  for (const f of all) { const n = fs.readFileSync(f,'utf8').split('\n').length; tl+=n; if (seen.has(f)) { rl+=n; rf++; } else dead.push([n, path.relative(root,f)]); }
  dead.sort((a,b)=>b[0]-a[0]);
  console.log(`${d}: files ${rf}/${all.length} reachable, lines ${rl}/${tl} reachable (${(100*rl/tl).toFixed(0)}%). top unreachable: ${dead.slice(0,6).map(x=>x[1]+'('+x[0]+')').join(', ')}`);
}
console.log('total reachable files', seen.size);
