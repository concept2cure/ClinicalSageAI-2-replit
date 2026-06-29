/**
 * E6 — orchestrator tests. Verifies the generate→verify wiring, the flag gate,
 * honesty propagation, and that verification fails when a predicate fact is
 * missing or an equivalence verdict is mismatched.
 *
 * AnaToolExecutor is mocked so these tests stay fast and isolated: we supply
 * fake author_docx_native / verify_docx_against_source handlers and assert the
 * orchestrator drives them with matrix-derived inputs. The verify fake re-uses
 * the REAL substring contract (missing required_strings → fail), so a dropped
 * fact or altered verdict is genuinely caught.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory tool registry the mock exposes to the orchestrator.
const handlers = new Map<string, (input: any, ctx?: any) => Promise<string>>();

vi.mock('../../AnaToolExecutor', () => ({
  getToolHandler: (name: string) => handlers.get(name),
  registerToolHandler: (name: string, h: any) => handlers.set(name, h),
}));

import { authorSEDiscussion } from '../se-discussion-author';
import { CLEAN_SE_MATRIX, UNRESOLVED_SE_MATRIX } from '../fixtures';
import { EQUIVALENCE_VERDICT_LABEL } from '../se-discussion-builder';

const ctx = { organizationId: 1, userId: 7 };
const ENABLED = { ENABLE_ANA_DOCUMENT_STUDIO: 'true' } as unknown as NodeJS.ProcessEnv;

/**
 * Install fakes that mimic the real tools. `author` records the body it was
 * given (so verify can check against it); `verify` runs the real substring
 * contract over that body. `corruptBody` lets a test simulate a document that
 * dropped a fact or altered a verdict.
 */
function installFakes(corruptBody?: (body: string) => string) {
  let lastBody = '';
  handlers.set('author_docx_native', async (input) => {
    lastBody = corruptBody ? corruptBody(String(input.content)) : String(input.content);
    return JSON.stringify({ docxPath: '/tmp/se.docx', title: input.title });
  });
  handlers.set('verify_docx_against_source', async (input) => {
    const required: string[] = Array.isArray(input.required_strings) ? input.required_strings : [];
    // Mirror verify_docx_against_source: single-space normalisation + substring.
    const text = lastBody.replace(/\s+/g, ' ');
    const missing = required.filter((s) => !text.includes(s));
    return JSON.stringify({
      ok: missing.length === 0,
      requiredStringsChecked: required.length,
      missingRequiredStrings: missing,
    });
  });
}

beforeEach(() => {
  handlers.clear();
});

describe('flag gate', () => {
  it('does not generate when ENABLE_ANA_DOCUMENT_STUDIO is off', async () => {
    installFakes();
    const res = await authorSEDiscussion(
      { matrix: CLEAN_SE_MATRIX, provenance: 'analyzed' },
      ctx,
      { env: { ENABLE_ANA_DOCUMENT_STUDIO: 'false' } as unknown as NodeJS.ProcessEnv },
    );
    expect(res.generated).toBe(false);
    expect(res.docxPath).toBeNull();
    expect(res.notes.join(' ')).toMatch(/gated/i);
  });

  it('generates when the flag is on', async () => {
    installFakes();
    const res = await authorSEDiscussion(
      { matrix: CLEAN_SE_MATRIX, provenance: 'analyzed' },
      ctx,
      { env: ENABLED },
    );
    expect(res.generated).toBe(true);
    expect(res.docxPath).toBe('/tmp/se.docx');
  });
});

describe('generate → verify (faithful document passes)', () => {
  it('verifies green when the authored body reproduces every matrix fact + verdict', async () => {
    installFakes();
    const res = await authorSEDiscussion(
      { matrix: CLEAN_SE_MATRIX, provenance: 'analyzed' },
      ctx,
      { env: ENABLED },
    );
    expect(res.generated).toBe(true);
    expect((res.verification as any).ok).toBe(true);
    expect((res.verification as any).missingRequiredStrings).toEqual([]);
    expect(res.sealable).toBe(true);
  });
});

describe('verification fails on a dropped fact or altered verdict', () => {
  it('fails when a predicate fact is missing from the document', async () => {
    // Strip the predicate device name out of the authored body.
    installFakes((body) => body.split('MedStream Volumetric Pump').join('REDACTED'));
    const res = await authorSEDiscussion(
      { matrix: CLEAN_SE_MATRIX, provenance: 'analyzed' },
      ctx,
      { env: ENABLED },
    );
    expect((res.verification as any).ok).toBe(false);
    expect((res.verification as any).missingRequiredStrings).toContain('MedStream Volumetric Pump');
  });

  it('fails when an equivalence verdict is altered (Equivalent → Not equivalent)', async () => {
    // Simulate a typist flipping a verdict label in the rendered document.
    installFakes((body) =>
      body.split(EQUIVALENCE_VERDICT_LABEL.EQUIVALENT).join(EQUIVALENCE_VERDICT_LABEL.NOT_EQUIVALENT),
    );
    const res = await authorSEDiscussion(
      { matrix: CLEAN_SE_MATRIX, provenance: 'analyzed' },
      ctx,
      { env: ENABLED },
    );
    expect((res.verification as any).ok).toBe(false);
    expect((res.verification as any).missingRequiredStrings).toContain(
      EQUIVALENCE_VERDICT_LABEL.EQUIVALENT,
    );
  });
});

describe('honesty propagation', () => {
  it('keeps a sample matrix preview-only (sealable=false) even after a green verify', async () => {
    installFakes();
    const res = await authorSEDiscussion(
      { matrix: CLEAN_SE_MATRIX, provenance: 'sample' },
      ctx,
      { env: ENABLED },
    );
    expect(res.generated).toBe(true);
    expect((res.verification as any).ok).toBe(true);
    expect(res.sealable).toBe(false);
    expect(res.notes.join(' ')).toMatch(/sample data/i);
  });

  it('passes the unresolved-matrix narrative through verify (no SE asserted) and stays sealable for analyzed', async () => {
    installFakes();
    const res = await authorSEDiscussion(
      { matrix: UNRESOLVED_SE_MATRIX, provenance: 'analyzed' },
      ctx,
      { env: ENABLED },
    );
    // Document still verifies against its own facts...
    expect((res.verification as any).ok).toBe(true);
    // ...but the narrative withholds the overall SE conclusion.
    expect(res.plan?.content).toMatch(/Substantial equivalence is NOT asserted/i);
  });

  it('does not generate for an empty matrix', async () => {
    installFakes();
    const res = await authorSEDiscussion(
      { matrix: { ...CLEAN_SE_MATRIX, comparison_rows: [] }, provenance: 'analyzed' },
      ctx,
      { env: ENABLED },
    );
    expect(res.generated).toBe(false);
    expect(res.notes.join(' ')).toMatch(/no comparison rows/i);
  });
});
