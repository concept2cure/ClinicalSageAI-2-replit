#!/usr/bin/env node
/**
 * Fix corrupted toast calls in client/src files
 * 
 * The corruption pattern looks like:
 * // toast call replaced
 *   // Original: toast({
 *         title: "...",
 *         description: "...",
 *         variant: "..."
 *       })
 *   console.log('Toast would show:', {
 *         title: "...",
 *         description: "...",
 *         variant: "..."
 *       });
 * 
 * Should be restored to:
 * toast({
 *   title: "...",
 *   description: "...",
 *   variant: "..."
 * });
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find all affected files
function findAffectedFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      findAffectedFiles(fullPath, files);
    } else if (item.endsWith('.tsx') || item.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('// toast call replaced')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function fixToastCalls(content) {
  // Pattern 1: Full corrupted toast call with variant
  // This regex matches the corrupted pattern and captures the toast content
  let fixed = content;
  
  // Match pattern with console.log replacement
  const corruptedPattern = /\/\/ toast call replaced\s*\n\s*\/\/ Original: (toast\(\{[\s\S]*?\}\))\s*\n\s*console\.log\('Toast would show:', \{[\s\S]*?\}\);/g;
  
  fixed = fixed.replace(corruptedPattern, (match, original) => {
    // Clean up the original toast call - fix indentation and add semicolon
    let cleaned = original.trim();
    if (!cleaned.endsWith(';')) {
      cleaned = cleaned.replace(/\)$/, ');');
    }
    // Fix indentation - replace leading spaces with proper formatting
    cleaned = cleaned.replace(/\n\s+/g, '\n      ');
    return cleaned;
  });
  
  // Pattern 2: Simpler corrupted pattern
  const simplePattern = /\/\/ toast call replaced\s*\n\s*\/\/ Original: (toast\(\{[^}]+\}\))\s*\n\s*console\.log\([^)]+\);/g;
  
  fixed = fixed.replace(simplePattern, (match, original) => {
    let cleaned = original.trim();
    if (!cleaned.endsWith(';')) {
      cleaned = cleaned.replace(/\)$/, ');');
    }
    return cleaned;
  });
  
  return fixed;
}

// Alternative approach: More aggressive fix
function fixToastCallsAggressive(content) {
  let lines = content.split('\n');
  let result = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    // Check if this is start of corrupted block
    if (line.includes('// toast call replaced')) {
      // Find the Original: toast({ line
      let toastStartLine = -1;
      let toastEndLine = -1;
      let consoleLogStartLine = -1;
      let consoleLogEndLine = -1;
      
      // Scan ahead to find the structure
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        if (lines[j].includes('// Original: toast({')) {
          toastStartLine = j;
        }
        if (toastStartLine !== -1 && toastEndLine === -1 && lines[j].includes('})')) {
          toastEndLine = j;
        }
        if (lines[j].includes("console.log('Toast would show:'")) {
          consoleLogStartLine = j;
        }
        if (consoleLogStartLine !== -1 && consoleLogEndLine === -1 && lines[j].includes('});')) {
          consoleLogEndLine = j;
          break;
        }
      }
      
      if (toastStartLine !== -1 && consoleLogEndLine !== -1) {
        // Extract the toast content from Original: line
        const indent = line.match(/^(\s*)/)[1];
        let toastContent = [];
        
        // Get the toast({ part
        let firstLine = lines[toastStartLine].replace('// Original: ', '').trim();
        toastContent.push(indent + firstLine);
        
        // Get middle lines until })
        for (let j = toastStartLine + 1; j <= toastEndLine; j++) {
          // Skip the console.log section if we've passed the toast end
          if (lines[j].includes("console.log('Toast would show:'")) break;
          
          let cleanLine = lines[j].trim();
          if (cleanLine && !cleanLine.startsWith('//')) {
            toastContent.push(indent + '  ' + cleanLine);
          }
        }
        
        // Ensure it ends with );
        let lastIdx = toastContent.length - 1;
        if (toastContent[lastIdx] && !toastContent[lastIdx].includes(');')) {
          toastContent[lastIdx] = toastContent[lastIdx].replace(/\)\s*$/, ');');
        }
        
        result.push(...toastContent);
        
        // Skip to after console.log block
        i = consoleLogEndLine + 1;
        continue;
      }
    }
    
    result.push(line);
    i++;
  }
  
  return result.join('\n');
}

// Main execution
const clientSrcDir = path.join(__dirname, '..', 'client', 'src');
console.log('Scanning for affected files...');

const affectedFiles = findAffectedFiles(clientSrcDir);
console.log(`Found ${affectedFiles.length} affected files`);

let fixedCount = 0;
for (const filePath of affectedFiles) {
  console.log(`Processing: ${path.relative(clientSrcDir, filePath)}`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  const before = (content.match(/\/\/ toast call replaced/g) || []).length;
  
  let fixed = fixToastCallsAggressive(content);
  const after = (fixed.match(/\/\/ toast call replaced/g) || []).length;
  
  if (before !== after) {
    fs.writeFileSync(filePath, fixed);
    console.log(`  Fixed ${before - after} toast calls (${after} remaining)`);
    fixedCount += (before - after);
  } else {
    console.log(`  No changes needed or pattern not matched`);
  }
}

console.log(`\nTotal fixed: ${fixedCount} toast calls`);
