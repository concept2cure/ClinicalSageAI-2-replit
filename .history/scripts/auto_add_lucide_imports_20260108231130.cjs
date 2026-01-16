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

// gather global lucide icons used across repo
const files = walk(root);
const lucideImportRe = /import\s+\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"]/g;
const globalIcons = new Set();
files.forEach(f => {
  const c = fs.readFileSync(f,'utf8');
  let m;
  while ((m = lucideImportRe.exec(c))) {
    const names = m[1].split(',').map(s=>s.trim()).filter(Boolean);
    names.forEach(n => {
      const real = n.split(/\s+as\s+/)[0].trim();
      globalIcons.add(real);
    });
  }
});

if (globalIcons.size === 0) {
  console.log('No lucide-react imports found to build global icon set. Aborting.');
  process.exit(0);
}

console.log('Global lucide icons count:', globalIcons.size);

function detectLocalNames(code) {
  const local = new Set();
  let m;
  const funcRe = /function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
  while ((m = funcRe.exec(code))) local.add(m[1]);
  const classRe = /class\s+([A-Z][A-Za-z0-9_]*)\s*/g;
  while ((m = classRe.exec(code))) local.add(m[1]);
  const constRe = /const\s+([A-Z][A-Za-z0-9_]*)\s*=/g;
  while ((m = constRe.exec(code))) local.add(m[1]);
  return local;
}

const builtin = new Set(['svg','path','div','span','h1','h2','h3','h4','h5','h6','p','a','ul','li','ol','table','thead','tbody','tr','td','th','button','input','img','form','label','section','article','header','footer','main','nav','g','rect','circle','line','polyline','polygon','strong','em','br','hr']);

const summary = [];
files.forEach(f => {
  let code = fs.readFileSync(f,'utf8');
  const tags = new Set();
  const tagRe = /<([A-Z][A-Za-z0-9_]*)\b/g;
  let m;
  while ((m = tagRe.exec(code))) tags.add(m[1]);
  if (tags.size === 0) return;

  // get existing lucide imported symbols for this file
  const imported = new Set();
  let imp;
  const localLucideMatch = code.match(importNamedRe);
  // extract all named imports generally
  const importNamedRe2 = /import\s+\{([\s\S]*?)\}\s+from\s+['"][^'"]+['"]/g;
  while ((imp = importNamedRe2.exec(code))) {
    const names = imp[1].split(',').map(s=>s.trim()).filter(Boolean);
    names.forEach(n => imported.add(n.split(/\s+as\s+/)[0].trim()));
  }

  const localNames = detectLocalNames(code);

  const missing = [];
  for (const tag of tags) {
    if (builtin.has(tag.toLowerCase())) continue;
    if (localNames.has(tag)) continue;
    if (imported.has(tag)) continue;
    if (globalIcons.has(tag)) {
      missing.push(tag);
    }
  }

  if (missing.length > 0) {
    // try to add them to existing lucide import if present
    const lucideReSingle = /import\s+\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"]/;
    if (lucideReSingle.test(code)) {
      code = code.replace(lucideReSingle, (m0, group)=>{
        const existing = group.split(',').map(s=>s.trim()).filter(Boolean);
        const add = missing.filter(x => !existing.includes(x));
        const newGroup = existing.concat(add).join(', ');
        return `import { ${newGroup} } from 'lucide-react'`;
      });
      fs.writeFileSync(f, code, 'utf8');
      summary.push({file: f, added: missing, method: 'append'});
    } else {
      // insert an import after the first import block or after React import
      const reactImportRe = /import\s+React[\s\S]*?from\s+['"]react['"];?/;
      const insertLine = `import { ${missing.join(', ')} } from 'lucide-react';\n`;
      if (reactImportRe.test(code)) {
        code = code.replace(reactImportRe, (m0)=> m0 + '\n' + insertLine);
      } else {
        code = insertLine + code;
      }
      fs.writeFileSync(f, code, 'utf8');
      summary.push({file: f, added: missing, method: 'new-import'});
    }
  }
});

console.log('Done. Summary entries:', summary.length);
summary.forEach(s=>{
    console.log('-', s.file.replace(process.cwd(),'').replace(/\\/g,'/'), s.added.join(', '), s.method);
  });
// exit
process.exit(0);
