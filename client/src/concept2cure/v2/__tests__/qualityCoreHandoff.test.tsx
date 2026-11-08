// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
const h = vi.hoisted(() => ({ props: null as Record<string, unknown> | null, apply: vi.fn(() => ({ status: 'applied' })) }));
vi.mock('../../quality/QualityRoute', () => ({ default: (props: Record<string, unknown>) => { h.props = props; return <div>Quality</div>; } }));
vi.mock('../surfaceActions', () => ({ applySurfaceAction: h.apply }));
import { QualityModule } from '../surfaces/QualityModule';
import type { SurfaceViewProps } from '../surfaceViews';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { isNotificationRecordTarget } from '@shared/types/notification-navigation';
import { clearNavParams, stashNavParamsForTarget } from '../navParams';
import { SourceCatalogLine } from '../editor/SourceCatalogLine';
const props = { surface: UI_SURFACES.find(s => s.id === 'quality')!, segment: 'pharma', onAsk: vi.fn(), onNav: vi.fn() } as SurfaceViewProps;
afterEach(() => { cleanup(); clearNavParams(); vi.clearAllMocks(); });
describe('Quality native record handoff in the unified workflow', () => {
  it('accepts only known register targets and retains exact personal-reader targets', () => {
    const target = { surface: 'quality', label: 'Open CAPA register', programId: null, params: { qmsTab: 'capa' } };
    expect(isNotificationRecordTarget(target)).toBe(true);
    expect(isNotificationRecordTarget({ ...target, params: { qmsTab: 'not-a-register' } })).toBe(false);
    expect(isNotificationRecordTarget({ ...target, params: { qmsTab: 'capa', qmsIntent: 'read' } })).toBe(false);
    expect(isNotificationRecordTarget({ ...target, params: { qmsTab: 'capa', qmsDocumentId: '9' } })).toBe(false);
    expect(isNotificationRecordTarget({ ...target, params: { qmsTab: 'sop', qmsDocumentId: '9', qmsIntent: 'read' } })).toBe(true);
    expect(isNotificationRecordTarget({ ...target, params: { qmsDocumentId: '9', qmsIntent: 'read' } })).toBe(true);
  });
  it('starts the native register on first mount and uses its existing action handler for later handoffs', async () => {
    stashNavParamsForTarget('quality', { qmsTab: 'capa' });
    render(<QualityModule {...props} />);
    expect(h.props?.initialTab).toBe('capa');
    act(() => stashNavParamsForTarget('quality', { qmsTab: 'deviations' }));
    await waitFor(() => expect(h.apply).toHaveBeenCalledWith(expect.objectContaining({ actionId: 'quality.open-tab', params: { tab: 'deviations' } }), expect.any(Function), expect.any(Function)));
  });
  it('shows a refused same-surface register handoff without remounting the controlled editor', async () => {
    h.apply.mockReturnValueOnce({ status: 'failed', reason: 'Return to the Quality register before switching tabs.' } as never);
    render(<QualityModule {...props} />);
    act(() => stashNavParamsForTarget('quality', { qmsTab: 'capa' }));
    expect(await screen.findByText('Return to the Quality register before switching tabs.')).toBeTruthy();
  });
  it('shows project ownership and lifecycle beside shared Quality source facts', () => {
    render(<SourceCatalogLine catalog={{ studyRef: null, trialRegistryIdentifier: null, protocolNumber: null, documentDate: null, dataCutDate: null, dataset: null,
      nativeRecord: { workArea: 'quality', sourceScope: 'organization', kind: 'qms_suppliers', id: '9', lifecycle: 'pending', version: null } }} />);
    expect(screen.getByTestId('source-catalog').textContent).toContain('Quality system');
    expect(screen.getByTestId('source-catalog').textContent).toContain('Organization context');
    expect(screen.getByTestId('source-catalog').textContent).toContain('pending');
  });
});
