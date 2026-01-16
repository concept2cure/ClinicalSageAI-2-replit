const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'client', 'src');
const exts = ['.jsx', '.tsx', '.js', '.ts'];
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (exts.includes(path.extname(full))) {
      results.push(full);
    }
  });
  return results;
}

const files = walk(root);
const lucideRe = /import\s+\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"];?/g;
let changed = 0;
files.forEach(f => {
  let code = fs.readFileSync(f,'utf8');
  let m;
  let newCode = code;
  while ((m = lucideRe.exec(code))) {
    const group = m[1];
    const specs = group.split(',').map(s => s.trim()).filter(Boolean);
    // Build map localName -> importedName
    const map = new Map();
    for (const s of specs) {
      if (s.includes(' as ')) {
        const [imported, local] = s.split(/\s+as\s+/).map(x => x.trim());
        map.set(local, imported);
      } else {
        map.set(s, s);
      }
    }
    // Now produce normalized spec list, preserving order by first occurrence in original specs
    const seen = new Set();
    const normalized = [];
    for (const s of specs) {
      let local;
      let imported;
      if (s.includes(' as ')) {
        [imported, local] = s.split(/\s+as\s+/).map(x => x.trim());
      } else {
        imported = s; local = s;
      }
      if (seen.has(local)) continue;
      seen.add(local);
      if (imported !== local) normalized.push(`${imported} as ${local}`);
      else normalized.push(local);
    }
    const replacement = `import { ${normalized.join(', ')} } from 'lucide-react'`;
    newCode = newCode.replace(m[0], replacement);
    changed++;
  }
  if (newCode !== code) fs.writeFileSync(f, newCode, 'utf8');
});
console.log('Dedupe completed. Modified import groups:', changed);
