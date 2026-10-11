/**
 * A step that built an authoring document keeps the document's ids in the
 * saved trace, however long its result.
 *
 * Found in a real browser on 2026-10-08 (docs/evidence/D2-ONE-ANA/2026-10-08/
 * ana-1-canvas-opens/screens/, finding 1): a conversation reopened from history
 * showed no document at all. draft_authoring_document returns { saved, title,
 * status, content, …, authoringDocId, programId }; the trace kept the first
 * 180 characters of that JSON, which is all draft text, so the id was cut off
 * and the reopened conversation could not find its document. The saved summary
 * as it was, from the capture database:
 *   {"saved":true,"title":"Module 2.5 Clinical Overview (stand-in draft)",
 *    "status":"generated","content":"# Module 2.5 Clinical Overview …
 */
import { describe, expect, it } from 'vitest';
import { buildTraceEntry, summarizeToolResult } from '../tool-trace';

const DOC = 'a6257943-a4f8-4dc0-a957-5dd4ca69e2a6';
const PROGRAM = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const RESULT = JSON.stringify({
  saved: true,
  title: 'Module 2.5 Clinical Overview (stand-in draft)',
  status: 'generated',
  content: '# Module 2.5 Clinical Overview\n\n## 2.5.1 Product Development Rationale\n\n' + 'Drafted text. '.repeat(200),
  documentStatus: 'draft',
  authoringDocId: DOC,
  programId: PROGRAM,
  sectionCount: 4,
});

/* The client's reader (ConversationThread authoringDocFromToolResult) is a
   regex over the summary; the same expressions, so this proves the round trip. */
const DOC_ID_RE = /"authoringDocId"\s*:\s*"([0-9a-f-]{36})"/i;
const PROGRAM_ID_RE = /"programId"\s*:\s*"([0-9a-f-]{36})"/i;

describe('the saved step summary of a step that built a document', () => {
  it('keeps the document id, the program and the title, whatever came before them', () => {
    const summary = buildTraceEntry('draft_authoring_document', 'Drafting the document', 'success', RESULT).resultSummary;
    expect(DOC_ID_RE.exec(summary)?.[1]).toBe(DOC);
    expect(PROGRAM_ID_RE.exec(summary)?.[1]).toBe(PROGRAM);
    expect(JSON.parse(summary)).toMatchObject({ authoringDocId: DOC, programId: PROGRAM, status: 'generated', title: 'Module 2.5 Clinical Overview (stand-in draft)' });
  });

  it('does not carry the draft text into the trace', () => {
    expect(summarizeToolResult(RESULT)).not.toContain('Drafted text.');
  });

  it('leaves every other result as it was', () => {
    expect(summarizeToolResult(JSON.stringify({ results: [1, 2, 3] }))).toBe('3 results');
    expect(summarizeToolResult(JSON.stringify({ error: 'no project open' }))).toBe('error: no project open');
  });
});
