// @vitest-environment jsdom
/**
 * E6 — SEComparisonTable tests: the 510(k) Substantial Equivalence side-by-side
 * comparison surface. Covers real data-table semantics (caption + scope'd column
 * and row headers, screen-reader navigable), the equivalence verdict carrying
 * text + icon (never colour alone), and the honesty contract (sample /
 * not_assessed matrices are preview-only and suppress the seal/export note).
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import {
  SEComparisonTable,
  SE_VERDICT_LABEL,
  type SEComparisonRow,
} from '../SEComparisonTable';

afterEach(cleanup);

const rows: SEComparisonRow[] = [
  {
    characteristic: 'Intended use',
    subjectValue: 'Continuous glucose monitoring',
    predicateValue: 'Continuous glucose monitoring',
    status: 'EQUIVALENT',
  },
  {
    characteristic: 'Sensor wear time',
    subjectValue: '14 days',
    predicateValue: '10 days',
    status: 'DISCUSSION_REQUIRED',
    note: 'Longer wear time requires supporting data.',
  },
  {
    characteristic: 'Sterilization method',
    subjectValue: 'EO',
    predicateValue: 'Gamma',
    status: 'NOT_EQUIVALENT',
  },
];

function renderTable(provenance: 'analyzed' | 'sample' | 'not_assessed' = 'analyzed') {
  return render(
    <SEComparisonTable
      subjectDeviceName="AcmeCGM X2"
      predicateDeviceName="LegacyCGM"
      predicateKNumber="K112233"
      rows={rows}
      provenance={provenance}
    />,
  );
}

describe('SEComparisonTable — data-table semantics', () => {
  it('renders a real table with a caption that names subject and predicate', () => {
    renderTable();
    const table = screen.getByRole('table');
    expect(table.tagName).toBe('TABLE');
    const caption = table.querySelector('caption');
    expect(caption).not.toBeNull();
    expect(caption!.textContent).toContain('AcmeCGM X2');
    expect(caption!.textContent).toContain('K112233');
  });

  it('exposes column headers with scope="col"', () => {
    renderTable();
    const colHeaders = screen.getAllByRole('columnheader');
    // Characteristic, subject, predicate, equivalence
    expect(colHeaders).toHaveLength(4);
    colHeaders.forEach(th => expect(th.getAttribute('scope')).toBe('col'));
    expect(colHeaders[0].textContent).toContain('Characteristic');
  });

  it('exposes each characteristic as a row header with scope="row"', () => {
    renderTable();
    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders).toHaveLength(rows.length);
    rowHeaders.forEach(th => expect(th.getAttribute('scope')).toBe('row'));
    expect(rowHeaders[0].textContent).toContain('Intended use');
  });

  it('labels the section for assistive tech', () => {
    renderTable();
    const section = screen.getByRole('region', { name: 'Substantial equivalence comparison' });
    expect(section).toBeTruthy();
  });
});

describe('SEComparisonTable — verdict is text + icon (colour never alone)', () => {
  it('renders the verdict text label verbatim for every row', () => {
    renderTable();
    expect(screen.getByText(SE_VERDICT_LABEL.EQUIVALENT)).toBeTruthy();
    expect(screen.getByText(SE_VERDICT_LABEL.DISCUSSION_REQUIRED)).toBeTruthy();
    expect(screen.getByText(SE_VERDICT_LABEL.NOT_EQUIVALENT)).toBeTruthy();
  });

  it('pairs a decorative icon with each verdict text label', () => {
    const { container } = renderTable();
    const verdicts = container.querySelectorAll('[data-tone]');
    expect(verdicts.length).toBe(rows.length);
    verdicts.forEach(v => {
      // every verdict pill carries an aria-hidden icon alongside the text
      expect(v.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
      expect((v.textContent ?? '').trim().length).toBeGreaterThan(0);
    });
  });
});

describe('SEComparisonTable — honesty contract', () => {
  it('analyzed matrix is marked sealable/exportable and shows no preview-only notice', () => {
    renderTable('analyzed');
    expect(screen.getByText(/may be sealed or exported/)).toBeTruthy();
    expect(screen.queryByText(/preview only/i)).toBeNull();
  });

  it('sample matrix is preview-only and cannot be sealed or exported', () => {
    renderTable('sample');
    const note = screen.getByText(/Sample matrix — preview only/);
    expect(note.textContent).toContain('cannot be sealed or exported');
    // the exportable affirmation is suppressed
    expect(screen.queryByText(/may be sealed or exported/)).toBeNull();
  });

  it('not_assessed matrix is preview-only and cannot be sealed or exported', () => {
    renderTable('not_assessed');
    const note = screen.getByText(/Matrix not assessed — preview only/);
    expect(note.textContent).toContain('cannot be sealed or exported');
    expect(screen.queryByText(/may be sealed or exported/)).toBeNull();
  });
});
