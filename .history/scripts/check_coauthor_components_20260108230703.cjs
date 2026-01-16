const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'client', 'src', 'pages', 'CoAuthor.jsx');
const code = fs.readFileSync(file, 'utf8');

// Find JSX tags
const tagRe = /<([A-Z][A-Za-z0-9_]*)\b/g;
const tags = new Set();
let m;
while ((m = tagRe.exec(code))) tags.add(m[1]);

// Find import from 'lucide-react'
const importRe = /from '\/lucide-react'|from 'lucide-react'|from "lucide-react"/g;
const importLineRe = /import \{([\s\S]*?)\} from ['"]lucide-react['"]/;
const importMatch = code.match(importLineRe);
let imported = new Set();
if (importMatch) {
  const names = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  names.forEach(n => {
    // handle alias like FileText as TextSelect
    const real = n.split(/\s+as\s+/)[0].trim();
    imported.add(real);
  });
}

// Also collect local function/component names (function declarations, const X = ...)
const localNames = new Set();
const funcRe = /function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
while ((m = funcRe.exec(code))) localNames.add(m[1]);
const constRe = /const\s+([A-Z][A-Za-z0-9_]*)\s*=/g;
while ((m = constRe.exec(code))) localNames.add(m[1]);

// Now find tags not imported and not local and not React builtins
const builtin = new Set(['svg','path','div','span','h1','h2','h3','h4','h5','h6','p','a','ul','li','ol','table','thead','tbody','tr','td','th','button','input','img','form','label','section','article','header','footer','main','nav','svg','g','rect','circle','line','polyline','polygon']);

const missing = [];
for (const tag of tags) {
  if (imported.has(tag)) continue;
  if (localNames.has(tag)) continue;
  if (builtin.has(tag.toLowerCase())) continue;
  // exclude React components that are clearly referenced as props (e.g., Module names) but we'll assume they should be imported
  missing.push(tag);
}

console.log('Imported icons count:', imported.size);
console.log('Local component count:', localNames.size);
console.log('Detected JSX tags count:', tags.size);
console.log('\nPotentially missing imports (first 200):');
console.log(missing.slice(0,200).sort().join(', '));

// Exit code: 0
