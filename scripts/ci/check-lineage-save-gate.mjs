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
    (/\.transaction\(\s*async\s*\(?\s*tx\b/.test(src) && /const client = \w+\(tx\)/.test(src)),
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
