const fs = require('fs');
const path = require('path');
const files = [
  'client/src/components/coauthor/DocumentPreview.jsx',
  'client/src/components/coauthor/VersionHistory.jsx'
];
files.forEach(f => {
  if (!fs.existsSync(f)) { console.warn('Not found', f); return; }
  let code = fs.readFileSync(f, 'utf8');
  const importReGlobal = /import\s+\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"];?/g;
  const matches = [...code.matchAll(importReGlobal)];
  if (matches.length === 0) { console.warn('No lucide import in', f); return; }
  // collect specs across all matches
  const specs = [];
  matches.forEach(m=>{
    const parts = m[1].split(',').map(s=>s.trim()).filter(Boolean);
    parts.forEach(p=>specs.push(p));
  });
  // create map local->import
  const seenLocal = new Set();
  const ordered = [];
  for (const s of specs) {
    let imported = s;
    let local = s;
    if (s.includes(' as ')) {
      const parts = s.split(/\s+as\s+/).map(x=>x.trim());
      imported = parts[0]; local = parts[1];
    }
    if (seenLocal.has(local)) continue; // skip duplicates
    seenLocal.add(local);
    if (imported !== local) ordered.push(`${imported} as ${local}`);
    else ordered.push(local);
  }
  const newImport = `import { ${ordered.join(', ')} } from 'lucide-react';`;
  // Now remove all existing lucide imports and insert new at appropriate place
  let newCode = code.replace(importReGlobal, '');
  const reactRe = /import\s+React[\s\S]*?from\s+['"]react['"];?/;
  if (reactRe.test(newCode)) newCode = newCode.replace(reactRe, m0 => m0 + '\n' + newImport + '\n');
  else newCode = newImport + '\n' + newCode;
  fs.writeFileSync(f, newCode, 'utf8');
  console.log('Strict normalized', f);
});
