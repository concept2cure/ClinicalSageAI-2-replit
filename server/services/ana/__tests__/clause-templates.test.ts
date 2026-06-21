/**
 * Regulatory clause-template catalog — unit tests. Deterministic; verifies
 * field validation, rendered insertion shape, anchor defaulting, placeholder
 * swaps, and catalog discovery. No python/worker dependency — the catalog is a
 * pure content layer over the docx-insert contract.
 */
import { describe, it, expect } from 'vitest';
import {
  renderClauseTemplate,
  listClauseTemplates,
  getClauseTemplate,
  CLAUSE_TEMPLATE_KEYS,
} from '../clause-templates';

describe('clause catalog', () => {
  it('exposes the four regulatory building blocks', () => {
    expect([...CLAUSE_TEMPLATE_KEYS].sort()).toEqual(
      ['cover_letter_header', 'section_heading', 'signature_block', 'sponsor_placeholder_swap'].sort(),
    );
    const meta = listClauseTemplates();
    expect(meta).toHaveLength(4);
    // discovery metadata must not leak the render function
    expect((meta[0] as Record<string, unknown>).render).toBeUndefined();
    expect(getClauseTemplate('signature_block')?.category).toBe('signature');
  });

  it('flags an unknown clause key', () => {
    const r = renderClauseTemplate('not_a_clause', {});
    expect(r.unknownClause).toBe(true);
    expect(r.insertions).toHaveLength(0);
  });
});

describe('signature_block', () => {
  it('reports missing required fields and renders nothing', () => {
    const r = renderClauseTemplate('signature_block', { signatory_name: 'Jane Roe' });
    expect(r.missingFields).toContain('signatory_title');
    expect(r.insertions).toHaveLength(0);
  });

  it('renders a signature block with name, title, org, and date', () => {
    const r = renderClauseTemplate(
      'signature_block',
      {
        signatory_name: 'Jane Roe',
        signatory_title: 'VP, Regulatory Affairs',
        organization: 'Concept2Cure, Inc.',
        signature_date: '2026-06-21',
      },
      { anchorType: 'end' },
    );
    expect(r.missingFields).toHaveLength(0);
    expect(r.insertions).toHaveLength(1);
    const content = r.insertions[0].content;
    expect(content).toContain('Sincerely,');
    expect(content).toContain('Jane Roe');
    expect(content).toContain('VP, Regulatory Affairs');
    expect(content).toContain('Concept2Cure, Inc.');
    expect(content).toContain('Date: 2026-06-21');
    expect(r.insertions[0].anchorType).toBe('end');
  });

  it('warns when organization is omitted', () => {
    const r = renderClauseTemplate('signature_block', {
      signatory_name: 'Jane Roe',
      signatory_title: 'Director',
    });
    expect(r.warnings.join(' ')).toMatch(/organization/i);
  });
});

describe('cover_letter_header', () => {
  it('defaults placement to document start and includes RE line', () => {
    const r = renderClauseTemplate('cover_letter_header', {
      sponsor_name: 'Concept2Cure, Inc.',
      letter_date: 'June 21, 2026',
      re_line: 'IND 123456 — Initial Submission',
      sponsor_address: '123 Cure Way\nBoston, MA 02110',
      submission_type: 'IND',
    });
    expect(r.insertions).toHaveLength(1);
    expect(r.insertions[0].anchorType).toBe('start');
    const content = r.insertions[0].content;
    expect(content).toContain('Food and Drug Administration'); // default recipient
    expect(content).toContain('RE: IND 123456 — Initial Submission');
    expect(content).toContain('Submission Type: IND');
    expect(content).toContain('Boston, MA 02110');
  });
});

describe('section_heading', () => {
  it('maps level to markdown heading depth and prepends the number', () => {
    const r = renderClauseTemplate(
      'section_heading',
      { heading_text: 'Statistical Methods', heading_number: '10.3', heading_level: '3', intro: 'This section describes…' },
      { anchorType: 'heading_text', anchorValue: '10. Study Design', position: 'after' },
    );
    const content = r.insertions[0].content;
    expect(content.startsWith('### 10.3 Statistical Methods')).toBe(true);
    expect(content).toContain('This section describes');
  });

  it('defaults an invalid level to 2 with a warning', () => {
    const r = renderClauseTemplate('section_heading', { heading_text: 'Intro', heading_level: '9' });
    expect(r.insertions[0].content.startsWith('## ')).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/level/i);
  });
});

describe('sponsor_placeholder_swap', () => {
  it('emits a replace insertion per supplied token and needs no anchor', () => {
    const r = renderClauseTemplate('sponsor_placeholder_swap', {
      sponsor_name: 'Concept2Cure, Inc.',
      submission_date: '2026-06-21',
    });
    expect(r.missingFields).toHaveLength(0);
    expect(r.insertions).toHaveLength(2);
    const tokens = r.insertions.map(i => i.anchorValue);
    expect(tokens).toContain('{{SPONSOR}}');
    expect(tokens).toContain('{{DATE}}');
    for (const ins of r.insertions) {
      expect(ins.anchorType).toBe('placeholder');
      expect(ins.position).toBe('replace');
    }
  });

  it('requires sponsor_name', () => {
    const r = renderClauseTemplate('sponsor_placeholder_swap', { submission_date: '2026-06-21' });
    expect(r.missingFields).toContain('sponsor_name');
  });
});
