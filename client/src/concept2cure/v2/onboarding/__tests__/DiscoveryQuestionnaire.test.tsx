// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { emptyDiscovery, type OnboardingDiscovery } from '@shared/types/onboarding-discovery';
import { DiscoveryQuestionnaire } from '../DiscoveryQuestionnaire';
import { DiscoveryReview } from '../DiscoveryReview';

afterEach(cleanup);
function Harness({ stage = 'company' }: { stage?: 'company' | 'project' }) {
  const [value, setValue] = React.useState<OnboardingDiscovery>(emptyDiscovery);
  return <><DiscoveryQuestionnaire stage={stage} value={value} onChange={setValue} onAsk={vi.fn()} /><DiscoveryReview value={value} /></>;
}

describe('discovery questions adapt to the client’s own answers', () => {
  it('shows guidance for a newcomer and keeps comma-separated domains editable', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Experience with regulatory work'), { target: { value: 'new' } });
    expect(screen.getByText(/Start with a project and its source documents/)).toBeTruthy();
    const input = screen.getByLabelText('Therapeutic areas or clinical domains') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Oncology,' } });
    expect(input.value).toBe('Oncology,');
    fireEvent.change(input, { target: { value: 'Oncology, Neurology' } });
    expect(screen.getByText('Oncology, Neurology', { selector: '.v' })).toBeTruthy();
  });
  it('asks predicate questions only for a device and clears answers when the product changes', () => {
    render(<Harness stage="project" />);
    fireEvent.change(screen.getByLabelText('Product context'), { target: { value: 'device' } });
    fireEvent.change(screen.getByLabelText('Predicate strategy or comparator device'), { target: { value: 'K123456' } });
    expect(screen.queryByLabelText('Assay, specimen and comparator context')).toBeNull();
    fireEvent.change(screen.getByLabelText('Product context'), { target: { value: 'ivd' } });
    expect(screen.getByLabelText('Assay, specimen and comparator context')).toBeTruthy();
    expect(screen.queryByText('K123456')).toBeNull();
    fireEvent.change(screen.getByLabelText('Product context'), { target: { value: 'device' } });
    expect((screen.getByLabelText('Predicate strategy or comparator device') as HTMLTextAreaElement).value).toBe('');
  });
  it('offers launch-scoped uses and explains the CMC scope when selected', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Compose CMC / Module 3'));
    expect(screen.getByText(/Module 3 composition supports small-molecule US INDs/)).toBeTruthy();
    expect(screen.queryByText(/digital twin/i)).toBeNull();
  });
});
