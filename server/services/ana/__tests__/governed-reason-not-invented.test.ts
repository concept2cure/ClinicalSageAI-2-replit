/**
 * A governed AnA write records the person's reason for change, or it does not
 * happen. It never records a reason nobody gave.
 *
 * `recordGovernedAction` writes `reason` into `audit_logs.reason`, which the
 * inspector's ledger shows as the reason for the change. Eighty-seven AnA tool
 * paths used to fill it with a stock sentence whenever the model sent no
 * reason of at least 8 characters: `fcoiReason(input, 'Review comment added
 * via AnA')`, `qmsReason(input, 'Controlled document … created via AnA')`, and
 * `governedPdev(ctx, …, 'Review comment added via AnA', …)` for every protocol
 * development tool. The REST routes these tools share a service with refuse
 * the same write without a reason (protocol-reviews.ts and
 * financial-disclosures.ts `reasonSchema`, /api/c2c/actions `REASON_REQUIRED`,
 * governed-qms-write.ts `governedQmsReason`), so the chat surface was the one
 * path with a weaker rule, and the ledger said the person had given a reason.
 *
 * 2026-09-29, second pass (security review of ca8bb65e0). The first pass read
 * only AnaToolExecutor.ts and only recordGovernedAction, and five tools that
 * carry a reason to a write sat outside the gate:
 *  - commit_document_revision, registered from document-spine.ts, whose core
 *    wrote `AnA revised "<title>" (v<n>)` as the reason when none was given;
 *  - qms_change_transition (a 3-character floor, the reason in the audit row's
 *    details rather than its reason column), qms_change_create (no floor),
 *    apply_fact_change (any non-empty string) and establish_governed_fact (no
 *    floor), whose reasons reach an audit row through recordAuditRow or the
 *    service they call.
 * The structural guard now reads every module that registers a handler and
 * follows a reason into any call, not only recordGovernedAction.
 *
 * What this suite holds:
 *
 *  - Without a stated reason (absent, or under 8 characters after trimming),
 *    each shape refuses BEFORE any write: no connection, no domain call, no
 *    ledger row — the shared `governedPdev` helper
 *    (add_protocol_review_comment), a handler with its own transaction
 *    (create_clinical_investigator), the QMS handler (create_qms_document), a
 *    handler that writes before its ledger row (triage_compliance_attention),
 *    a handler in another module whose input is `reason_for_change`
 *    (commit_document_revision), and handlers whose ledger row is an audit row
 *    written after their service call (qms_change_transition,
 *    qms_change_create).
 *  - The refusal tells the model to ask the person, names the input the reason
 *    goes in, and forbids supplying a reason they did not give.
 *  - With a stated reason, the ledger row carries exactly that reason, trimmed.
 *  - Across every module that registers a handler: every tool whose path
 *    carries a reason into a call is in REASON_REQUIRED_TOOLS (and every entry
 *    there is such a tool); every reason carried is the gated one or passed on
 *    unchanged — never a literal, a template, a helper call with a fallback, or
 *    a `??` / `||` default; and it is read before the handler opens a
 *    connection.
 *
 * RED-FIRST EVIDENCE: run against the code before the fix, the refusal cases
 * fail (the tools answered ok:true and recordGovernedAction received
 * 'Review comment added via AnA', 'Investigator registered via AnA',
 * 'Controlled document SOP-7 created via AnA', 'Compliance attention triaged to
 * tasks via AnA'), and the source scan fails naming 58 call sites.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// ─── Test doubles ────────────────────────────────────────────────────────────
// The handlers reach the database through `getPool().connect()` and their
// domain services through dynamic imports. Both are replaced so the suite can
// see whether anything was opened, written or recorded — not SQL.

const h = vi.hoisted(() => ({
  queries: [] as string[],
  connects: 0,
  recordAuditRow: vi.fn(async (_entry: Record<string, unknown>) => ({ persisted: true, chained: true })),
  transitionChange: vi.fn(async (..._a: unknown[]) => ({ id: 3, change_number: 'CC-2026-070', status: 'under_assessment' })),
  createChange: vi.fn(async (..._a: unknown[]) => ({ id: 5, change_number: 'CC-2026-071', status: 'proposed', classification: 'minor' })),
  upsertVersion: vi.fn(async (..._a: unknown[]) => ({ artifactId: 'artifact_1', artifactPk: 42, version: 2, created: true, contentHash: 'hash' })),
}));

const fakeClient = {
  query: vi.fn(async (sql: string) => {
    h.queries.push(String(sql).trim().split('\n')[0]);
    if (/INSERT INTO qms_documents/.test(String(sql))) {
      return { rows: [{ id: 41, doc_number: 'SOP-7', title: 'Line clearance', status: 'draft' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
  release: vi.fn(),
};

vi.mock('../../../db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
  getPool: () => ({
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    connect: async () => { h.connects += 1; return fakeClient; },
  }),
}));

/* The confirmed-write role gate (services/part11/editor-role.ts) reads the
   person's organization role from the database this suite does not have. A
   member (GOVERNED_WRITE_ROLES), so the gate passes and the reason is what is
   under test. */
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'member' }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: async () => 'member' }));

const recordGovernedAction = vi.fn(async (_client: unknown, _entry: Record<string, unknown>) => ({ actionId: 'act_test', auditId: 'aud_test', sha256Chain: '' }));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction }));

const addCommentTx = vi.fn(async () => ({ id: 91, severity: 'major' }));
vi.mock('../../protocol-reviews/protocol-reviews-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  addCommentTx,
}));

const createInvestigatorTx = vi.fn(async () => ({ id: 7 }));
vi.mock('../../financial-disclosures/fcoi-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createInvestigatorTx,
}));

const triageComplianceAttention = vi.fn(async () => ({
  criticalItems: 2, created: [{ taskId: 1 }, { taskId: 2 }], alreadyTracked: [],
}));
vi.mock('../../research-compliance/compliance-triage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  triageComplianceAttention,
}));

// The change-control tools write their §11.10(e) row through recordAuditRow
// after the service call; both are observed here.
vi.mock('../../audit/audit-write-outcome', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recordAuditRow: h.recordAuditRow,
}));
vi.mock('../../qms/changeControl.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  transitionChange: h.transitionChange,
  createChange: h.createChange,
}));

// commit_document_revision runs the real spine (defaultSpineDeps) on the fake
// client; its version write and the derived readiness figure are observed.
vi.mock('../artifactVersionStore', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  upsertDocumentArtifactVersionTx: h.upsertVersion,
}));
vi.mock('../project-readiness-aggregator', () => ({ getProjectReadinessAggregate: async () => ({ score: 64 }) }));

import { approvedToolHandler } from './support/approved-tool-handler';
import { REASON_REQUIRED_TOOLS, getRegisteredToolNames } from '../AnaToolExecutor';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { reasonFieldOf } from '../stated-reason-input';
import { GLOBAL_RI_TOOL_NAMES } from '../../global-ri/ana-tools';
import { UPDATE_PLAN_TOOL_NAME } from '../turn-plan';

/* humanConfirmed: the person has confirmed the write in the chat (the
   confirmation gate in AnaToolExecutor runs before any handler). The reason is
   the second thing the record needs, and this suite is about that one. */
const CTX = { organizationId: 1, userId: 10, humanConfirmed: true };

async function call(name: string, input: Record<string, unknown>) {
  const handler = approvedToolHandler(name);
  expect(handler, `${name} must be registered`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX as never));
}

/** Every ledger row written: governed actions and audit rows alike. */
function ledgerRows(): Array<Record<string, unknown>> {
  return [
    ...recordGovernedAction.mock.calls.map(([, entry]) => entry),
    ...h.recordAuditRow.mock.calls.map(([entry]) => entry),
  ];
}
const ledgerReasons = () =>
  ledgerRows().flatMap((r) => [r.reason, (r.details as Record<string, unknown> | undefined)?.reason].filter((x) => x !== undefined));

type Shape = {
  shape: string;
  tool: string;
  input: Record<string, unknown>;
  domainWrite: ReturnType<typeof vi.fn> | null;
  /** Which ledger the row lands in. */
  ledger: 'governed action' | 'audit row';
  /** The sentence the path used to record when no reason was given, if it had one. */
  invented: string | null;
  /** The key the domain write receives the reason under, when it receives it. */
  domainReasonKey?: string;
};

/** One representative per shape that used to invent or under-check a reason, with the domain write it guards. */
const SHAPES: Shape[] = [
  {
    shape: 'governedPdev helper',
    tool: 'add_protocol_review_comment',
    input: { protocol_document_id: 12, comment: 'The primary endpoint window contradicts section 9.2.', severity: 'major' },
    domainWrite: addCommentTx,
    ledger: 'governed action',
    invented: 'Review comment added via AnA',
  },
  {
    shape: 'handler-owned transaction (fcoiReason)',
    tool: 'create_clinical_investigator',
    input: { full_name: 'Dr. Ana Ruiz', role: 'principal_investigator' },
    domainWrite: createInvestigatorTx,
    ledger: 'governed action',
    invented: 'Investigator registered via AnA',
  },
  {
    shape: 'QMS controlled document (qmsReason)',
    tool: 'create_qms_document',
    input: { doc_number: 'SOP-7', title: 'Line clearance', doc_type: 'sop' },
    domainWrite: null,
    ledger: 'governed action',
    invented: 'Controlled document SOP-7 created via AnA',
  },
  {
    shape: 'writes before its ledger row',
    tool: 'triage_compliance_attention',
    input: {},
    domainWrite: triageComplianceAttention,
    ledger: 'governed action',
    invented: 'Compliance attention triaged to tasks via AnA',
  },
  {
    shape: 'another module (document-spine.ts), reason in reason_for_change',
    tool: 'commit_document_revision',
    input: { title: 'Clinical Overview', content: 'Section 2.5 body', project_id: 3, ana_thread_id: 'thread-1' },
    domainWrite: h.upsertVersion,
    ledger: 'governed action',
    invented: 'AnA revised "Clinical Overview" (v2)',
    domainReasonKey: 'reasonForChange',
  },
  {
    shape: 'audit row after the service call (3-character floor)',
    tool: 'qms_change_transition',
    input: { change_id: 3, to: 'under_assessment' },
    domainWrite: h.transitionChange,
    ledger: 'audit row',
    invented: null,
  },
  {
    shape: 'reason persisted on the change record (no floor)',
    tool: 'qms_change_create',
    input: { change_number: 'CC-2026-071', title: 'Second-source resin' },
    domainWrite: h.createChange,
    ledger: 'audit row',
    invented: null,
    domainReasonKey: 'reason',
  },
];

beforeEach(() => {
  h.queries.length = 0;
  h.connects = 0;
  recordGovernedAction.mockClear();
  h.recordAuditRow.mockClear();
  addCommentTx.mockClear();
  createInvestigatorTx.mockClear();
  triageComplianceAttention.mockClear();
  h.transitionChange.mockClear();
  h.createChange.mockClear();
  h.upsertVersion.mockClear();
  fakeClient.query.mockClear();
});

describe('a governed AnA write without the person\'s reason is refused before anything is written', () => {
  const missing = (field: string): Array<[string, Record<string, unknown>]> => [
    ['no reason at all', {}],
    ['an empty reason', { [field]: '' }],
    ['a reason under 8 characters once trimmed', { [field]: '   ok     ' }],
    ['a reason of 3 to 7 characters', { [field]: 'Fixed.' }],
    ['a reason that is not text', { [field]: 12345678 }],
    ...(field === 'reason' ? [] : [['a reason in an input the tool does not read it from', { reason: 'Requested by the study PI.' }] as [string, Record<string, unknown>]]),
  ];

  for (const s of SHAPES) {
    const field = reasonFieldOf(s.tool);
    describe(`${s.tool} — ${s.shape}`, () => {
      it.each(missing(field))('refuses on %s, and nothing reaches the ledger', async (_label, extra) => {
        const out = await call(s.tool, { ...s.input, ...extra });

        expect(out.ok).toBe(false);
        expect(out.reasonRequired).toBe(true);
        expect(out.code).toBe('REASON_REQUIRED');
        expect(out.tool).toBe(s.tool);

        // No ledger row of any kind, and in particular not the stock sentence.
        expect(ledgerRows()).toEqual([]);
        if (s.invented) expect(ledgerReasons()).not.toContain(s.invented);

        // Refused BEFORE any write: no connection, no transaction, no domain call.
        expect(h.connects).toBe(0);
        expect(h.queries).toEqual([]);
        if (s.domainWrite) expect(s.domainWrite).not.toHaveBeenCalled();
      });

      it('tells the model to ask the person, where the reason goes, and not to supply one they did not give', async () => {
        const out = await call(s.tool, { ...s.input });
        expect(out.error).toMatch(/Nothing was recorded or changed/);
        expect(out.error).toMatch(/Ask the person/);
        expect(out.error).toContain(`"${field}"`);
        expect(out.error).toMatch(/Do not write a reason they did not give/);
      });

      it(`records exactly the reason the person gave, trimmed, on the ${s.ledger}`, async () => {
        const stated = 'Requested by the study PI at the 9/24 review.';
        const out = await call(s.tool, { ...s.input, [field]: `  ${stated}  ` });

        expect(out.error).toBeUndefined();
        expect(out.ok).toBe(true);
        const rows = s.ledger === 'governed action' ? recordGovernedAction.mock.calls.map(([, e]) => e) : h.recordAuditRow.mock.calls.map(([e]) => e);
        expect(rows).toHaveLength(1);
        // In the reason column itself, which is what the ledger shows as the reason.
        expect(rows[0].reason).toBe(stated);
        expect(ledgerReasons()).toEqual([stated]);
        if (s.domainWrite) expect(s.domainWrite).toHaveBeenCalledTimes(1);
        if (s.domainReasonKey) {
          expect(s.domainWrite!.mock.calls[0]).toContainEqual(expect.objectContaining({ [s.domainReasonKey]: stated }));
        }
      });
    });
  }
});

// ─── Every module that registers a handler, not four samples ────────────────
// Eighty-seven paths had the fallback; the samples above exercise seven. This
// holds the rest by structure, read from the TypeScript syntax tree (comments
// and strings are not code, so nothing here is fooled by either) of the
// executor AND of every module it hands its register to (document-spine.ts
// registers commit_document_revision that way, and the first version of this
// guard never read it).
//
// A reason is followed wherever it goes: any property named reason /
// reasonForChange / reason_for_change / changeReason in an object passed to a
// call — recordGovernedAction, recordAuditRow, or the service that records it
// (applyFactChange, createChange, commitCanonicalRevision, …) — on the path of
// a registered handler, including module-local functions the handler calls.

const ANA_DIR = path.resolve(__dirname, '..');
const readAna = (f: string) => fs.readFileSync(path.join(ANA_DIR, f), 'utf8');
const HANDLER_MODULES = [
  'AnaToolExecutor.ts',
  ...fs
    .readdirSync(ANA_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'AnaToolExecutor.ts' && /export function register\w*Handlers\(\s*register\b/.test(readAna(f))),
].sort();

const REASON_KEYS = new Set(['reason', 'reasonForChange', 'reason_for_change', 'changeReason']);
/** The stated-reason reads: a reason bound from gatedReason/requireStatedReason is the person's or nothing was written. */
const GATES = new Set(['gatedReason', 'requireStatedReason']);
/** Calls a reason may appear in without being carried to a write: a tool result, or the gate itself. */
const NOT_A_WRITE = new Set(['stringify', 'statedReason', ...GATES]);
const CONNECTS = new Set(['connect', 'withTransaction']);

type Fn = ts.FunctionLikeDeclaration;
type Module = { file: string; tree: ts.SourceFile; local: Map<string, Fn> };
type Carrier = { module: Module; prop: ts.PropertyAssignment | ts.ShorthandPropertyAssignment; value: ts.Expression | ts.Identifier; fn: Fn };

const MODULES: Module[] = HANDLER_MODULES.map((file) => {
  const full = path.join(ANA_DIR, file);
  const tree = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true);
  const local = new Map<string, Fn>();
  for (const st of tree.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body) local.set(st.name.text, st);
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          local.set(d.name.text, d.initializer);
        }
      }
    }
  }
  return { file, tree, local };
});

const where = (m: Module, n: ts.Node) => `${m.file}:${m.tree.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
const calleeName = (c: ts.CallExpression): string | null =>
  ts.isIdentifier(c.expression) ? c.expression.text : ts.isPropertyAccessExpression(c.expression) ? c.expression.name.text : null;

function each(node: ts.Node, fn: (n: ts.Node) => void) {
  const visit = (n: ts.Node) => { fn(n); ts.forEachChild(n, visit); };
  visit(node);
}

/** A registration's handler: inline, a local function by name, or the last argument of a wrapper (withCaughtErrors). */
function resolveHandler(m: Module, n: ts.Node | undefined): Fn | null {
  if (!n) return null;
  if (ts.isFunctionLike(n) && 'body' in n && n.body) return n as Fn;
  if (ts.isIdentifier(n)) return m.local.get(n.text) ?? null;
  if (ts.isCallExpression(n)) return resolveHandler(m, n.arguments[n.arguments.length - 1]);
  return null;
}

/** Registrations by literal name, including through a local registering helper (registerIndustryDesignTool). */
type Registration = { module: Module; tool: string | null; handler: Fn | null; at: ts.Node };
const REGISTRATIONS: Registration[] = [];
for (const m of MODULES) {
  // Local helpers that register under their first parameter.
  const registeringHelpers = new Map<string, Fn>();
  for (const [name, fn] of m.local) {
    each(fn, (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['registerToolHandler', 'register'].includes(n.expression.text)) {
        const first = n.arguments[0];
        if (first && ts.isIdentifier(first) && fn.parameters[0] && ts.isIdentifier(fn.parameters[0].name) && fn.parameters[0].name.text === first.text) {
          registeringHelpers.set(name, resolveHandler(m, n.arguments[1]) as Fn);
        }
      }
    });
  }
  each(m.tree, (n) => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
    const name = n.expression.text;
    const first = n.arguments[0];
    if (name === 'registerToolHandler' || name === 'register') {
      const inHelper = [...registeringHelpers.values()].some((fn) => n.pos >= fn.pos && n.end <= fn.end);
      if (inHelper) return;
      REGISTRATIONS.push({ module: m, tool: first && ts.isStringLiteral(first) ? first.text : null, handler: resolveHandler(m, n.arguments[1]), at: n });
    } else if (registeringHelpers.has(name) && first && ts.isStringLiteral(first)) {
      REGISTRATIONS.push({ module: m, tool: first.text, handler: registeringHelpers.get(name)!, at: n });
    }
  });
}

/** The functions a handler reaches in its own module: itself, and every local function it calls, transitively. */
function reachable(m: Module, handler: Fn): Fn[] {
  const seen = new Set<Fn>();
  const queue = [handler];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    each(f, (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const target = m.local.get(n.expression.text);
        if (target) queue.push(target);
      }
    });
  }
  return [...seen];
}

/** Every reason-named property in an object passed to a call that is not a tool result or the gate. */
function carriers(m: Module, fns: Fn[]): Carrier[] {
  const out: Carrier[] = [];
  for (const fn of fns) {
    each(fn, (n) => {
      if (!ts.isCallExpression(n)) return;
      const name = calleeName(n);
      if (!name || NOT_A_WRITE.has(name)) return;
      for (const arg of n.arguments) {
        const inArg = (x: ts.Node) => {
          if (ts.isFunctionLike(x)) return; // a callback is walked as code in its own right
          if ((ts.isPropertyAssignment(x) || ts.isShorthandPropertyAssignment(x)) && ts.isIdentifier(x.name) && REASON_KEYS.has(x.name.text)) {
            out.push({ module: m, prop: x, value: ts.isShorthandPropertyAssignment(x) ? x.name : x.initializer, fn });
          }
          ts.forEachChild(x, inArg);
        };
        inArg(arg);
      }
    });
  }
  return out;
}

const enclosingFns = (n: ts.Node): Fn[] => {
  const out: Fn[] = [];
  for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p) && 'body' in p && p.body) out.push(p as Fn);
  return out;
};

/** Where `name` is bound, looking outward from `at`: a const/let, or a parameter. */
function binding(at: ts.Node, name: string): { fn: Fn; decl: ts.VariableDeclaration | null; param: ts.ParameterDeclaration | null } | null {
  for (const fn of enclosingFns(at)) {
    const param = fn.parameters.find((p) => ts.isIdentifier(p.name) && p.name.text === name) ?? null;
    if (param) return { fn, decl: null, param };
    let decl: ts.VariableDeclaration | null = null;
    each(fn.body!, (n) => {
      if (!decl && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && enclosingFns(n)[0] === fn) decl = n;
    });
    if (decl) return { fn, decl, param: null };
  }
  return null;
}

const isGateCall = (e: ts.Expression | undefined): boolean =>
  !!e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && GATES.has(e.expression.text);

/** The first call that opens a connection in `fn` (its own body, callbacks included), or -1. */
function firstConnect(fn: Fn): number {
  let at = -1;
  each(fn.body!, (n) => {
    if (at < 0 && ts.isCallExpression(n) && CONNECTS.has(calleeName(n) ?? '')) at = n.getStart();
  });
  return at;
}

/** Why an identifier carried as a reason is not the gated one, or null when it is (bound from the gate before any connection). */
function identifierNotStated(v: ts.Identifier): string | null {
  const b = binding(v, v.text);
  if (!b) return `${v.text} is not bound on this path`;
  if (b.param) return `${v.text} is a parameter: a sentence can be passed through it unseen — bind it from gatedReason where it is used`;
  const init = b.decl!.initializer;
  if (!isGateCall(init)) return `${v.text} is not read with gatedReason/requireStatedReason: ${init?.getText() ?? '(no initializer)'}`;
  const connect = firstConnect(b.fn);
  return connect >= 0 && b.decl!.getStart() > connect ? `${v.text} is read after the connection is opened` : null;
}

/** A `param.reason` passed on unchanged by a dependency that forwards what its caller gated — never the tool's own input. */
function forwardedNotStated(v: ts.PropertyAccessExpression & { expression: ts.Identifier }): string | null {
  const b = binding(v, v.expression.text);
  if (b?.param && !REGISTRATIONS.some((r) => r.handler === b.fn)) return null;
  return `${v.getText()} reads the reason straight from ${b?.param ? "the tool's input" : 'a local object'}, not through the gate`;
}

/**
 * Why a carried reason is not the person's, or null when it is: bound from the
 * gate before any connection, or passed on unchanged from the function's own
 * parameter object (a dependency that forwards what its caller gated).
 */
function notStated(c: Carrier): string | null {
  const v = c.value;
  if (ts.isIdentifier(v)) return identifierNotStated(v);
  if (ts.isPropertyAccessExpression(v) && ts.isIdentifier(v.expression) && REASON_KEYS.has(v.name.text)) {
    return forwardedNotStated(v as ts.PropertyAccessExpression & { expression: ts.Identifier });
  }
  return `${v.getText()} is written here, not stated by the person`;
}

const PATHS = REGISTRATIONS.filter((r) => r.handler).map((r) => ({ ...r, carried: carriers(r.module, reachable(r.module, r.handler!)) }));

describe('every module that registers a handler — no ledger write can carry an invented reason', () => {
  it('reads every handler the registry holds (a scan that matches nothing proves nothing)', () => {
    expect(HANDLER_MODULES).toEqual(expect.arrayContaining([
      'AnaToolExecutor.ts', 'document-spine.ts', 'document-catalog-tools.ts', 'document-placement-tools.ts', 'agentic-workflow-tools.ts',
    ]));
    expect(REGISTRATIONS.filter((r) => !r.handler).map((r) => where(r.module, r.at)), 'a registration whose handler the scan cannot see').toEqual([]);
    const scanned = new Set(REGISTRATIONS.map((r) => r.tool).filter((t): t is string => !!t));
    // Registered under a computed name: the deterministic Global-RI loop and update_plan. Neither is scanned by name,
    // so neither may carry a reason (asserted below).
    const computed = new Set([...GLOBAL_RI_TOOL_NAMES, UPDATE_PLAN_TOOL_NAME]);
    const unseen = getRegisteredToolNames().filter((t) => !scanned.has(t) && !computed.has(t)).sort();
    expect(unseen, 'registered tools the scan never read').toEqual([]);
    expect(scanned.size).toBeGreaterThanOrEqual(700);
  });

  it('finds the population it guards', () => {
    const carrying = new Set(PATHS.filter((p) => p.carried.length && p.tool).map((p) => p.tool!));
    expect(carrying.size).toBeGreaterThanOrEqual(95);
    for (const t of ['commit_document_revision', 'apply_fact_change', 'establish_governed_fact', 'qms_change_create', 'qms_change_transition', 'add_protocol_review_comment']) {
      expect(carrying, `${t} carries a reason to a write`).toContain(t);
    }
  });

  it('a handler registered under a computed name carries no reason (it cannot be held to REASON_REQUIRED_TOOLS by name)', () => {
    const offenders = PATHS.filter((p) => !p.tool && p.carried.length).map((p) => where(p.module, p.at));
    expect(offenders).toEqual([]);
  });

  it('every reason carried to a write is the stated one — no literal, template, fallback helper, ?? / || default, or raw input', () => {
    const offenders = PATHS.flatMap((p) =>
      p.carried.map((c) => ({ c, why: notStated(c) })).filter((x) => x.why).map((x) => `${p.tool} ${where(x.c.module, x.c.prop)}: ${x.why}`),
    );
    expect([...new Set(offenders)], 'these can record a reason nobody gave').toEqual([]);
  });

  it('every tool that carries a reason to a write is asked for it before confirmation, and the set names no other tool', () => {
    const carrying = new Set(PATHS.filter((p) => p.carried.length && p.tool).map((p) => p.tool!));
    const missing = [...carrying].filter((t) => !REASON_REQUIRED_TOOLS.has(t)).sort();
    expect(missing, 'these tools carry a reason to a write but are proposed without the person\'s reason').toEqual([]);
    const stale = [...REASON_REQUIRED_TOOLS].filter((t) => !carrying.has(t)).sort();
    expect(stale, 'these are asked for a reason that nothing records').toEqual([]);
  });

  it('each tool reads its reason from the input its definition declares, described as the person\'s', () => {
    const wrong: string[] = [];
    for (const tool of REASON_REQUIRED_TOOLS) {
      const field = reasonFieldOf(tool);
      const def = ALL_ANA_TOOLS.find((t) => t.name === tool);
      const prop = (def?.input_schema.properties as Record<string, { description?: string }> | undefined)?.[field];
      if (!prop) wrong.push(`${tool}: its definition has no "${field}" input`);
      else if (!/in their words/.test(prop.description ?? '') || !/never write one yourself/.test(prop.description ?? '')) {
        wrong.push(`${tool}: "${field}" does not say it is the person's reason (STATED_REASON_INPUT)`);
      }
    }
    for (const p of PATHS) {
      each(p.handler!, (n) => {
        if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== 'gatedReason' || !p.tool) return;
        const read = n.arguments[1] && ts.isStringLiteral(n.arguments[1]) ? n.arguments[1].text : 'reason';
        if (read !== reasonFieldOf(p.tool)) wrong.push(`${p.tool} reads "${read}" but is asked for "${reasonFieldOf(p.tool)}"`);
      });
    }
    expect(wrong).toEqual([]);
  });

  it('no call to the gate takes a fallback: its second argument is a field name, never a sentence', () => {
    const fieldNames = new Set(['reason', 'reason_for_change']);
    const fallbacks: string[] = [];
    for (const m of MODULES) {
      each(m.tree, (n) => {
        if (!ts.isCallExpression(n) || !['statedReason', 'gatedReason', 'requireStatedReason'].includes(calleeName(n) ?? '')) return;
        const second = n.arguments[1];
        if (!second) return;
        const ok = (ts.isStringLiteral(second) && fieldNames.has(second.text))
          || (ts.isCallExpression(second) && ts.isIdentifier(second.expression) && second.expression.text === 'reasonFieldOf');
        if (!ok || n.arguments.length > 2) fallbacks.push(`${where(m, n)}: ${n.getText()}`);
      });
    }
    expect(fallbacks).toEqual([]);
    // And the helpers themselves accept nothing else: the parameter is the closed field-name type.
    const src = ts.createSourceFile('s.ts', readAna('stated-reason-input.ts'), ts.ScriptTarget.Latest, true);
    const alias = src.statements.find((s): s is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(s) && s.name.text === 'StatedReasonField');
    expect(alias?.type.getText(src)).toBe("'reason' | 'reason_for_change'");
    for (const st of src.statements) {
      if (!ts.isFunctionDeclaration(st) || !st.name || !['statedReason', 'gatedReason', 'requireStatedReason'].includes(st.name.text)) continue;
      expect(st.parameters.map((p) => p.type?.getText(src)).slice(1), st.name.text).toEqual(['StatedReasonField']);
    }
  });
});

describe('the person is asked why before they are asked to confirm', () => {
  const unconfirmed = { organizationId: 1, userId: 10 };

  it('an unconfirmed governed write without a reason asks for the reason, not for confirmation', async () => {
    const out = JSON.parse(await approvedToolHandler('create_clinical_investigator')!({ full_name: 'Dr. Ana Ruiz', role: 'principal_investigator' }, unconfirmed as never));
    expect(out.code).toBe('REASON_REQUIRED');
    expect(h.connects).toBe(0);
  });

  it('with the reason stated, it is proposed for confirmation', async () => {
    const out = JSON.parse(
      await approvedToolHandler('create_clinical_investigator')!(
        { full_name: 'Dr. Ana Ruiz', role: 'principal_investigator', reason: 'Requested by the study PI.' },
        unconfirmed as never,
      ),
    );
    expect(out.error).toBe('HUMAN_CONFIRMATION_REQUIRED');
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('asks commit_document_revision for reason_for_change, the input it reads, before proposing it', async () => {
    const input = { title: 'Clinical Overview', content: 'Section 2.5 body', project_id: 3, ana_thread_id: 'thread-1' };
    const asked = JSON.parse(await approvedToolHandler('commit_document_revision')!({ ...input, reason: 'Requested by the study PI.' }, unconfirmed as never));
    expect(asked.code).toBe('REASON_REQUIRED');
    expect(asked.error).toContain('"reason_for_change"');
    const proposed = JSON.parse(await approvedToolHandler('commit_document_revision')!({ ...input, reason_for_change: 'Requested by the study PI.' }, unconfirmed as never));
    expect(proposed.error).toBe('HUMAN_CONFIRMATION_REQUIRED');
    expect(h.connects).toBe(0);
    expect(ledgerRows()).toEqual([]);
  });
});
