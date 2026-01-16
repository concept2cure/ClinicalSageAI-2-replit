const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'client', 'src', 'pages', 'CoAuthor.jsx');
const code = fs.readFileSync(file, 'utf8');

const tagRe = /<([A-Z][A-Za-z0-9_]*)\b/g;
const tags = new Set();
let m;
while ((m = tagRe.exec(code))) tags.add(m[1]);

const imported = new Set();
const importAllRe = /import\s+([A-Za-z0-9_]+)\s+from\s+['"][^'"]+['"]/g; // default import
const importNamedRe = /import\s+\{([\s\S]*?)\}\s+from\s+['"][^'"]+['"]/g;
while ((m = importAllRe.exec(code))) {
  imported.add(m[1]);
}
while ((m = importNamedRe.exec(code))) {
  const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
  for (const n of names) {
    const real = n.split(/\s+as\s+/)[0].trim();
    imported.add(real);
  }
}

const localNames = new Set();
const funcRe = /function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
while ((m = funcRe.exec(code))) localNames.add(m[1]);
const classRe = /class\s+([A-Z][A-Za-z0-9_]*)\s*/g;
while ((m = classRe.exec(code))) localNames.add(m[1]);
const constRe = /const\s+([A-Z][A-Za-z0-9_]*)\s*=/g;
while ((m = constRe.exec(code))) localNames.add(m[1]);

const builtin = new Set(['svg','path','div','span','h1','h2','h3','h4','h5','h6','p','a','ul','li','ol','table','thead','tbody','tr','td','th','button','input','img','form','label','section','article','header','footer','main','nav','g','rect','circle','line','polyline','polygon','strong','em','br','hr']);

const missing = [];
for (const tag of tags) {
  if (builtin.has(tag.toLowerCase())) continue;
  if (imported.has(tag)) continue;
  if (localNames.has(tag)) continue;
  // If it's React built-in use: Fragment
  if (tag === 'Fragment') continue;
  missing.push(tag);
}

fs.writeFileSync('/tmp/coauthor_missing.txt', missing.sort().join('\n'));
console.log('Wrote /tmp/coauthor_missing.txt - count:', missing.length);
