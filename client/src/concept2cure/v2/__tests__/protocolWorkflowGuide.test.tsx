// @vitest-environment jsdom
/** The suggested order selects existing tabs and reports only recorded design facts. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ProtocolWorkflowGuide } from '../surfaces/ProtocolWorkflowGuide';

const STEPS = [
  ['Study design', 'study-design'],
  ['Statistics', 'statistics'],
  ['Write protocol', 'document'],
  ['Run checks', 'compliance'],
  ['Review protocol', 'reviews'],
] as const;
const guide = () => screen.getByRole('navigation', { name: 'Study and protocol design' });

afterEach(() => cleanup());

describe('one guide over the existing study/protocol workspace', () => {
  it('suggests the five existing steps in order, with only the open step current', () => {
    render(<ProtocolWorkflowGuide doc={{}} tab="document" onTab={vi.fn(() => true)} />);
    expect(within(guide()).getAllByRole('button').map(button => button.textContent?.trim())).toEqual(STEPS.map(([label]) => label));
    expect(within(guide()).getByRole('button', { name: 'Write protocol' }).getAttribute('aria-current')).toBe('step');
    expect(within(guide()).getAllByRole('button').filter(button => button.hasAttribute('aria-current'))).toHaveLength(1);
    expect(guide().textContent).not.toMatch(/\d+%|complete|approved/i);
  });

  it.each(STEPS)('the %s step requests its existing %s tab', (label, id) => {
    const onTab = vi.fn(() => true);
    render(<ProtocolWorkflowGuide doc={{}} tab="objectives" onTab={onTab} />);
    fireEvent.click(within(guide()).getByRole('button', { name: label }));
    expect(onTab).toHaveBeenCalledExactlyOnceWith(id);
  });

  it('does not assign a current guided step to an unrelated tab', () => {
    render(<ProtocolWorkflowGuide doc={{}} tab="budget" onTab={vi.fn(() => true)} />);
    expect(within(guide()).getAllByRole('button').some(button => button.hasAttribute('aria-current'))).toBe(false);
  });

  it('asks for a study design when no design is bound', () => {
    render(<ProtocolWorkflowGuide doc={{ studyDesign: null }} tab="document" onTab={vi.fn(() => true)} />);
    expect(screen.getByText(/create or bind/i)).toBeTruthy();
    expect(guide().textContent).not.toMatch(/approved|passed|complete/i);
  });

  it('reports an unreadable design without treating the recorded link as a successful read', () => {
    render(<ProtocolWorkflowGuide doc={{ studyDesign: { studyId: 'sd_1', resolved: false, blocksApproval: false } }} tab="study-design" onTab={vi.fn(() => true)} />);
    expect(screen.getByText(/could not be read/i)).toBeTruthy();
    expect(guide().textContent).not.toMatch(/approved|passed|complete/i);
  });

  it('reports the recorded blocking findings when approval is blocked', () => {
    render(<ProtocolWorkflowGuide doc={{ studyDesign: { studyId: 'sd_1', resolved: true, blocksApproval: true } }} tab="study-design" onTab={vi.fn(() => true)} />);
    expect(screen.getByText(/findings.*block approval/i)).toBeTruthy();
    expect(guide().textContent).not.toMatch(/approved|passed|complete/i);
  });

  it('suggests writing and checking a resolved design without claiming approval or completion', () => {
    render(<ProtocolWorkflowGuide doc={{ studyDesign: { studyId: 'sd_1', resolved: true, blocksApproval: false } }} tab="study-design" onTab={vi.fn(() => true)} />);
    expect(screen.getByText(/write.*check|writing.*check/i)).toBeTruthy();
    expect(guide().textContent).not.toMatch(/approved|passed|complete|\d+%/i);
  });
});
