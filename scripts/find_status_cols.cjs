const fs = require('fs');
const content = fs.readFileSync('shared/schema.ts', 'utf8');
const lines = content.split('\n');

// Find status columns and their comment hints
const statusCols = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Match columns named *status* using varchar or text
  const colMatch = line.match(/(\w+):\s*(?:varchar|text)\(['"]([\w_]+)['"]/);
  if (
    colMatch &&
    (colMatch[2].includes('status') ||
      colMatch[1].includes('Status') ||
      colMatch[1].includes('status'))
  ) {
    const nextLine = (lines[i + 1] || '').trim();
    const comment = nextLine.startsWith('//') ? nextLine.substring(2).trim() : '';
    statusCols.push({
      line: i + 1,
      varName: colMatch[1],
      colName: colMatch[2],
      code: line.trim(),
      comment,
    });
  }
}

console.log(`Found ${statusCols.length} status columns using varchar/text\n`);

// Group by column name
const byName = {};
for (const col of statusCols) {
  const key = col.colName;
  if (!byName[key]) byName[key] = [];
  byName[key].push(col);
}

const sorted = Object.entries(byName).sort((a, b) => b[1].length - a[1].length);
console.log('Top status column names by frequency:');
for (const [name, cols] of sorted.slice(0, 15)) {
  console.log(`  ${name}: ${cols.length} occurrences`);
  // Show sample comments
  const comments = cols.filter(c => c.comment).map(c => c.comment);
  if (comments.length > 0) {
    console.log(`    Values: ${comments[0]}`);
  }
}

console.log('\nAll status columns:');
statusCols.forEach(c => {
  console.log(`  L${c.line} ${c.colName} = ${c.varName}`);
  if (c.comment) console.log(`    // ${c.comment}`);
});
