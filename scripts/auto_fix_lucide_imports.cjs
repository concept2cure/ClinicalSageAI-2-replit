const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'client', 'src');
const exts = ['.jsx', '.tsx', '.js', '.ts'];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else {
      if (exts.includes(path.extname(file))) results.push(filePath);
    }
  });
  return results;
}

function parseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // find JSX tags (capitalized)
  const tagRe = /<([A-Z][A-Za-z0-9_]*)\b/g;
  const tags = new Set();
  let m;
  while ((m = tagRe.exec(content))) tags.add(m[1]);

  // find local declarations (function/class/const)
  const local = new Set();
  while ((m = /function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g.exec(content))) local.add(m[1]);
  (content.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g) || []).forEach(x => {
    const nm = x.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/)[1];
    local.add(nm);
  });
  (content.match(/class\s+([A-Z][A-Za-z0-9_]*)\s*/g) || []).forEach(x => {
    const nm = x.match(/class\s+([A-Z][A-Za-z0-9_]*)\s*/)[1];
    local.add(nm);
  });
  (content.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=/g) || []).forEach(x => {
    const nm = x.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=/)[1];
    local.add(nm);
  });

  // find existing named imports
  const importNamedRe = /import\s+\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"]/;
  const importNamed = importNamedRe.exec(content);
  const existing = new Set();
  if (importNamed) {
    importNamed[1].split(',').map(s => s.trim()).filter(Boolean).forEach(n => {
      const real = n.split(/\s+as\s+/)[0].trim();
      existing.add(real);
    });
  }

  return { content, tags: Array.from(tags), local: Array.from(local), existing }; 
}

function lucideHasIcon(name) {
  try {
    const lucide = require('lucide-react');
    return lucide && (name in lucide);
  } catch (e) {
    return false;
  }
}

const files = walk(root);
let changedFiles = 0;
let totalAdded = 0;

for (const file of files) {
  const { content, tags, local, existing } = parseFile(file);
  const missing = [];
  for (const tag of tags) {
    if (existing.has(tag)) continue;
    if (local.includes(tag)) continue;
    if (/^[a-z]/.test(tag)) continue; // not an icon/component
    // Only consider icons that lucide exports
    if (lucideHasIcon(tag)) missing.push(tag);
  }
  if (missing.length === 0) continue;

  // compute unique list of icons to add (exclude already present)
  const toAdd = missing.filter(m => !existing.has(m)).sort();
  if (toAdd.length === 0) continue;

  // Back up file
  fs.copyFileSync(file, file + '.bak');

  let newContent = content;

  const importNamedRe = /import\s+\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"]/;
  if (importNamedRe.test(content)) {
    newContent = content.replace(importNamedRe, (match, group) => {
      // merge existing with toAdd
      const existingList = group.split(',').map(s => s.trim()).filter(Boolean);
      const merged = Array.from(new Set(existingList.concat(toAdd))).sort();
      return `import { ${merged.join(', ')} } from 'lucide-react'`;
    });
  } else {
    // insert a new import after the last import statement
    const importAllRe = /((?:import[\s\S]*?\n)+)/;
    const importMatch = content.match(importAllRe);
    const importLine = `import { ${toAdd.join(', ')} } from 'lucide-react';\n`;
    if (importMatch) {
      const idx = content.indexOf(importMatch[0]) + importMatch[0].length;
      newContent = content.slice(0, idx) + importLine + content.slice(idx);
    } else {
      // prepend
      newContent = importLine + content;
    }
  }

  fs.writeFileSync(file, newContent, 'utf8');
  console.log('Updated', file, 'added icons:', toAdd.join(', '));
  changedFiles++;
  totalAdded += toAdd.length;
}

console.log('Done. Files changed:', changedFiles, 'total icons added:', totalAdded);
