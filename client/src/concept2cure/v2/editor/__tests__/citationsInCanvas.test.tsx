// @vitest-environment jsdom
/**
 * Citations in the canvas: inserted by picking a SOURCE, stored as that
 * source's identity, displayed as the number its position gives it.
 *
 * ── What this pins ──────────────────────────────────────────────────────────
 * 1. THE RIBBON CAN INSERT ONE, and what it writes into the governed record is
 *    the source's id and the author's pinpoint — never the number on screen. A
 *    stored "[3]" would be the defect this feature exists to prevent.
 * 2. A CITATION APPEARING EARLIER RENUMBERS THE ONES AFTER IT while the stored
 *    content is byte-identical. That is the entire value of the feature, and it
 *    is asserted here the way it is asserted server-side: the same stored
 *    string, rendered against two different documents.
 * 3. A CITATION WHOSE SOURCE IS GONE SAYS SO, in place, in words — not as a
 *    plausible-looking wrong number, not as a gap, and taking no number at all.
 * 4. THE FIDELITY GATE STILL LETS THE SECTION BE EDITED. A node contributing no
 *    text would drop every section holding a citation into raw source mode —
 *    the capability would disable the editor it ships in.
 * 5. THE OTHER "Cite" BUTTON IS GONE. A control labelled "Cite" that only asks
 *    the assistant a question, sitting beside one that really cites, is a writer
 *    believing a claim is sourced when the filed document has no record of it.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { RichSectionEditor, type RichSectionEditorHandle } from '../RichSectionEditor';
import { CITATION_MISSING_TEXT } from '@shared/authoring/citations';

afterEach(cleanup);

const CSR = '41';
const PROTOCOL = '77';

const LIBRARY = [
  { id: CSR, title: 'CTP-201 Clinical Study Report' },
  { id: PROTOCOL, title: 'CTP-201-301 Protocol' },
];

const base = {
  onSave: vi.fn(async () => {}),
  chrome: 'full' as const,
  ariaLabel: 'Section content',
};

/** Stored content citing the CSR then the protocol. No number anywhere in it. */
const STORED =
  `<p>Met<a data-cite="${CSR}" data-cite-locator="p. 142">CTP-201 Clinical Study Report</a>` +
  ` per<a data-cite="${PROTOCOL}">CTP-201-301 Protocol</a>.</p>`;

const canvasText = () => document.querySelector('.tiptap')?.textContent ?? '';

describe('inserting a citation', () => {
  it('stores the source’s identity and the pinpoint, not the number on screen', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    render(
      <RichSectionEditor
        {...base}
        ref={ref}
        value="<p>The endpoint was met </p>"
        citationsApi={{ sources: LIBRARY, precedingSourceIds: [] }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^cite a source/i }));
    fireEvent.change(screen.getByLabelText(/source to cite/i), { target: { value: PROTOCOL } });
    fireEvent.change(screen.getByLabelText(/page or table/i), { target: { value: 'p. 12' } });
    fireEvent.click(screen.getByRole('button', { name: /^insert$/i }));

    const stored = ref.current!.getContent();
    expect(stored, 'nothing was inserted').toContain('data-cite');
    expect(stored).toContain(`data-cite="${PROTOCOL}"`);
    // The pinpoint IS authored content and is stored.
    expect(stored).toContain('data-cite-locator="p. 12"');
    // The number is not in the record at all — it is a rendering.
    expect(stored).not.toMatch(/\[\d+/);
    // The canvas shows the number this document's reference list gives it.
    expect(canvasText()).toContain('[1, p. 12]');
  });

  it('records the section→source link the platform already keeps', () => {
    const onCite = vi.fn();
    render(
      <RichSectionEditor
        {...base}
        value="<p>x</p>"
        citationsApi={{ sources: LIBRARY, precedingSourceIds: [], onCite }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^cite a source/i }));
    fireEvent.change(screen.getByLabelText(/source to cite/i), { target: { value: CSR } });
    fireEvent.click(screen.getByRole('button', { name: /^insert$/i }));

    expect(onCite).toHaveBeenCalledWith(CSR);
  });

  it('offers the document’s sources to pick from, and no field to type a number in', () => {
    render(
      <RichSectionEditor
        {...base}
        value="<p>x</p>"
        citationsApi={{ sources: LIBRARY, precedingSourceIds: [] }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^cite a source/i }));

    const picker = screen.getByLabelText(/source to cite/i) as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).toEqual([
      'CTP-201 Clinical Study Report',
      'CTP-201-301 Protocol',
    ]);
    /* A typed number is exactly the unmanaged text this replaces. */
    expect(screen.queryByLabelText(/citation number/i)).toBeNull();
  });

  it('says so plainly when the document has no sources yet', () => {
    render(
      <RichSectionEditor
        {...base}
        value="<p>x</p>"
        citationsApi={{ sources: [], precedingSourceIds: [] }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^cite a source/i }));
    expect(screen.getByText(/no sources are available to this document yet/i)).toBeTruthy();
  });

  it('hides the capability entirely when the host supplies no library', () => {
    render(<RichSectionEditor {...base} value="<p>x</p>" />);
    expect(screen.queryByRole('button', { name: /^cite a source/i })).toBeNull();
  });
});

describe('numbering in the canvas', () => {
  it('numbers by position, in reading order', () => {
    render(
      <RichSectionEditor
        {...base}
        value={STORED}
        citationsApi={{ sources: LIBRARY, precedingSourceIds: [] }}
      />,
    );
    expect(canvasText()).toContain('[1, p. 142]');
    expect(canvasText()).toContain('[2]');
  });

  it('A CITATION APPEARING EARLIER RENUMBERS THIS ONE, with the stored content untouched', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    const { rerender } = render(
      <RichSectionEditor
        {...base}
        ref={ref}
        value={STORED}
        citationsApi={{ sources: LIBRARY, precedingSourceIds: [] }}
      />,
    );
    expect(canvasText()).toContain('[1, p. 142]');
    const contentBefore = ref.current!.getContent();

    /* Someone cites the protocol in a section ABOVE this one. No edit is made
       here; only the document around this section changed. */
    rerender(
      <RichSectionEditor
        {...base}
        ref={ref}
        value={STORED}
        citationsApi={{ sources: LIBRARY, precedingSourceIds: [PROTOCOL] }}
      />,
    );

    expect(canvasText()).toContain('[2, p. 142]');
    expect(canvasText()).not.toContain('[1, p. 142]');

    /* THE HALF THAT MAKES IT SAFE: the record did not move. A repaint is a
       rendering, not an edit — it must not mint a revision, dirty the section
       or rewrite one character of a Part 11 record. */
    expect(ref.current!.getContent()).toBe(contentBefore);
    expect(contentBefore).toContain(`data-cite="${CSR}"`);
  });

  it('never shows the cached source name in place of the number', () => {
    render(
      <RichSectionEditor
        {...base}
        value={STORED}
        citationsApi={{ sources: LIBRARY, precedingSourceIds: [] }}
      />,
    );
    const marker = document.querySelector('.rse-cite');
    expect(marker?.textContent).toBe('[1, p. 142]');
    // The name lives in the stored cache, and is not what the canvas prints.
    expect(marker?.textContent).not.toContain('CTP-201');
  });

  it('says an unknown source is unknown, in place, and gives it no number', () => {
    render(
      <RichSectionEditor
        {...base}
        value={`<p>Claimed<a data-cite="99999">Deleted source</a> and<a data-cite="${CSR}">csr</a>.</p>`}
        citationsApi={{ sources: LIBRARY, precedingSourceIds: [] }}
      />,
    );
    expect(canvasText()).toContain(CITATION_MISSING_TEXT);
    expect(canvasText()).not.toContain('Deleted source');
    expect(document.querySelector('.rse-cite[data-missing="1"]')).toBeTruthy();
    /* The resolvable citation beside it still takes the FIRST number — a broken
       citation reserves nothing, so the reference list has no gap. */
    expect(canvasText()).toContain('[1]');
    expect(canvasText()).not.toContain('[2]');
  });
});

describe('the “Cite” label that cited nothing', () => {
  it('the assistant control no longer claims to cite', () => {
    render(<RichSectionEditor {...base} value="<p>x</p>" onAsk={vi.fn()} />);
    /* It asks AnA a question; it creates no citation, stores nothing and puts
       nothing in the reference list. With no citation capability mounted, no
       control on this ribbon may be labelled "Cite". */
    expect(screen.queryByRole('button', { name: /^cite$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /ask.*source/i })).toBeTruthy();
  });

  it('asks for a source instead of claiming to have cited one', () => {
    const onAsk = vi.fn();
    render(<RichSectionEditor {...base} value="<p>The endpoint was met.</p>" onAsk={onAsk} />);
    fireEvent.click(screen.getByRole('button', { name: /ask.*source/i }));
    // Nothing selected, so nothing is asked — and nothing is claimed either.
    expect(onAsk).not.toHaveBeenCalledWith(expect.stringContaining('Cite this claim'));
  });
});

describe('the fidelity gate', () => {
  it('still allows rich editing of a section that holds a citation', () => {
    render(
      <RichSectionEditor
        {...base}
        value={STORED}
        citationsApi={{ sources: LIBRARY, precedingSourceIds: [] }}
      />,
    );
    /* Source mode renders a raw textarea instead of the canvas. If the parse
       looked lossy — which it does the moment the citation contributes no text
       to the comparison — every section holding a citation would lose rich
       editing, and the ribbon control above would be unreachable. */
    expect(document.querySelector('.rse-source')).toBeNull();
    expect(document.querySelector('.tiptap')).toBeTruthy();
  });

  it('round-trips through parse, serialization and the governed save path', async () => {
    let saved = '';
    const ref = React.createRef<RichSectionEditorHandle>();
    render(
      <RichSectionEditor
        {...base}
        ref={ref}
        value={STORED}
        onSave={async (s: string) => {
          saved = s;
        }}
        citationsApi={{ sources: LIBRARY, precedingSourceIds: [] }}
      />,
    );

    /* Add a second citation of the CSR, then save: the write must carry every
       citation — the ones that came in from the store and survived the parse,
       and the new one. */
    fireEvent.click(screen.getByRole('button', { name: /^cite a source/i }));
    fireEvent.change(screen.getByLabelText(/source to cite/i), { target: { value: CSR } });
    fireEvent.change(screen.getByLabelText(/page or table/i), { target: { value: 'Table 8' } });
    fireEvent.click(screen.getByRole('button', { name: /^insert$/i }));
    await ref.current!.save();

    expect(saved).toContain(`data-cite="${CSR}"`);
    expect(saved).toContain('data-cite-locator="p. 142"');
    expect(saved).toContain('data-cite-locator="Table 8"');
    expect(saved).toContain(`data-cite="${PROTOCOL}"`);
    // And still no number in the record.
    expect(saved).not.toMatch(/\[\d+/);
  });
});
