// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { emptyDiscovery } from '@shared/types/onboarding-discovery';
import { DiscoveryReview } from '../DiscoveryReview';
afterEach(cleanup);
it('states missing context honestly and renders human input as text', () => {
  const d = emptyDiscovery();
  d.company.goals = '<script>unsafe()</script>';
  render(<DiscoveryReview value={d} />);
  expect(screen.getAllByText('Not stated').length).toBeGreaterThan(1);
  expect(screen.getByText('<script>unsafe()</script>')).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByText(/Project creation, permissions and security changes/)).toBeTruthy();
});
