const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'client', 'src');
const exts = ['.jsx', '.tsx', '.js', '.ts'];
function walk(dir) { let r=[]; fs.readdirSync(dir).forEach(f=>{ const full=path.join(dir,f); const s=fs.statSync(full); if(s.isDirectory()) r=r.concat(walk(full)); else if(exts.includes(path.extname(full))) r.push(full); }); return r; }
const files = walk(root);
const importRe = /import\s+\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"];?/g;
let modified = 0;
files.forEach(f=>{
  let code = fs.readFileSync(f,'utf8');
  const matches = [...code.matchAll(importRe)];
  if (matches.length <= 1) return;
  const allSpecs = [];
  matches.forEach(m=>{
    const specs = m[1].split(',').map(s=>s.trim()).filter(Boolean);
    specs.forEach(s=>{ if (!allSpecs.includes(s)) allSpecs.push(s); });
  });
  const newImport = `import { ${allSpecs.join(', ')} } from 'lucide-react';`;
  // remove all existing lucide imports
  code = code.replace(importRe, '');
  // insert new import after the last React import if present, otherwise at top
  const reactRe = /import\s+React[\s\S]*?from\s+['"]react['"];?/;
  if (reactRe.test(code)) {
    code = code.replace(reactRe, (m0)=> m0 + '\n' + newImport);
  } else {
    code = newImport + '\n' + code;
  }
  fs.writeFileSync(f, code, 'utf8');
  modified++;
});
console.log('Merged lucide imports in files:', modified);
