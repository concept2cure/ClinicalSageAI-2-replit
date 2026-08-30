// @vitest-environment jsdom
/**
 * The fidelity gate now sees STRUCTURE, not only text.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * roundTrip.ts refused rich mode only when the stored TEXT and the parsed text
 * differed. Text equality is the wrong invariant for a document whose STRUCTURE
 * is part of the record, and it affirmed a corruption it could not see TWICE,
 * both confirmed in production:
 *
 *   INCIDENT 1 — a stored <h4> came back an <h3> (parser clamped Math.min(3,…)):
 *     every character preserved, the hierarchy demoted one rank.
 *   INCIDENT 2 — a stored <caption> was reparented into a table DATA CELL (no
 *     caption node in the schema): every character preserved, a caption promoted
 *     to data in a filed document.
 *
 * The gate saw identical text and allowed rich mode; the next save would write
 * the demoted structure into the governed record. assessFidelity now also
 * compares a STRUCTURAL SIGNATURE — counts of the constructs ProseMirror keeps
 * as semantics — and ORs any drift into the verdict.
 *
 * ── How these fixtures are built ─────────────────────────────────────────────
 * The must-catch incident cases parse the stored HTML with the RECOVERED PRE-FIX
 * schema (headings [1,2,3]; a plain Table node with no caption attribute) so the
 * loss actually happens, exactly as it did in production. The must-NOT-flag
 * cases parse with the SHIPPED schema and prove the fix is not refused, and that
 * the normalization the module's docblock protects (div→p, b→strong, a merged
 * cell) leaves the signature invariant. Nothing here is simulated — every case
 * runs generateJSON over real extensions, which is the parse the boot gate runs.
 */
import { describe, it, expect } from 'vitest';
import { generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { CaptionNumbering, CaptionedTable } from '../captionNumbering';
import { AuthoringImage } from '../imageNode';
import { assessFidelity, editorHeldDoc } from '../roundTrip';

/* The parser as it stood for each incident. Kept minimal but REAL — the same
   node set, with the one property that was wrong at the time. */
const PREFIX_HEADINGS = [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Superscript, Subscript];
const PREFIX_TABLE = [StarterKit, TableKit.configure({}), Superscript, Subscript]; // kit's plain Table, no caption node

/* The shipped schema, in the shape the boot path configures it: TableKit's own
   Table is OFF and the real CaptionedTable (which reads <caption> into
   attrs.caption on parse) replaces it — exactly RichSectionEditor's extensions.
   Using the bare kit Table here would reproduce incident 2, not the fix. */
const SHIPPED = [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5] } }),
  TableKit.configure({ table: false }),
  CaptionedTable.configure({ resizable: false }),
  AuthoringImage,
  CaptionNumbering,
  Superscript,
  Subscript,
];

const parse = (html: string, exts: Parameters<typeof generateJSON>[1]) => generateJSON(html, exts);

describe('structural fidelity — must catch (text is identical; only structure drifts)', () => {
  it('INCIDENT 1: a heading flattened by the pre-fix schema', () => {
    const stored = '<h4>Pharmacokinetic parameters</h4><p>Values were within range.</p>';
    const v = assessFidelity(stored, parse(stored, PREFIX_HEADINGS));
    // The text side cannot see it — every word survives.
    expect(v.storedText).toBe(v.parsedText);
    // The structural side does: [4] on the record, [] after the parse demoted it.
    expect(v.storedSignature.headingLevels).toEqual([4]);
    expect(v.parsedSignature.headingLevels).toEqual([]);
    expect(v.structuralDrift).toContain('headingLevels');
    expect(v.lossy).toBe(true);
  });

  it('INCIDENT 2: a caption reparented into a data cell by the pre-fix schema', () => {
    const stored =
      '<table><caption>Summary of adverse events</caption>' +
      '<tbody><tr><th>Arm</th><th>N</th></tr><tr><td>Active</td><td>120</td></tr></tbody></table>';
    const v = assessFidelity(stored, parse(stored, PREFIX_TABLE));
    expect(v.storedText).toBe(v.parsedText); // caption words survive, in a cell
    expect(v.storedSignature.captions).toBe(1);
    expect(v.parsedSignature.captions).toBe(0);
    // Row/cell counts also move as the caption becomes a row of cells.
    expect(v.structuralDrift).toEqual(expect.arrayContaining(['captions']));
    expect(v.lossy).toBe(true);
  });

  it('LIVE #1: an <h6> — above the schema ceiling — silently becomes a paragraph', () => {
    const stored = '<h6>Note on assay drift</h6>';
    const v = assessFidelity(stored, parse(stored, SHIPPED));
    expect(v.storedText).toBe(v.parsedText);
    expect(v.storedSignature.headingLevels).toEqual([6]);
    expect(v.parsedSignature.headingLevels).toEqual([]); // no rule for h6 → paragraph
    expect(v.lossy).toBe(true);
  });

  it('LIVE #2: a definition list — no schema node — is flagged', () => {
    const stored = '<dl><dt>AE</dt><dd>Adverse Event</dd><dt>MTD</dt><dd>Maximum Tolerated Dose</dd></dl>';
    const v = assessFidelity(stored, parse(stored, SHIPPED));
    expect(v.storedSignature.defItems).toBe(4);
    expect(v.parsedSignature.defItems).toBe(0); // structurally always 0
    expect(v.structuralDrift).toContain('defItems');
    expect(v.lossy).toBe(true);
  });

  it('LIVE #3: a header row written with <td> in <thead> is demoted to data', () => {
    const stored =
      '<table><thead><tr><td>Arm</td><td>N</td></tr></thead>' +
      '<tbody><tr><td>Active</td><td>120</td></tr></tbody></table>';
    const v = assessFidelity(stored, parse(stored, SHIPPED));
    // th-or-in-thead on the record; the parse kept them as body cells.
    expect(v.storedSignature.headerCells).toBe(2);
    expect(v.parsedSignature.headerCells).toBe(0);
    expect(v.structuralDrift).toContain('headerCells');
    expect(v.lossy).toBe(true);
  });
});

describe('structural fidelity — must NOT flag (the fix, and legitimate normalization)', () => {
  it('INCIDENT 1 fixed: an <h4> round-trips under the shipped schema', () => {
    const stored = '<h4>Pharmacokinetic parameters</h4>';
    const v = assessFidelity(stored, parse(stored, SHIPPED));
    expect(v.storedSignature.headingLevels).toEqual([4]);
    expect(v.parsedSignature.headingLevels).toEqual([4]);
    expect(v.structuralDrift).toEqual([]);
    expect(v.lossy).toBe(false);
  });

  it('INCIDENT 2 fixed: a captioned table stays in rich mode', () => {
    const stored =
      '<table><caption>Summary of adverse events</caption>' +
      '<tbody><tr><th>Arm</th><th>N</th></tr><tr><td>Active</td><td>120</td></tr></tbody></table>';
    const v = assessFidelity(stored, parse(stored, SHIPPED));
    // The shipped CaptionedTable reads the caption into attrs.caption; here the
    // kit Table also preserves table geometry. The point: no structural drift on
    // a legitimate table, so it is NOT refused to source mode.
    expect(v.structuralDrift).toEqual([]);
    expect(v.lossy).toBe(false);
  });

  it('div→p and b→strong do not trip the gate', () => {
    const stored = '<div>The device met <b>the</b> acceptance criterion.</div>';
    const v = assessFidelity(stored, parse(stored, SHIPPED));
    expect(v.structuralDrift).toEqual([]);
    expect(v.lossy).toBe(false);
  });

  it('the execCommand provenance strip (1 div, 3 spans → paragraphs) is not refused', () => {
    // Exactly the legacy shape a block/paragraph tag-count check would have
    // false-flagged. The semantic-only signature leaves it invariant.
    const stored = '<div class="dc-prov"><span>CSR 2.7.3</span><span>H</span><span>a1b2c3</span></div>';
    const v = assessFidelity(stored, parse(stored, SHIPPED));
    expect(v.storedSignature).toMatchObject({ tables: 0, headingLevels: [], captions: 0, defItems: 0 });
    expect(v.structuralDrift).toEqual([]);
    expect(v.lossy).toBe(false);
  });

  it('a colspan cell counts as ONE declared cell on both sides — merged tables are not refused', () => {
    const stored =
      '<table><tbody><tr><td colspan="2">Combined</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>';
    const v = assessFidelity(stored, parse(stored, SHIPPED));
    // 3 declared cells on the record; must be 3 tableCell NODES, not the 4-slot
    // expanded grid. If this ever reads 4, the signature is counting the grid.
    expect(v.storedSignature.cells).toBe(3);
    expect(v.parsedSignature.cells).toBe(3);
    expect(v.structuralDrift).toEqual([]);
    expect(v.lossy).toBe(false);
  });
});

describe('structural fidelity — what the editor will ACTUALLY hold (fixTables)', () => {
  /* generateJSON does not run plugins; the live Editor runs fixTables on first
     edit, padding a ragged table and clamping rowspan overflow into the record.
     editorHeldDoc models that, so the signature refuses a table the editor
     would rewrite. Passing the RAW generateJSON doc would miss all of these —
     which is exactly the blind spot an adversarial sweep found in the first cut. */
  /* Mirror the boot composition: assess against the held doc, then OR the
     table-rewrite boolean in exactly as the boot path does. */
  const heldVerdict = (stored: string) => {
    const held = editorHeldDoc(parse(stored, SHIPPED), SHIPPED);
    const base = assessFidelity(stored, held.doc);
    return held.tablesRewritten && !base.lossy
      ? { ...base, lossy: true, structuralDrift: ['tables'] }
      : base;
  };

  it('a ragged table (a short row) is refused — the editor would pad it', () => {
    const stored = '<table><tbody><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td></tr></tbody></table>';
    // Raw parse keeps 4 declared cells and would pass; the held doc has 6.
    const raw = assessFidelity(stored, parse(stored, SHIPPED));
    expect(raw.structuralDrift).toEqual([]); // proves the raw parse is blind
    const v = heldVerdict(stored);
    expect(v.storedSignature.cells).toBe(4);
    expect(v.parsedSignature.cells).toBeGreaterThan(4); // fixTables fabricated cells
    expect(v.structuralDrift).toContain('cells');
    expect(v.lossy).toBe(true);
  });

  it('a rowspan that overflows the table is refused — the editor would clamp it', () => {
    const stored = '<table><tbody><tr><td rowspan="5">tall</td><td>x</td></tr><tr><td>y</td></tr></tbody></table>';
    const v = heldVerdict(stored);
    // fixTables clamps rowspan 5->2; the change surfaces as structural drift.
    expect(v.lossy).toBe(true);
    expect(v.structuralDrift.length).toBeGreaterThan(0);
  });

  it('a well-formed rectangular table is NOT refused — fixTables leaves it alone', () => {
    const stored = '<table><tbody><tr><th>Arm</th><th>N</th></tr><tr><td>Active</td><td>120</td></tr></tbody></table>';
    const v = heldVerdict(stored);
    expect(v.structuralDrift).toEqual([]);
    expect(v.lossy).toBe(false);
  });

  it('a merged (colspan) table is NOT refused — declared cells agree, no fabrication', () => {
    const stored = '<table><tbody><tr><td colspan="2">Combined</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>';
    const v = heldVerdict(stored);
    expect(v.structuralDrift).toEqual([]);
    expect(v.lossy).toBe(false);
  });
});

describe('structural fidelity — a dropped image is caught', () => {
  it('a srcless <img> (its alt caption lost) is flagged: any <img> is counted', () => {
    // AuthoringImage parses img[src] only, so a srcless img emits no node and is
    // dropped whole — alt included. Counting any <img> on the DOM side sees it.
    const stored = '<p>Body.</p><img alt="Figure 7. Dissolution profile at 37C">';
    const v = assessFidelity(stored, parse(stored, SHIPPED));
    expect(v.storedSignature.images).toBe(1);
    expect(v.parsedSignature.images).toBe(0);
    expect(v.structuralDrift).toContain('images');
    expect(v.lossy).toBe(true);
  });

  it('a normal img[src] still round-trips — not a false positive', () => {
    const stored = '<img src="/api/authoring/images/77" alt="Chromatogram">';
    const v = assessFidelity(stored, parse(stored, SHIPPED));
    expect(v.storedSignature.images).toBe(1);
    expect(v.parsedSignature.images).toBe(1);
    expect(v.structuralDrift).toEqual([]);
    expect(v.lossy).toBe(false);
  });
});
