const fs = require('fs');
const content = fs.readFileSync('shared/schema.ts', 'utf8');
const lines = content.split('\n');

const tables = [];
let i = 0;
while (i < lines.length) {
  const match = lines[i].match(/export const (\w+) = pgTable\(/);
  if (match) {
    const name = match[1];
    const startLine = i;
    let parenDepth = 0;
    let hasCreatedAt = false;
    let hasUpdatedAt = false;
    let j = i;

    for (; j < lines.length; j++) {
      const line = lines[j];
      for (const ch of line) {
        if (ch === '(') parenDepth++;
        if (ch === ')') parenDepth--;
      }
      if (line.includes("'created_at'")) hasCreatedAt = true;
      if (line.includes("'updated_at'")) hasUpdatedAt = true;
      if (parenDepth === 0 && j > startLine) break;
    }

    tables.push({ name, startLine: startLine + 1, endLine: j + 1, hasCreatedAt, hasUpdatedAt });
    i = j + 1;
  } else {
    i++;
  }
}

const missingUpdatedAt = tables.filter(t => !t.hasUpdatedAt && t.hasCreatedAt);
const missingCreatedAt = tables.filter(t => !t.hasCreatedAt);
const missingBoth = tables.filter(t => !t.hasUpdatedAt && !t.hasCreatedAt);

console.log('=== MISSING ONLY UPDATED_AT (' + missingUpdatedAt.length + ') ===');
missingUpdatedAt.forEach(t => console.log(t.name + ' L' + t.startLine + '-' + t.endLine));

console.log('\n=== MISSING CREATED_AT (' + missingCreatedAt.length + ') ===');
missingCreatedAt.forEach(t => console.log(t.name + ' L' + t.startLine + '-' + t.endLine));

console.log('\n=== MISSING BOTH (' + missingBoth.length + ') ===');
missingBoth.forEach(t => console.log(t.name + ' L' + t.startLine + '-' + t.endLine));

console.log('\nTotal tables:', tables.length);
