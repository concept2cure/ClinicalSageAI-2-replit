#!/usr/bin/env node
/**
 * CI gate: every renderable surface is either discoverable or declared as not.
 *
 * A surface a user cannot find is, to that user, a surface that does not exist.
 * This product renders 118 of them and exposes 14 from the persistent rail; the
 * rest are meant to be found through the Apps catalog, which is seeded from
 * `available_modules` in db/migrations/20260810_reconcile_module_catalog.sql.
 *
 * Nothing kept those two lists in step. A surface could be built, routed,
 * tested and shipped while being reachable only by someone who already knew its
 * URL — which is how seven backed surfaces (design controls, human factors,
 * eTMF, IND lifecycle, investigator brochure, publishing centre, report engine)
 * came to be invisible despite calling live APIs, one of them across seventeen
 * endpoints.
 *
 * ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
 * It does not demand every surface appear in the catalog. Plenty legitimately
 * should not: the catalog itself, admin and billing screens, onboarding, and
 * the surfaces reached contextually from inside another one. Those are declared
 * in CONTEXTUAL below WITH A REASON, which is the point — "not in the catalog"
 * becomes a decision somebody made and signed, rather than an omission nobody
 * noticed.
 *
 * The reason string is required. A surface silently added to the exclusion list
 * is the same invisibility this gate exists to prevent, just written down.
 *
 * Usage:
 *   node scripts/ci/check-surface-discoverability.mjs
 *   node scripts/ci/check-surface-discoverability.mjs --json
 *
 * Exit code: 0 when every renderable surface is accounted for, 1 otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_MODE = process.argv.includes('--json');

const VIEWS = 'client/src/concept2cure/v2/surfaceViews.ts';
const CATALOG_FILES = [
  'db/migrations/20260810_reconcile_module_catalog.sql',
  'migrations/20260814j_catalog_missing_product_surfaces.sql',
  'migrations/20260814k_catalog_mission_control.sql',
  'migrations/20260814l_catalog_filing_strategy.sql',
];

/**
 * Surfaces deliberately absent from the Apps catalog, each with the reason.
 *
 * These are not "not ready" — they are surfaces the catalog is the wrong place
 * for. A capability that a customer could switch on belongs in the catalog; a
 * screen the shell or another surface routes you to does not.
 */
const CONTEXTUAL = {
  apps: 'the catalog itself — listing it inside itself is a loop',
  'admin-console': 'platform administration, reached from the admin area not subscribed to',
  setup: 'first-run configuration, reached before any catalog exists',
  onboarding: 'first-run flow, entered automatically',
  'onboarding-ingest': 'step within the onboarding flow',
  billing: 'account administration, not a subscribable capability',
  usage: 'account administration, not a subscribable capability',
  licensing: 'account administration — it is what grants catalog entries',
  /* Both reached from the org-admin nav (Shell.tsx: `isOrgAdmin ? [{ to:
     'master-licensing' }, { to: 'access-requests' }]`) — the same account-
     administration family as licensing/billing/usage. Landed 2026-08-24 without
     a declaration; the gate had been red since. Declared, not catalogued: a
     catalog entry would list an admin console as a subscribable capability. */
  'master-licensing': 'account administration, reached from the org-admin nav',
  'access-requests': 'account administration, reached from the org-admin nav',
  training: 'account administration',
  'project-home': 'the landing surface for a project, routed to on selection',
  'conversation-thread': 'AnA rail destination, reached by asking a question',
  'ana-command': 'AnA rail surface, on the persistent rail',
  'ana-memory': 'AnA rail surface, on the persistent rail',
  'audit-trail': 'governance surface, reached from Part 11 console and record views',
  'part11-console': 'governance surface, reached from admin and compliance views',
  'task-board': 'on the persistent rail as Tasks',
  coverage: 'engineering diagnostic, not a customer capability',
  'client-portal': 'external-participant surface, entered by invitation link',
  'regulatory-workspace': 'canvas host that other surfaces open into, not opened directly',
  /* The pdev family: `pdev` IS in the catalog and routes to these through its
     own nav vocabulary (PDEV_NAV in surfaces/PdevSurfaces.tsx). Listing sub-tabs
     as separately subscribable modules would misrepresent what a customer is
     switching on. */
  'pdev-cmc': 'tab within the pdev surface, which is in the catalog',
  'pdev-nonclinical': 'tab within the pdev surface, which is in the catalog',
  'pdev-clinical': 'tab within the pdev surface, which is in the catalog',
  'pdev-regulatory': 'tab within the pdev surface, which is in the catalog',
  'pdev-ind-assembly': 'tab within the pdev surface, which is in the catalog',
  'pdev-contradictions': 'tab within the pdev surface, which is in the catalog',
  'pdev-fda-interactions': 'tab within the pdev surface, which is in the catalog',
};

const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');

/** Surface ids the renderer knows how to draw. */
function renderableSurfaces() {
  const src = read(VIEWS);
  // Entries look like `  'device-510k': { component: X },` or `  apps: { … },`
  const ids = [...src.matchAll(/^\s{2}'?([a-z0-9][a-z0-9-]*)'?:\s*\{/gm)].map((m) => m[1]);
  return [...new Set(ids)];
}

/** Module ids seeded into the Apps catalog. */
function catalogModules() {
  const ids = [];
  for (const f of CATALOG_FILES) {
    const src = read(f);
    ids.push(...[...src.matchAll(/^\s*\('([a-z0-9][a-z0-9-]*)',/gm)].map((m) => m[1]));
  }
  return [...new Set(ids)];
}

const renderable = renderableSurfaces();
const catalog = new Set(catalogModules());
const failures = [];

const undiscoverable = renderable.filter((id) => !catalog.has(id) && !(id in CONTEXTUAL));
for (const id of undiscoverable) {
  failures.push({
    id,
    message:
      'renders but is in neither the Apps catalog nor the CONTEXTUAL list — a user can only reach it by knowing its URL',
  });
}

// A declared exclusion with an empty reason is an omission with extra steps.
for (const [id, reason] of Object.entries(CONTEXTUAL)) {
  if (!reason || reason.trim().length < 10) {
    failures.push({ id, message: 'declared contextual with no usable reason' });
  }
}

// Stale exclusions: a surface that stopped rendering, or that later joined the
// catalog, should leave the list rather than sit there implying a decision that
// no longer applies.
const renderableSet = new Set(renderable);
for (const id of Object.keys(CONTEXTUAL)) {
  if (!renderableSet.has(id)) {
    failures.push({ id, message: 'declared contextual but no longer renders — remove it' });
  } else if (catalog.has(id)) {
    failures.push({ id, message: 'declared contextual AND in the catalog — the two disagree' });
  }
}

const summary = {
  renderable: renderable.length,
  inCatalog: renderable.filter((id) => catalog.has(id)).length,
  contextual: Object.keys(CONTEXTUAL).length,
  undiscoverable: undiscoverable.length,
};

if (JSON_MODE) {
  console.log(JSON.stringify({ summary, failures }, null, 2));
} else if (failures.length === 0) {
  console.log(
    `\n[ci:surface-discoverability] OK — ${summary.renderable} renderable surface(s): ` +
      `${summary.inCatalog} in the Apps catalog, ${summary.contextual} declared contextual.\n`,
  );
} else {
  console.error(`\n[ci:surface-discoverability] FAIL — ${failures.length} issue(s):\n`);
  for (const f of failures) console.error(`  ${f.id}: ${f.message}`);
  console.error(
    '\nA surface a user cannot find is, to that user, a surface that does not exist.\n' +
      'Either add it to the Apps catalog seed\n' +
      `  (${CATALOG_FILES.join('\n   ')})\n` +
      'or declare it in CONTEXTUAL in this file with the reason it is reached another way.\n' +
      'Do not add a shell to the catalog to silence this — listing something as available\n' +
      'that does not work is worse than it being hard to find.\n',
  );
}

process.exit(failures.length === 0 ? 0 : 1);
