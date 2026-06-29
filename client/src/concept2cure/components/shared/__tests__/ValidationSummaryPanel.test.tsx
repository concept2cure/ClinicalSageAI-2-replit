// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ValidationSummaryPanel,
  type ValidationFinding,
} from '../ValidationSummaryPanel';

const SAMPLE_FINDINGS: ValidationFinding[] = [
  {
    rule: 'SD1002',
    severity: 'error',
    message: 'Missing required variable USUBJID in DM domain.',
    domain: 'DM',
  },
  {
    rule: 'SD0062',
    severity: 'warning',
    message: 'Variable label exceeds 40 characters.',
    domain: 'AE',
  },
  {
    rule: 'SD1085',
    severity: 'info',
    message: 'Supplemental qualifier QVAL is character type.',
  },
];

describe('ValidationSummaryPanel', () => {
  it('renders the title', () => {
    render(
      <ValidationSummaryPanel title="SDTM validation" findings={SAMPLE_FINDINGS} />,
    );
    expect(screen.getByText('SDTM validation')).toBeTruthy();
  });

  it('has an accessible region label', () => {
    render(
      <ValidationSummaryPanel title="SDTM validation" findings={SAMPLE_FINDINGS} />,
    );
    expect(
      screen.getByRole('region', { name: /sdtm validation.*summary/i }),
    ).toBeTruthy();
  });

  it('renders the standard badge when provided', () => {
    render(
      <ValidationSummaryPanel
        title="SDTM validation"
        standard="CDISC SDTM v3.4"
        findings={SAMPLE_FINDINGS}
      />,
    );
    expect(screen.getByText('CDISC SDTM v3.4')).toBeTruthy();
  });

  it('hides the standard badge when not provided', () => {
    render(
      <ValidationSummaryPanel title="Validation" findings={SAMPLE_FINDINGS} />,
    );
    expect(screen.queryByText(/CDISC/)).toBeNull();
  });

  it('shows valid status indicator', () => {
    render(
      <ValidationSummaryPanel
        title="Validation"
        findings={[]}
        valid={true}
      />,
    );
    expect(screen.getByLabelText('Valid')).toBeTruthy();
    expect(screen.getByText('Valid')).toBeTruthy();
  });

  it('shows invalid status indicator', () => {
    render(
      <ValidationSummaryPanel
        title="Validation"
        findings={SAMPLE_FINDINGS}
        valid={false}
      />,
    );
    expect(screen.getByLabelText('Invalid')).toBeTruthy();
    expect(screen.getByText('Invalid')).toBeTruthy();
  });

  it('hides valid/invalid when valid prop is undefined', () => {
    render(
      <ValidationSummaryPanel title="Validation" findings={SAMPLE_FINDINGS} />,
    );
    expect(screen.queryByLabelText('Valid')).toBeNull();
    expect(screen.queryByLabelText('Invalid')).toBeNull();
  });

  it('displays summary counts', () => {
    render(
      <ValidationSummaryPanel title="Validation" findings={SAMPLE_FINDINGS} />,
    );
    expect(screen.getByText('1 error')).toBeTruthy();
    expect(screen.getByText('1 warning')).toBeTruthy();
    expect(screen.getByText('1 info')).toBeTruthy();
  });

  it('pluralizes counts correctly', () => {
    const multipleErrors: ValidationFinding[] = [
      { rule: 'E1', severity: 'error', message: 'Error one' },
      { rule: 'E2', severity: 'error', message: 'Error two' },
      { rule: 'W1', severity: 'warning', message: 'Warning one' },
      { rule: 'W2', severity: 'warning', message: 'Warning two' },
      { rule: 'W3', severity: 'warning', message: 'Warning three' },
    ];
    render(
      <ValidationSummaryPanel title="Validation" findings={multipleErrors} />,
    );
    expect(screen.getByText('2 errors')).toBeTruthy();
    expect(screen.getByText('3 warnings')).toBeTruthy();
    expect(screen.getByText('0 info')).toBeTruthy();
  });

  it('renders all findings with rule codes', () => {
    render(
      <ValidationSummaryPanel title="Validation" findings={SAMPLE_FINDINGS} />,
    );
    expect(screen.getByText('SD1002')).toBeTruthy();
    expect(screen.getByText('SD0062')).toBeTruthy();
    expect(screen.getByText('SD1085')).toBeTruthy();
  });

  it('renders finding messages', () => {
    render(
      <ValidationSummaryPanel title="Validation" findings={SAMPLE_FINDINGS} />,
    );
    expect(
      screen.getByText('Missing required variable USUBJID in DM domain.'),
    ).toBeTruthy();
  });

  it('renders domain label when provided', () => {
    render(
      <ValidationSummaryPanel title="Validation" findings={SAMPLE_FINDINGS} />,
    );
    expect(screen.getByText('DM')).toBeTruthy();
    expect(screen.getByText('AE')).toBeTruthy();
  });

  it('renders severity dots with aria-labels', () => {
    render(
      <ValidationSummaryPanel title="Validation" findings={SAMPLE_FINDINGS} />,
    );
    expect(screen.getByLabelText('Error')).toBeTruthy();
    expect(screen.getByLabelText('Warning')).toBeTruthy();
    expect(screen.getByLabelText('Info')).toBeTruthy();
  });

  it('sorts findings by severity: errors first, then warnings, then info', () => {
    const mixed: ValidationFinding[] = [
      { rule: 'I1', severity: 'info', message: 'Info first in array' },
      { rule: 'E1', severity: 'error', message: 'Error second in array' },
      { rule: 'W1', severity: 'warning', message: 'Warning third in array' },
    ];
    const { container } = render(
      <ValidationSummaryPanel title="Validation" findings={mixed} />,
    );
    const items = container.querySelectorAll('li');
    expect(items[0]?.textContent).toContain('Error second in array');
    expect(items[1]?.textContent).toContain('Warning third in array');
    expect(items[2]?.textContent).toContain('Info first in array');
  });

  it('shows empty state when no findings', () => {
    render(<ValidationSummaryPanel title="Validation" findings={[]} />);
    expect(
      screen.getByText(/no findings.*all checks passed/i),
    ).toBeTruthy();
  });

  it('hides summary bar in empty state', () => {
    render(<ValidationSummaryPanel title="Validation" findings={[]} />);
    expect(screen.queryByText(/error/i)).toBeNull();
  });

  it('fires onExport when export button is clicked', () => {
    const handler = vi.fn();
    render(
      <ValidationSummaryPanel
        title="Validation"
        findings={SAMPLE_FINDINGS}
        onExport={handler}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /export validation results/i }),
    );
    expect(handler).toHaveBeenCalledOnce();
  });

  it('hides export button when no handler provided', () => {
    render(
      <ValidationSummaryPanel title="Validation" findings={SAMPLE_FINDINGS} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
