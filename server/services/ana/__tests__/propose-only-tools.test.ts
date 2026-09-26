/**
 * The tool-name-keyed propose-only partition cannot go stale.
 *
 * ── The defect (audit 2026-09-24 DP-36, plan P1-34) ──────────────────────────
 * P0-12's "every write is a proposal" held only for the ~110 commands behind
 * `execute_platform_command`. The ~730 tools registered by name with
 * `registerToolHandler` were outside the partition by the gate's own docstring,
 * so a model response could save to the vault, revise a controlled document,
 * approve an import or acknowledge training with nobody confirming.
 *
 * ── What keeps the registry honest ───────────────────────────────────────────
 * The command partition is DERIVED from COMMAND_AUTHORIZATION; a tool registry
 * cannot be, because a handler carries no `effect`. So this file derives the
 * CANDIDATES instead, the way governed-write-gate.test.ts derives free-text
 * tools from the schemas: it splits every registering module on
 * `registerToolHandler('name'` (and `register('name'` in the RegisterFn
 * modules), and flags a handler body that carries a write marker. Every
 * flagged name must be in exactly one of the three maps. A new writer cannot
 * ship unclassified, and a name cannot be in two classes at once.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  PLATFORM_COMMAND_BRIDGE_TOOL,
  PROPOSE_ONLY_TOOLS,
  READ_ONLY_TOOL_EXCLUSIONS,
  REFUSE_IN_CHAT_TOOLS,
  buildToolProposalResult,
  buildToolRefusalResult,
  isProposeOnlyTool,
  refusedInChatTool,
  toolTierOf,
} from '../propose-only-tools';
import { GOVERNED_CONTENT_WRITE_TOOLS } from '../governed-write-tools';

const ANA_DIR = path.resolve(__dirname, '..');

/**
 * A handler body that does one of these persists something. `setTenantContextTx`
 * is the RLS scoping call every tenant-bound read makes inside a transaction,
 * so it is the one `*Tx(` name excluded.
 */
const WRITE_MARKER =
  /INSERT INTO|UPDATE\s+[\w."]+\s+SET|DELETE FROM|db\.insert\(|db\.update\(|db\.delete\(|recordGovernedAction|recordArtifactProvenance|recordAuditRow|\b(?!setTenantContextTx\b)\w+Tx\(|fs\.writeFile|createNotification|method:\s*'POST'/;

/**
 * Every module that registers a tool: the executor, and each sibling that takes
 * an injected `register: RegisterFn` (the pattern used to avoid an import
 * cycle). Discovered, not listed, so a new registrar module is scanned too.
 */
function registeringModules(): string[] {
  return readdirSync(ANA_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(ANA_DIR, f))
    .filter((p) => p.endsWith('AnaToolExecutor.ts') || /register:\s*RegisterFn/.test(readFileSync(p, 'utf8')));
}

interface Handler {
  name: string;
  file: string;
  body: string;
}

/** Split each registering module into (name, body) at every literal registration. */
function registeredHandlers(): Handler[] {
  const out: Handler[] = [];
  for (const file of registeringModules()) {
    const src = readFileSync(file, 'utf8');
    const isRegistrar = /register:\s*RegisterFn/.test(src);
    const re = isRegistrar ? /\bregister(?:ToolHandler)?\(\s*'([a-z0-9_]+)'/g : /\bregisterToolHandler\(\s*'([a-z0-9_]+)'/g;
    const sites: Array<{ name: string; at: number }> = [];
    for (let m = re.exec(src); m; m = re.exec(src)) sites.push({ name: m[1], at: m.index });
    for (let i = 0; i < sites.length; i++) {
      const start = sites[i].at;
      const nextSite = sites[i + 1]?.at ?? src.length;
      // A handler ends at the first column-zero `});` after it; helpers and
      // comments between two handlers are not the first handler's body.
      const close = src.indexOf('\n});', start + 4);
      const end = Math.min(nextSite, close === -1 ? src.length : close + 4);
      out.push({ name: sites[i].name, file: path.basename(file), body: src.slice(start, end) });
    }
  }
  return out;
}

const handlers = registeredHandlers();
const registered = new Set(handlers.map((h) => h.name));
const flagged = [...new Set(handlers.filter((h) => WRITE_MARKER.test(h.body)).map((h) => h.name))];

const proposals = Object.keys(PROPOSE_ONLY_TOOLS);
const refusals = Object.keys(REFUSE_IN_CHAT_TOOLS);
const exclusions = Object.keys(READ_ONLY_TOOL_EXCLUSIONS);
const classified = new Set([...proposals, ...refusals, ...exclusions]);

/** The refusals already wired inline in the executor (refuseSignatureInChat and three hand-written copies). */
function inlineRefusers(): string[] {
  const src = readFileSync(path.join(ANA_DIR, 'AnaToolExecutor.ts'), 'utf8');
  const viaHelper = [...src.matchAll(/refuseSignatureInChat\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
  // The four that refuse with their own copy rather than the helper. Relocating
  // all of them onto buildToolRefusalResult waits for the executor's window.
  const handWritten = ['finalize_protocol_document', 'approve_rbm_assessment', 'approve_rbm_plan', 'transmit_submission'];
  return [...new Set([...viaHelper, ...handWritten])];
}

describe('the scan still sees the surface', () => {
  it('finds the whole registered surface across the executor and every RegisterFn module', () => {
    expect(registered.size).toBeGreaterThan(700);
    const files = new Set(handlers.map((h) => h.file));
    for (const f of ['AnaToolExecutor.ts', 'document-spine.ts', 'agentic-workflow-tools.ts', 'document-catalog-tools.ts']) {
      expect(files, f).toContain(f);
    }
  });

  it('flags the tools the finding was found through', () => {
    for (const n of ['save_document_to_vault', 'update_vault_document', 'qms_change_transition', 'retire_qms_document', 'create_qms_document', 'ack_training', 'approve_import']) {
      expect(flagged, n).toContain(n);
    }
    expect(flagged.length).toBeGreaterThan(100);
  });
});

describe('the classification cannot go stale', () => {
  it('every handler with a write marker is classified — a new writer cannot ship unclassified', () => {
    const unclassified = flagged.filter((n) => !classified.has(n));
    expect(unclassified).toEqual([]);
  });

  it('no name is in two maps', () => {
    const twice = [...classified].filter(
      (n) => [n in PROPOSE_ONLY_TOOLS, n in REFUSE_IN_CHAT_TOOLS, n in READ_ONLY_TOOL_EXCLUSIONS].filter(Boolean).length > 1,
    );
    expect(twice).toEqual([]);
  });

  it('every classified name is a registered tool — no stale entries', () => {
    const stale = [...classified].filter((n) => !registered.has(n));
    expect(stale).toEqual([]);
  });

  it('every entry says why, in a sentence', () => {
    const whys: Array<[string, string]> = [
      ...Object.entries(PROPOSE_ONLY_TOOLS).map(([n, e]) => [n, e.why] as [string, string]),
      ...Object.entries(REFUSE_IN_CHAT_TOOLS).map(([n, e]) => [n, e.why] as [string, string]),
      ...Object.entries(READ_ONLY_TOOL_EXCLUSIONS),
    ];
    expect(whys.length).toBeGreaterThan(0);
    for (const [n, why] of whys) {
      expect(why.length, n).toBeGreaterThan(30);
      expect(why, n).toMatch(/\.$/);
    }
    for (const [n, e] of Object.entries(REFUSE_IN_CHAT_TOOLS)) {
      expect(e.act.length, n).toBeGreaterThan(8);
      expect(e.where.length, n).toBeGreaterThan(8);
    }
  });

  it('the two gates compose: every governed content write is a proposal or a refusal', () => {
    const unaided = Object.keys(GOVERNED_CONTENT_WRITE_TOOLS).filter((n) => !isProposeOnlyTool(n) && !(n in REFUSE_IN_CHAT_TOOLS));
    expect(unaided).toEqual([]);
  });

  it('every handler that already refuses inline is registered as a refusal — the registry is the single source', () => {
    const inline = inlineRefusers();
    expect(inline.length).toBeGreaterThanOrEqual(14);
    expect(inline.filter((n) => !(n in REFUSE_IN_CHAT_TOOLS))).toEqual([]);
  });

  it('the command bridge is in no map — the command partition governs it', () => {
    expect(classified.has(PLATFORM_COMMAND_BRIDGE_TOOL)).toBe(false);
    expect(isProposeOnlyTool(PLATFORM_COMMAND_BRIDGE_TOOL)).toBe(false);
    expect(refusedInChatTool(PLATFORM_COMMAND_BRIDGE_TOOL, { command: 'create_task' })).toBeNull();
  });
});

describe("the finding's exemplars are classified as stated (DP-36)", () => {
  it.each(['save_document_to_vault', 'update_vault_document', 'draft_authoring_document', 'create_qms_document'])(
    '%s is a proposal',
    (n) => {
      expect(isProposeOnlyTool(n)).toBe(true);
      expect(refusedInChatTool(n, { title: 'x' })).toBeNull();
    },
  );

  it.each(['retire_qms_document', 'approve_import', 'ack_training', 'approve_qms_document'])('%s is refused in chat', (n) => {
    expect(refusedInChatTool(n, { document_id: 1 })).not.toBeNull();
    expect(isProposeOnlyTool(n)).toBe(false);
  });

  it('qms_change_transition is refused for the approve, reject and close targets and proposed for the rest', () => {
    for (const to of ['approved', 'rejected', 'closed']) {
      const r = refusedInChatTool('qms_change_transition', { change_id: 1, to, reason: 'why' });
      expect(r, to).not.toBeNull();
      expect(r?.target).toBe(to);
    }
    for (const to of ['under_assessment', 'in_implementation', 'verification', 'cancelled']) {
      expect(refusedInChatTool('qms_change_transition', { change_id: 1, to }), to).toBeNull();
    }
    expect(isProposeOnlyTool('qms_change_transition')).toBe(true);
    expect(toolTierOf('qms_change_transition')).toBe('reason');
  });

  it('an unreadable transition target is refused, not proposed', () => {
    for (const input of [{}, { to: '' }, { to: 42 }, null, 'approved']) {
      const r = refusedInChatTool('qms_change_transition', input);
      expect(r, JSON.stringify(input)).not.toBeNull();
      expect(r?.target).toBeNull();
      expect(buildToolRefusalResult(r!).message).toMatch(/could not be read/);
    }
  });

  it('the tools that already demand a reason-for-change of their own are at the reason tier, so the reason is the person’s', () => {
    for (const n of ['save_document_to_vault', 'update_vault_document', 'revise_qms_document', 'seed_tmf', 'update_tmf_artifact_status', 'apply_fact_change', 'commit_document_revision']) {
      expect(toolTierOf(n), n).toBe('reason');
    }
    for (const n of ['create_qms_document', 'draft_authoring_document', 'fire_notification', 'create_calendar_event']) {
      expect(toolTierOf(n), n).toBe('confirm');
    }
  });

  it('a read is neither', () => {
    for (const n of ['list_vault_documents', 'search_documents', 'lookup_ich_guideline']) {
      expect(isProposeOnlyTool(n), n).toBe(false);
      expect(toolTierOf(n), n).toBeNull();
      expect(refusedInChatTool(n, {}), n).toBeNull();
    }
  });
});

describe('the envelopes', () => {
  it('a proposal mirrors buildHumanConfirmationRequiredResult with a {tool, input} retry', () => {
    const r = buildToolProposalResult('save_document_to_vault', { title: 't', content: 'c', reason: 'r' });
    expect(r).toEqual({
      success: false,
      action: 'save_document_to_vault',
      error: 'HUMAN_CONFIRMATION_REQUIRED',
      message: expect.stringMatching(/taken by a person/),
      openModal: 'esign',
      data: {
        tier: 'reason',
        reasonRequired: true,
        signatureRequired: false,
        proposedByAgent: true,
        retry: { tool: 'save_document_to_vault', input: { title: 't', content: 'c', reason: 'r' } },
      },
    });
  });

  it('a confirm-tier proposal asks for no reason and carries an object input even when the call had none', () => {
    const r = buildToolProposalResult('create_qms_document', undefined);
    expect(r.data.tier).toBe('confirm');
    expect(r.data.reasonRequired).toBe(false);
    expect(r.data.retry).toEqual({ tool: 'create_qms_document', input: {} });
  });

  it('refuses to build a proposal for a tool that is not one — no silent confirm tier for an unknown name', () => {
    expect(() => buildToolProposalResult('list_vault_documents', {})).toThrow(/not a propose-only tool/);
    expect(() => buildToolProposalResult('retire_qms_document', {})).toThrow(/not a propose-only tool/);
  });

  it('a refusal keeps refuseSignatureInChat’s keys and adds an error code every door reads as a refusal', () => {
    const r = buildToolRefusalResult(refusedInChatTool('approve_import', { import_job_id: 1, project_id: 2 })!);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('REFUSED_IN_CHAT');
    expect(r.signatureRequired).toBe(true);
    expect(r.tool).toBe('approve_import');
    expect(r.message).toMatch(/Nothing was recorded or changed\. Do it from /);
  });
});
