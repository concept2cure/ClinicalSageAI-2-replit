import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LockedModuleCard } from '../LockedModuleCard';

describe('LockedModuleCard', () => {
  it('renders the module title and description', () => {
    render(
      <LockedModuleCard
        moduleId="cdisc"
        title="CDISC pipeline"
        description="SDTM/ADaM dataset generation and validation."
      />,
    );
    expect(screen.getByText('CDISC pipeline')).toBeTruthy();
    expect(screen.getByText('SDTM/ADaM dataset generation and validation.')).toBeTruthy();
  });

  it('shows the required tier badge', () => {
    render(
      <LockedModuleCard
        moduleId="spl"
        title="SPL generation"
        description="Structured product labeling."
        requiredTier="Premium"
      />,
    );
    expect(screen.getByText('Premium tier')).toBeTruthy();
  });

  it('defaults to Enterprise tier', () => {
    render(
      <LockedModuleCard
        moduleId="spl"
        title="SPL"
        description="Test"
      />,
    );
    expect(screen.getByText('Enterprise tier')).toBeTruthy();
  });

  it('fires onRequestUpgrade with moduleId when button clicked', () => {
    const handler = vi.fn();
    render(
      <LockedModuleCard
        moduleId="heor"
        title="HEOR modeling"
        description="Budget-impact and cost-effectiveness."
        onRequestUpgrade={handler}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /request upgrade/i }));
    expect(handler).toHaveBeenCalledWith('heor');
  });

  it('hides upgrade button when no handler provided', () => {
    render(
      <LockedModuleCard
        moduleId="rim"
        title="RIM"
        description="Regulatory intelligence model."
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('has an accessible region label', () => {
    render(
      <LockedModuleCard
        moduleId="test"
        title="Test module"
        description="Test description."
      />,
    );
    expect(screen.getByRole('region', { name: /test module.*locked/i })).toBeTruthy();
  });
});
