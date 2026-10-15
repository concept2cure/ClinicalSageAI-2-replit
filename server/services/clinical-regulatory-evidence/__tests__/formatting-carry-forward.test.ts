import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { attributeMachineSpans, formattingCarryForwardSafety } from '../machine-attribution';
import { clauseSpans } from '../lineage-gate';
import { SpanLineageError, type LiveMachineSpan } from '../span-lineage.service';

const OLD_QA = '<h1>QA saved study report</h1>\n<p>This is stored test content for browser verification, not clinical evidence.</p>\n<table>\n<thead>\n<tr>\n<th>Field</th>\n<th>Stored value</th>\n</tr>\n</thead>\n<tbody><tr>\n<td>Purpose</td>\n<td>UI verification only</td>\n</tr>\n<tr>\n<td>Source</td>\n<td>Saved CSR output</td>\n</tr>\n</tbody></table>\n';
const FIGURE = '<img src="/api/authoring/images/file_1791929751823_ngzjr1" alt="qa-governed-figure">';
const NEW_QA = FIGURE + '<h1>QA saved study report</h1><p>This is stored test content for browser verification, not clinical evidence.</p><table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Field</p></th><th colspan="1" rowspan="1"><p>Stored value</p></th></tr><tr><td colspan="1" rowspan="1"><p>Purpose</p></td><td colspan="1" rowspan="1"><p>UI verification only</p></td></tr><tr><td colspan="1" rowspan="1"><p>Source</p></td><td colspan="1" rowspan="1"><p>Saved CSR output</p></td></tr></tbody></table><p></p>';
const TEXT = 'The primary endpoint was met at week twelve.';

function liveOf(content: string, accepted = false): LiveMachineSpan[] {
  return clauseSpans(content).map(span => ({
    charStart: span.charStart,
    charEnd: span.charEnd,
    spanTextSha256: createHash('sha256').update(span.text).digest('hex'),
    provenanceKind: accepted ? 'accepted_machine_draft' : 'machine_draft',
    machineAuthorId: 'workflow_import',
    assertedBy: accepted ? 'original-reviewer' : null,
    assertedAt: accepted ? new Date('2026-10-01T10:00:00Z') : null,
    signatureId: accepted ? 'original-signature' : null,
    createdBy: 'original-requester',
  }));
}

function carry(previousContent: string, content: string, accepted = false) {
  const options = { previousContent, content, accepted: [], live: liveOf(previousContent, accepted), actor: 'later-saver' };
  return attributeMachineSpans(clauseSpans(content), options);
}

function attributedText(content: string, result: ReturnType<typeof attributeMachineSpans>) {
  return result.map(span => content.slice(span.charStart, span.charEnd)).join(' ');
}

describe('format-only provenance carry-forward', () => {
  it('preserves the recorded unaccepted prose across the real figure/table normalization', () => {
    expect(OLD_QA).toHaveLength(323);
    expect(NEW_QA).toHaveLength(673);
    const result = carry(OLD_QA, NEW_QA);
    const machineText = attributedText(NEW_QA, result);
    expect(machineText).toContain('QA saved study report');
    expect(machineText).toContain('not clinical evidence.');
    expect(machineText).toContain('Saved CSR output');
    expect(machineText).not.toContain('<img');
    expect(result.every(span => span.machineAuthorId === 'workflow_import' && span.assertedBy === null && !span.inAcceptedText)).toBe(true);
    expect(result.every(span => span.createdBy === 'original-requester')).toBe(true);
    expect(result.every(span => span.charStart >= FIGURE.length)).toBe(true);
  });

  it('keeps normalized paragraph and table wrappers with the retained prose', () => {
    const result = carry(OLD_QA, NEW_QA);
    expect(result[0]?.charStart).toBe(FIGURE.length);
    expect(result.at(-1)?.charEnd).toBe(NEW_QA.length);
    expect(attributedText(NEW_QA, result)).toContain('colspan="1"');
  });

  it('preserves the original acceptor, time and signature without recording a fresh acceptance', () => {
    const result = carry(`<p>${TEXT}</p>`, `<p><strong>${TEXT}</strong></p>`, true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ assertedBy: 'original-reviewer', assertedAt: new Date('2026-10-01T10:00:00Z'), signatureId: 'original-signature', inAcceptedText: false });
  });

  it('does not carry an edited independent paragraph while preserving the untouched one', () => {
    const old = `<p>${TEXT}</p>\n\n<p>The reviewed dose was 100 mg.</p>`;
    const next = `<p><strong>${TEXT}</strong></p><p>The reviewed dose was 200 mg.</p>`;
    const text = attributedText(next, carry(old, next));
    expect(text).toContain(TEXT);
    expect(text).not.toContain('200 mg');
  });

  it('bounds repeated formatted clauses to the number previously attributed', () => {
    const old = `<p>${TEXT}</p>`;
    const next = `<p><b>${TEXT}</b></p><p><b>${TEXT}</b></p>`;
    expect(carry(old, next)).toHaveLength(1);
  });

  it('preserves current behavior when no trusted previous content is supplied', () => {
    const old = `<p>${TEXT}</p>`;
    const next = `<p><b>${TEXT}</b></p>`;
    expect(attributeMachineSpans(clauseSpans(next), { content: next, accepted: [], live: liveOf(old), actor: 'later-saver' })).toEqual([]);
  });

  it('carries the original usage and measured confidence without inventing new values', () => {
    const previousContent = `<p>${TEXT}</p>`;
    const content = `<p><b>${TEXT}</b></p>`;
    const options = { previousContent, content, accepted: [], actor: 'later-saver',
      live: liveOf(previousContent).map(span => ({ ...span, usage: 'derived' as const, confidence: 0.72 })) };
    expect(attributeMachineSpans(clauseSpans(content), options)[0]).toMatchObject({ usage: 'derived', confidence: 0.72 });
  });

  it('attributes a whole-machine draft remainder after partially retaining an accepted span', () => {
    const previousContent = `<p>${TEXT}</p>`;
    const content = `<p><b>${TEXT}</b> Newly generated safety findings require review.</p>`;
    const options = { previousContent, content, accepted: [], live: liveOf(previousContent, true), actor: 'later-saver', machineDraft: { authorId: 'ana' } };
    const result = attributeMachineSpans(clauseSpans(content), options);
    expect(result.some(span => span.machineAuthorId === 'workflow_import' && span.assertedBy === 'original-reviewer')).toBe(true);
    expect(result.filter(span => span.machineAuthorId === 'ana').map(span => span.spanText).join(' ')).toContain('Newly generated safety findings require review.');
    expect(result.filter(span => span.machineAuthorId === 'ana').every(span => span.assertedBy === null)).toBe(true);
  });

  it('keeps a verified fresh acceptance ahead of unaccepted formatting carry', () => {
    const previousContent = `<p>${TEXT}</p>`;
    const content = `<p><b>${TEXT}</b></p>`;
    const options = { previousContent, content, live: liveOf(previousContent), actor: 'later-saver', accepted: [{ authorId: 'ana', text: TEXT }], recordOccurrences: () => 1 };
    expect(attributeMachineSpans(clauseSpans(content), options)).toMatchObject([{ machineAuthorId: 'ana', assertedBy: 'later-saver', inAcceptedText: true }]);
  });

  it('retains exact-raw usage and unknown confidence when formatting is not needed', () => {
    const content = `<p>${TEXT}</p>`;
    const options = { content, accepted: [], actor: 'later-saver', live: liveOf(content).map(span => ({ ...span, usage: 'derived' as const, confidence: null })) };
    expect(attributeMachineSpans(clauseSpans(content), options)[0]).toMatchObject({ usage: 'derived', confidence: null });
  });
});

describe('new acceptance after an independently retained formatted paragraph', () => {
  it('credits genuinely accepted new prose in the remainder of a combined HTML clause', () => {
    const previousContent = `<p>${TEXT}</p>`;
    const fresh = 'The new safety finding requires independent clinical review.';
    const content = `<p><strong>${TEXT}</strong></p><p>${fresh}</p>`;
    const options = { previousContent, content, live: liveOf(previousContent, true), actor: 'later-saver',
      accepted: [{ authorId: 'ana', text: `<p>${fresh}</p>` }], recordOccurrences: () => 1 };
    const result = attributeMachineSpans(clauseSpans(content), options);
    expect(result.filter(span => span.inAcceptedText)).toHaveLength(1);
    expect(result.find(span => span.inAcceptedText)).toMatchObject({ machineAuthorId: 'ana', assertedBy: 'later-saver' });
    expect(result.find(span => span.machineAuthorId === 'workflow_import')).toMatchObject({ assertedBy: 'original-reviewer', inAcceptedText: false });
  });

  it('keeps record and reaccepted occurrence bounds after deriving that remainder', () => {
    const previousContent = `<p>${TEXT}</p>`;
    const content = `<p><strong>${TEXT}</strong></p><p>${TEXT}</p>`;
    const options = { previousContent, content, live: liveOf(previousContent, true), actor: 'later-saver', accepted: [{ authorId: 'ana', text: TEXT }], recordOccurrences: () => 1 };
    expect(attributeMachineSpans(clauseSpans(content), options).filter(span => span.inAcceptedText)).toEqual([]);
  });
});

describe('formatting carry-forward proves the trusted prior content', () => {
  it('throws on a previous span hash that does not describe the trusted prior text', () => {
    const previousContent = `<p>${TEXT}</p>`;
    const options = { previousContent, content: previousContent, accepted: [], live: [{ ...liveOf(previousContent)[0], spanTextSha256: '0'.repeat(64) }], actor: 'later-saver' };
    expect(() => attributeMachineSpans(clauseSpans(previousContent), options)).toThrow(SpanLineageError);
  });

  it('throws on impossible previous offsets instead of crediting the current saver', () => {
    const previousContent = `<p>${TEXT}</p>`;
    const options = { previousContent, content: previousContent, accepted: [], live: [{ ...liveOf(previousContent)[0], charEnd: previousContent.length + 1 }], actor: 'later-saver' };
    expect(() => attributeMachineSpans(clauseSpans(previousContent), options)).toThrow(SpanLineageError);
  });

  it.each([
    ['case', 'The Primary endpoint was met at week twelve.'],
    ['decimal', 'The dose was 10.6 mg/kg.'],
    ['scientific operator', 'The dose was 10^5 mg/kg.'],
  ])('does not treat changed %s characters as formatting', (_kind, changed) => {
    const original = changed.startsWith('The dose') ? 'The dose was 10^6 mg/kg.' : TEXT;
    expect(carry(`<p>${original}</p>`, `<p><b>${changed}</b></p>`)).toEqual([]);
  });

  it.each([
    `<p><xmp><b>${TEXT}</b></xmp></p>`,
    `<p><b title="Reviewer added statement">${TEXT}</b></p>`,
    `<p><b"malformed">${TEXT}</b></p>`,
    `<figure><p><b>${TEXT}</b></p></figure>`,
  ])('refuses unsafe reader/printing markup in %s', next => {
    expect(carry(`<p>${TEXT}</p>`, next)).toEqual([]);
  });

  it('does not collapse significant whitespace in preformatted content', () => {
    expect(carry('<pre>Dose\n100 mg</pre>', '<pre><b>Dose 100 mg</b></pre>')).toEqual([]);
  });
});

describe('formatting preserves prose across canonical presentation and entities', () => {
  it('retains prose under the canonical combined paragraph presentation declarations', () => {
    const next = `<p style="text-align: left; margin-top: 0px;"><strong>${TEXT}</strong></p>`;
    expect(attributedText(next, carry(`<p>${TEXT}</p>`, next))).toContain(TEXT);
    expect(formattingCarryForwardSafety(`<p>${TEXT}</p>`, next)).toEqual({ safe: true });
  });

  it('keeps both sides of an inserted image without attributing its caption to the original author', () => {
    const old = '<p>Safety signals were monitored.</p>';
    const next = `<p><strong>Safety signals were ${FIGURE}monitored.</strong></p>`;
    const result = carry(old, next);
    expect(attributedText(next, result)).toContain('Safety signals were');
    expect(attributedText(next, result)).toContain('monitored.');
    expect(attributedText(next, result)).not.toContain('qa-governed-figure');
    expect(result.every(span => !span.inAcceptedText && span.assertedBy === null)).toBe(true);
  });

  it('decodes equivalent scientific entities exactly once with raw offsets retained', () => {
    const old = '<p>Storage at 25 °C; dose ≤ 10 µg; literal &amp;le; is a label.</p>';
    const next = '<p><b>Storage at 25 &deg;C; dose &le; 10 &micro;g; literal &amp;le; is a label.</b></p>';
    const result = carry(old, next);
    expect(attributedText(next, result)).toContain('&micro;g');
    expect(attributedText(next, result)).toContain('literal &amp;le;');
    expect(result.every(span => next.slice(span.charStart, span.charEnd) === span.spanText)).toBe(true);
  });

  it('does not equate an unknown uppercase entity with the scientific character', () => {
    expect(carry('<p>Dose ≤ 10 µg.</p>', '<p><b>Dose &LE; 10 &Micro;g.</b></p>')).toEqual([]);
  });

  it.each([
    ['hidden presentation', `<p style="display: none">${TEXT}</p>`],
    ['printing annotation', `<p><b title="Different conclusion">${TEXT}</b></p>`],
    ['source mode', `<figure><p>${TEXT}</p></figure>`],
    ['malformed markup', `<p><b"malformed">${TEXT}</b></p>`],
  ])('discloses unsafe %s instead of declaring formatting verified', (_name, next) => {
    expect(formattingCarryForwardSafety(`<p>${TEXT}</p>`, next).safe).toBe(false);
  });
});

describe('table formatting preserves cell identity', () => {
  const old = '<table><tr><th>AE</th><th>Dose</th></tr><tr><td>None recorded</td><td>100 mg</td></tr></table>';

  it('retains unchanged exact cells when one other cell changes', () => {
    const next = '<table><tbody><tr><th colspan="1"><p>AE</p></th><th><p>Dose</p></th></tr><tr><td><p>None recorded</p></td><td><p>200 mg</p></td></tr></tbody></table>';
    const text = attributedText(next, carry(old, next));
    expect(text).toContain('AE');
    expect(text).toContain('None recorded');
    expect(text).not.toContain('200 mg');
  });

  it.each([
    '<table><tr><td><p>AE</p></td><th><p>Dose</p></th></tr><tr><td><p>None recorded</p></td><td><p>100 mg</p></td></tr></table>',
    '<table><tr><th rowspan="2"><p>AE</p></th><th><p>Dose</p></th></tr><tr><td><p>None recorded</p></td><td><p>100 mg</p></td></tr></table>',
    '<table><tr><th><p>AE</p></th><th><p>Dose</p></th></tr><tr><td colspan="2"><p>None recorded 100 mg</p></td></tr></table>',
  ])('does not flatten changed cell/header/span associations', next => {
    expect(carry(old, next)).toEqual([]);
  });

  it('does not carry a short old cell label inside a changed longer value', () => {
    const next = '<table><tr><th><p>AE1</p></th><th><p>Dose</p></th></tr><tr><td><p>None recorded</p></td><td><p>100 mg</p></td></tr></table>';
    expect(attributedText(next, carry(old, next))).not.toContain('AE1');
  });

  it('refuses changed header text rather than retaining data under a different association', () => {
    const next = '<table><tr><th><p>AE</p></th><th><p>Other dose</p></th></tr><tr><td><p>None recorded</p></td><td><p>100 mg</p></td></tr></table>';
    expect(carry(old, next)).toEqual([]);
  });

  it('refuses reordered cells even when the same words remain in the table', () => {
    const next = '<table><tr><th><p>AE</p></th><th><p>Dose</p></th></tr><tr><td><p>100 mg</p></td><td><p>None recorded</p></td></tr></table>';
    expect(carry(old, next)).toEqual([]);
  });

  it('refuses reordered data rows even when their full text remains unchanged', () => {
    const previous = '<table><tr><th>Finding</th><th>Dose</th></tr><tr><td>None recorded</td><td>100 mg</td></tr><tr><td>Confirmed finding</td><td>200 mg</td></tr></table>';
    const next = '<table><tr><th><p>Finding</p></th><th><p>Dose</p></th></tr><tr><td><p>Confirmed finding</p></td><td><p>200 mg</p></td></tr><tr><td><p>None recorded</p></td><td><p>100 mg</p></td></tr></table>';
    expect(carry(previous, next)).toEqual([]);
  });

  it.each([
    ['100 mg', '100 mg/kg'],
    ['Safety', 'Safety not demonstrated'],
  ])('does not retain the old %s substring inside a changed full cell value', (previousValue, currentValue) => {
    const previous = `<table><tr><th>Stored value</th><th>Purpose</th></tr><tr><td>${previousValue}</td><td>Review required</td></tr></table>`;
    const next = `<table><tr><th><p>Stored value</p></th><th><p>Purpose</p></th></tr><tr><td><p>${currentValue}</p></td><td><p>Review required</p></td></tr></table>`;
    const result = carry(previous, next);
    const valuePosition = next.indexOf(currentValue);
    expect(result.some(span => span.charStart <= valuePosition && span.charEnd > valuePosition)).toBe(false);
    expect(attributedText(next, result)).toContain('Review required');
  });
});
