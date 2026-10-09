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
 * What this suite holds:
 *
 *  - Without a stated reason (absent, or under 8 characters after trimming),
 *    each of the three shapes — the shared `governedPdev` helper (the finding:
 *    add_protocol_review_comment), a handler with its own transaction
 *    (create_clinical_investigator), and the QMS handler (create_qms_document)
 *    — refuses BEFORE any write: no connection, no domain transaction, no
 *    ledger row. triage_compliance_attention, which creates tasks before it
 *    writes its ledger row and used to swallow a ledger failure, creates none.
 *  - The refusal tells the model to ask the person and forbids supplying a
 *    reason they did not give.
 *  - With a stated reason, the ledger row carries exactly that reason, trimmed.
 *  - Across the whole of AnaToolExecutor.ts, every `recordGovernedAction` call
 *    passes its reason as a variable resolved before the handler opens a
 *    connection — never a literal, a template, a helper call with a fallback,
 *    or a `??` / `||` default.
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

const h = vi.hoisted(() => ({ queries: [] as string[], connects: 0 }));

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

import { approvedToolHandler } from './support/approved-tool-handler';
import { REASON_REQUIRED_TOOLS } from '../AnaToolExecutor';

/* humanConfirmed: the person has confirmed the write in the chat (the
   confirmation gate in AnaToolExecutor runs before any handler). The reason is
   the second thing the record needs, and this suite is about that one. */
const CTX = { organizationId: 1, userId: 10, humanConfirmed: true };

async function call(name: string, input: Record<string, unknown>) {
  const handler = approvedToolHandler(name);
  expect(handler, `${name} must be registered`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX as never));
}

/** One representative per shape that used to invent a reason, with the domain write it guards. */
const SHAPES = [
  {
    shape: 'governedPdev helper',
    tool: 'add_protocol_review_comment',
    input: { protocol_document_id: 12, comment: 'The primary endpoint window contradicts section 9.2.', severity: 'major' },
    domainWrite: addCommentTx,
    invented: 'Review comment added via AnA',
  },
  {
    shape: 'handler-owned transaction (fcoiReason)',
    tool: 'create_clinical_investigator',
    input: { full_name: 'Dr. Ana Ruiz', role: 'principal_investigator' },
    domainWrite: createInvestigatorTx,
    invented: 'Investigator registered via AnA',
  },
  {
    shape: 'QMS controlled document (qmsReason)',
    tool: 'create_qms_document',
    input: { doc_number: 'SOP-7', title: 'Line clearance', doc_type: 'sop' },
    domainWrite: null,
    invented: 'Controlled document SOP-7 created via AnA',
  },
  {
    shape: 'writes before its ledger row',
    tool: 'triage_compliance_attention',
    input: {},
    domainWrite: triageComplianceAttention,
    invented: 'Compliance attention triaged to tasks via AnA',
  },
] as const;

beforeEach(() => {
  h.queries.length = 0;
  h.connects = 0;
  recordGovernedAction.mockClear();
  addCommentTx.mockClear();
  createInvestigatorTx.mockClear();
  triageComplianceAttention.mockClear();
  fakeClient.query.mockClear();
});

describe('a governed AnA write without the person\'s reason is refused before anything is written', () => {
  const missing: Array<[string, Record<string, unknown>]> = [
    ['no reason at all', {}],
    ['an empty reason', { reason: '' }],
    ['a reason under 8 characters once trimmed', { reason: '   ok     ' }],
    ['a reason that is not text', { reason: 12345678 }],
  ];

  for (const s of SHAPES) {
    describe(`${s.tool} — ${s.shape}`, () => {
      it.each(missing)('refuses on %s, and the invented sentence never reaches the ledger', async (_label, extra) => {
        const out = await call(s.tool, { ...s.input, ...extra });

        expect(out.ok).toBe(false);
        expect(out.reasonRequired).toBe(true);
        expect(out.code).toBe('REASON_REQUIRED');
        expect(out.tool).toBe(s.tool);

        // No ledger row, and in particular not the stock sentence.
        expect(recordGovernedAction).not.toHaveBeenCalled();
        const reasons = recordGovernedAction.mock.calls.map(([, entry]) => entry.reason);
        expect(reasons).not.toContain(s.invented);

        // Refused BEFORE any write: no connection, no transaction, no domain call.
        expect(h.connects).toBe(0);
        expect(h.queries).toEqual([]);
        if (s.domainWrite) expect(s.domainWrite).not.toHaveBeenCalled();
      });

      it('tells the model to ask the person, and not to supply a reason they did not give', async () => {
        const out = await call(s.tool, { ...s.input });
        expect(out.error).toMatch(/Nothing was recorded or changed/);
        expect(out.error).toMatch(/Ask the person/);
        expect(out.error).toMatch(/"reason"/);
        expect(out.error).toMatch(/Do not write a reason they did not give/);
      });

      it('records exactly the reason the person gave, trimmed', async () => {
        const out = await call(s.tool, { ...s.input, reason: '  Requested by the study PI at the 9/24 review.  ' });

        expect(out.error).toBeUndefined();
        expect(out.ok).toBe(true);
        expect(recordGovernedAction).toHaveBeenCalledTimes(1);
        expect(recordGovernedAction.mock.calls[0][1].reason).toBe('Requested by the study PI at the 9/24 review.');
        if (s.domainWrite) expect(s.domainWrite).toHaveBeenCalledTimes(1);
      });
    });
  }
});

// ─── The whole file, not four samples ────────────────────────────────────────
// Eighty-seven paths had the fallback. Four are exercised above; this holds
// the rest by structure, read from the TypeScript syntax tree of the executor
// (comments and strings are not code, so nothing here is fooled by either):
// every recordGovernedAction call takes its reason from a variable the handler
// resolved before it opened a connection, and every handler that records a
// governed action is in REASON_REQUIRED_TOOLS, so the person is asked why
// before they are asked to confirm.

const SOURCE_PATH = path.resolve(__dirname, '..', 'AnaToolExecutor.ts');
const tree = ts.createSourceFile(SOURCE_PATH, fs.readFileSync(SOURCE_PATH, 'utf8'), ts.ScriptTarget.Latest, true);

const calls = (name: string): ts.CallExpression[] => {
  const out: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) out.push(n);
    ts.forEachChild(n, visit);
  };
  visit(tree);
  return out;
};
const lineOf = (n: ts.Node) => tree.getLineAndCharacterOfPosition(n.getStart()).line + 1;

/** The `reason` of a recordGovernedAction(client, { … }) call: the property's value node, or null. */
function reasonOf(call: ts.CallExpression): ts.Node | null {
  const entry = call.arguments[1];
  if (!entry || !ts.isObjectLiteralExpression(entry)) return null;
  for (const prop of entry.properties) {
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'reason') return prop.name;
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'reason') return prop.initializer;
  }
  return null;
}

/** The nearest enclosing function body. */
function enclosingFunction(n: ts.Node): ts.FunctionLikeDeclaration | null {
  for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p) && 'body' in p && p.body) return p as ts.FunctionLikeDeclaration;
  return null;
}

/** The tool a handler is registered as: registerToolHandler('name', <this function>). */
function registeredAs(fn: ts.Node): string | null {
  const reg = fn.parent;
  if (reg && ts.isCallExpression(reg) && ts.isIdentifier(reg.expression) && reg.expression.text === 'registerToolHandler') {
    const [name] = reg.arguments;
    return name && ts.isStringLiteral(name) ? name.text : null;
  }
  return null;
}

/** Where `name` is declared (const/let, or a parameter) inside `fn`, and where fn first calls .connect(). */
function declarationAndConnect(fn: ts.FunctionLikeDeclaration, name: string): { decl: number; connect: number } {
  let decl = -1;
  let connect = -1;
  if (fn.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === name)) decl = fn.getStart();
  const visit = (n: ts.Node) => {
    if (decl < 0 && ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) decl = n.getStart();
    if (connect < 0 && ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'connect') connect = n.getStart();
    ts.forEachChild(n, visit);
  };
  if (fn.body) visit(fn.body);
  return { decl, connect };
}

describe('AnaToolExecutor.ts — no governed ledger write can carry an invented reason', () => {
  const sites = calls('recordGovernedAction').map((c) => ({ call: c, line: lineOf(c), reason: reasonOf(c) }));

  it('finds the population it guards (a scan that matches nothing proves nothing)', () => {
    expect(sites.length).toBeGreaterThanOrEqual(60);
    expect(sites.filter((s) => !s.reason).map((s) => s.line), 'every recordGovernedAction call passes a reason').toEqual([]);
  });

  it('every reason is a variable — no literal, template, fallback helper, or ?? / || default', () => {
    const offenders = sites
      .filter((s) => s.reason && !ts.isIdentifier(s.reason))
      .map((s) => `line ${s.line}: reason: ${s.reason!.getText()}`);
    expect(offenders, 'these calls can record a reason nobody gave').toEqual([]);
  });

  it('every reason variable is resolved before the handler opens a connection', () => {
    const late: string[] = [];
    for (const s of sites) {
      if (!s.reason || !ts.isIdentifier(s.reason)) continue;
      const fn = enclosingFunction(s.call);
      const { decl, connect } = fn ? declarationAndConnect(fn, s.reason.text) : { decl: -1, connect: -1 };
      if (decl < 0) late.push(`line ${s.line}: ${s.reason.text} is not declared in its handler`);
      else if (connect >= 0 && decl > connect) late.push(`line ${s.line}: ${s.reason.text} is resolved after the connection is opened`);
    }
    expect(late).toEqual([]);
  });

  it('every tool that records a governed action is asked for its reason before confirmation', () => {
    const recording = new Set<string>();
    for (const s of sites) {
      const fn = enclosingFunction(s.call);
      const tool = fn ? registeredAs(fn) : null;
      if (tool) recording.add(tool);
    }
    // The protocol-development tools record through the shared governedPdev helper.
    for (const c of calls('governedPdev')) {
      const tool = c.arguments[3];
      if (tool && ts.isStringLiteral(tool)) recording.add(tool.text);
    }
    expect(recording.size).toBeGreaterThanOrEqual(60);
    const missing = [...recording].filter((t) => !REASON_REQUIRED_TOOLS.has(t)).sort();
    expect(missing, 'these tools record a governed action but are proposed without the person\'s reason').toEqual([]);
  });

  it('no helper in the file takes a fallback reason', () => {
    const fallbacks = calls('statedReason').concat(calls('gatedReason')).filter((c) => c.arguments.length > 1);
    expect(fallbacks.map(lineOf)).toEqual([]);
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
});
