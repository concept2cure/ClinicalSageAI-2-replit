/**
 * One step-presentation table, both tenses, redacted details (ANA-SUMMARY S3,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §2.3, §2.6, §5 S3).
 *
 * presentStep is the one function that builds a step's label, source, preview
 * and facts; stepMessage writes the one status sentence. These pin the rules
 * the stream and the client then carry: a tool's name never reaches a label, a
 * finished step reads in the done form only when it succeeded, an id never
 * reaches a preview or a fact, and "a model was used in this step" is said
 * only from the generation capture.
 */
import { describe, it, expect } from 'vitest';

import { cleanStepText, presentStep, stepMessage, stepUsedModel, finishedStep } from '../step-presentation.js';
import { describeToolPlan } from '../agentic-loop.js';
import { STEP_VERBS, unknownStepLabel } from '@shared/ana/step-verbs';

const UUID = '3f2b8c1e-9d4a-4e6b-8c2f-1a5d7e9b0c3d';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe('labels come from the register, never from a tool name', () => {
  it('a tool with no entry reads "Running a step" live and "Ran a step" finished', () => {
    const live = presentStep('sentinel_tool_xyz', { query: 'x' });
    const done = presentStep('sentinel_tool_xyz', {}, null, { status: 'success', result: '{}' });
    expect(live.label).toBe('Running a step');
    expect(done.label).toBe('Ran a step');
    expect(describeToolPlan([{ id: '1', name: 'sentinel_tool_xyz', input: {} }])[0].label).toBe('Running a step');
    for (const text of [live.label, done.label, JSON.stringify(live.facts), JSON.stringify(done.facts)]) {
      expect(text).not.toMatch(/sentinel/i);
    }
  });

  it('the unknown-step words are the shared table\'s, both halves', () => {
    expect(unknownStepLabel('doing')).toBe('Running a step');
    expect(unknownStepLabel('done')).toBe('Ran a step');
  });
});

describe('tense', () => {
  it('a live step reads in the doing form, a finished one in the done form', () => {
    const input = { query: 'shelf life' };
    expect(presentStep('search_project_documents', input).label).toBe('Searching the Vault');
    expect(presentStep('search_project_documents', input, null, { status: 'success', result: '{"results":[]}' }).label).toBe('Searched the Vault');
    expect(presentStep('validate_ectd_package', {}, null, { status: 'success', result: '{}' }).label).toBe('Validated the eCTD package');
  });

  it('a step that did not succeed keeps the doing form: a failed validation never reads "Validated"', () => {
    for (const outcome of [
      { status: 'error' as const },
      { status: 'not_found' as const },
      { status: 'cancelled' as const },
      { status: 'success' as const, heldBack: true },
      { status: 'success' as const, result: JSON.stringify({ ok: false, reason: 'coverage incomplete' }) },
    ]) {
      expect(presentStep('validate_ectd_package', {}, null, outcome).label).toBe('Validating the eCTD package');
    }
  });

  it('every verb has both forms, and they differ', () => {
    for (const [key, v] of Object.entries(STEP_VERBS)) {
      expect(v.doing, key).toMatch(/^[A-Z][a-z]+( (up|on))?$/);
      expect(v.done, key).toMatch(/^[A-Z][a-z]+( (up|on))?$/);
      expect(v.done, key).not.toBe(v.doing);
    }
  });
});

describe('preview: one allow-listed field, never an id', () => {
  it('previews the query beneath "Searched the Vault"', () => {
    const p = presentStep('search_project_documents', { query: 'shelf life', program_id: UUID });
    expect(p.preview).toBe('shelf life');
    expect(p.facts).toEqual([{ name: 'Searched for', value: 'shelf life' }]);
  });

  it('drops a value that looks like a uuid or a long hex string, keeps numbers', () => {
    expect(cleanStepText(UUID)).toBeNull();
    expect(cleanStepText(`doc ${UUID}`)).toBeNull();
    expect(cleanStepText('a3f9c2e1b7d4058e')).toBeNull();
    expect(cleanStepText('2025')).toBe('2025');
    expect(cleanStepText(510)).toBe('510');
  });

  it('caps a preview at 80 characters and never lets a double quote split the label', () => {
    const long = cleanStepText('x'.repeat(200))!;
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('…')).toBe(true);
    expect(cleanStepText('the "pivotal" study')).toBe("the 'pivotal' study");
  });
});

describe('redaction: facts come from allow-listed fields only (S3 test 1, server half)', () => {
  it('a step with input {document_id:<uuid>} and result {authoringDocId:<uuid>} carries no uuid', () => {
    const outcome = {
      status: 'success' as const,
      latencyMs: 2400,
      usedModel: false,
      result: JSON.stringify({ authoringDocId: UUID, programId: UUID, title: 'Clinical Overview', note: `id ${UUID}` }),
    };
    const p = presentStep('draft_authoring_document', { document_id: UUID, title: 'Clinical Overview' }, null, outcome);
    const step = finishedStep({ name: 'draft_authoring_document', input: { document_id: UUID } }, null, outcome);
    expect(JSON.stringify(p)).not.toMatch(UUID_RE);
    expect(JSON.stringify(step.frame)).not.toMatch(UUID_RE);
    expect(JSON.stringify(step.trace)).not.toMatch(UUID_RE);
    expect(p.facts).toEqual([{ name: 'Took', value: '2.4s' }]);
  });

  it('counts are read from allow-listed numeric fields and nothing else', () => {
    const p = presentStep('search_literature', { query: 'estimand' }, null, {
      status: 'success',
      result: JSON.stringify({ totalMatches: 12, results: [{}, {}], error: 'ignored', summary: 'free text' }),
    });
    expect(p.facts).toEqual([
      { name: 'Searched for', value: 'estimand' },
      { name: 'Found', value: '12 matches' },
    ]);
  });

  it('a listing states the scope\'s total, not the page it returned; the Vault search counts its hits', () => {
    const listed = presentStep('list_project_documents', {}, null, {
      status: 'success',
      result: JSON.stringify({ ok: true, returned: 100, total: 340, documents: new Array(100).fill({}) }),
    });
    expect(listed.facts).toContainEqual({ name: 'Found', value: '340 documents' });
    const searched = presentStep('search_project_documents', { query: 'stability' }, null, {
      status: 'success',
      result: JSON.stringify({ ok: true, hits: [{ documentId: UUID }, {}], textMatches: 8, message: 'read_project_document before relying on one.' }),
    });
    expect(searched.facts).toContainEqual({ name: 'Found', value: '2 documents' });
    expect(JSON.stringify(searched.facts)).not.toMatch(/read_project_document|[0-9a-f]{8}-/);
  });

  it('a read states the Vault title and the characters it delivered', () => {
    const p = presentStep('read_project_document', { document_id: UUID }, null, {
      status: 'success',
      result: JSON.stringify({ ok: true, documentTitle: 'Stability report 2025', window: { start: 0, end: 4812, text: '…' }, totalChars: 60000 }),
    });
    expect(p.facts).toEqual([
      { name: 'Document', value: 'Stability report 2025' },
      { name: 'Characters read', value: '4,812 of 60,000' },
    ]);
  });
});

describe('document titles (S3 test 5, presentation half)', () => {
  it('names the document when the stream resolved its title, and reads generically when it did not', () => {
    const titles = new Map([[UUID, 'Stability report 2025']]);
    expect(presentStep('read_project_document', { document_id: UUID }, titles).label).toBe('Reading "Stability report 2025"');
    expect(presentStep('read_project_document', { document_id: UUID }, new Map()).label).toBe('Reading a Vault document');
    expect(presentStep('read_project_document', { document_id: 'not-a-uuid' }, titles).label).toBe('Reading a Vault document');
  });
});

describe('connected systems', () => {
  it('one system searched reads as that system; the reasons are said in words, never as tool names', () => {
    const result = JSON.stringify({
      searched: ['google_drive'],
      skipped: [
        { connector: 'box', reason: 'not connected for this organization' },
        { connector: 'pubmed', reason: "not one of the organisation's document repositories, so this tool never sends it a query; for public sources use search_literature or the agency lookups" },
        { connector: 'sharepoint', reason: 'credentials invalid or connector unhealthy' },
        { connector: 'x_custom', reason: 'unknown connector' },
        { connector: 'onedrive', reason: 'HTTP 503 from graph.microsoft.com' },
      ],
      resultCount: 2,
      documents: [{}, {}],
    });
    const p = presentStep('search_connected_repositories', { query: 'protocol' }, null, { status: 'success', result });
    expect(p.source).toBe('google_drive');
    expect(p.facts).toContainEqual({ name: 'Systems searched', value: 'Google Drive' });
    const notSearched = p.facts.find(f => f.name === 'Systems not searched')!.value;
    expect(notSearched).toBe(
      'Box (not connected for your organisation); PubMed (not one of your document repositories); ' +
        'SharePoint (its connection needs attention); another system (not a system this search knows); ' +
        'OneDrive (the search did not complete)',
    );
    expect(notSearched).not.toMatch(/search_literature|credentials|graph\.microsoft|x_custom/);
  });

  it('several systems read as "connected"', () => {
    const p = presentStep('search_connected_repositories', {}, null, {
      status: 'success',
      result: JSON.stringify({ searched: ['google_drive', 'box'], skipped: [] }),
    });
    expect(p.source).toBe('connected');
  });
});

describe('usedModel is the generation capture, never a list (S3 test 6, presentation half)', () => {
  it('true when the capture noted a generation, false when none, null when the handler ran elsewhere', () => {
    expect(stepUsedModel({ calls: 1 }, false)).toBe(true);
    expect(stepUsedModel({ calls: 0 }, false)).toBe(false);
    expect(stepUsedModel(null, true)).toBeNull();
    expect(stepUsedModel(null, false)).toBe(false);
  });

  it('a step whose handler made a generation says so, whatever the register claims', () => {
    const p = presentStep('compute_sample_size', {}, null, { status: 'success', result: '{}', usedModel: true });
    expect(p.source).toBe('engine');
    expect(p.facts).toContainEqual({ name: 'Model', value: 'a model was used in this step' });
  });
});

describe('stepMessage: the one place a status sentence is written (§2.6)', () => {
  const doing = 'Searching the Vault';
  it.each([
    ['error', false, undefined, "AnA couldn't finish searching the Vault and continued without it."],
    ['not_found', false, undefined, "Searching the Vault isn't available here, so AnA continued without it."],
    ['cancelled', false, undefined, 'You stopped searching the Vault before it finished.'],
    ['error', true, 'declined', 'You declined searching the Vault, so it did not run.'],
    ['error', true, 'no decision within the approval window', "Searching the Vault did not run: it needs a person's authorisation (no decision within the approval window)."],
    ['not_run', false, 'manual hold', 'Searching the Vault did not run because the turn stopped first.'],
    ['success', false, undefined, null],
  ] as const)('%s (held back: %s, why: %s)', (status, heldBack, why, sentence) => {
    expect(stepMessage(status, heldBack, why, doing)).toBe(sentence);
  });
});
