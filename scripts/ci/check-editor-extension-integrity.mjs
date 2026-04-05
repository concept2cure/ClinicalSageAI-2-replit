#!/usr/bin/env node

/**
 * CI Guard: Editor Extension Integrity
 *
 * Verifies that every @tiptap/* package imported in client/src/ is listed
 * in package.json dependencies or devDependencies.
 *
 * Exit 0 = all imports satisfied
 * Exit 1 = missing packages detected
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const CLIENT_SRC = join(ROOT, "client/src");

// --- Step 1: Read installed @tiptap/* packages from package.json ---

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const installedTiptap = new Set();

for (const depField of ["dependencies", "devDependencies"]) {
  if (pkg[depField]) {
    for (const name of Object.keys(pkg[depField])) {
      if (name.startsWith("@tiptap/")) {
        installedTiptap.add(name);
      }
    }
  }
}

console.log(`Found ${installedTiptap.size} @tiptap/* packages in package.json`);

// --- Step 2: Scan client/src/ for @tiptap/* imports ---

const importPattern = /from\s+['"](@tiptap\/[^'"\/]+)/g;
const requirePattern = /require\(\s*['"](@tiptap\/[^'"\/]+)/g;

const importedTiptap = new Map(); // packageName -> Set<filePath>

function scanDirectory(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      scanDirectory(fullPath);
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      const content = readFileSync(fullPath, "utf-8");

      for (const pattern of [importPattern, requirePattern]) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const pkg = match[1];
          if (!importedTiptap.has(pkg)) {
            importedTiptap.set(pkg, new Set());
          }
          importedTiptap.get(pkg).add(fullPath.replace(ROOT + "/", ""));
        }
      }
    }
  }
}

scanDirectory(CLIENT_SRC);

console.log(`Found ${importedTiptap.size} unique @tiptap/* imports in client/src/`);

// --- Step 3: Check for missing packages ---

const missing = [];

for (const [pkg, files] of importedTiptap) {
  if (!installedTiptap.has(pkg)) {
    missing.push({ package: pkg, files: [...files] });
  }
}

if (missing.length === 0) {
  console.log("\n✓ All @tiptap/* imports are satisfied by package.json\n");

  // Print summary
  const sorted = [...importedTiptap.keys()].sort();
  for (const pkg of sorted) {
    console.log(`  ${pkg} (${importedTiptap.get(pkg).size} file(s))`);
  }

  console.log("\nEditor extension integrity check PASSED.");
  process.exit(0);
} else {
  console.error(`\n✗ ${missing.length} @tiptap/* package(s) imported but NOT in package.json:\n`);

  for (const { package: pkg, files } of missing) {
    console.error(`  ${pkg}`);
    for (const f of files) {
      console.error(`    - ${f}`);
    }
  }

  console.error("\nFix: npm install <missing-package>");
  console.error("Editor extension integrity check FAILED.");
  process.exit(1);
}
