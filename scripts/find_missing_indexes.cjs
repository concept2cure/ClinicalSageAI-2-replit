/**
 * Find tables with organization_id, project_id, or user_id columns that lack indexes on those columns.
 */
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
    let j = i;

    // Collect all lines of this table definition
    const tableLines = [];
    for (; j < lines.length; j++) {
      const line = lines[j];
      tableLines.push(line);
      for (const ch of line) {
        if (ch === '(') parenDepth++;
        if (ch === ')') parenDepth--;
      }
      if (parenDepth === 0 && j > startLine) break;
    }

    const tableText = tableLines.join('\n');

    // Check for key columns
    const hasOrgId = tableText.includes("'organization_id'") || tableText.includes("'org_id'");
    const hasProjectId = tableText.includes("'project_id'");
    const hasUserId = tableText.includes("'user_id'");

    // Check if there's a table callback (index definitions)
    // Look for index() calls on these columns
    const hasOrgIdx =
      tableText.includes('table.organizationId') || tableText.includes('table.orgId');
    const hasProjectIdx = tableText.includes('table.projectId');
    const hasUserIdx = tableText.includes('table.userId');

    // Check if org_id is already in a unique constraint
    const orgInUnique = /unique.*organizationId|uniqueIndex.*organizationId/.test(tableText);

    // Has callback at all?
    const hasCallback = /table\s*=>\s*[({]/.test(tableText);

    const needsOrgIdx = hasOrgId && !hasOrgIdx && !orgInUnique;
    const needsProjectIdx = hasProjectId && !hasProjectIdx;

    if (needsOrgIdx || needsProjectIdx) {
      tables.push({
        name,
        startLine: startLine + 1,
        endLine: j + 1,
        needsOrgIdx,
        needsProjectIdx,
        hasCallback,
      });
    }

    i = j + 1;
  } else {
    i++;
  }
}

console.log(`Tables needing indexes: ${tables.length}`);
console.log('\n=== NEEDS ORG_ID INDEX ===');
tables
  .filter(t => t.needsOrgIdx)
  .forEach(t => console.log(`${t.name} L${t.startLine}-${t.endLine} hasCallback:${t.hasCallback}`));
console.log('\n=== NEEDS PROJECT_ID INDEX ===');
tables
  .filter(t => t.needsProjectIdx)
  .forEach(t => console.log(`${t.name} L${t.startLine}-${t.endLine} hasCallback:${t.hasCallback}`));
