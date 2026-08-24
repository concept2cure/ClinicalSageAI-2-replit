#!/usr/bin/env node
/**
 * CI gate: AnA's screen-awareness does not regress, and its adoption ratchets.
 *
 * ── THE GAP THIS EXISTS FOR ─────────────────────────────────────────────────
 * A surface tells AnA what it is showing by calling `usePublishSurfaceContext`
 * (client/src/concept2cure/v2/surfaceContext.ts). The shell forwards that as
 * `module_context` on every turn, and the server renders it into the system
 * prompt (server/services/ana-ri/surface-context-block.ts).
 *
 * The pipeline was completed end to end — publisher, transport, consumer — and
 * then three surfaces out of 118 called the publisher. On the other 115, AnA
 * was handed a live conversation and an empty screen: she could be asked "what
 * should I do next?" on a page whose contents she could not see, and would
 * answer from the surface id alone. That is worse than no assistant, because
 * it looks like one.
 *
 * ── WHAT THIS GATE COUNTS, AND WHY THAT CHANGED ─────────────────────────────
 * Coverage is measured in ROUTABLE SURFACE IDS, and nothing else. Four earlier
 * defects in this file all came from counting something adjacent to that:
 *
 *  1. THE DENOMINATOR WAS NOT THE REGISTRY. The registry reader matched
 *     `/^\s*'([a-z0-9-]+)':/gm` over the WHOLE of surfaceViews.ts at ANY
 *     indentation, so it swept up object keys that are not surface ids at all —
 *     `style:` and `'aria-busy':` from `SurfaceChunkFallback` — and reported
 *     122 registered surfaces where the map holds 120. A gate whose denominator
 *     is invented cannot report a true percentage of anything. The reader now
 *     parses only the body of the `SURFACE_VIEWS` object literal, only at the
 *     entry indentation, and only keys whose value opens a registration.
 *
 *  2. MEMBERSHIP WAS MISTAKEN FOR REACHABILITY. The id check asked
 *     `REGISTRY_IDS.has(id)`, which is true for an id the ROUTER REWRITES
 *     before the shell ever reads context by it. `surfaceIdFromLocation`
 *     applies `DEEP_LINK_ALIASES` first, so `/concept2cure/task-board` makes
 *     `activeId === 'tasks'` and a surface publishing under `'task-board'`
 *     matches nothing — `useActiveSurfaceContext` compares keys exactly.
 *     TaskBoard.tsx did precisely this, its context reached AnA zero times, and
 *     this gate passed it because `'task-board'` is a key in SURFACE_VIEWS.
 *     Alias SOURCES are therefore excluded from the routable set and publishing
 *     into one is a hard failure, named as such.
 *
 *  3. ONE GROUNDING CHANNEL WAS COUNTED, AND THERE ARE TWO. A surface
 *     registered `ownsConversation: true` takes the rail's column and runs its
 *     OWN `useAnaChat`. Nothing in the shell reads its published context,
 *     because the shell's rail is not drawn there — so `usePublishSurfaceContext`
 *     is the WRONG channel on those screens, and the right one is the
 *     `moduleContext` its own hook forwards (`document-authoring` and
 *     `ectd-coauthor` do exactly this). Counting only publishers reported both
 *     of those as blind, and — worse — scored `rbm` exactly the same as them.
 *     `rbm` ran the real assistant, on the real endpoint, with the real study
 *     id, and passed NO `moduleContext` at all, so it could not name one KRI on
 *     the board beside it. Both channels are now counted, each on the surfaces
 *     it actually applies to, and an owned surface that forwards no context is
 *     as blind here as one that never published.
 *
 *  4. THE RATCHET ONLY TURNED ONE WAY IN THEORY. `covered < BASELINE` fails,
 *     but `covered > BASELINE` passed silently, so the constant drifted below
 *     reality and the gate protected a bar nobody was standing on — while
 *     printing "101 are blind" and exiting 0. The baseline is now EXACT: below
 *     it is a regression, above it is an un-recorded improvement, and both
 *     fail. You cannot wire a surface without raising the number in the same
 *     change, and you cannot lower the number without the diff showing the
 *     surfaces you unwired.
 *
 * Usage:
 *   node scripts/ci/check-ana-surface-context.mjs
 *   node scripts/ci/check-ana-surface-context.mjs --json
 *   node scripts/ci/check-ana-surface-context.mjs --list   # what is still blind
 *
 * Exit 0 — every routable id is accounted for and coverage is exactly at the
 * baseline. Exit 1 — a surface went blind, a publish landed nowhere, or
 * coverage moved without the baseline moving with it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSON_MODE = process.argv.includes('--json');
const LIST_MODE = process.argv.includes('--list');

const V2_DIR = 'client/src/concept2cure/v2';
const SURFACES_DIR = `${V2_DIR}/surfaces`;
const SCAN_ROOT = 'client/src/concept2cure';

/**
 * Routable surface IDS publishing screen state today.
 *
 * EXACT, not a floor. Below it a surface went silent; above it a surface was
 * wired and this number was not raised with it. Both are failures — see (3) in
 * the header. Raise it in the same commit that wires the surface.
 */
const ID_BASELINE = 66;

/**
 * Routable ids that legitimately publish nothing, with the reason.
 *
 * Keyed by SURFACE ID, because the id is the unit AnA experiences: a file can
 * serve several ids and a child component can publish for a parent. Keyed by
 * FILENAME (as this list used to be) an exemption silently covered every id a
 * file served, so exempting `Coverage` also exempted anything else that file
 * ever came to render.
 *
 * Kept deliberately short. "It is not built yet" is NOT a reason to be here —
 * that is the backlog, which this gate reports rather than excuses.
 */
const NO_CONTEXT_NEEDED = {
  'client-portal': 'external-participant surface that deliberately offers no assistant',
  'conversation-thread': 'the conversation itself — its context is the thread',
  'ana-command': 'AnA rail surface; its subject is AnA, not a screen under discussion',
  'ana-memory': 'AnA rail surface; renders what AnA already holds',
  coverage: 'engineering diagnostic, not a customer capability',
  /* Owns the rail's column and runs NO assistant on it. Its middle pane is a
     client-side intent router ("Report builder") that composes text locally —
     it is deliberately not `useAnaChat`, because a template wearing the
     assistant's name is indistinguishable from the assistant to the person
     reading it (surfaceViews.ts records that decision). There is no AnA on this
     screen to ground. This exemption expires the moment it runs a real
     `useAnaChat`: the gate then fails it as an owned surface with no
     moduleContext. */
  insights: 'owns the rail column and deliberately runs no assistant — its report pane is a local intent router, not AnA',
};

/* ── The registry, parsed truthfully ──────────────────────────────────────── */

/**
 * Every id registered in the `SURFACE_VIEWS` map.
 *
 * Parsed from the object literal's body at the entry indentation only. The
 * previous reader scanned the whole file at any depth and counted `style:` and
 * `'aria-busy':` — keys of a style object and an ARIA attribute inside the
 * chunk fallback — as surfaces. Read from the source rather than listed here so
 * a renamed surface cannot leave a stale allowlist behind.
 */
function readSurfaceViews() {
  const full = path.join(repoRoot, V2_DIR, 'surfaceViews.ts');
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

const SURFACE_VIEWS_SRC = readSurfaceViews();

function registeredSurfaceIds() {
  if (!SURFACE_VIEWS_SRC) return null;
  const start = SURFACE_VIEWS_SRC.indexOf('export const SURFACE_VIEWS');
  if (start < 0) return null;
  const body = SURFACE_VIEWS_SRC.slice(start);
  const ids = new Set();
  for (const m of body.matchAll(/^ {2}(?:'([a-z0-9-]+)'|([a-z0-9-]+)):\s*\{/gm)) ids.add(m[1] ?? m[2]);
  return ids.size > 0 ? ids : null;
}

/**
 * Ids registered `ownsConversation: true`, mapped to the file that serves them.
 *
 * These screens take the rail's column, so the shell neither draws a rail nor
 * reads their published context: their grounding channel is the `moduleContext`
 * their own `useAnaChat` forwards. The mapping comes from the `lazyOwnedSurface`
 * binding the entry names, so a renamed module cannot leave this stale.
 */
function ownedConversationSurfaces() {
  if (!SURFACE_VIEWS_SRC) return new Map();
  const binding = new Map();
  for (const m of SURFACE_VIEWS_SRC.matchAll(
    /^const (\w+) = lazy(?:Owned)?Surface\(\(\) => import\('([^']+)'\)/gm,
  )) {
    binding.set(m[1], m[2]);
  }
  const start = SURFACE_VIEWS_SRC.indexOf('export const SURFACE_VIEWS');
  const body = SURFACE_VIEWS_SRC.slice(start);
  const out = new Map();
  for (const m of body.matchAll(
    /^ {2}(?:'([a-z0-9-]+)'|([a-z0-9-]+)):\s*\{([^}]*)\}/gm,
  )) {
    const id = m[1] ?? m[2];
    const entry = m[3];
    if (!/ownsConversation:\s*true/.test(entry)) continue;
    const comp = entry.match(/component:\s*([A-Za-z]\w*)/);
    const mod = comp ? binding.get(comp[1]) : null;
    out.set(id, mod ? path.join(V2_DIR, `${mod.replace(/^\.\//, '')}.tsx`) : null);
  }
  return out;
}

/**
 * Does this owned-conversation surface hand its own `useAnaChat` a
 * `moduleContext`?
 *
 * That is the whole question for these screens. Running the real assistant is
 * not grounding — `rbm` ran it against the real endpoint with the real study id
 * and still could not see a single reading on the board beside it, because the
 * option was simply absent from the call.
 */
function ownedSurfaceIsGrounded(relFile) {
  if (!relFile) return false;
  const full = path.join(repoRoot, relFile);
  if (!fs.existsSync(full)) return false;
  const src = fs.readFileSync(full, 'utf8');
  for (const call of src.matchAll(/useAnaChat\(\s*\{[\s\S]{0,800}?\}\s*\)/g)) {
    if (/\bmoduleContext\b/.test(call[0])) return true;
  }
  return false;
}

/**
 * `DEEP_LINK_ALIASES` — the rewrites `surfaceIdFromLocation` applies BEFORE the
 * shell has an `activeId` at all. An alias SOURCE can never be the active id,
 * so context published under one is unreachable by construction.
 */
function deepLinkAliases() {
  const full = path.join(repoRoot, V2_DIR, 'registryModel.ts');
  if (!fs.existsSync(full)) return null;
  const src = fs.readFileSync(full, 'utf8');
  const start = src.indexOf('export const DEEP_LINK_ALIASES');
  if (start < 0) return null;
  const body = src.slice(start, src.indexOf('};', start));
  const out = {};
  for (const m of body.matchAll(/^\s*(?:'([a-z0-9-]+)'|([a-z0-9-]+)):\s*'([a-z0-9-]+)'/gm)) {
    out[m[1] ?? m[2]] = m[3];
  }
  return Object.keys(out).length > 0 ? out : null;
}

const REGISTERED_IDS = registeredSurfaceIds();
const ALIASES = deepLinkAliases();
/** id → file, for every surface registered `ownsConversation: true`. */
const OWNED_SURFACES = ownedConversationSurfaces();

/* A parse that comes back empty or implausible would make every assertion below
   pass vacuously, which is the failure mode this whole file exists to end. */
const parseFailures = [];
if (!REGISTERED_IDS) parseFailures.push('SURFACE_VIEWS could not be parsed out of surfaceViews.ts');
else if (REGISTERED_IDS.size < 100 || !REGISTERED_IDS.has('vault')) {
  parseFailures.push(
    `SURFACE_VIEWS parsed to ${REGISTERED_IDS.size} id(s) and ${REGISTERED_IDS.has('vault') ? 'does' : 'does not'} ` +
      'contain the known id `vault` — the reader no longer matches the map',
  );
}
if (!ALIASES) parseFailures.push('DEEP_LINK_ALIASES could not be parsed out of registryModel.ts');

const resolveId = (id) => (ALIASES && ALIASES[id]) || id;

/** Ids the shell can actually mount: registered, and not rewritten on the way in. */
const ROUTABLE_IDS = REGISTERED_IDS
  ? new Set([...REGISTERED_IDS].filter((id) => resolveId(id) === id))
  : new Set();
/** Registered ids the router rewrites — publishing under one reaches nothing. */
const ALIAS_SOURCE_IDS = REGISTERED_IDS
  ? new Set([...REGISTERED_IDS].filter((id) => resolveId(id) !== id))
  : new Set();

/* ── The publishers, as they actually appear in product code ──────────────── */

/**
 * Every `usePublishSurfaceContext('<id>'` call in the shipped tree, by id.
 *
 * A string LITERAL is required, not a mention: the call has to name the id it
 * publishes under so this scan can compare it with the registry. Every surface
 * wired to date passes one. Publishers in tests are ignored — a fixture
 * publishing an id proves nothing about the product.
 */
function publishersById() {
  const byId = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(rel);
        continue;
      }
      if (!/\.tsx?$/.test(e.name) || e.name.includes('.test.')) continue;
      const src = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
      for (const m of src.matchAll(/usePublishSurfaceContext\(\s*'([a-z0-9-]+)'/g)) {
        if (!byId.has(m[1])) byId.set(m[1], []);
        byId.get(m[1]).push(rel);
      }
    }
  };
  walk(SCAN_ROOT);
  return byId;
}

const PUBLISHERS = publishersById();

/**
 * Grounded through the surface's OWN conversation, not the publish channel.
 * Only meaningful for `ownsConversation: true` ids — see (3) in the header.
 */
const selfGrounded = new Set(
  [...OWNED_SURFACES.entries()]
    .filter(([id, file]) => ROUTABLE_IDS.has(id) && ownedSurfaceIsGrounded(file))
    .map(([id]) => id),
);
/** Owned surfaces whose own hook forwards no context — the `rbm` failure mode. */
const ownedUngrounded = [...OWNED_SURFACES.keys()]
  .filter((id) => ROUTABLE_IDS.has(id) && !selfGrounded.has(id) && !(id in NO_CONTEXT_NEEDED))
  .sort();

const isGrounded = (id) => PUBLISHERS.has(id) || selfGrounded.has(id);

const covered = [...ROUTABLE_IDS].filter(isGrounded).sort();
const exempt = [...ROUTABLE_IDS].filter((id) => id in NO_CONTEXT_NEEDED && !isGrounded(id)).sort();
const blind = [...ROUTABLE_IDS]
  .filter((id) => !isGrounded(id) && !(id in NO_CONTEXT_NEEDED))
  .sort();

/** Surface FILES holding a publish call — reported, never gated on. See header. */
const publishingFiles = new Set(
  [...PUBLISHERS.values()].flat().filter((f) => f.startsWith(`${SURFACES_DIR}/`)),
);

/* ── Failures ─────────────────────────────────────────────────────────────── */

const failures = [...parseFailures];

/* A publish that reaches nothing. Two ways to get there, and the second one is
   the one that shipped: an id the registry does not know, and an id the ROUTER
   REWRITES before the shell reads context by it. */
for (const [id, files] of [...PUBLISHERS.entries()].sort()) {
  const where = files.join(', ');
  if (ALIAS_SOURCE_IDS.has(id)) {
    failures.push(
      `${where} publishes as '${id}', which DEEP_LINK_ALIASES rewrites to '${resolveId(id)}' before ` +
        `the shell has an active id — the shell reads context by exact id, so this publishes into nothing. ` +
        `Publish as '${resolveId(id)}'.`,
    );
  } else if (REGISTERED_IDS && !REGISTERED_IDS.has(id)) {
    failures.push(
      `${where} publishes as '${id}', which SURFACE_VIEWS does not register — ` +
        'the shell reads context by surface id, so this publishes into nothing',
    );
  }
}

/* The ratchet, exact in both directions. */
if (REGISTERED_IDS) {
  if (covered.length < ID_BASELINE) {
    failures.push(
      `surface-id coverage FELL to ${covered.length}, below the baseline of ${ID_BASELINE} — ` +
        'a routable surface id stopped publishing its screen state to AnA. Restore the publish call.',
    );
  } else if (covered.length > ID_BASELINE) {
    failures.push(
      `surface-id coverage ROSE to ${covered.length}, above the baseline of ${ID_BASELINE} — ` +
        `raise ID_BASELINE to ${covered.length} in this change. A baseline left below reality is not a ` +
        'gate: it silently permits everything back down to the stale number.',
    );
  }
}

/* A stale exclusion implies a decision that no longer applies. */
for (const [id, reason] of Object.entries(NO_CONTEXT_NEEDED)) {
  if (REGISTERED_IDS && !ROUTABLE_IDS.has(id)) {
    failures.push(`${id}: declared as needing no context but is not a routable surface id`);
  } else if (!reason || reason.trim().length < 10) {
    failures.push(`${id}: declared with no usable reason`);
  } else if (isGrounded(id)) {
    failures.push(
      `${id}: declared as needing no context, but it is grounded — ` +
        (PUBLISHERS.has(id)
          ? `${PUBLISHERS.get(id).join(', ')} publishes for it`
          : 'its own useAnaChat forwards a moduleContext') +
        '. Delete the exemption; it describes a decision that was reversed.',
    );
  }
}

/* ── Report ───────────────────────────────────────────────────────────────── */

const summary = {
  routableIds: ROUTABLE_IDS.size,
  registeredIds: REGISTERED_IDS ? REGISTERED_IDS.size : 0,
  aliasSourceIds: [...ALIAS_SOURCE_IDS].sort(),
  covered: covered.length,
  viaPublisher: covered.filter((id) => PUBLISHERS.has(id)).length,
  viaOwnConversation: [...selfGrounded].sort(),
  ownedButUngrounded: ownedUngrounded,
  exempt: exempt.length,
  blind: blind.length,
  baseline: ID_BASELINE,
  surfaceFilesPublishing: publishingFiles.size,
};

if (JSON_MODE) {
  console.log(JSON.stringify({ summary, covered, exempt, blind, failures }, null, 2));
} else if (LIST_MODE) {
  console.log(`\nRoutable surface ids AnA cannot see the screen of (${blind.length}):\n`);
  for (const id of blind) {
    console.log(`  ${id}${OWNED_SURFACES.has(id) ? '   [owns its conversation — needs a moduleContext, not a publish]' : ''}`);
  }
  console.log('');
} else if (failures.length === 0) {
  console.log(
    `\n[ci:ana-surface-context] OK — ${summary.covered} of ${summary.routableIds} routable surface ids ` +
      `publish screen state (baseline ${ID_BASELINE} exact), ${summary.exempt} exempt, ` +
      `${summary.blind} still blind.\n` +
      `  ${summary.viaPublisher} through usePublishSurfaceContext; ` +
      `${summary.viaOwnConversation.length} through their own useAnaChat moduleContext ` +
      `(${summary.viaOwnConversation.join(', ') || 'none'}) — surfaces that own the\n` +
      '  conversation are grounded on that channel, because the shell draws no rail there.\n' +
      `  ${summary.registeredIds} ids are registered; ${summary.aliasSourceIds.length} of those ` +
      `(${summary.aliasSourceIds.join(', ') || 'none'}) are DEEP_LINK_ALIASES sources the router\n` +
      '  rewrites before the shell has an active id, so they are not routable and cannot be\n' +
      '  published under. Ids, not files, are the unit AnA experiences: one file can serve\n' +
      `  several, and a child can publish for a parent that has no call of its own\n` +
      `  (${summary.surfaceFilesPublishing} surface file(s) hold a call).\n`,
  );
} else {
  console.error(`\n[ci:ana-surface-context] FAIL — ${failures.length} issue(s):\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    '\nA surface that takes the shell conversation and publishes nothing leaves AnA\n' +
      'answering about a screen she cannot see. Restore the publish call, publish under\n' +
      'the id the router actually mounts, or — if the surface genuinely needs no context —\n' +
      'declare its ID in NO_CONTEXT_NEEDED with a reason.\n',
  );
}

process.exit(failures.length === 0 ? 0 : 1);
