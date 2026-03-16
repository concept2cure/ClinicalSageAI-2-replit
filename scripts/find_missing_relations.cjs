const fs = require('fs');
const content = fs.readFileSync('shared/schema.ts', 'utf8');
const out = [];

// Find all pgTable exports
const tableNames = new Set();
const regex = /export const (\w+) = pgTable\(/g;
let m;
while ((m = regex.exec(content)) !== null) {
  tableNames.add(m[1]);
}

// Find all relations definitions
const relNames = new Set();
const relRegex = /export const (\w+)Relations = relations\(/g;
while ((m = relRegex.exec(content)) !== null) {
  relNames.add(m[1]);
}

const withRel = [];
const noRel = [];
for (const t of tableNames) {
  if (relNames.has(t)) {
    withRel.push(t);
  } else {
    noRel.push(t);
  }
}

out.push('Tables with relations: ' + withRel.length);
out.push('Tables without relations: ' + noRel.length);

// Find which tables are referenced by FKs
const fkPattern = /references\(\(\) => (\w+)\.\w+/g;
const referencedTables = new Set();
while ((m = fkPattern.exec(content)) !== null) {
  referencedTables.add(m[1]);
}

const importantMissing = noRel.filter(t => referencedTables.has(t));
out.push('\nReferenced tables without relations (' + importantMissing.length + '):');
importantMissing.forEach(t => out.push('  ' + t));

out.push('\nTables WITH relations:');
withRel.forEach(t => out.push('  ' + t));

fs.writeFileSync('/tmp/relations_report.txt', out.join('\n'));
process.stdout.write(out.join('\n') + '\n');
