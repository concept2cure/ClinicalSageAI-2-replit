/** @vitest-environment jsdom */
/**
 * The shell's segment label follows the OPEN PROGRAM's product type.
 *
 * MDX demo pack, 2026-09-21, finding F9: with the 510(k) IVD program open, the
 * top bar read "Biotech & Pharma" — the segment is a stored preference and
 * nothing told it a device program was open.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ currentOrganization: { name: 'Concept2Cure Diagnostics' } }),
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));

import { TopBar } from '../Shell';
import { publishShellProject, segmentForShellProject } from '../shellProject';

const surface = { id: 'project-home', label: 'Project' } as any;
const renderBar = (segment = 'biopharma') =>
  render(<TopBar surface={surface} onPalette={() => {}} segment={segment} onSegment={() => {}} />);
const label = () => document.querySelector('.tb-dom-lbl')?.textContent;

beforeEach(() => {
  delete (window as any).C2C_PROJECT;
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
  sessionStorage.clear();
});

describe('segmentForShellProject (pure)', () => {
  it('maps product type first, workstream second, nothing otherwise', () => {
    expect(segmentForShellProject({ id: 'p', productType: 'ivd' })).toBe('diagnostics');
    expect(segmentForShellProject({ id: 'p', productType: 'cdx' })).toBe('diagnostics');
    expect(segmentForShellProject({ id: 'p', productType: 'device' })).toBe('medtech');
    expect(segmentForShellProject({ id: 'p', productType: 'samd' })).toBe('medtech');
    expect(segmentForShellProject({ id: 'p', productType: 'drug' })).toBe('biopharma');
    expect(segmentForShellProject({ id: 'p', productType: 'biologic' })).toBe('biopharma');
    expect(segmentForShellProject({ id: 'p', ws: 'MDX' })).toBe('medtech');
    expect(segmentForShellProject({ id: 'p', ws: 'Biotech' })).toBe('biopharma');
    expect(segmentForShellProject({ id: 'p', ws: 'CRO' })).toBe('cro');
    expect(segmentForShellProject({ id: 'p' })).toBeNull();
    expect(segmentForShellProject(null)).toBeNull();
    // An unknown product type is not guessed.
    expect(segmentForShellProject({ id: 'p', productType: 'widget' })).toBeNull();
  });
});

describe('TopBar segment label', () => {
  it('reads the preference when no program is open', () => {
    renderBar('biopharma');
    expect(label()).toBe('Biotech & Pharma');
  });

  it('reads the IVD segment with a 510(k) IVD program open, whatever the preference says', () => {
    publishShellProject({ id: '82d3b729', title: '[Demo · MDX] NeuroPanel-Dx 510(k)', ws: 'MDX', productType: 'ivd' });
    renderBar('biopharma');
    expect(label()).toBe('In Vitro Diagnostics');
  });

  it('reads the device segment for a device program', () => {
    publishShellProject({ id: 'dev-1', ws: 'MDX', productType: 'device' });
    renderBar('biopharma');
    expect(label()).toBe('Medical Device & Diagnostics');
  });

  it('follows the workstream before the product type is known, then the product type once it is published', () => {
    publishShellProject({ id: '82d3b729', ws: 'MDX' });
    renderBar('biopharma');
    expect(label()).toBe('Medical Device & Diagnostics');
    act(() => {
      publishShellProject({ id: '82d3b729', ws: 'MDX', productType: 'ivd' });
    });
    expect(label()).toBe('In Vitro Diagnostics');
  });
});
