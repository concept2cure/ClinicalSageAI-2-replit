import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  runPythonScriptIsolated,
  runDocxXmlSurgeryIsolated,
  runDocxValidateIsolated,
} from '../../services/compute/scriptWorker';

// These suites need python-docx + lxml on the runner (ships in the services/
// image). Probe once and skip when absent.
const docxStackAvailable = await (async () => {
  try {
    const probe = await runPythonScriptIsolated({ code: 'import docx, lxml.etree' });
    return probe.ok;
  } catch {
    return false;
  }
})();

// Build a source .docx (bold run + justified heading + placeholder) in the
// sandbox so no JS docx dependency is needed.
async function buildSourceDocx(): Promise<Buffer> {
  const built = await runPythonScriptIsolated({
    code: [
      'from docx import Document',
      'from docx.enum.text import WD_ALIGN_PARAGRAPH',
      'd = Document()',
      "h = d.add_heading('10.3 Statistical Methods', level=2)",
      'h.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY',
      'p = d.add_paragraph()',
      "r = p.add_run('Prepared for {{SPONSOR}} '); r.bold = True",
      "p.add_run('confidential.')",
      "d.save('source.docx')",
    ].join('\n'),
  });
  expect(built.ok).toBe(true);
  return Buffer.from(built.outputFiles['source.docx'] as string, 'base64');
}

describe.skipIf(!docxStackAvailable)('surgical_docx_xml_edit (raw OOXML surgery)', () => {
  it('inserts paragraphs inheriting anchor formatting and validates', async () => {
    const source = await buildSourceDocx();
    const result = await runDocxXmlSurgeryIsolated(source, [
      {
        op: 'insert_paragraphs',
        anchorText: '10.3 Statistical Methods',
        position: 'after',
        paragraphs: ['Sample size derived from prior trials.', 'Power 0.9 at alpha 0.05.'],
        inheritFormat: true,
      },
    ]);
    expect(result.applied[0].status).toBe('applied');
    expect(result.applied[0].count).toBe(2);
    expect(result.validation.ok).toBe(true);
    expect(result.validation.reopened).toBe(true);
    // 1 heading + 2 inserted + 1 body paragraph
    expect(result.validation.paragraphCount).toBe(4);
  });

  it('replaces a placeholder token preserving run formatting', async () => {
    const source = await buildSourceDocx();
    const result = await runDocxXmlSurgeryIsolated(source, [
      { op: 'replace_text', find: '{{SPONSOR}}', replace: 'Concept2Cure, Inc.' },
    ]);
    expect(result.applied[0].status).toBe('applied');
    expect(result.applied[0].count).toBe(1);
    expect(result.validation.ok).toBe(true);
  });

  it('reports anchor_not_found without corrupting the document', async () => {
    const source = await buildSourceDocx();
    const result = await runDocxXmlSurgeryIsolated(source, [
      { op: 'insert_paragraphs', anchorText: 'No Such Heading', paragraphs: ['x'] },
    ]);
    expect(result.applied[0].status).toBe('anchor_not_found');
    expect(result.validation.ok).toBe(true);
  });
});

describe.skipIf(!docxStackAvailable)('validate_docx', () => {
  it('passes a well-formed document', async () => {
    const source = await buildSourceDocx();
    const report = await runDocxValidateIsolated(source);
    expect(report.ok).toBe(true);
    expect(report.missingParts).toHaveLength(0);
    expect(report.malformedParts).toHaveLength(0);
    expect(report.reopened).toBe(true);
  });

  it('fails a corrupt archive', async () => {
    const report = await runDocxValidateIsolated(Buffer.from('not a real docx'));
    expect(report.ok).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
  });
});
