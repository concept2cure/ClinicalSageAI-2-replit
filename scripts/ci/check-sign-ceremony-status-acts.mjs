/**
 * Status acts, for the sign-ceremony gate (check-sign-ceremony.mjs). 2026-10-29, D5.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * A decision need not stamp an approver to be one. Accepting a hazard's residual
 * risk (server/routes/mdx-risk-management.ts) writes `status = 'accepted',
 * acceptable = TRUE` on risk_items, which has no stamp column. So the gate, which
 * found `sign` ledger writes and approval stamps, could not see the signed
 * acceptance, and would not have seen an unsigned one either
 * (docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/,
 * "The gate's limit").
 *
 * ── The rule ──────────────────────────────────────────────────────────────────
 * A SQL write that sets a governed status or flag is a site. It is held to the
 * approval stamp's rule: its handler writes a signature row.
 *
 * ── What is governed ──────────────────────────────────────────────────────────
 * Two sources the product already keeps. This module keeps no copy of either.
 *   1. Signed pairs, from the ceremonies themselves. Every status a handler
 *      holding a signature ceremony writes, and every boolean flag it sets TRUE,
 *      is governed on that table everywhere, as `table.column=value`. The signed
 *      acceptance makes risk_items.status=accepted and risk_items.acceptable=true
 *      governed, so any other write of either must sit behind a ceremony too.
 *      The baseline records every signed pair (`signedPairs`), and a recorded pair
 *      stays governed after its ceremony is gone. Without that record, removing
 *      the ceremony would teach the gate to stop looking (the fold-f1a slice's
 *      mutation M11, the plain PATCH put back). A newly signed pair fails the gate
 *      until it is recorded.
 *   2. Declared signed statuses, read on every run from the product constants
 *      that say which statuses only a signed act may set
 *      (DECLARED_SIGNED_STATUS_SOURCES). These are governed on every table,
 *      except the ones the product signs only on some tables
 *      (TABLE_SCOPED_SIGNED_STATUSES), which count as signed pairs only.
 * Any other status is not an act: draft, in_review, open, completed, rejected.
 *
 * For a status act, writeMutation counts only as writeMutation('sign'). Its other
 * commands write no electronic_signatures row (SIGNATURE_COMMANDS in
 * server/routes/c2c/actions.ts is sign and revoke-signature), and the lock route's
 * writeMutation('lock') is not a signature, by the product's own decision (the
 * baseline's `authority` entry for c2c/documents.ts).
 *
 * ── Limits ────────────────────────────────────────────────────────────────────
 * Only a literal value is seen ('approved', TRUE), or a `$n` whose value is a
 * literal in the query's inline parameter array. A status computed in code,
 * built from fragments (`sets.push(...)`), chosen by CASE, or written through
 * Drizzle `.set({ status })` is not seen, as for stamps. A statement that also
 * stamps an approval is the stamp's site, not a second one. A ceremony that also
 * writes an incidental status makes that status governed on its table.
 *
 * @module scripts/ci/check-sign-ceremony-status-acts
 */
import { callSpan, literalEnd, stripComments, topLevelArgs } from './check-sign-ceremony-source.mjs';

/** A signature ceremony in a handler, as a status act needs it: writeMutation only with 'sign'. */
export const STATUS_CEREMONY = /\b(?:persistGovernedActionSignature|persistGovernedSignSignature|persistElectronicSignature|insertAuthoringSignature|signGovernedAct)\s*\(|\bwriteMutation\s*\(\s*(['"`])sign\1/;

/**
 * Where the product declares the statuses only a signed act may set. Read from
 * these files on every run: a declaration that moves or is renamed fails the
 * gate, so the gate cannot keep checking a vocabulary nobody declares any more.
 * `keys`: the statuses are the object's keys, not its values.
 */
export const DECLARED_SIGNED_STATUS_SOURCES = [
  // "The document moves that are electronic signatures" (labeling documents).
  { file: 'server/routes/mdx-labeling-approvals.ts', name: 'DOC_SIGNED_STATUS' },
  // "The meaning each signed act of the status route is signed with" (artifacts).
  { file: 'server/services/artifact-approval-act.ts', name: 'ARTIFACT_ACT_MEANING', keys: true },
  // Submission moves that "must go through the governed e-signature flow".
  { file: 'server/services/submission-service/submission-service.ts', name: 'GOVERNED_TRANSITIONS' },
  // "Statuses only a governed act may set" (co-author documents).
  { file: 'server/services/coauthor/coauthor-status-write.ts', name: 'SIGN_OFF_STATUSES' },
  // Authoring statuses that seal a document: a freeze, or "an approval e-signature".
  { file: 'server/services/authoring/document-lock.ts', name: 'LOCKED_DOCUMENT_STATUSES' },
];

/**
 * Declared signed statuses that are a signature only on the tables a ceremony
 * signs them on, with the evidence. They count as signed pairs (source 1), never
 * on every table.
 */
export const TABLE_SCOPED_SIGNED_STATUSES = {
  superseded:
    'Signed for a labeling document (DOC_SIGNED_STATUS, signDocumentStatus). Elsewhere it marks a record a newer one replaced, which no one signs. The 2026-10-29 census found seven such writes: an AnA proposal, an assumption record, a failure pattern, a EULA version, a RIM label version, a client memory entry and an account canon fact.',
  locked:
    "Signed for an artifact (ARTIFACT_ACT_MEANING: release) and a co-author document. The c2c document lock (routes/c2c/documents.ts POST /:id/lock) is re-authenticated but is not a signature, by the product's own decision: SIGNATURE_COMMANDS is sign and revoke-signature, and writeMutation('lock') writes no electronic_signatures row. Neither is an account canon fact's lock (services/account-canon.ts lockCanonFact).",
};

/** The string values (or, with `keys`, the keys) of the constant `name` in `src`, lower case; null when it is not declared there. */
export function declaredStatuses(src, name, keys = false) {
  const code = stripComments(src);
  const m = new RegExp(`\\bconst\\s+${name}\\b[^=]*=`).exec(code);
  if (!m) return null;
  const from = m.index + m[0].length;
  const open = code.slice(from).search(keys ? /\{/ : /\[/);
  if (open === -1) return null;
  const start = from + open;
  const end = code.indexOf(keys ? '}' : ']', start);
  if (end === -1) return null;
  const body = code.slice(start + 1, end);
  const re = keys ? /(?:^|[,{\s])['"]?(\w+)['"]?\s*:/g : /(['"`])([^'"`]+)\1/g;
  const out = [];
  let v;
  while ((v = re.exec(body))) out.push((keys ? v[1] : v[2]).toLowerCase());
  return out.length ? out : null;
}

/**
 * The statuses governed on every table: the declared ones (source 2) less the
 * table-scoped ones. `read(file)` returns a file's source, or null when it is
 * missing. Pure given `read`, so the selftest can drive it.
 */
export function decisionStatusesFrom(read) {
  const statuses = new Set();
  const missing = [];
  for (const s of DECLARED_SIGNED_STATUS_SOURCES) {
    const src = read(s.file);
    const values = src == null ? null : declaredStatuses(src, s.name, s.keys);
    if (!values) { missing.push(`${s.file}: ${s.name}`); continue; }
    for (const v of values) if (!Object.hasOwn(TABLE_SCOPED_SIGNED_STATUSES, v)) statuses.add(v);
  }
  return { statuses, missing };
}

/** Index of the SQL string's closing quote, from its opening quote at `j`. */
const sqlStringEnd = (text, j) => {
  const e = text.indexOf("'", j + 1);
  return e === -1 ? text.length : e;
};

/** Split SQL at top-level commas: not inside parentheses or a SQL string. Each part keeps its offset. */
function sqlSplit(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let j = 0; j < text.length; j++) {
    const ch = text[j];
    if (ch === "'") j = sqlStringEnd(text, j);
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push({ text: text.slice(start, j), offset: start });
      start = j + 1;
    }
  }
  parts.push({ text: text.slice(start), offset: start });
  return parts;
}

const SET_LIST_STOP = /^(?:WHERE|RETURNING|FROM)\b/i;

/** Where the SET list starting at `from` ends: a top-level WHERE / RETURNING / FROM, a `;`, or the parenthesis that closes it. */
function setListEnd(text, from) {
  let depth = 0;
  for (let j = from; j < text.length; j++) {
    const ch = text[j];
    if (ch === "'") j = sqlStringEnd(text, j);
    else if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) return j;
      depth--;
    } else if (depth === 0 && (ch === ';' || (/\w/.test(ch) && !/\w/.test(text[j - 1] ?? ' ') && SET_LIST_STOP.test(text.slice(j, j + 10))))) return j;
  }
  return text.length;
}

/** Where the parenthesised list opening at `open` closes. */
function parenEnd(text, open) {
  let depth = 0;
  for (let j = open; j < text.length; j++) {
    const ch = text[j];
    if (ch === "'") j = sqlStringEnd(text, j);
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return j;
  }
  return text.length;
}

/** The inline parameter array of the `.query(sql, [...])` call whose first argument opens at `quote`, as elements; null when there is none. */
function inlineParams(code, quote) {
  const lead = Math.max(0, quote - 120);
  const m = /\b(?:query|execute)\s*(?:<[^()]*?>)?\s*\(\s*$/.exec(code.slice(lead, quote));
  if (!m) return null;
  const arr = topLevelArgs(callSpan(code, lead + m.index + m[0].lastIndexOf('(')))[1];
  if (!arr || !arr.startsWith('[') || !arr.endsWith(']')) return null;
  return topLevelArgs(`(${arr.slice(1, -1)})`);
}

/** A parameter element as a SQL value: a literal (lower case), 'true', or null. */
function paramValue(p) {
  const lit = /^(['"`])([^'"`$]*)\1$/.exec(p.trim());
  if (lit) return lit[2].toLowerCase();
  return p.trim() === 'true' ? 'true' : null;
}

/** A SQL value as the gate reads it: a literal (lower case), 'true', or null when it is not a literal. */
function sqlValue(expr, params) {
  const e = expr.trim();
  const lit = /^'([^']*)'(?:\s*::\s*\w+)?$/.exec(e);
  if (lit) return lit[1].toLowerCase();
  if (/^true$/i.test(e)) return 'true';
  const ref = /^\$(\d+)(?:\s*::\s*\w+)?$/.exec(e);
  const p = ref && params ? params[Number(ref[1]) - 1] : undefined;
  return p === undefined ? null : paramValue(p);
}

const STATUS_COLUMN = /^(?:status|state|\w+_status|\w+_state)$/;
const SQL_NAME = /^\s*(?:"?(\w+)"?\.)?"?(\w+)"?\s*$/;
const tableName = (raw) => raw.replace(/"/g, '').toLowerCase().replace(/^public\./, '');
const leadingSpace = (t) => t.length - t.trimStart().length;

/** One SQL string literal: its text, where the text starts in `code`, and its parameters (read once, on demand). */
function sqlLiteral(code, quote, end) {
  let params;
  return {
    text: code.slice(quote + 1, end),
    base: quote + 1,
    params: () => (params === undefined ? (params = inlineParams(code, quote)) : params),
  };
}

/** The assignments of a SET list (`col = value, …`) in `lit`, at `at` = { table, from, to, statement }. */
function setListAssignments(lit, { table, from, to, statement }, isStamped) {
  const list = lit.text.slice(from, to);
  const stamped = isStamped(list);
  const out = [];
  for (const part of sqlSplit(list)) {
    const eq = part.text.indexOf('=');
    const col = eq === -1 ? null : SQL_NAME.exec(part.text.slice(0, eq));
    if (!col) continue;
    const index = lit.base + from + part.offset + leadingSpace(part.text);
    out.push({ table, column: col[2].toLowerCase(), value: sqlValue(part.text.slice(eq + 1), lit.params()), index, statement, stamped });
  }
  return out;
}

/** The column/value pairs of `INSERT INTO t (cols) VALUES (vals)`, the cols list opening at `colsOpen`. */
function insertValueAssignments(lit, table, colsOpen, colsClose, statement) {
  const after = /^\s*VALUES\s*\(/i.exec(lit.text.slice(colsClose + 1));
  if (!after) return [];
  const valsOpen = colsClose + after[0].length;
  const vals = sqlSplit(lit.text.slice(valsOpen + 1, parenEnd(lit.text, valsOpen)));
  const cols = lit.text.slice(colsOpen + 1, colsClose).split(',').map((c) => (SQL_NAME.exec(c)?.[2] ?? '').toLowerCase());
  const out = [];
  cols.forEach((column, k) => {
    const v = vals[k];
    if (!column || !v) return;
    out.push({ table, column, value: sqlValue(v.text, lit.params()), index: lit.base + valsOpen + 1 + v.offset + leadingSpace(v.text), statement, stamped: false });
  });
  return out;
}

const UPDATE_SET = /\bUPDATE\s+(?:ONLY\s+)?((?:"?\w+"?\.)?"?\w+"?)(?:\s+(?:AS\s+)?(?!SET\b)\w+)?\s+SET\b/gi;
const INSERT_INTO = /\bINSERT\s+INTO\s+((?:"?\w+"?\.)?"?\w+"?)\s*\(/gi;
const DO_UPDATE_SET = /\bDO\s+UPDATE\s+SET\b/i;

/** Every assignment the SQL statements in one literal make. `next()` numbers a statement. */
function literalAssignments(lit, next, isStamped) {
  const out = [];
  let m;
  UPDATE_SET.lastIndex = 0;
  while ((m = UPDATE_SET.exec(lit.text))) {
    const from = m.index + m[0].length;
    out.push(...setListAssignments(lit, { table: tableName(m[1]), from, to: setListEnd(lit.text, from), statement: next() }, isStamped));
  }
  INSERT_INTO.lastIndex = 0;
  while ((m = INSERT_INTO.exec(lit.text))) {
    const table = tableName(m[1]);
    const colsOpen = m.index + m[0].length - 1;
    const colsClose = lit.text.indexOf(')', colsOpen);
    if (colsClose === -1) continue;
    out.push(...insertValueAssignments(lit, table, colsOpen, colsClose, next()));
    const conflict = DO_UPDATE_SET.exec(lit.text.slice(colsClose));
    if (!conflict) continue;
    const from = colsClose + conflict.index + conflict[0].length;
    out.push(...setListAssignments(lit, { table, from, to: setListEnd(lit.text, from), statement: next() }, isStamped));
  }
  return out;
}

/**
 * Every assignment a SQL write makes in `code` (comment-stripped): UPDATE … SET,
 * INSERT … (cols) VALUES (…), and ON CONFLICT … DO UPDATE SET. Each carries its
 * table, column, value (see sqlValue), index, statement number, and whether that
 * statement stamps an approval (`isStamped`, the gate's stamp test).
 */
export function sqlAssignments(code, isStamped = () => false) {
  const out = [];
  let statement = 0;
  const next = () => ++statement;
  for (let i = 0; i < code.length; i++) {
    const q = code[i];
    if (q !== '"' && q !== "'" && q !== '`') continue;
    const end = literalEnd(code, i);
    const lit = sqlLiteral(code, i, end);
    i = end;
    if (lit.text.length >= 12 && /\b(?:UPDATE|INSERT)\b/i.test(lit.text)) out.push(...literalAssignments(lit, next, isStamped));
  }
  return out;
}

export const pairKey = (a) => `${a.table}.${a.column}=${a.value}`;
/** A status set to a literal, or a flag set TRUE. */
const isGovernable = (a) => a.value != null && (STATUS_COLUMN.test(a.column) ? a.value !== 'true' : a.value === 'true');

/** Source 1 in one file: every governable pair written where `inCeremony(index)` holds. */
export function signedPairsOf(code, inCeremony) {
  const pairs = new Set();
  for (const a of sqlAssignments(code)) if (isGovernable(a) && inCeremony(a.index)) pairs.add(pairKey(a));
  return pairs;
}

/**
 * The status-act sites in `code`: one per SQL statement that writes a governed
 * status or flag, unless that statement stamps an approval (then the stamp is
 * its site). `decisionStatuses`: governed on every table; `signedPairs`:
 * governed on their own table.
 */
export function findStatusActs(code, { decisionStatuses, signedPairs, isStamped }) {
  const sites = [];
  const seen = new Set();
  for (const a of sqlAssignments(code, isStamped)) {
    if (a.stamped || seen.has(a.statement) || !isGovernable(a)) continue;
    const declared = STATUS_COLUMN.test(a.column) && decisionStatuses.has(a.value);
    if (!declared && !signedPairs.has(pairKey(a))) continue;
    seen.add(a.statement);
    sites.push({ index: a.index, kind: 'status-act', act: `${a.table}.${a.column} = ${a.value === 'true' ? 'TRUE' : `'${a.value}'`}` });
  }
  return sites;
}

/**
 * Compare the pairs the ceremonies sign now (`derived`: pair → the file that
 * signs it) with the baseline's record. `unrecorded` fails the gate; `unsigned`
 * (recorded, signed by no ceremony now) stays governed and is only reported.
 */
export function evaluateSignedPairs(derived, recorded) {
  const record = new Set(recorded ?? []);
  return {
    unrecorded: [...derived].filter(([p]) => !record.has(p)).map(([pair, file]) => ({ pair, file })),
    unsigned: [...record].filter((p) => !derived.has(p)),
  };
}
