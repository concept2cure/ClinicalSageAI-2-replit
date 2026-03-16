/**
 * Add missing organization_id and project_id indexes to schema.ts tables.
 * Strategy: Find tables that have org_id/project_id columns but no index on them.
 * For tables without a callback: add one with the index.
 * For tables with a callback: add the index to the existing callback.
 */
const fs = require('fs');
const content = fs.readFileSync('shared/schema.ts', 'utf8');

// Use regex to find all pgTable definitions and extract their contents
const tableRegex = /export const (\w+) = pgTable\(\s*'([^']+)',/g;
let match;
const tablePositions = [];

while ((match = tableRegex.exec(content)) !== null) {
  tablePositions.push({
    name: match[1],
    tableName: match[2],
    startPos: match.index,
  });
}

console.log(`Found ${tablePositions.length} tables`);

// For each table, find the full extent by balancing parens from the start
const tables = [];
for (const tp of tablePositions) {
  let depth = 0;
  let endPos = tp.startPos;
  let started = false;

  for (let i = tp.startPos; i < content.length; i++) {
    const ch = content[i];
    if (ch === '(') {
      depth++;
      started = true;
    }
    if (ch === ')') {
      depth--;
    }
    if (started && depth === 0) {
      endPos = i + 1;
      break;
    }
  }

  const body = content.substring(tp.startPos, endPos);

  const hasOrgId = body.includes("'organization_id'") || body.includes("'org_id'");
  const hasProjectId = body.includes("'project_id'");

  // Check if there's an index already on the org columns
  // Look for table.organizationId or table.orgId in index definitions
  const hasOrgIdx =
    /\bindex\(.*\)\.on\(.*table\.(organizationId|orgId)/.test(body) ||
    /uniqueIndex\(.*\)\.on\(.*table\.(organizationId|orgId)/.test(body) ||
    /unique\(.*\)\.on\(.*table\.(organizationId|orgId)/.test(body);
  const hasProjectIdx =
    /\bindex\(.*\)\.on\(.*table\.projectId/.test(body) ||
    /uniqueIndex\(.*\)\.on\(.*table\.projectId/.test(body);

  // Check if there's a table callback
  const hasCallback = /table\s*=>\s*[({]/.test(body) || /\(table\)\s*=>\s*[({]/.test(body);

  const needsOrgIdx = hasOrgId && !hasOrgIdx;
  const needsProjectIdx = hasProjectId && !hasProjectIdx;

  if (needsOrgIdx || needsProjectIdx) {
    tables.push({
      ...tp,
      endPos,
      body,
      needsOrgIdx,
      needsProjectIdx,
      hasCallback,
      hasOrgId: body.includes("'organization_id'") ? 'organizationId' : 'orgId',
    });
  }
}

console.log(`\nTables needing org_id index: ${tables.filter(t => t.needsOrgIdx).length}`);
console.log(`Tables needing project_id index: ${tables.filter(t => t.needsProjectIdx).length}`);
console.log(`Tables with existing callback: ${tables.filter(t => t.hasCallback).length}`);
console.log(`Tables without callback: ${tables.filter(t => !t.hasCallback).length}`);

// Now modify the file - process from end to start to preserve positions
tables.sort((a, b) => b.startPos - a.startPos);

let modified = content;
let addedCount = 0;

for (const table of tables) {
  const body = modified.substring(table.startPos, table.endPos);

  // Build index names
  const idxPrefix = `idx_${table.tableName}`;
  const orgCol = table.hasOrgId;
  const indexes = [];

  if (table.needsOrgIdx) {
    indexes.push(`      ${idxPrefix}_org: index('${idxPrefix}_org').on(table.${orgCol})`);
  }
  if (table.needsProjectIdx) {
    indexes.push(`      ${idxPrefix}_project: index('${idxPrefix}_project').on(table.projectId)`);
  }

  let newBody;

  if (table.hasCallback) {
    // Find the return { ... } block and add our indexes
    // or the table => ({ ... }) pattern

    // Pattern 1: table => ({ ...existing... })
    // We need to add before the closing })
    // Pattern 2: table => { return { ...existing... }; }

    // Find the last }) or }; } before the end
    // Simplest: find the last index/unique line and add after it
    const indexLines = body.match(
      /\n(\s+\w+:\s*(?:index|uniqueIndex|unique)\([^)]*\)\.on\([^)]*\))(?:,?\s*$)/gm
    );

    if (indexLines && indexLines.length > 0) {
      const lastIdxLine = indexLines[indexLines.length - 1];
      const lastIdxPos = body.lastIndexOf(lastIdxLine.trimStart());

      if (lastIdxPos !== -1) {
        // Ensure trailing comma on last existing index
        const trimmed = lastIdxLine.trimEnd();
        const insertAfter = lastIdxPos + lastIdxLine.trimStart().length;
        const replacement = (trimmed.endsWith(',') ? '' : ',') + '\n' + indexes.join(',\n');

        newBody = body.substring(0, insertAfter);
        if (!newBody.trimEnd().endsWith(',')) newBody = newBody.trimEnd() + ',';
        newBody += '\n' + indexes.join(',\n') + body.substring(insertAfter);
      }
    }

    if (!newBody) {
      // Fallback: couldn't find index lines in callback, skip
      console.log(`  SKIP (complex callback): ${table.name}`);
      continue;
    }
  } else {
    // No callback - need to add one
    // The table ends with });  or just )  after the columns }
    // Find the columns closing } and the final );

    // Find the position of the closing paren
    // The body ends with ); or )
    // Before that, we need to insert ,\n  table => ({\n    indexes\n  })

    // Pattern: pgTable('name', { ...columns... });
    // We need: pgTable('name', { ...columns... }, table => ({ ...indexes... }));

    // Find the last } in the body (columns close)
    let lastBrace = body.lastIndexOf('}');
    // The body should end with ); after that

    const callback = `,\n  table => ({\n${indexes.join(',\n')},\n  })`;

    // Insert after the columns closing brace but before the final );
    // Find position: }); at end or },\n);
    const endMatch = body.match(/\}\s*\)\s*;?\s*$/);
    if (endMatch) {
      const endIdx = body.lastIndexOf(endMatch[0]);
      // Insert callback between } and )
      const bracePos = body.indexOf('}', endIdx);
      newBody = body.substring(0, bracePos + 1) + callback + body.substring(bracePos + 1);
    } else {
      console.log(`  SKIP (can't find end): ${table.name}`);
      continue;
    }
  }

  if (newBody) {
    modified = modified.substring(0, table.startPos) + newBody + modified.substring(table.endPos);
    addedCount++;
  }
}

fs.writeFileSync('shared/schema.ts', modified);
console.log(`\nDone! Added indexes to ${addedCount} tables.`);
