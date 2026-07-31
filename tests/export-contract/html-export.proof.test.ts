/**
 * Export-contract proof — HTML export → reopen (DOM parse) → structural
 * qualification.
 *
 * Proof hierarchy tiers 6-7 for the HTML path (docs/architecture/PROOF_HIERARCHY.md).
 * The universal packager emits a real .html document for web/preview deliverables
 * by STRING CONCATENATION (universal-packager.ts generateHtml). String-built markup
 * is where structural bugs hide — a dropped tag or a title that never reaches the
 * body. This proof takes the REAL generator's output and:
 *   - REOPEN (independent of the writer): parses the bytes into a DOM with
 *     `node-html-parser`, a parser that never saw the writer's template;
 *   - QUALIFY: retrieves the authored title from BOTH `<title>` and `<h1>`, the
 *     generator identity from `<meta name="generator">`, and the content TOKEN from
 *     the `.content` node — all via DOM queries, never a raw byte match;
 *   - NON-VACUOUS: a foreign HTML document is rejected by the generator-identity
 *     check, and stripping the `<h1>` from the real output makes the structural
 *     title check fail — proving the qualification reads structure, not bytes.
 *
 * HONEST SCOPE: node-html-parser is lenient (it does not throw on malformed input),
 * so the negatives assert STRUCTURAL detection, not a parser exception.
 *
 * No DB, no mocks: the universal packager imports only docx/archiver/crypto.
 * Output: tests/export-contract/__reports__/html-export.{manifest.json,report.md}
 */

import { describe, it, expect, afterAll } from 'vitest';
import { parse as parseHtml } from 'node-html-parser';
import { packageSingleFormat } from '../../server/services/universal-packager';
import { JourneyRecorder } from '../golden-journeys/harness';

const REPORT_DIR = 'tests/export-contract/__reports__';

const GENERATOR = 'Concept2Cure Universal Packager';
const TITLE = 'Rendered Export Contract';
const TOKEN = 'ROUNDTRIPHTML3W';
const CONTENT = `Executive summary paragraph — ${TOKEN}`;

/** Structural identity: is this DOM one of our generated artifacts? */
function isOurArtifact(root: ReturnType<typeof parseHtml>): boolean {
  const gen = root.querySelector('meta[name="generator"]')?.getAttribute('content');
  const h1 = root.querySelector('h1');
  return gen === GENERATOR && !!h1;
}

const R = new JourneyRecorder(
  'Export-contract proof — HTML export → reopen → structural qualification',
  'Generate a real .html document with the universal packager and reopen it with ' +
    'an independent DOM parser (node-html-parser), proving the authored title and ' +
    'content are retrievable from the parsed structure.',
  ['(no DB — direct generator output)'],
);

afterAll(() => {
  R.write('html-export', REPORT_DIR);
});

describe('HTML export → reopen → structural qualification', () => {
  R.limitations.push(
    'node-html-parser is lenient and does not throw on malformed HTML, so the ' +
      'negatives assert structural detection (missing identity / missing h1) rather ' +
      'than a parser exception. The reader is independent of the string-built writer.',
  );

  it('generates, reopens the DOM, and qualifies the structure', async () => {
    // ── Generate the real artifact ──────────────────────────────────────────
    const gen = await R.step('generate-real-html', async () => {
      const output = await packageSingleFormat('html', TITLE, CONTENT);
      expect(output).not.toBeNull();
      const buf = output!.buffer;
      expect(buf.length).toBeGreaterThan(0);
      expect(output!.format).toBe('html');
      expect(output!.checksum).toMatch(/^[a-f0-9]{64}$/);
      // Document-type sniff: begins with an HTML doctype.
      expect(buf.toString('utf-8').trimStart().slice(0, 15).toLowerCase()).toContain('<!doctype html');
      return { sizeBytes: buf.length, format: output!.format, mimeType: output!.mimeType, fileName: output!.fileName };
    });
    const output = await packageSingleFormat('html', TITLE, CONTENT);
    const html = output!.buffer.toString('utf-8');

    // ── REOPEN + QUALIFY: retrieve authored data through the parsed DOM ───────
    const dom = await R.step('reopen-dom-and-qualify', async () => {
      const root = parseHtml(html);
      expect(isOurArtifact(root)).toBe(true);
      // Title reaches BOTH the head <title> and the body <h1>.
      expect(root.querySelector('title')?.text).toBe(TITLE);
      expect(root.querySelector('h1')?.text).toBe(TITLE);
      // The content TOKEN is inside the .content node (DOM query, not byte match).
      const contentNode = root.querySelector('.content');
      expect(contentNode, 'no .content node in the rendered document').toBeTruthy();
      expect(contentNode!.text).toContain(TOKEN);
      // Generator identity present.
      expect(root.querySelector('meta[name="generator"]')?.getAttribute('content')).toBe(GENERATOR);
      return {
        title: root.querySelector('h1')?.text,
        generatorMeta: root.querySelector('meta[name="generator"]')?.getAttribute('content'),
        tokenInContentNode: contentNode!.text.includes(TOKEN),
      };
    });
    expect(dom.tokenInContentNode).toBe(true);

    // ── Non-vacuous #1: a foreign HTML document is rejected by identity ──────
    await R.expectBlocked('foreign-html-is-not-our-artifact', async () => {
      const foreign = parseHtml('<!DOCTYPE html><html><body><p>just a page</p></body></html>');
      const rejected = !isOurArtifact(foreign);
      return { blocked: rejected, hasH1: !!foreign.querySelector('h1'), hasGeneratorMeta: !!foreign.querySelector('meta[name="generator"]') };
    });

    // ── Non-vacuous #2: stripping the <h1> makes the structural check fail ───
    // A writer that dropped the title-in-body would emit exactly this; the DOM
    // check (not a byte scan) catches it.
    await R.expectBlocked('h1-removed-fails-structural-title-check', async () => {
      const mangled = parseHtml(html.replace(/<h1>[\s\S]*?<\/h1>/, ''));
      const h1 = mangled.querySelector('h1');
      const stillHasTitleInBody = !!h1 && h1.text === TITLE;
      return { blocked: !stillHasTitleInBody, h1Present: !!h1 };
    });

    R.observations.push(
      `Generated a ${gen.sizeBytes}-byte .html document; an independent DOM parser ` +
        `retrieved the title from <title> and <h1> and the content token from .content.`,
    );
  });
});
