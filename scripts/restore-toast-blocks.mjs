#!/usr/bin/env node
/**
 * Restore corrupted "toast call replaced" blocks back into valid `toast({ ... })` calls.
 *
 * This repo has multiple corruption variants that break TS/TSX parsing, typically:
 *
 *   // toast call replaced
 *   // Original: toast({
 *     ...
 *   })
 *   console.log('Toast would show:', {
 *     ...
 *   });
 *
 * Some variants also leave a bare `})` which causes syntax errors.
 *
 * This script replaces the entire block starting at the marker line through the end
 * of the console.log statement with a single `toast({ ... });` statement.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CLIENT_SRC = path.join(ROOT, 'client', 'src');

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      if (/\.(ts|tsx)$/.test(entry.name)) yield full;
    }
  }
}

function leadingWhitespace(line) {
  const m = line.match(/^\s*/);
  return m ? m[0] : '';
}

function findNextIndex(lines, start, predicate) {
  for (let i = start; i < lines.length; i++) {
    if (predicate(lines[i], i)) return i;
  }
  return -1;
}

function extractObjectLiteral(lines, startLineIndex, startCol) {
  // Extract object literal text starting at `{` (at startCol within startLineIndex)
  // Returns { text, endLineIndex, endCol } where end points just after the matching `}`.
  let depth = 0;
  let inString = false;
  let stringQuote = '';
  let escaped = false;

  const out = [];

  for (let i = startLineIndex; i < lines.length; i++) {
    const line = lines[i];
    const from = i === startLineIndex ? startCol : 0;

    for (let j = from; j < line.length; j++) {
      const ch = line[j];
      out.push(ch);

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === stringQuote) {
          inString = false;
          stringQuote = '';
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringQuote = ch;
        continue;
      }

      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return {
            text: out.join(''),
            endLineIndex: i,
            endCol: j + 1,
          };
        }
      }
    }

    // Preserve newlines in extracted text.
    out.push('\n');
  }

  return null;
}

function repairFile(filePath) {
  const original = fs.readFileSync(filePath, 'utf8');
  if (!original.includes('toast call replaced')) return null;

  const lines = original.split(/\r?\n/);
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('toast call replaced')) continue;

    const markerIndex = i;

    // Find the console.log line that starts the object literal we can re-use.
    const logIndex = findNextIndex(lines, markerIndex + 1, (l) =>
      l.includes("console.log('Toast would show:'") && l.includes('{')
    );

    if (logIndex === -1) continue;

    const logLine = lines[logIndex];
    const braceCol = logLine.indexOf('{');
    if (braceCol === -1) continue;

    const extracted = extractObjectLiteral(lines, logIndex, braceCol);
    if (!extracted) continue;

    // Find the end of the console.log statement: scan forward from extracted end.
    let endIndex = extracted.endLineIndex;
    let endLineRemainder = lines[endIndex].slice(extracted.endCol);

    // If the statement terminator isn't on this line, keep walking.
    while (!/\)\s*;/.test(endLineRemainder) && endIndex < lines.length - 1) {
      endIndex++;
      endLineRemainder = lines[endIndex];
    }

    // Replace from marker line through endIndex.
    const indent = leadingWhitespace(lines[markerIndex]);
    const toastCall = `${indent}toast(${extracted.text.trimEnd()});`;

    lines.splice(markerIndex, endIndex - markerIndex + 1, toastCall);
    changed = true;

    // Restart scan at the line after replacement.
    i = markerIndex;
  }

  if (!changed) return null;

  const updated = lines.join('\n');
  fs.writeFileSync(filePath, updated, 'utf8');
  return { updated };
}

function main() {
  const files = Array.from(walk(CLIENT_SRC));
  let scanned = 0;
  let updatedCount = 0;

  for (const file of files) {
    scanned++;
    const result = repairFile(file);
    if (result) updatedCount++;
  }

  console.log(`Scanned ${scanned} TS/TSX file(s). Updated ${updatedCount} file(s).`);
}

main();
