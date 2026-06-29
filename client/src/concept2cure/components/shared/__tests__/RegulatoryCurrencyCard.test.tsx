// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  RegulatoryCurrencyCard,
  type GuidanceFreshness,
} from '../RegulatoryCurrencyCard';

const SAMPLE_ITEMS: GuidanceFreshness[] = [
  {
    guidanceId: 'ncd-310.1',
    title: 'Proton beam therapy',
    status: 'current',
    citedDate: '2024-01-15',
  },
  {
    guidanceId: 'lcd-L35062',
    title: 'Molecular diagnostic testing',
    status: 'stale',
    effectiveDate: '2022-06-01',
    message: 'Superseded by L39012',
  },
  {
    guidanceId: 'ncd-220.6',
    title: 'PET for oncology',
    status: 'void',
  },
];

describe('RegulatoryCurrencyCard', () => {
  it('renders the card title', () => {
    render(<RegulatoryCurrencyCard items={SAMPLE_ITEMS} />);
    expect(screen.getByText('Regulatory currency')).toBeTruthy();
  });

  it('has an accessible region label', () => {
    render(<RegulatoryCurrencyCard items={SAMPLE_ITEMS} />);
    expect(
      screen.getByRole('region', { name: /regulatory currency/i }),
    ).toBeTruthy();
  });

  it('displays summary counts', () => {
    render(<RegulatoryCurrencyCard items={SAMPLE_ITEMS} />);
    expect(screen.getByText('1 current')).toBeTruthy();
    expect(screen.getByText('1 stale')).toBeTruthy();
    expect(screen.getByText('1 void')).toBeTruthy();
  });

  it('renders all guidance items', () => {
    render(<RegulatoryCurrencyCard items={SAMPLE_ITEMS} />);
    expect(screen.getByText('Proton beam therapy')).toBeTruthy();
    expect(screen.getByText('Molecular diagnostic testing')).toBeTruthy();
    expect(screen.getByText('PET for oncology')).toBeTruthy();
  });

  it('shows cited date when provided', () => {
    render(<RegulatoryCurrencyCard items={SAMPLE_ITEMS} />);
    expect(screen.getByText(/Cited 2024-01-15/)).toBeTruthy();
  });

  it('shows effective date when provided', () => {
    render(<RegulatoryCurrencyCard items={SAMPLE_ITEMS} />);
    expect(screen.getByText(/Effective 2022-06-01/)).toBeTruthy();
  });

  it('shows message when provided', () => {
    render(<RegulatoryCurrencyCard items={SAMPLE_ITEMS} />);
    expect(screen.getByText('Superseded by L39012')).toBeTruthy();
  });

  it('shows last checked footer', () => {
    render(
      <RegulatoryCurrencyCard
        items={SAMPLE_ITEMS}
        lastChecked="2 minutes ago"
      />,
    );
    expect(screen.getByText('Last checked: 2 minutes ago')).toBeTruthy();
  });

  it('hides last checked footer when not provided', () => {
    render(<RegulatoryCurrencyCard items={SAMPLE_ITEMS} />);
    expect(screen.queryByText(/last checked/i)).toBeNull();
  });

  it('fires onRefresh when refresh button is clicked', () => {
    const handler = vi.fn();
    render(
      <RegulatoryCurrencyCard items={SAMPLE_ITEMS} onRefresh={handler} />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /refresh regulatory currency/i }),
    );
    expect(handler).toHaveBeenCalledOnce();
  });

  it('hides refresh button when no handler provided', () => {
    render(<RegulatoryCurrencyCard items={SAMPLE_ITEMS} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders status dots with aria-labels', () => {
    render(<RegulatoryCurrencyCard items={SAMPLE_ITEMS} />);
    expect(screen.getByLabelText('Current')).toBeTruthy();
    expect(screen.getByLabelText('Stale')).toBeTruthy();
    expect(screen.getByLabelText('Void')).toBeTruthy();
  });

  it('handles empty items array', () => {
    render(<RegulatoryCurrencyCard items={[]} />);
    expect(screen.getByText('0 current')).toBeTruthy();
    expect(screen.getByText('0 stale')).toBeTruthy();
    expect(screen.getByText('0 void')).toBeTruthy();
  });
});
