/**
 * UI Authority Audit Script
 *
 * Validates the UI shell authority structure against config/ui-surface-registry.json.
 * Run: npm run audit:ui-authority   (npx tsx scripts/audit-ui-authority.ts)
 *
 * ── What changed on 2026-09-06 ───────────────────────────────────────────────
 * This script used to assert against a shell that no longer exists: it looked
 * for `zen-app-constants.ts` (a LayoutMode enum with a limit of 30 values) and
 * `components/sidebar/ZenSidebar.tsx` (five destination labels). Both files
 * were deleted in Phase 7, so the script could only ever fail — and because
 * nothing ran it, that failure was invisible. It now audits the shell that
 * ships (v2/V2App.tsx + v2/Shell.tsx + v2/registryModel.ts), reads the same
 * registry file, and is wired into package.json so it can be run.
 *
 * The checks are measurements, not aspirations: the rail is audited against
 * the registry's recorded destinations and limits (which carry the 2026-07-28
 * product decision), not against a five-item ideal the product owner declined.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
let passes = 0;

function pass(msg: string) { console.log(`  [PASS] ${msg}`); passes++; }
function fail(msg: string) { console.log(`  [FAIL] ${msg}`); failures++; }
function heading(title: string) { console.log(`\n── ${title} ──`); }
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// ── 1. Load UI Surface Registry ──

heading('Surface Registry File Checks');

const registryPath = path.join(ROOT, 'config/ui-surface-registry.json');
if (!fs.existsSync(registryPath)) {
  fail('config/ui-surface-registry.json not found');
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
const surfaces = registry.surfaces as Record<string, Record<string, any>>;

// ── 2. Validate each surface entry ──

function walkClientSources(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') walkClientSources(full, out); }
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const clientSources = walkClientSources(path.join(ROOT, 'client/src'));

function importedAnywhere(relativePath: string): boolean {
  const name = path.basename(relativePath, path.extname(relativePath));
  const importRegex = new RegExp(`import\\s[^;]*\\b${name}\\b`);
  return clientSources.some((f) => !f.endsWith(relativePath) && importRegex.test(fs.readFileSync(f, 'utf-8')));
}

function checkSurfaces(category: string, entries: Record<string, any>) {
  for (const [name, entry] of Object.entries(entries)) {
    if (!entry.path) continue; // destinations are checked separately
    const exists = fs.existsSync(path.join(ROOT, entry.path));
    if (entry.status === 'deleted') {
      if (exists) fail(`${category}/${name}: status is "deleted" but file exists at ${entry.path}`);
      else pass(`${category}/${name}: deleted and file absent`);
    } else if (entry.status === 'active') {
      if (exists) pass(`${category}/${name}: active and file exists`);
      else fail(`${category}/${name}: status is "active" but file missing at ${entry.path}`);
    } else if (entry.status === 'demoted') {
      if (!exists) fail(`${category}/${name}: status is "demoted" but file missing at ${entry.path}`);
      else if (importedAnywhere(entry.path)) fail(`${category}/${name}: demoted but still imported in client/src`);
      else pass(`${category}/${name}: demoted and no imports found`);
    } else {
      fail(`${category}/${name}: unknown status "${entry.status}"`);
    }
  }
}

for (const [category, entries] of Object.entries(surfaces)) {
  if (category === 'destinations') continue;
  if (entries && typeof entries === 'object' && !Array.isArray(entries)) checkSurfaces(category, entries);
}

// ── 3. One shell owner: nothing outside the v2 tree renders a top-level sidebar ──

heading('Single Shell Owner');

const routerSwitches = clientSources.filter((f) => /<Switch[\s>]/.test(fs.readFileSync(f, 'utf-8')));
const allowedSwitches = new Set(['client/src/App.jsx', 'client/src/concept2cure/router/ZenRouter.tsx']);
const strays = routerSwitches.map((f) => path.relative(ROOT, f)).filter((f) => !allowedSwitches.has(f));
if (strays.length === 0) pass(`only ${allowedSwitches.size} route switches exist (App.jsx, ZenRouter.tsx)`);
else fail(`unexpected route switch(es): ${strays.join(', ')}`);

// ── 4. Layout-flag budget (the successor of the LayoutMode count) ──

heading('Layout Flag Budget');

const views = read('client/src/concept2cure/v2/surfaceViews.ts');
// Count registry ENTRIES that own the column, not every mention of the flag
// (the file's own documentation names it several times).
const owners = (views.match(/\{\s*component:[^}]*ownsConversation:\s*true/g) ?? []).length;
const max = Number(registry.limits?.ownsConversationMax ?? 7);
if (owners <= max) pass(`${owners} surface(s) own the conversation column (limit ${max})`);
else fail(`${owners} surfaces own the conversation column — exceeds limit of ${max}`);

// ── 5. Rail and destinations ──

heading('Rail and Destinations');

const model = read('client/src/concept2cure/v2/registryModel.ts');
const shell = read('client/src/concept2cure/v2/Shell.tsx');
const railIds = (name: string) => {
  const m = model.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`));
  return m ? [...m[1].matchAll(/id:\s*'([^']+)'/g)].map((x) => x[1]) : null;
};
const groups = ['RAIL_CORE', 'RAIL_SPECIALIST', 'RAIL_EXPLORE', 'RAIL_QUICK'];
const rail: string[] = [];
for (const g of groups) {
  const ids = railIds(g);
  if (!ids) fail(`${g} not found in registryModel.ts`);
  else rail.push(...ids);
}
const railTargets = new Set([
  ...rail,
  ...[...model.matchAll(/target:\s*'([^']+)'/g)].map((m) => m[1]),
]);
const railMax = Number(registry.limits?.railButtonsMax ?? 24);
if (rail.length > 0 && rail.length <= railMax) pass(`rail declares ${rail.length} destination buttons (limit ${railMax})`);
else if (rail.length > railMax) fail(`rail declares ${rail.length} destination buttons — exceeds limit of ${railMax}`);

const dests = (surfaces.destinations ?? {}) as Record<string, any>;
for (const [name, d] of Object.entries(dests)) {
  if (d.railTarget) {
    if (railTargets.has(d.railTarget)) pass(`destination ${name} → rail target "${d.railTarget}" is on the rail`);
    else fail(`destination ${name} → rail target "${d.railTarget}" is not on the rail`);
  } else if (Array.isArray(d.accountMenu)) {
    const missing = d.accountMenu.filter((label: string) => !shell.includes(`'${label}'`));
    if (missing.length === 0) pass(`destination ${name}: account menu carries ${d.accountMenu.length} labelled entries`);
    else fail(`destination ${name}: account menu missing ${missing.join(', ')}`);
  } else {
    // Not a rail item by decision: it must still be reachable by AnA and by URL.
    const nav = read('shared/navigation/index.ts');
    const views2 = read('client/src/concept2cure/v2/surfaceViews.ts');
    const reachable = nav.includes(`id: '${name}'`) && views2.includes(`'${name}':`);
    if (reachable) pass(`destination ${name}: not a rail item; reachable by navigate_to and deep link`);
    else fail(`destination ${name}: neither a rail item nor reachable by navigate_to (shared/navigation) + surfaceViews`);
  }
}

// ── 6. No Poppins font references ──

heading('Poppins Font Reference Check');

function findPoppinsRefs(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') findPoppinsRefs(full, results);
    else if (entry.isFile() && /\.(ts|tsx|js|jsx|css|html)$/.test(entry.name)) {
      // A comment that records the font's REMOVAL is not a reference to it.
      const code = fs.readFileSync(full, 'utf-8')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (/poppins/i.test(code)) results.push(path.relative(ROOT, full));
    }
  }
  return results;
}
const poppinsFiles = findPoppinsRefs(path.join(ROOT, 'client'));
if (poppinsFiles.length === 0) pass('No Poppins font references found in client/');
else { fail(`Poppins font references found in ${poppinsFiles.length} file(s):`); for (const f of poppinsFiles) console.log(`         - ${f}`); }

// ── Summary ──

heading('Summary');
console.log(`  Passed: ${passes}`);
console.log(`  Failed: ${failures}`);
console.log(`  Total:  ${passes + failures}\n`);
if (failures > 0) { console.log('AUDIT FAILED — resolve the above issues.\n'); process.exit(1); }
console.log('AUDIT PASSED — all checks green.\n');
process.exit(0);
