/**
 * Script to add missing createdAt/updatedAt timestamps to all pgTable definitions in schema.ts
 *
 * Strategy:
 * 1. Parse each pgTable definition to find its column block
 * 2. For tables missing createdAt: add both createdAt and updatedAt
 * 3. For tables missing only updatedAt: add updatedAt after createdAt line
 */

const fs = require('fs');

const SCHEMA_FILE = 'shared/schema.ts';
const content = fs.readFileSync(SCHEMA_FILE, 'utf8');
const lines = content.split('\n');

// First pass: identify all tables and their boundaries
const tables = [];
let i = 0;
while (i < lines.length) {
  const match = lines[i].match(/export const (\w+) = pgTable\(/);
  if (match) {
    const tableName = match[1];
    const startLine = i;

    // Find the columns object opening brace
    // pgTable('name', { ... }) or pgTable(\n  'name',\n  { ... })
    let columnsOpenLine = -1;
    let j = i;
    let foundTableName = false;

    // Skip to find the opening { of columns object
    let parenDepth = 0;
    let braceDepth = 0;
    let firstBraceFound = false;
    let columnsCloseLine = -1;

    for (j = i; j < lines.length; j++) {
      const line = lines[j];
      for (let k = 0; k < line.length; k++) {
        const ch = line[k];
        if (ch === '(') parenDepth++;
        if (ch === ')') parenDepth--;
        if (ch === '{') {
          braceDepth++;
          if (!firstBraceFound) {
            firstBraceFound = true;
            columnsOpenLine = j;
          }
        }
        if (ch === '}') {
          braceDepth--;
          if (braceDepth === 0 && firstBraceFound && columnsCloseLine === -1) {
            columnsCloseLine = j;
          }
        }
      }
      if (parenDepth === 0 && j > i) break;
    }

    const endLine = j;

    // Check for timestamps in the column block
    let hasCreatedAt = false;
    let hasUpdatedAt = false;
    let createdAtLine = -1;

    for (let k = columnsOpenLine; k <= columnsCloseLine; k++) {
      if (lines[k].includes("'created_at'") || lines[k].includes("'createdAt'")) {
        hasCreatedAt = true;
        createdAtLine = k;
      }
      if (lines[k].includes("'updated_at'") || lines[k].includes("'updatedAt'")) {
        hasUpdatedAt = true;
      }
    }

    tables.push({
      name: tableName,
      startLine,
      endLine,
      columnsOpenLine,
      columnsCloseLine,
      hasCreatedAt,
      hasUpdatedAt,
      createdAtLine,
    });

    i = endLine + 1;
  } else {
    i++;
  }
}

console.log(`Found ${tables.length} tables`);
const needsBoth = tables.filter(t => !t.hasCreatedAt && !t.hasUpdatedAt);
const needsUpdatedOnly = tables.filter(t => t.hasCreatedAt && !t.hasUpdatedAt);
console.log(`Tables needing both: ${needsBoth.length}`);
console.log(`Tables needing only updatedAt: ${needsUpdatedOnly.length}`);

// Build the modified file - process from bottom up to preserve line numbers
const insertions = [];

// Tables needing both createdAt and updatedAt
for (const table of needsBoth) {
  // Detect indentation from the columns close line
  const closeLineContent = lines[table.columnsCloseLine];
  const closeIndent = closeLineContent.match(/^(\s*)/)[1];
  const colIndent = closeIndent + '  '; // columns are typically 2 more spaces

  // Look at the line just before columnsCloseLine to determine the trailing comma pattern
  let insertBeforeLine = table.columnsCloseLine;
  const prevLine = lines[insertBeforeLine - 1].trimEnd();

  // Add a trailing comma to the previous line if it doesn't have one
  const needsComma = !prevLine.endsWith(',') && !prevLine.endsWith('{');

  insertions.push({
    line: insertBeforeLine,
    tableName: table.name,
    type: 'both',
    indent: colIndent,
    needsComma: needsComma,
    prevLineIdx: insertBeforeLine - 1,
  });
}

// Tables needing only updatedAt
for (const table of needsUpdatedOnly) {
  // Insert after the createdAt line
  const createdLine = lines[table.createdAtLine];
  const indent = createdLine.match(/^(\s*)/)[1];

  insertions.push({
    line: table.createdAtLine + 1,
    tableName: table.name,
    type: 'updatedOnly',
    indent: indent,
    needsComma: false,
    prevLineIdx: table.createdAtLine,
  });
}

// Sort insertions from bottom to top to preserve line numbers
insertions.sort((a, b) => b.line - a.line);

let modifiedLines = [...lines];

for (const ins of insertions) {
  if (ins.type === 'both') {
    // Add comma to previous line if needed
    if (ins.needsComma) {
      modifiedLines[ins.prevLineIdx] = modifiedLines[ins.prevLineIdx].trimEnd() + ',';
    }

    const newLines = [
      `${ins.indent}createdAt: timestamp('created_at').defaultNow().notNull(),`,
      `${ins.indent}updatedAt: timestamp('updated_at').defaultNow(),`,
    ];
    modifiedLines.splice(ins.line, 0, ...newLines);
  } else {
    // updatedOnly - insert after createdAt
    const newLines = [`${ins.indent}updatedAt: timestamp('updated_at').defaultNow(),`];
    modifiedLines.splice(ins.line, 0, ...newLines);
  }
}

fs.writeFileSync(SCHEMA_FILE, modifiedLines.join('\n'));
console.log(`\nDone! Modified ${insertions.length} tables.`);
console.log('File written to', SCHEMA_FILE);
