/**
 * OQ-008 — the signed CMC / Module 3 acts, and the response shapes the app
 * commits to.
 *
 * Pure predicates and the signed posts the credentialed signer makes
 * (tests/validation/lib/credentials.mjs). They live here rather than in
 * run.mjs so the runner stays the list of steps the protocol names, which is
 * the QMS runner's arrangement (tests/validation/oq/qms/signed-acts.mjs) and
 * the one `ci:validation-traceability` reads: it follows the runner's
 * `from './*.mjs'` imports, so a step in a module this file's importer pulls
 * in is still the runner's step.
 *
 * The protocol is docs/validation/OQ-008-CMC-MODULE-3.md; the requirements are
 * docs/validation/URS-007-CMC-MODULE-3.md.
 */
import { signerCode } from '../../lib/credentials.mjs';

/** The §11.70 digest the app binds a section approval to. */
export const SECTION_BINDING_BASIS = 'cmc-module3-section-version';
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Two refusal envelopes live under `/api/cmc`, and a step that reads the wrong
 * field compares a sentence with a code:
 *
 *   the composition boundary  → { success: false, code, error: <prose>, hint }
 *                               (services/cmc/composition-scope.ts)
 *   the module3-os routes     → { success: false, error: <CODE>, detail }
 *
 * So `code` is read FIRST — where it exists it is the machine code, and the
 * prose is in `error`; where it does not, `error` IS the code. The detail is
 * whichever of `detail`, `error` and `hint` carries the sentences.
 */
export const dataOf = (r) => r.json?.data ?? r.json ?? {};
export const errCode = (r) => r.json?.code ?? r.json?.error?.code ?? (typeof r.json?.error === 'string' ? r.json.error : null);
export const errDetail = (r) => {
  const j = r.json ?? {};
  if (typeof j.detail === 'string' && j.detail) return j.detail;
  const prose = [j.code ? j.error : null, j.hint, j.message].filter((x) => typeof x === 'string' && x);
  return prose.join(' ');
};

/** The id of a row a register create returned, whichever key it used. */
export const idOf = (r) => dataOf(r).id ?? null;

/** A created register row carries the caller's organisation and the open programme. */
export const isFiledUnder = (row, projectId) =>
  String(row?.projectId ?? row?.project_id ?? '') === String(projectId);

/**
 * A section as GET /api/cmc/module3-os/sections/:project/:key returns it. The
 * compiled record is the compiler's own verdict (URS-CMC-006), so a step that
 * asserts completeness reads it from here and never from a request body.
 */
export const completenessOf = (section) =>
  section?.completeness ?? section?.deterministicJson?.completeness ?? null;

/** Every section key the compile returned, sorted, for a stable record. */
export const sectionKeys = (sections) =>
  (sections ?? []).map((s) => s.sectionKey ?? s.section_key).filter(Boolean).sort();

/**
 * The reauth body a governed CMC act takes. The authenticator code is computed
 * fresh for each act: a code reused inside its own window is refused by the
 * replay guard, which is correct and is not what any step here is testing.
 */
export async function reauthOf(signer) {
  const code = await signerCode(signer);
  return { password: signer.password, ...(code ? { totp: code } : {}) };
}

/** A governed POST as the signer, recorded on the step like every other call. */
export async function postAsSigner(ctx, signer, path, body) {
  const api = ctx.apiAs(signer.session);
  return api('POST', path, { ...body, reauth: await reauthOf(signer) });
}

/**
 * Approve one Module 3 section as the signer. One options object rather than a
 * positional list: the section, the reason and anything a step adds (a
 * `compiledHash` read before a recompile, an idempotency key) belong together.
 */
export async function approveSection(ctx, signer, { projectId, sectionKey, reason, ...extra }) {
  return postAsSigner(ctx, signer, `/api/cmc/module3-os/sections/${projectId}/${encodeURIComponent(sectionKey)}/approve`, {
    reason,
    meaning: 'approval',
    ...extra,
  });
}

/**
 * The electronic_signatures rows recorded against a target, as the Part 11
 * read route returns them. A step asserts over these rather than over the
 * act's own response, because what an inspector reads is the row.
 */
export async function signatureRowsFor(api, target) {
  const r = await api('GET', `/api/part11/signatures/by-target?target=${encodeURIComponent(target)}`);
  const rows = r.json?.data ?? r.json?.signatures ?? [];
  return { status: r.status, rows: Array.isArray(rows) ? rows : [] };
}

/** The signature row a Module 3 section approval writes. */
export const isSectionSignatureRow = (row, signerId) =>
  String(row.signer_id ?? row.signerId) === String(signerId) &&
  row.binding_basis === SECTION_BINDING_BASIS &&
  HEX64.test(String(row.bound_payload_digest ?? row.boundPayloadDigest)) &&
  (row.is_valid ?? row.isValid) !== false;

/**
 * What a step reports when it recomputes a bound digest: the stored inputs, the
 * recomputed value and the row's, so the record shows the comparison rather
 * than only its verdict.
 */
export function digestReport({ inputs, recomputed, row }) {
  return {
    recomputedFrom: inputs,
    recomputed,
    signatureRowDigest: row,
    matches: recomputed === row,
  };
}
