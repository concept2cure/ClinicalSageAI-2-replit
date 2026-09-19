import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_ANA_TOOLS } from '../../ana/AnaToolDefinitions.js';
import { getToolHandler } from '../../ana/AnaToolExecutor.js';

/**
 * The persona's client-files discipline must name tools that exist, and must
 * keep saying the four things that make AnA use them.
 *
 * ── Why this section exists at all ────────────────────────────────────────────
 * The tools to see the project folder shipped before any instruction to reach
 * for them did. With ~700 tools registered, a tool description is not a
 * discipline: the observed failure was an agent telling a client it could not
 * see a file that was sitting in the vault, one call away, because the Context
 * Clarity Protocol above told it to say plainly when something is not in its
 * context — and a file is not IN the context, it is in a place you look.
 *
 * ── Why it is worth a test ────────────────────────────────────────────────────
 * Two failure modes, both silent. A renamed or retired tool leaves the persona
 * promising a call the runtime cannot serve, which teaches the model to
 * hallucinate one (the CMC section carries the same tripwire for the same
 * reason). And a well-meaning edit that softens "look before you answer" or
 * drops the whole-document rule restores the behavior the section was written
 * to end, with nothing to notice it.
 */

const PERSONA = fs.readFileSync(path.resolve(__dirname, '../persona.ts'), 'utf8');

function clientFilesSection(): string {
  const start = PERSONA.indexOf("## THE CLIENT'S FILES (NON-NEGOTIABLE)");
  expect(start, 'the persona must carry a client-files section').toBeGreaterThan(-1);
  const end = PERSONA.indexOf('\n## ', start + 1);
  return PERSONA.slice(start, end === -1 ? undefined : end);
}

/** Every snake_case identifier in the section — how capabilities are named. */
function namedCapabilities(): string[] {
  return Array.from(
    new Set([...clientFilesSection().matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g)].map(m => m[1])),
  );
}

const toolNames = new Set(ALL_ANA_TOOLS.map(t => t.name));

describe('persona — the client files discipline', () => {
  it('names the tools rather than gesturing at a capability', () => {
    expect(namedCapabilities().length).toBeGreaterThanOrEqual(4);
  });

  it.each(namedCapabilities())('%s is a real, executable tool', (name) => {
    expect(toolNames.has(name), `persona names "${name}" but it is not a registered AnA tool`).toBe(true);
    // A definition with no handler fails at the point of use — the worst place
    // to find out.
    expect(typeof getToolHandler(name)).toBe('function');
  });

  /* The section used to describe list_project_documents as returning "every
     document in the project vault". It never did — it returns a page, and the
     recall block returns the twelve newest — so the persona was asserting a
     completeness the tools could not deliver, which is the premise a model
     needs in order to answer "there is no such document" from a partial list.
     The tools now report what they withheld; the persona has to say that the
     numbers exist and must be read, or nothing consults them. */
  it('tells her a listing is a page, and that absence is a claim about the whole vault', () => {
    const s = clientFilesSection();
    expect(s).toMatch(/withheld/i);
    expect(s).toContain('There is no such document');
    expect(s).toMatch(/oldest/i);
    // And it must not promise completeness it cannot keep.
    expect(s).not.toContain('It returns every document in the project vault');
  });

  it('tells her to LOOK before reporting a file absent', () => {
    const s = clientFilesSection();
    expect(s).toContain('list_project_documents');
    expect(s).toMatch(/Never tell someone a document is missing|until you have looked/);
  });

  it('says a file is not part of the context snapshot, so the "not in my context" reply does not apply to it', () => {
    // Without this, the Context Clarity Protocol above reads as licence to
    // report an uploaded file as absent — which is the defect.
    const s = clientFilesSection();
    expect(s).toMatch(/not\*{0,2} part of the CONTEXT SNAPSHOT/i);
    expect(s).toMatch(/previous session/i);
  });

  it('requires the whole document, not a sample, and says a scan is a document', () => {
    const s = clientFilesSection();
    expect(s).toMatch(/scanned PDF is a document, not an image/i);
    expect(s).toMatch(/coverage/i);
    expect(s).toContain('read_project_document');
  });

  it('requires the comprehension to be recorded, and only what the text states', () => {
    const s = clientFilesSection();
    expect(s).toContain('catalog_project_document');
    expect(s).toMatch(/a number you inferred is not a number it carries/i);
  });

  it('points at the passage index for a question the text settles, without licensing a sample', () => {
    // The corpus of passages existed for months with no tool able to read it;
    // naming the tool here is what turns "she can" into "she does". The second
    // half matters as much: a passage answers a question, it does not replace
    // the full read the catalog gate requires.
    const s = clientFilesSection();
    expect(s).toContain('search_document_passages');
    expect(s).toMatch(/not a shortcut|do not comprehend a file/);
  });

  it('requires the file to be PUT somewhere, and unfiling to be the honest fallback', () => {
    // A comprehension record that leaves the document in the Unfiled queue is
    // half the job: the client asked for it to be put in the right place, and
    // the ingest classifier's guess is not that.
    const s = clientFilesSection();
    expect(s).toContain('place_project_document');
    expect(s).toMatch(/Unfiled queue/);
    expect(s).toMatch(/unfile:true/);
  });

  it('requires an unreadable file to be reported as such', () => {
    expect(clientFilesSection()).toMatch(/never let an empty read pass for an empty document/i);
  });

  it('carries no backtick — the persona body is a template literal', () => {
    // A backtick here terminates the string and breaks the whole prompt; the
    // first draft of this section did exactly that.
    expect(clientFilesSection()).not.toContain('`');
  });
});
