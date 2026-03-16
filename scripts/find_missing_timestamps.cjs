const fs = require('fs');
const content = fs.readFileSync('shared/schema.ts', 'utf8');
const lines = content.split('\n');

const tables = [];
let currentTable = null;
let braceDepth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const tableMatch = line.match(/export const (\w+) = pgTable\(/);
  if (tableMatch) {
    if (currentTable) tables.push(currentTable);
    currentTable = {
      name: tableMatch[1],
      startLine: i + 1,
      hasCreatedAt: false,
      hasUpdatedAt: false,
      endLine: 0,
    };
    braceDepth = 0;
  }
  if (currentTable) {
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (line.includes("'created_at'") || line.includes("'createdAt'"))
      currentTable.hasCreatedAt = true;
    if (line.includes("'updated_at'") || line.includes("'updatedAt'"))
      currentTable.hasUpdatedAt = true;
    if (braceDepth <= 0 && i > currentTable.startLine - 1) {
      currentTable.endLine = i + 1;
      tables.push(currentTable);
      currentTable = null;
    }
  }
}
if (currentTable) tables.push(currentTable);

const missingUpdatedAt = tables.filter(t => !t.hasUpdatedAt && t.hasCreatedAt);
const missingCreatedAt = tables.filter(t => !t.hasCreatedAt);
const missingBoth = tables.filter(t => !t.hasUpdatedAt && !t.hasCreatedAt);

console.log('=== MISSING ONLY UPDATED_AT (' + missingUpdatedAt.length + ') ===');
missingUpdatedAt.forEach(t => console.log(t.name + ' L' + t.startLine + '-' + t.endLine));

console.log(
  '\n=== MISSING CREATED_AT (and possibly updated_at) (' + missingCreatedAt.length + ') ==='
);
missingCreatedAt.forEach(t =>
  console.log(t.name + ' L' + t.startLine + '-' + t.endLine + ' updated_at:' + t.hasUpdatedAt)
);

console.log('\n=== MISSING BOTH (' + missingBoth.length + ') ===');
missingBoth.forEach(t => console.log(t.name + ' L' + t.startLine + '-' + t.endLine));

console.log('\nTotal tables:', tables.length);
