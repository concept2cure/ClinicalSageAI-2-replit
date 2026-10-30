// @vitest-environment jsdom
/**
 * The IND screen's briefing book is the project's meeting-package document in
 * the editor (slice G14): started from the built-in registry template for the
 * meeting type, never a shared template standing in, and never assembled into
 * a preview that cannot be filed.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const H = vi.hoisted(() => ({ templates: [] as unknown[] }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { id: 3, organizationId: 7 } }) }));
vi.mock('../editor/authoringCurrentRead', () => ({ useAuthoringReadSession: () => ({ actor: '7:3', key: 1, sameRevision: () => true }) }));
vi.mock('../editor/useScopedDocuments', () => ({
  useScopedDocuments: () => ({ docs: [{ id: 'd1', title: 'Pre-IND package', template_id: 'tpl-pre' }], docsState: 'ready', loadDocs: vi.fn(), refreshCreationContext: vi.fn() }),
}));
vi.mock('../dataConnect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dataConnect')>()),
  useLiveData: () => ({ data: { templates: H.templates }, loading: false }),
}));
vi.mock('../surfaces/ProjectBiotechPlan', () => ({
  TemplateStart: (p: { template: { id: string }; docs: unknown[]; programId: string }) =>
    <div data-testid="template-start" data-template={p.template.id} data-docs={p.docs.length} data-program={p.programId} />,
}));

import { IndBriefingBookStart, meetingPackageTemplate } from '../surfaces/IndBriefingBookStart';
import type { AuthoringTemplate } from '../surfaces/AuthoringTemplatePicker';

const T = (id: string, registryId: string | null, entryId?: string) =>
  ({ id, name: id, entryId, filingContext: { registryId, region: registryId ? 'US' : 'GLOBAL' } }) as unknown as AuthoringTemplate;
const PROGRAM = '40000000-0000-4000-8000-000000000031';

afterEach(cleanup);

describe('the IND briefing book starts in the editor', () => {
  it('uses the built-in template for exactly the meeting type, never a shared one', () => {
    const templates = [T('shared', null, 'component:meeting'), T('tpl-pre', 'US_PRE_IND', 'registry:US_PRE_IND'), T('tpl-b', 'US_TYPE_B_MEETING', 'registry:US_TYPE_B_MEETING')];
    expect(meetingPackageTemplate(templates, 'US_PRE_IND')?.id).toBe('tpl-pre');
    expect(meetingPackageTemplate(templates, 'US_TYPE_C_MEETING')).toBeNull();
  });

  it('starts or opens the project\'s package for the chosen meeting type', () => {
    H.templates = [T('tpl-pre', 'US_PRE_IND', 'registry:US_PRE_IND'), T('tpl-b', 'US_TYPE_B_MEETING', 'registry:US_TYPE_B_MEETING')];
    render(<IndBriefingBookStart programId={PROGRAM} onOpenDocument={vi.fn()} onAsk={vi.fn()} />);
    const start = screen.getByTestId('template-start');
    expect([start.dataset.template, start.dataset.program, start.dataset.docs]).toEqual(['tpl-pre', PROGRAM, '1']);
    fireEvent.change(screen.getByLabelText(/Meeting type/), { target: { value: 'type_b' } });
    expect(screen.getByTestId('template-start').dataset.template).toBe('tpl-b');
  });

  it('says so when no built-in template is returned, and starts nothing in its place', () => {
    H.templates = [T('shared', null, 'component:meeting')];
    render(<IndBriefingBookStart programId={PROGRAM} onOpenDocument={vi.fn()} onAsk={vi.fn()} />);
    expect(screen.queryByTestId('template-start')).toBeNull();
    expect(screen.getByText(/No built-in meeting-package template/)).toBeTruthy();
  });
});
