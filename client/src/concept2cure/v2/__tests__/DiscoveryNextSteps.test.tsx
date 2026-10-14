// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { assessOnboardingDiscovery } from '@shared/types/onboarding-discovery';
import { DiscoveryNextSteps } from '../surfaces/DiscoveryNextSteps';
import { completeDiscovery } from './onboardingDiscoveryFixtures';
afterEach(cleanup);

it('routes guidance to existing surfaces and leaves configured controls and project creation to those workflows', () => {
  const onNav = vi.fn();
  render(<DiscoveryNextSteps assessment={assessOnboardingDiscovery(completeDiscovery())} onNav={onNav} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open: Create or select your first project' }));
  expect(onNav).toHaveBeenCalledWith('projects');
  expect(screen.getByText(/does not create a project or configure security controls/)).toBeTruthy();
});
