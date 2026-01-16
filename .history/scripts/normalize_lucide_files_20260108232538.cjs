const fs = require('fs');
const path = require('path');
const files = [
  'client/src/components/coauthor/DocumentPreview.jsx',
  'client/src/components/coauthor/VersionHistory.jsx'
];
files.forEach(f => {
  if (!fs.existsSync(f)) { console.warn('Not found', f); return; }
  let code = fs.readFileSync(f, 'utf8');
  const importRe = /import\s+\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"];?/;
  const m = code.match(importRe);
  if (!m) { console.warn('No lucide import in', f); return; }
  const specs = m[1].split(',').map(s=>s.trim()).filter(Boolean);
  const seen = new Set();
  const normalized = [];
  for (const s of specs) {
    const local = s.includes(' as ') ? s.split(/\s+as\s+/)[1].trim() : s;
    if (seen.has(local)) continue;
    seen.add(local);
    normalized.push(s);
  }
  const newImport = `import { ${normalized.join(', ')} } from 'lucide-react';`;
  code = code.replace(importRe, newImport);
  fs.writeFileSync(f, code, 'utf8');
  console.log('Normalized', f);
});
