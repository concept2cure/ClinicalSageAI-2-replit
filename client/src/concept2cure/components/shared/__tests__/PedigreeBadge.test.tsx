// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PedigreeBadge } from '../PedigreeBadge';

describe('PedigreeBadge', () => {
  it('renders the correct label for deterministic_registry', () => {
    render(<PedigreeBadge pedigree="deterministic_registry" />);
    expect(screen.getByText('Verified registry')).toBeTruthy();
  });

  it('renders the correct label for deterministic_query', () => {
    render(<PedigreeBadge pedigree="deterministic_query" />);
    expect(screen.getByText('Verified query')).toBeTruthy();
  });

  it('renders the correct label for rim_learned', () => {
    render(<PedigreeBadge pedigree="rim_learned" />);
    expect(screen.getByText('Learned pattern')).toBeTruthy();
  });

  it('renders the correct label for external_api_live', () => {
    render(<PedigreeBadge pedigree="external_api_live" />);
    expect(screen.getByText('Live API')).toBeTruthy();
  });

  it('renders the correct label for model_assisted', () => {
    render(<PedigreeBadge pedigree="model_assisted" />);
    expect(screen.getByText('Model-assisted')).toBeTruthy();
  });

  it('has an accessible status role with pedigree label', () => {
    render(<PedigreeBadge pedigree="deterministic_registry" />);
    expect(
      screen.getByRole('status', { name: /pedigree: verified registry/i }),
    ).toBeTruthy();
  });

  it('marks the icon as aria-hidden', () => {
    const { container } = render(
      <PedigreeBadge pedigree="deterministic_registry" />,
    );
    const iconWrapper = container.querySelector('[aria-hidden="true"]');
    expect(iconWrapper).toBeTruthy();
  });

  it('shows tooltip with guidance on hover', () => {
    render(<PedigreeBadge pedigree="rim_learned" />);
    const badge = screen.getByRole('status');
    fireEvent.mouseEnter(badge);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    expect(
      screen.getByText('Result derived from a regulatory intelligence model.'),
    ).toBeTruthy();
  });

  it('hides tooltip on mouse leave', () => {
    render(<PedigreeBadge pedigree="rim_learned" />);
    const badge = screen.getByRole('status');
    fireEvent.mouseEnter(badge);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.mouseLeave(badge);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('includes toolName in tooltip when provided', () => {
    render(
      <PedigreeBadge pedigree="external_api_live" toolName="search_trials" />,
    );
    const badge = screen.getByRole('status');
    fireEvent.mouseEnter(badge);
    expect(
      screen.getByText(
        /search_trials.*Result fetched from a live external API/,
      ),
    ).toBeTruthy();
  });

  it('does not show tooltip when not hovered', () => {
    render(<PedigreeBadge pedigree="model_assisted" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
