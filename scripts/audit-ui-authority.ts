/**
 * UI Authority Audit Script
 *
 * Validates the UI shell authority structure against config/ui-surface-registry.json.
 * Run: npx tsx scripts/audit-ui-authority.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
let passes = 0;

function pass(msg: string) {
  console.log(`  [PASS] ${msg}`);
  passes++;
}

function fail(msg: string) {
  console.log(`  [FAIL] ${msg}`);
  failures++;
}

function heading(title: string) {
  console.log(`\n── ${title} ──`);
}

// ── 1. Load UI Surface Registry ──

heading('Surface Registry File Checks');

const registryPath = path.join(ROOT, 'config/ui-surface-registry.json');
if (!fs.existsSync(registryPath)) {
  fail('config/ui-surface-registry.json not found');
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
const surfaces = registry.surfaces;

// ── 2. Validate each surface entry ──

function checkSurfaces(category: string, entries: Record<string, any>) {
  for (const [name, entry] of Object.entries(entries)) {
    if (!entry.path) continue; // skip entries without a file path (e.g. destinations)
    const filePath = path.join(ROOT, entry.path);
    const exists = fs.existsSync(filePath);

    if (entry.status === 'deleted') {
      if (exists) {
        fail(`${category}/${name}: status is "deleted" but file exists at ${entry.path}`);
      } else {
        pass(`${category}/${name}: deleted and file absent`);
      }
    } else if (entry.status === 'active') {
      if (exists) {
        pass(`${category}/${name}: active and file exists`);
      } else {
        fail(`${category}/${name}: status is "active" but file missing at ${entry.path}`);
      }
    } else if (entry.status === 'demoted') {
      if (!exists) {
        fail(`${category}/${name}: status is "demoted" but file missing at ${entry.path}`);
      } else {
        // Check if demoted file is still imported somewhere in client/
        const importName = path.basename(entry.path, path.extname(entry.path));
        const clientDir = path.join(ROOT, 'client');
        let importFound = false;
        try {
          const result = new TextDecoder().decode(
            // Use a simple recursive search in client/src
            fs.readFileSync(filePath) // just confirm readable
          );
          // Search for imports of this file across client/src
          const srcDir = path.join(clientDir, 'src');
          importFound = searchImports(srcDir, importName, entry.path);
        } catch {
          // ignore read errors
        }
        if (importFound) {
          fail(`${category}/${name}: demoted but still imported in client/src`);
        } else {
          pass(`${category}/${name}: demoted and no imports found`);
        }
      }
    }
  }
}

function searchImports(dir: string, componentName: string, relativePath: string): boolean {
  if (!fs.existsSync(dir)) return false;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      if (searchImports(fullPath, componentName, relativePath)) return true;
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      // Don't check the file itself
      if (fullPath.endsWith(relativePath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes(`from`) && content.includes(componentName)) {
        const importRegex = new RegExp(`import\\s.*${componentName}`, 'i');
        if (importRegex.test(content)) return true;
      }
    }
  }
  return false;
}

for (const [category, entries] of Object.entries(surfaces)) {
  if (typeof entries === 'object' && entries !== null && !Array.isArray(entries)) {
    checkSurfaces(category, entries as Record<string, any>);
  }
}

// ── 3. LayoutMode count check (max 30) ──

heading('LayoutMode Count Check');

const constantsPath = path.join(ROOT, 'client/src/concept2cure/zen-app-constants.ts');
if (!fs.existsSync(constantsPath)) {
  fail('zen-app-constants.ts not found');
} else {
  const constantsContent = fs.readFileSync(constantsPath, 'utf-8');
  // Extract the LayoutMode type block
  const layoutMatch = constantsContent.match(/export type LayoutMode\s*=([\s\S]*?);/);
  if (!layoutMatch) {
    fail('Could not parse LayoutMode type from zen-app-constants.ts');
  } else {
    const values = layoutMatch[1].match(/'\S+'/g) || [];
    const count = values.length;
    if (count <= 30) {
      pass(`LayoutMode has ${count} values (limit: 30)`);
    } else {
      fail(`LayoutMode has ${count} values — exceeds limit of 30`);
    }
  }
}

// ── 4. Sidebar destination labels ──

heading('Sidebar Destination Labels Check');

const sidebarPath = path.join(ROOT, 'client/src/concept2cure/components/sidebar/ZenSidebar.tsx');
if (!fs.existsSync(sidebarPath)) {
  fail('ZenSidebar.tsx not found');
} else {
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
  const requiredLabels = ['Chats', 'Projects', 'Communication Center', 'Apps', 'Settings'];
  const missing: string[] = [];
  for (const label of requiredLabels) {
    if (!sidebarContent.includes(label)) {
      missing.push(label);
    }
  }
  if (missing.length === 0) {
    pass(`ZenSidebar contains all 5 destination labels`);
  } else {
    fail(`ZenSidebar missing labels: ${missing.join(', ')}`);
  }
}

// ── 5. No Poppins font references ──

heading('Poppins Font Reference Check');

function findPoppinsRefs(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      findPoppinsRefs(fullPath, results);
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx|css|html)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (/poppins/i.test(content)) {
        results.push(fullPath.replace(ROOT + '/', ''));
      }
    }
  }
  return results;
}

const poppinsFiles = findPoppinsRefs(path.join(ROOT, 'client'));
if (poppinsFiles.length === 0) {
  pass('No Poppins font references found in client/');
} else {
  fail(`Poppins font references found in ${poppinsFiles.length} file(s):`);
  for (const f of poppinsFiles) {
    console.log(`         - ${f}`);
  }
}

// ── Summary ──

heading('Summary');
console.log(`  Passed: ${passes}`);
console.log(`  Failed: ${failures}`);
console.log(`  Total:  ${passes + failures}\n`);

if (failures > 0) {
  console.log('AUDIT FAILED — resolve the above issues.\n');
  process.exit(1);
} else {
  console.log('AUDIT PASSED — all checks green.\n');
  process.exit(0);
}
