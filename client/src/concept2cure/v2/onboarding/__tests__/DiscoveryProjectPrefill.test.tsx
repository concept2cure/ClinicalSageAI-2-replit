// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { emptyDiscovery } from '@shared/types/onboarding-discovery';
import { DiscoveryProjectPrefill } from '../DiscoveryProjectPrefill';
const read = vi.hoisted(() => ({ data: null as unknown, error: undefined as string | undefined }));
vi.mock('../../dataConnect', () => ({ useLiveData: () => read }));
vi.mock('@/utils/authToken', () => ({ getOrgId: () => 7 }));
beforeEach(() => { read.data = null; read.error = undefined; });
afterEach(cleanup);
it('copies only user-stated context when the user chooses it and never picks a filing', () => {
  const d = emptyDiscovery(); d.project.name = 'Lead IND program'; d.project.indication = 'Lung cancer'; d.project.productType = 'drug';
  read.data = { settings: { onboardingDiscovery: d } };
  const apply = vi.fn();
  render(<DiscoveryProjectPrefill onApply={apply} />);
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Use planned project details' }));
  expect(apply).toHaveBeenCalledWith(d.project);
  expect(screen.getByRole('status').textContent).toMatch(/Review them before creating/);
});
it('does not offer fabricated project details on a missing or unreadable record', () => {
  read.error = 'Read failed';
  render(<DiscoveryProjectPrefill onApply={vi.fn()} />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText(/could not be read/)).toBeTruthy();
});
