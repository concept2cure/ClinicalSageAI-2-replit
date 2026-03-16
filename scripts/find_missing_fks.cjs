/**
 * Find columns that look like foreign keys (named *_id) but have no .references() constraint.
 * Focus on the most common patterns: user_id, organization_id, project_id, document_id
 */
const fs = require('fs');
const content = fs.readFileSync('shared/schema.ts', 'utf8');
const lines = content.split('\n');

// Known FK targets for common column names
const FK_PATTERNS = {
  user_id: 'users.id',
  created_by_user_id: 'users.id',
  updated_by_user_id: 'users.id',
  assigned_to_user_id: 'users.id',
  reviewed_by_user_id: 'users.id',
  approved_by_user_id: 'users.id',
};

// Track columns that look like FKs but don't have .references()
const missingFKs = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Match integer('some_id') or integer('some_id') without .references on same or next line
  const idColMatch = line.match(/(\w+):\s*integer\(['"]([\w_]+)['"]\)/);
  if (!idColMatch) continue;

  const varName = idColMatch[1];
  const colName = idColMatch[2];

  // Skip if it doesn't end with _id
  if (!colName.endsWith('_id')) continue;

  // Skip id itself
  if (colName === 'id') continue;

  // Check if this line or the next few lines have .references()
  const blockText = lines.slice(i, Math.min(i + 4, lines.length)).join(' ');
  if (blockText.includes('.references(')) continue;

  // Determine likely target
  let target = FK_PATTERNS[colName];
  if (!target) {
    // Guess from column name: parent_id -> self-ref, xxx_id -> xxxs.id or xxx.id
    if (colName === 'parent_id') {
      target = 'self-reference';
    } else {
      const base = colName.replace(/_id$/, '');
      target = `${base}s.id (guessed)`;
    }
  }

  missingFKs.push({
    line: i + 1,
    varName,
    colName,
    code: line.trim(),
    target,
  });
}

console.log(`Found ${missingFKs.length} integer columns ending in _id without .references()\n`);

// Group by column name
const grouped = {};
for (const fk of missingFKs) {
  if (!grouped[fk.colName]) grouped[fk.colName] = [];
  grouped[fk.colName].push(fk);
}

const sorted = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
for (const [colName, items] of sorted.slice(0, 20)) {
  console.log(`${colName}: ${items.length} occurrences → ${items[0].target}`);
  items.slice(0, 3).forEach(item => console.log(`  L${item.line}: ${item.code}`));
  if (items.length > 3) console.log(`  ... and ${items.length - 3} more`);
}
