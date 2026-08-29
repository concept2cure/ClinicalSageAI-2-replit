// @vitest-environment jsdom
/**
 * The fidelity gate, on the markup it did not know about.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * `roundTrip.ts` opens with "a regulated document may not change by a single
 * character" and had NO TESTS. Not a thin suite — none. The module that decides
 * whether the editor may touch a filed section at all was the one thing in the
 * editor nothing checked.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `looksLikeHtml` matches a fixed allowlist of tags. `dl`, `dt`, `dd` and
 * `caption` were not in it. A definition list is how an abbreviations or
 * glossary section is written — "AE / Adverse Event", "MTD / Maximum Tolerated
 * Dose" — and it is exactly the shape an AI draft emits for one.
 *
 * With the tag unrecognised, the boot path takes the PLAIN-TEXT branch, and
 * `plainTextToHtml` escapes everything because "plain text has no markup by
 * definition". So the record's markup became visible body text: a filed
 * document that reads
 *
 *     <dl><dt>AE</dt><dd>Adverse Event</dd></dl>
 *
 * as a literal line of prose, angle brackets and all.
 *
 * ── Why nothing caught it ────────────────────────────────────────────────────
 * The gate compares the stored text against the parsed text and refuses rich
 * mode when they differ. Both sides ran through the same wrong branch:
 * `assessFidelity` also asks `looksLikeHtml(stored)`, so it compared the raw
 * string-with-tags against the parsed literal string-with-tags, they matched,
 * and it returned `lossy: false`. The gate did not fail to catch the
 * corruption — it AFFIRMED the corrupted content was faithful, because both
 * halves of the comparison agreed on the same mistake.
 *
 * That is the pathology this repo's working agreement names: a check that
 * cannot fail is worse than no check. This one reported safety it had not
 * established, on the record it exists to protect.
 */
import { describe, it, expect } from 'vitest';
import {
  looksLikeHtml,
  assessFidelity,
  htmlVisibleText,
  plainTextToHtml,
  normalizeForCompare,
} from '../roundTrip';

/** An abbreviations list — the most common definition list in a submission. */
const GLOSSARY =
  '<dl><dt>AE</dt><dd>Adverse Event</dd><dt>MTD</dt><dd>Maximum Tolerated Dose</dd></dl>';

/* assessFidelity now takes the PARSED TipTap document, not its text — it reads
   both the retained text and the structural signature off it. These text-axis
   tests build the trivial doc whose text is the string they used to pass; a
   plain paragraph carries no structure, so the structural signature is all-zero
   on both sides and only the text comparison governs, exactly as before. */
const asParagraph = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
});

describe('markup the record can hold is recognised as markup', () => {
  /* ONE TAG PER CASE. The first version used the whole GLOSSARY fixture for
     the `dl` case — which also contains `<dt>` — so removing `dl` from the
     allowlist left it green, matching on a different tag. A case that passes
     because of a tag it is not testing is not testing that tag. (Verified by
     removing each in turn.) */
  it.each([
    ['definition list', '<dl>'],
    ['definition term', '<dt>AE</dt>'],
    ['definition detail', '<dd>Adverse Event</dd>'],
    ['table caption', '<caption>Table 5-2. Subject and predicate</caption>'],
    ['figure', '<figure>'],
    ['figure caption', '<figcaption>Figure 1</figcaption>'],
  ])('%s', (_label, stored) => {
    /* Unrecognised, this took the plain-text branch and was ESCAPED into the
       record — the tags became visible prose in a filed document. */
    expect(looksLikeHtml(stored), 'treated as plain text, so its tags get escaped').toBe(true);
  });

  it('still refuses to treat a tag-shaped prose token as markup', () => {
    /* The reason the allowlist exists at all, and it must survive the fix:
       any-tag detection routed real prose through an HTML parse that swallowed
       the token. */
    expect(looksLikeHtml('temperature <critical> threshold exceeded')).toBe(false);
    expect(looksLikeHtml('the value is <= 10 and >= 2')).toBe(false);
  });
});

describe('the gate does not affirm a corruption it caused', () => {
  it('does not report a glossary as faithfully editable in rich mode', () => {
    /* THE TRAP THIS FILE IS REALLY FOR. Reproduce what the boot path did:
       unrecognised markup goes through plainTextToHtml, and the editor's parse
       of that yields the literal tag text back. */
    const asEditorSawIt = plainTextToHtml(GLOSSARY);
    expect(asEditorSawIt, 'the record markup was escaped into visible text').toContain('&lt;dl&gt;');

    /* The parsed text of that escaped HTML is the literal source string. Before
       the fix `assessFidelity` compared THAT against the raw stored string —
       also treated as plain text — and they matched, so it returned
       `lossy: false` and the editor opened in rich mode over corrupted content.

       Now `stored` is recognised as HTML, so the stored side is its VISIBLE
       text ("AE Adverse Event …") while the parse retained the literal tags.
       They differ, the verdict is lossy, and the editor drops to source mode
       where the raw string round-trips byte for byte. */
    // The editor's parse of the escaped HTML yields the literal tag text back.
    const verdict = assessFidelity(GLOSSARY, asParagraph(GLOSSARY));
    expect(
      verdict.lossy,
      'the gate called the escaped-tag rendering a faithful representation',
    ).toBe(true);
  });

  it('reads a glossary as the words a reviewer sees, not as its tags', () => {
    const seen = normalizeForCompare(htmlVisibleText(GLOSSARY));
    expect(seen).toContain('AE');
    expect(seen).toContain('Adverse Event');
    expect(seen).toContain('Maximum Tolerated Dose');
    // Not the markup.
    expect(seen).not.toContain('<dl>');
    expect(seen).not.toContain('dt');
  });

  it('still passes content the editor genuinely represents', () => {
    /* The working path must keep working: an ordinary paragraph whose parse
       retained every word is not lossy, and must still open in rich mode. */
    const stored = '<p>The device met the acceptance criterion.</p>';
    const parsed = 'The device met the acceptance criterion.';
    expect(assessFidelity(stored, asParagraph(parsed)).lossy).toBe(false);
  });

  it('still catches real text loss', () => {
    /* And the gate must still refuse when the parse actually dropped words —
       the property it was built for. */
    const stored = '<p>Kept.</p><script>dropped()</script>';
    expect(assessFidelity(stored, asParagraph('Kept.')).lossy).toBe(true);
  });
});

describe('the two allowlists agree', () => {
  it('the server parser recognises exactly what the client does', async () => {
    /* `contentLooksLikeHtml` in server/export/authoring-section-content.ts is
       the same decision on the export side, and its comment says to keep the
       two in agreement. They had drifted — which is how the same content could
       be escaped by one and parsed by the other, so the section a reviewer read
       on screen and the section in the exported DOCX disagreed about whether
       its own tags were text.

       Compared as SOURCE rather than by importing the server module: this suite
       runs in jsdom under the client config, and the server module pulls in
       node-html-parser and a chain of server-only imports. */
    const fs = await import('node:fs');
    const path = await import('node:path');
    const read = (p: string) =>
      fs.readFileSync(path.resolve(__dirname, p), 'utf8');

    const tagsOf = (src: string) => {
      const m = /<\\\/\?\(([a-z0-9|[\]{}\-^]+)\)/.exec(src.replace(/\s+/g, ''));
      return new Set((m?.[1] ?? '').split('|'));
    };
    const client = tagsOf(read('../roundTrip.ts'));
    const server = tagsOf(
      read('../../../../../../server/export/authoring-section-content.ts'),
    );
    expect(client.size, 'could not read the client allowlist').toBeGreaterThan(10);
    expect(server.size, 'could not read the server allowlist').toBeGreaterThan(10);
    expect([...server].sort()).toEqual([...client].sort());
  });
});
