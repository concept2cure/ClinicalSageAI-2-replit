import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walk(full));
    else results.push(full);
  }
  return results;
}

function restoreInFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  if (!original.includes('// toast call replaced')) return { changed: false };

  const lines = original.split(/\r?\n/);
  const out = [];
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.includes('// toast call replaced')) {
      out.push(line);
      continue;
    }

    // Start skipping until we find the console.log("Toast would show:", { ... }); block.
    changed = true;

    let toastIndent = line.match(/^(\s*)/)?.[1] ?? '';
    let foundConsole = false;

    // Advance to console.log line
    for (i = i + 1; i < lines.length; i++) {
      const l = lines[i];
      const consoleMatch = l.match(/^(\s*)console\.log\((['"`])Toast would show:\2,\s*\{\s*$/);
      if (consoleMatch) {
        toastIndent = consoleMatch[1];
        foundConsole = true;
        break;
      }

      // Some files may have slightly different spacing: console.log('Toast would show:', {
      const consoleMatchLoose = l.match(/^(\s*)console\.log\((['"`])Toast would show:\2,\s*\{\s*$/);
      if (consoleMatchLoose) {
        toastIndent = consoleMatchLoose[1];
        foundConsole = true;
        break;
      }

      const consoleMatchComma = l.match(/^(\s*)console\.log\((['"`])Toast would show:\2,\s*\{\s*$/);
      if (consoleMatchComma) {
        toastIndent = consoleMatchComma[1];
        foundConsole = true;
        break;
      }

      // Keep skipping
    }

    if (!foundConsole) {
      // Fall back: keep the marker line (comment it out so it won't break parsing)
      out.push(`${toastIndent}// toast call replaced (unrestored)`);
      // Continue without additional skipping
      continue;
    }

    // Capture object body until closing `});`
    const objLines = [];
    for (i = i + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*\}\);\s*$/.test(l)) {
        break;
      }
      objLines.push(l);
    }

    // Emit restored toast call
    out.push(`${toastIndent}toast({`);
    out.push(...objLines);
    out.push(`${toastIndent}});`);
  }

  const updated = out.join('\n');
  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf8');
    return { changed: true };
  }
  return { changed: false };
}

const targets = [
  path.join(repoRoot, 'client', 'src'),
];

let touched = 0;
let changedFiles = 0;
for (const root of targets) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    touched++;
    const res = restoreInFile(file);
    if (res.changed) changedFiles++;
  }
}

console.log(`Scanned ${touched} TS/TSX files. Updated ${changedFiles} file(s).`);
