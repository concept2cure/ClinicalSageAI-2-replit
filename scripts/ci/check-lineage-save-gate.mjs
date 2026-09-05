#!/usr/bin/env node
/**
 * Guard: content-writing paths must not persist text without its lineage.
 *
 * WHY A CI CHECK AND NOT ONLY A TEST
 * The gate is a few lines in a 6,000-line router. A refactor that moves the
 * UPDATE, an "optimisation" that drops the transaction, or a merge that takes
 * the wrong side of a conflict all remove it silently — and nothing fails,
 * because saves keep working. That is exactly the failure this system exists to
 * prevent: the loss is invisible until an inspector asks where a sentence came
 * from and the answer is missing for the period after the gate was removed.
 *
 * So the shape is asserted structurally. For every guarded write path this
 * requires, in the same file:
 *
 *   1. a transaction — either pool.connect + BEGIN/COMMIT/ROLLBACK, or a
 *      Drizzle `db.transaction(async tx => …)` whose gate client is derived
 *      from `tx` (`const client = <adapter>(tx)`), so the gate cannot be
 *      enlisted on a connection outside the write's transaction
 *   2. the lineage gate enlisted in it, in EITHER form:
 *        (a) direct — replaceAuthorSpans + assertLineageCoversContent, each
 *            passed the transaction `client` as its final argument; OR
 *        (b) the shared helper — enforceAuthorLineage(client, …), passed the
 *            transaction `client` as its FIRST argument. When the helper form is
 *            used, the helper module itself is verified to be a genuine gate
 *            (it calls both primitives and threads its own `exec` into each), so
 *            the indirection cannot silently hollow the gate out.
 *
 * A path that legitimately does not write prose can be removed from GUARDED,
 * which is a visible, reviewable change rather than a silent one.
 *
 * DISCOVERY (ledger L159). The list above is an allowlist, and an allowlist
 * only guards what someone remembered to add. L157 and L158 were both found
 * by grepping for content writes the list did not know about — the device
 * kit, the DMS plan, the consent form — each of which had shipped prose with
 * no lineage for as long as it existed. So the script now finds writers
 * itself: every server file that UPDATEs a `content` column (raw SQL or a
 * Drizzle `.set({ content })`) must be either GUARDED or declared in
 * NOT_PROSE with the reason it is not regulated prose. A new writer that is
 * neither fails here, by name, before it can ship unguarded.
 *
 * Usage: node scripts/ci/check-lineage-save-gate.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * Write paths that persist authored prose and must therefore gate on lineage.
 *
 * Add a surface here when it starts writing document text. The list is the
 * enforcement perimeter — a surface absent from it is unguarded by definition,
 * so absence should be a deliberate, reviewed choice.
 *
 * Per-entry `transaction`:
 *   - 'inline' (default): the file opens its own transaction (pool.connect +
 *     BEGIN/COMMIT/ROLLBACK) around the write, verified in-file.
 *   - 'caller': the write lives in a service function that runs inside a
 *     transaction opened by its caller (the file receives a `client`). The gate
 *     must still be enlisted on that `client`; the transaction itself is
 *     verified in each `txOwners` file instead.
 */
/**
 * Content writers the discovery pass finds that are NOT regulated prose, each
 * with the reason. Shrink-only by convention: an entry here says a reader
 * looked and decided, never that nobody looked.
 */
const NOT_PROSE = [
  {
    file: 'server/services/AssemblyLine.ts',
    why: 'assembly_docs is a scratch pipeline reached only through routes/test-assembly.ts, which nothing mounts; its content never reaches a governed document',
  },
  {
    file: 'server/routes/fda-forms.routes.ts',
    why: 'fda_510k_documents.content is the JSON of form FIELD VALUES (structured data with its own field-level linking), not narrative prose',
  },
  {
    file: 'server/services/SmartFieldLinking.ts',
    why: 'writes one linked field value into fda_510k_documents.content JSON; the value carries its own smart-field provenance',
  },
  {
    file: 'server/routes/global-compliance.ts',
    why: 'GDPR Art. 17 erasure — overwrites content with a redaction marker; nothing is authored',
  },
  {
    file: 'server/services/ana-ri/command-executor.ts',
    why: 'GDPR Art. 17 erasure of concept2cure_artifacts — overwrites content with a redaction marker; nothing is authored',
  },
  {
    file: 'server/services/atomVersionService.ts',
    why: 'lumen_data_atoms are Data Room SOURCE chunks (what documents cite), not authored claims; lineage points AT them',
  },
  {
    file: 'server/services/ana-wisdom-engine.ts',
    why: 'client_memory_entries is AnA working memory, never a document',
  },
  {
    file: 'server/services/artifact-tagger.ts',
    why: "places a tagged UPLOAD as an artifact: content is the uploaded file's extracted text, whose provenance is the upload record (file hash) — nobody authored clauses here",
  },
];

/**
 * Prose writers the discovery pass found that are NOT yet gated. Recorded
 * here so they are visible, not hidden — each names the ledger row that owns
 * closing it. Shrink-only: an entry whose file stops writing content (or
 * joins GUARDED) must be removed, and the guard fails until it is, so this
 * list can never quietly outgrow the truth. A NEW unguarded writer is never
 * added here to get green; it is gated, or declared NOT_PROSE with a reason.
 */
const KNOWN_UNGUARDED = [
];

const GUARDED = [
  {
    file: 'server/routes/authoring.router.ts',
    why: 'POST /sections (create) and PATCH /sections/:sectionId (save) write authored section content',
  },
  {
    file: 'server/services/protocol-development/protocol-development-service.ts',
    why: 'updateSectionTx / updateSynopsisTx write protocol prose (protocol_sections.content, protocol_documents.synopsis)',
    transaction: 'caller',
    txOwners: [
      'server/routes/protocol-development.ts', // governed() opens the transaction
      'server/services/ana/AnaToolExecutor.ts', // update_protocol_section tool opens the transaction
    ],
  },
  {
    file: 'server/services/biosketch/biosketch-service.ts',
    why: 'updateSectionTx writes NIH biosketch prose (biosketch_sections.content)',
    transaction: 'caller',
    txOwners: [
      'server/routes/biosketch.ts', // governed() opens the transaction
      'server/services/ana/AnaToolExecutor.ts', // update_biosketch_section tool opens the transaction
    ],
  },
  {
    file: 'server/routes/cerv2-sections.ts',
    why: 'PATCH /:sectionId and POST /:sectionId/accept-ana-draft write device kit section prose (cerv2_510k_sections.content) — the surfaces a 510(k)/PMA/CER is assembled from',
  },
  {
    file: 'server/services/dmsp/dmsp-service.ts',
    why: 'updateElementTx writes NIH Data Management & Sharing Plan prose (dms_plan_elements.content)',
    transaction: 'caller',
    txOwners: [
      'server/routes/dmsp.ts', // governed() opens the transaction
      'server/services/ana/AnaToolExecutor.ts', // update_dms_plan_element opens the transaction
    ],
  },
  {
    file: 'server/services/protocol-consent/protocol-consent-service.ts',
    why: 'updateElementTx writes informed-consent form prose (consent_form_elements.content)',
    transaction: 'caller',
    txOwners: [
      'server/routes/protocol-consent.ts', // governed() opens the transaction
      'server/services/ana/AnaToolExecutor.ts', // update_consent_element opens the transaction
    ],
  },
  {
    file: 'server/services/ana/artifactVersionStore.ts',
    why: 'upsertDocumentArtifactVersion(Tx) writes concept2cure_artifacts.content + its version row — the shared writer behind AnA Document Studio drafts and the canonical-revision spine',
  },
  {
    file: 'server/routes/batch-draft-routes.ts',
    why: 'POST accept writes coauthor_documents.content from an accepted AnA batch draft',
  },
  {
    file: 'server/services/cerv2/kit-section-write.ts',
    why: 'writeKitSectionTx is the one AnA writer of cerv2_510k_sections.content (write_kit_section tool + AnA-RI section.update command)',
    transaction: 'caller',
    txOwners: [
      'server/services/ana/AnaToolExecutor.ts', // write_kit_section opens the transaction
      'server/services/ana-ri/mdx-command-handlers.ts', // section.update opens the transaction
    ],
  },
  {
    // Moved from routes/concept2cure.ts in L53 slice 8; the writers are unchanged.
    file: 'server/routes/c2c/artifacts.ts',
    why: 'PUT …/artifacts/:artifactId (edit) and POST …/rollback write concept2cure_artifacts.content — the c2c artifact registry a filing is assembled from',
  },
  {
    file: 'server/services/ana/AnaToolExecutor.ts',
    why: 'write_q_sub_section, write_kit_section (via kit-section-write) and update_vault_document write regulated prose from AnA tools',
  },
  {
    file: 'server/services/ana/submission-chat-apply-rewrite.ts',
    why: 'applyRewrite overwrites concept2cure_artifacts.content with an accepted AnA rewrite',
  },
  {
    file: 'server/services/ai-actions/handlers/refine-with-validation.ts',
    why: 'the refine AI action writes the refined concept2cure_artifacts.content',
  },
  {
    file: 'server/services/module3-convergence-service.ts',
    why: 'bridgeCompileToArtifact writes composed Module 3 prose into concept2cure_artifacts.content',
  },
  {
    file: 'server/routes/q-sub.ts',
    why: 'PUT /:id/sections/:sectionKey writes device Q-Sub section prose (q_sub_section_bodies.content)',
  },
  {
    file: 'server/services/labeling/labeling-pi-service.ts',
    why: 'upsertLabelingPiSection writes USPI label prose (labeling_pi_sections.content JSONB → heading + body derived text)',
  },
];

/**
 * The argument list of `name(...)`, found by matching parentheses.
 *
 * A regex cannot do this: a lazy `[\s\S]{0,N}?` scanning for a trailing
 * argument happily runs past the call's own closing paren and matches the
 * argument of a LATER call, so a check written that way passes after the thing
 * it guards has been removed. That exact false pass was observed while building
 * this script, which is why it counts parens instead.
 */
function callArgs(src, name) {
  const out = [];
  const needle = `${name}(`;
  let from = 0;
  for (;;) {
    const at = src.indexOf(needle, from);
    if (at === -1) return out;
    let depth = 0;
    let end = -1;
    for (let i = at + needle.length - 1; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) return out;
    out.push(src.slice(at + needle.length, end));
    from = end + 1;
  }
}

/** Split an argument string into its top-level (paren/brace-balanced) args. */
function topLevelArgs(args) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of args) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Whether some call to `name` passes `ident` as its FINAL argument. */
function passesLastArg(src, name, ident) {
  return callArgs(src, name).some((args) => {
    const parts = topLevelArgs(args);
    return parts[parts.length - 1].trim() === ident;
  });
}

/** Whether some call to `name` passes `ident` as its FIRST argument. */
function passesFirstArg(src, name, ident) {
  return callArgs(src, name).some((args) => topLevelArgs(args)[0].trim() === ident);
}

/**
 * The shared gate primitive. When a guarded path delegates to it, the guard
 * verifies the helper itself is a genuine gate rather than trusting the name.
 */
const HELPER = {
  file: 'server/services/clinical-regulatory-evidence/lineage-gate.ts',
  fn: 'enforceAuthorLineage',
};

/** The helper genuinely gates: it calls both primitives and threads its own
 *  `exec` (the caller's transaction client) into each. */
function helperEnforcesGate() {
  const abs = path.join(ROOT, HELPER.file);
  if (!fs.existsSync(abs)) return false;
  const src = fs.readFileSync(abs, 'utf8');
  return (
    /replaceAuthorSpans\s*\(/.test(src) &&
    passesLastArg(src, 'replaceAuthorSpans', 'exec') &&
    /assertLineageCoversContent\s*\(/.test(src) &&
    passesLastArg(src, 'assertLineageCoversContent', 'exec')
  );
}

const TRANSACTION = {
  id: 'transaction',
  test: (src) =>
    // `.connect()` matches both `pool.connect()` and `getPool().connect()`; the
    // BEGIN/COMMIT/ROLLBACK trio confirms it is an actual transaction, not just
    // a checked-out connection.
    (src.includes('.connect()') &&
      src.includes("client.query('BEGIN')") &&
      src.includes("client.query('COMMIT')") &&
      src.includes("client.query('ROLLBACK')")) ||
    // Drizzle form: the callback's `tx` is the transaction, and the gate's
    // `client` must be derived from it — a `client` that comes from anywhere
    // else would let content and lineage commit separately.
    (/\.transaction\(\s*async\s*\(?\s*tx\b/.test(src) && /const client = \w+\(tx\)/.test(src)) ||
    // Raw-statement form on a request-scoped Drizzle db: BEGIN/COMMIT/ROLLBACK
    // issued as statements on `rdb`, and the gate's `client` adapted from that
    // same `rdb` — never from the pool.
    (src.includes('execute(sql`BEGIN`)') &&
      src.includes('execute(sql`COMMIT`)') &&
      src.includes('execute(sql`ROLLBACK`)') &&
      /const client = \w+\(rdb\)/.test(src)),
  message:
    'no transaction around the content write — content and lineage must commit together, ' +
    'or a failed lineage write leaves saved text with no provenance',
};

/**
 * Findings for the lineage gate in a guarded file: empty when enforced in
 * either the direct or the helper form, otherwise the specific reason.
 */
function gateFindings(src) {
  const direct =
    /replaceAuthorSpans\s*\(/.test(src) &&
    passesLastArg(src, 'replaceAuthorSpans', 'client') &&
    /assertLineageCoversContent\s*\(/.test(src) &&
    passesLastArg(src, 'assertLineageCoversContent', 'client');
  if (direct) return [];

  const usesHelper =
    new RegExp(`${HELPER.fn}\\s*\\(`).test(src) && passesFirstArg(src, HELPER.fn, 'client');
  if (usesHelper) {
    if (helperEnforcesGate()) return [];
    return [
      {
        id: 'helper-hollowed',
        message:
          `${HELPER.fn}(client, …) is used, but ${HELPER.file} no longer calls ` +
          'replaceAuthorSpans + assertLineageCoversContent with its exec — the gate has been ' +
          'hollowed out inside the helper',
      },
    ];
  }

  return [
    {
      id: 'lineage-gate',
      message:
        'neither the direct gate (replaceAuthorSpans + assertLineageCoversContent, each enlisted ' +
        `on the transaction client) nor the shared helper ${HELPER.fn}(client, …) is present — ` +
        'saved text would carry no record of where it came from',
    },
  ];
}

let failures = 0;

for (const target of GUARDED) {
  const abs = path.join(ROOT, target.file);
  if (!fs.existsSync(abs)) {
    console.error(`[ci:lineage-save-gate] MISSING FILE ${target.file}`);
    console.error(`  It is listed as a guarded write path. If it moved, update GUARDED.`);
    failures++;
    continue;
  }

  const src = fs.readFileSync(abs, 'utf8');

  // Transaction: verified in-file by default, or in each txOwner when the write
  // is a service function running inside the caller's transaction.
  const txFindings = [];
  if (target.transaction === 'caller') {
    for (const owner of target.txOwners ?? []) {
      const ownerAbs = path.join(ROOT, owner);
      if (!fs.existsSync(ownerAbs) || !TRANSACTION.test(fs.readFileSync(ownerAbs, 'utf8'))) {
        txFindings.push({
          id: 'transaction-owner',
          message:
            `the caller ${owner} does not open a transaction (pool.connect + BEGIN/COMMIT/ROLLBACK) — ` +
            'the gate is enlisted on a client that must come from one, or content and lineage can ' +
            'commit separately',
        });
      }
    }
  } else if (!TRANSACTION.test(src)) {
    txFindings.push(TRANSACTION);
  }

  const missing = [...txFindings, ...gateFindings(src)];

  if (missing.length === 0) {
    console.log(`[ci:lineage-save-gate] ok  ${target.file}`);
    continue;
  }

  failures++;
  console.error(`\n[ci:lineage-save-gate] FAIL ${target.file}`);
  console.error(`  ${target.why}`);
  for (const m of missing) {
    console.error(`  ✗ ${m.id}: ${m.message}`);
  }
}

// ── Discovery: writers the allowlist does not know about ─────────────────────
const CONTENT_WRITE = [
  // raw SQL: UPDATE <table> SET … content = …
  /UPDATE\s+[\w.]+\s+SET[\s\S]{0,400}?\bcontent\s*=/,
  // Drizzle: .set({ … content: … })
  // (same object literal only — a nested `{ content: … }` inside another
  // field, or an unrelated `.set({ headers })`, is not a content write)
  /\.set\(\{[^{}]*\bcontent\s*:/,
];
function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      yield* sourceFiles(full);
    } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      yield full;
    }
  }
}
/** Comments are not writes: a note about an old statement must not count as one. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const known = new Set([...GUARDED.map((g) => g.file), ...NOT_PROSE.map((n) => n.file)]);
const knownGaps = new Map(KNOWN_UNGUARDED.map((k) => [k.file, k]));
const unknownWriters = [];
const stillWriting = new Set();
for (const abs of sourceFiles(path.join(ROOT, 'server'))) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  const src = stripComments(fs.readFileSync(abs, 'utf8'));
  const writes = CONTENT_WRITE.some((re) => re.test(src));
  if (writes) stillWriting.add(rel);
  if (known.has(rel) || knownGaps.has(rel)) continue;
  if (writes) unknownWriters.push(rel);
}
for (const gap of KNOWN_UNGUARDED) {
  if (!stillWriting.has(gap.file) || known.has(gap.file)) {
    failures++;
    console.error(
      `\n[ci:lineage-save-gate] FAIL ${gap.file}\n  ✗ KNOWN_UNGUARDED lists it, but it no longer writes content unguarded — remove the entry ` +
        `(and close or update ledger ${gap.row}). The list may only shrink.`,
    );
  }
}
if (KNOWN_UNGUARDED.length > 0) {
  console.warn(`[ci:lineage-save-gate] ${KNOWN_UNGUARDED.length} known unguarded prose writer(s), recorded, not hidden:`);
  for (const gap of KNOWN_UNGUARDED) console.warn(`    ${gap.file} — ${gap.what} (ledger ${gap.row})`);
}
for (const rel of unknownWriters) {
  failures++;
  console.error(`\n[ci:lineage-save-gate] FAIL ${rel}`);
  console.error(
    '  ✗ unguarded-writer: this file UPDATEs a `content` column and is neither GUARDED nor declared in ' +
      'NOT_PROSE. If it writes regulated prose, enlist the lineage gate in its transaction and add it to ' +
      'GUARDED; if the column is not prose, add it to NOT_PROSE with the reason.',
  );
}
for (const n of NOT_PROSE) {
  if (!fs.existsSync(path.join(ROOT, n.file))) {
    failures++;
    console.error(`\n[ci:lineage-save-gate] FAIL ${n.file}\n  ✗ NOT_PROSE names a file that no longer exists — remove the entry.`);
  }
}

if (failures > 0) {
  console.error(
    `\n[ci:lineage-save-gate] ${failures} guarded path(s) no longer enforce lineage on save.\n` +
      `Documents saved through them would carry no record of where their text came from,\n` +
      `and nothing at runtime would report it. Restore the gate, or — if the path genuinely\n` +
      `no longer writes prose — remove it from GUARDED in this script with a reason.\n`,
  );
  process.exit(1);
}

console.log(`[ci:lineage-save-gate] OK — ${GUARDED.length} guarded path(s) enforce lineage on save.`);
