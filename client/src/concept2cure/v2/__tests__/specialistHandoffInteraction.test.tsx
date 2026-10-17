// @vitest-environment jsdom
/** Actual specialist controls, canonical writer and editor-target channel.
 * Only transport is synthetic; no provider or alternate editor is involved. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SurfaceViewProps } from '../surfaceViews';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
const launchScope = vi.hoisted(() => ({ enforced: null as boolean | null }));
vi.mock('@/lib/queryClient', async (original) => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));

vi.mock('../navEntitlements', async original => {
  const canonical = await original<typeof import('../navEntitlements')>();
  return {
    ...canonical,
    useNavEntitlements: () => ({ ...canonical.useNavEntitlements(), launchScopeEnforced: launchScope.enforced }),
  };
});

import { ReportEngine } from '../surfaces/ReportEngine';
import { Biostatistics } from '../surfaces/Biostatistics';
import { BiostatWorkbench } from '../surfaces/BiostatWorkbench';
import { PvCockpit } from '../surfaces/PvCockpit';
import { CmChange, CmPathway } from '../surfaces/CmcModule';
import { CmQuality } from '../surfaces/CmcQuality';
import { authService } from '@/services/portal/authService';
import { clearEditorTarget, consumeEditorTarget, peekEditorTarget } from '../editorTarget';
import { publishShellProject, updateShellProject } from '../shellProject';

const PROGRAM = '0b9f6c2e-5d4a-4c3b-9a21-7e6f5d4c3b2a';
const OTHER_PROGRAM = 'abcd1234-1234-4234-8234-1234567890ab';
const DOC_ID = 'saved-specialist-document';
const SECTION_ID = 'saved-specialist-section';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const docReceipt = (bound: boolean | null = true) => json(201, {
  success: true,
  document: { id: DOC_ID, title: 'Saved specialist document', module: 'M5', client_program_id: PROGRAM },
  ...(bound === null ? {} : { governance: bound
    ? { bound: true, c2cDocumentId: 'filing-document' }
    : { bound: false, reason: 'No governed filing exists for this project.' } }),
});
const sectionReceipt = (code = 'recommendations') => json(201, {
  success: true, section: { id: SECTION_ID, doc_id: DOC_ID, code, title: 'Saved specialist document' },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const authUser = (id = '71', organizationId = '8') => ({
  id, organizationId, organizationName: null, email: 'synthetic@example.test',
  firstName: 'Synthetic', lastName: 'Reviewer', displayName: 'Synthetic reviewer',
  roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false,
});
async function adopt(id = '71', organizationId = '8') {
  vi.stubGlobal('fetch', vi.fn(async () => json(200, { authenticated: true, user: authUser(id, organizationId) })));
  expect(await authService.adoptSession(`synthetic-session-${id}-${organizationId}`)).toMatchObject({ id, organizationId });
}
function props(id: string, onNav = vi.fn()): SurfaceViewProps {
  const surface = UI_SURFACES.find(s => s.id === id);
  if (!surface) throw new Error(`Missing actual registry surface ${id}`);
  return { surface, onAsk: vi.fn(), onNav, segment: 'biopharma' };
}
const ENGINE_COMPUTE = {
  validation: {
    valid: true,
    normalizedInput: {
      clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority',
      objectiveType: 'efficacy', endpointType: 'time_to_event', alpha: 0.05, powerTarget: 0.9,
      effectSize: 0.38, eventRate: 0.55, attritionRate: 0.15, allocationRatio: 1, numberOfGroups: 2,
    },
    warnings: [], errors: [], prefilled: [],
  },
  computation: {
    method: 'Log-rank test (Schoenfeld formula)',
    sampleSize: { perGroup: 311, total: 622, groups: 2 },
    power: 0.8423, effectSize: 0.38, alpha: 0.05,
    adjustedSampleSize: 366, adjustedTotal: 733, attritionAdjusted: true,
    formula: 'Events = (z_a + z_b)^2 * (1+r)^2 / (r * ln(HR)^2), HR=0.620, events=247',
    assumptions: [],
  },
  judgment: {
    overallVerdict: 'adequate', overallRisk: 'low', actionRecommendation: 'proceed',
    confidence: { level: 'high', score: 88, factors: [], limitations: [] },
    dimensions: [], fragility: { fragilityIndex: 22, category: 'robust', sensitiveParameters: [], narrative: '' },
    endpointMethodFit: { fit: 'strong', suggestedMethod: 'Cox model', currentMethod: 'Log-rank', rationale: '', alternatives: [] },
    escalationReasons: [], roleExplanations: { technical: '', clinical: '', regulatory: '', executive: '' },
  },
  domain: { track: 'biotech_pharma', methodSuggestions: [], designConsiderations: [], endpointGuidance: [], regulatoryNotes: [], riskFactors: [] },
};

const ENGINE_DOCUMENT = {
  type: 'sample_size_rationale',
  title: 'Sample Size Rationale',
  content: '# Sample Size Rationale\n\n## Sample Size Determination\n\n- **Total (adjusted)**: 733\n',
  version: 1,
  status: 'draft',
  provenance: { engineVersion: '1.0.0' },
};


let createReply: () => Response | Promise<Response>;
let sectionReply: () => Response | Promise<Response>;
let sectionCode: string;
let patchReply: () => Response | Promise<Response>;
const STRATEGY = {
  scope: 'both', cqas: [], cpps: [], controlElements: [], gaps: [], citations: [], generatedAt: '2026-10-16T12:00:00Z',
  stabilityMonitoring: { longTermCondition: 'Not assessed', acceleratedCondition: 'Not assessed',
    testParameters: [], timePoints: [], ichBasis: [], derivedFrom: 'not_evaluated' },
};
const BOARD = {
  portfolio: [], sections: null,
  kpis: { submissions: 0, rpiAverage: null, irOverdue: 0, sectionsApproved: null, sectionsTotal: null, readyPercent: null },
  correspondence: [{ id: 9, question: 'Synthetic shelf-life question.', sectionRef: '3.2.P.8.1',
    priority: 'medium', severity: 'MAJOR', status: 'OPEN', region: 'FDA', dueDate: null, overdue: false, assignedTo: null }],
  meta: { projectId: PROGRAM, portfolioProvisioned: true, sectionsProvisioned: null, generatedAt: '2026-10-16T12:00:00Z' },
};
function authoringCalls() {
  return apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && String(url).startsWith('/api/authoring/'));
}
function specialistResponse(method: string, url: string): Response | Promise<Response> {
  if (method === 'PATCH' && url === '/api/cmc/agency-questions/9') return patchReply();
  if (url.startsWith('/api/cmc/module3-board')) return json(200, { success: true, data: BOARD });
  if (url.startsWith('/api/cmc/quality/qbd/')) return json(200, { success: true, data: {
    cqas: [], cpps: [], inputs: {}, gaps: [], partial: false, unevaluatedInputs: [], analyzedAt: '2026-10-16T12:00:00Z',
  } });
  if (url === '/api/cmc/variations/classify') return json(200, { success: true, data: {
    fdaReportingCategory: 'annual_report', emaVariationCategory: 'type_ia', supacTier: 'level_1', bioequivalence: 'none', rationale: ['Synthetic assessment'],
    validationRequirements: ['Document comparability'], impactedCtdSections: ['3.2.S.2'], citations: ['SUPAC-IR'],
  } });
  if (url === '/api/cmc/control-strategy') return json(200, { success: true, data: STRATEGY });
  if (url === '/api/biostat/assurance') return json(200, { success: true, data: { assurance: 0.72 } });
  if (url === '/api/pharmacovigilance/overview') return json(200, { success: true, data: {
    kpis: { totalAdverseEvents: 0, seriousEvents: 0, expeditedReports: 0, overdueReports: 0, pendingSignals: 0, upcomingPeriodicReports: 0, complianceRate: 0 },
    recentOverdue: [], activeSignals: [], upcomingDeadlines: [],
  } });
  if (url === '/api/pharmacovigilance/signals/screen') return json(200, { success: true, data: {
    rows: [{ result: { signalDetected: true, prr: 3.2, ror: 3.5, rorCi: { lower: 1.8, upper: 6.7 }, chiSquared: 12.4, ebgm: 2.9, eb05: 1.7 } }],
    summary: { total: 1, signals: 1 },
  } });
  if (url === '/api/ana-biostats/compute') return json(200, ENGINE_COMPUTE);
  if (url === '/api/ana-biostats/document') return json(200, ENGINE_DOCUMENT);
  if (url === '/api/analytics/analyze-protocol-text') return json(200, {
    success: true, data: { protocol_data: {
      title: 'Synthetic protocol', indication: 'Synthetic indication', phase: '2',
      sample_size: 240, duration_weeks: 24, primary_endpoint: 'Synthetic outcome', risk_factors: [],
    }, similar_protocols: [] },
  });
  return json(200, { success: true, data: [] });
}
beforeEach(async () => {
  launchScope.enforced = null;
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  await adopt();
  publishShellProject({ id: PROGRAM, title: 'Synthetic specialist project' });
  createReply = () => docReceipt();
  sectionCode = 'recommendations';
  sectionReply = () => sectionReceipt(sectionCode);
  patchReply = () => json(200, { success: true, data: { id: 9, status: 'DRAFTED' } });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'POST' && url === '/api/authoring/docs') return createReply();
    if (method === 'POST' && url === '/api/authoring/sections') {
      sectionCode = String(body?.code); return sectionReply();
    }
    return specialistResponse(method, url);
  });
});
afterEach(() => {
  cleanup(); clearEditorTarget();
  delete window.C2C_PROJECT;
  localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals();
});
async function reporting(onNav = vi.fn()) {
  const view = render(<ReportEngine {...props('report-engine', onNav)} />);
  fireEvent.change(screen.getByLabelText('Protocol synopsis'), { target: { value:
    'Title: Synthetic protocol\nPhase: 2\nSample size: 240\nDuration: 24 weeks\nPrimary endpoint: Synthetic outcome' } });
  fireEvent.click(screen.getByRole('button', { name: 'Analyze protocol' }));
  await screen.findByRole('button', { name: 'Open in document editor' });
  return { ...view, onNav };
}
function openReport() { fireEvent.click(screen.getByRole('button', { name: 'Open in document editor' })); }
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

// These cases intentionally inspect the real one-shot target at navigation.
// They cannot pass merely because a new document happens to sort first.
describe('specialist document identity through the existing editor channel', () => {
  it('Reporting publishes the exact confirmed document, project and section before navigation', async () => {
    const targets: ReturnType<typeof consumeEditorTarget>[] = [];
    const onNav = vi.fn(() => targets.push(consumeEditorTarget()));
    await reporting(onNav); openReport();
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('document-authoring'));
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ docId: DOC_ID, programId: PROGRAM, sectionCode: 'recommendations', docType: null });
    expect(peekEditorTarget()).toBeNull();
    expect(authoringCalls().map(([, url]) => url)).toEqual(['/api/authoring/docs', '/api/authoring/sections']);
    expect(authoringCalls()[0][2]).toMatchObject({ client_program_id: PROGRAM, module: 'M5' });
  });

  it('double clicking the real open control starts one two-request writer', async () => {
    const pending = deferred<Response>(); createReply = () => pending.promise;
    const { onNav } = await reporting();
    const open = screen.getByRole('button', { name: 'Open in document editor' });
    fireEvent.click(open); fireEvent.click(open);
    expect(authoringCalls()).toHaveLength(1);
    await act(async () => pending.resolve(docReceipt()));
    await waitFor(() => expect(onNav).toHaveBeenCalledTimes(1));
    expect(authoringCalls()).toHaveLength(2);
  });
});

describe('late specialist completions own only their starting account and project', () => {
  it('a real token refresh of the same authenticated account preserves the pending handoff', async () => {
    authService.setToken('synthetic-before-refresh', authUser(), 'synthetic-refresh-token', 3600);
    const refreshTransport = vi.fn(async () => json(200, {
      accessToken: 'synthetic-after-refresh', refreshToken: 'synthetic-next-refresh', expiresIn: 3600,
    }));
    vi.stubGlobal('fetch', refreshTransport);
    const pending = deferred<Response>(); sectionReply = () => pending.promise;
    const { onNav } = await reporting(); openReport();
    await waitFor(() => expect(authoringCalls()).toHaveLength(2));
    await act(async () => {
      expect(await authService.refreshToken()).toBe(true);
      pending.resolve(sectionReceipt());
    });
    expect(refreshTransport.mock.calls).toHaveLength(1);
    expect(await authService.getValidAccessToken()).toBe('synthetic-after-refresh');
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('document-authoring'));
    expect(peekEditorTarget()).toMatchObject({ docId: DOC_ID, programId: PROGRAM, sectionCode: 'recommendations' });
  });

  it('same-project metadata updates retain the pending handoff and its exact identity', async () => {
    const pending = deferred<Response>(); sectionReply = () => pending.promise;
    const { onNav } = await reporting(); openReport();
    await waitFor(() => expect(authoringCalls()).toHaveLength(2));
    await act(async () => { updateShellProject({ title: 'Updated display title' }); pending.resolve(sectionReceipt()); });
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('document-authoring'));
    expect(peekEditorTarget()).toMatchObject({ docId: DOC_ID, programId: PROGRAM, sectionCode: 'recommendations' });
  });

  it.each(['project', 'project-away-and-back', 'account', 'organization'] as const)('%s change suppresses navigation after a committed section response', async change => {
    const pending = deferred<Response>(); sectionReply = () => pending.promise;
    const { onNav } = await reporting(); openReport();
    await waitFor(() => expect(authoringCalls()).toHaveLength(2));
    await act(async () => {
      if (change === 'project' || change === 'project-away-and-back') {
        publishShellProject({ id: OTHER_PROGRAM });
        if (change === 'project-away-and-back') publishShellProject({ id: PROGRAM });
      } else await adopt(change === 'account' ? '72' : '71', change === 'organization' ? '9' : '8');
      pending.resolve(sectionReceipt());
    });
    await settle();
    expect(onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull();
    expect(document.querySelector('.de-toast')).toBeNull();
    expect((screen.getByRole('button', { name: 'Open in document editor' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a new project never receives the older request’s refusal status', async () => {
    const pending = deferred<Response>(); sectionReply = () => pending.promise;
    const { onNav } = await reporting(); openReport();
    await waitFor(() => expect(authoringCalls()).toHaveLength(2));
    await act(async () => {
      publishShellProject({ id: OTHER_PROGRAM });
      pending.resolve(json(403, { success: false, error: 'Synthetic section refusal' }));
    });
    await settle();
    expect(onNav).not.toHaveBeenCalled();
    expect(document.querySelector('.de-toast')).toBeNull();
  });

  it('unmounting the specialist prevents its old success from navigating another host', async () => {
    const pending = deferred<Response>(); sectionReply = () => pending.promise;
    const { onNav, unmount } = await reporting(); openReport();
    await waitFor(() => expect(authoringCalls()).toHaveLength(2)); unmount();
    await act(async () => pending.resolve(sectionReceipt())); await settle();
    expect(onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull();
  });
});

describe('Biostatistics distinguishes saved working documents from filed documents', () => {
  it.each([false, null] as const)('binding %s cannot become a dossier-filed claim', async bound => {
    createReply = () => docReceipt(bound);
    render(<Biostatistics {...props('biostatistics')} />);
    await waitFor(() => expect(document.querySelector('.bs-doc-render')?.textContent).toContain('Sample Size Rationale'));
    fireEvent.click(screen.getByRole('button', { name: 'File it to the dossier' }));
    await waitFor(() => expect(document.querySelector('.de-toast')).not.toBeNull());
    const message = document.querySelector('.de-toast')?.textContent ?? '';
    expect(authoringCalls()).toHaveLength(2);
    expect(message).toMatch(/saved/i);
    expect(message).not.toMatch(/filed to the dossier/i);
    if (bound === false) expect(message).toContain('Not bound to a filing');
    expect(peekEditorTarget()).toBeNull();
  });
});


async function cmcChange(onNav: (id: string) => void) {
  launchScope.enforced = false;
  render(<CmChange ask={vi.fn()} nav={onNav} />);
  const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  choose('Dosage form', 'immediate_release_oral_solid'); choose('Change category', 'manufacturing_site');
  choose('Material affected', 'drug_substance'); choose('Touches a critical step', 'no');
  choose('Site change', 'different_site_same_country');
  choose('Change description', 'Synthetic supplier change requiring reviewer assessment.');
  fireEvent.click(screen.getByRole('button', { name: 'Assess proposed variation' }));
  return screen.findByRole('button', { name: 'Open draft assessment in editor' });
}
async function cmcQuality(onNav: (id: string) => void) {
  render(<CmQuality ask={vi.fn()} nav={onNav} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate control strategy' }));
  return screen.findByRole('button', { name: 'Open in editor' });
}
async function cmcCorrespondence(onNav: (id: string) => void) {
  render(<CmPathway ask={vi.fn()} nav={onNav} />);
  await screen.findByText('Synthetic shelf-life question.');
  return screen.getByTitle(/Create a governed response draft/);
}

describe('other existing specialist controls use the exact editor target', () => {
  it.each([true, null] as const)('CMC change refuses deferred assessment when launch scope is %s', async enforced => {
    launchScope.enforced = enforced;
    const onNav = vi.fn();
    render(<CmChange ask={vi.fn()} nav={onNav} />);
    await settle();
    expect(screen.getByText('Postapproval variation assessment is outside this release')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Assess proposed variation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open draft assessment in editor' })).toBeNull();
    expect(apiRequest.mock.calls.some(([, url]) => url === '/api/cmc/variations/classify')).toBe(false);
    expect(authoringCalls()).toHaveLength(0);
    expect(onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull();
  });

  it.each([
    ['CMC change', cmcChange, 'regulatory_change_impact_assessment'],
    ['CMC quality', cmcQuality, 'cmc_control_strategy'],
    ['CMC correspondence', cmcCorrespondence, 'agency_question_response'],
  ] as const)('%s retains doc, project and code at actual navigation', async (_name, prepare, code) => {
    const targets: ReturnType<typeof consumeEditorTarget>[] = [];
    const onNav = vi.fn(() => targets.push(consumeEditorTarget()));
    fireEvent.click(await prepare(onNav));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('document-authoring'));
    expect(targets[0]).toMatchObject({ docId: DOC_ID, programId: PROGRAM, sectionCode: code, docType: null });
    expect(authoringCalls()).toHaveLength(2);
    expect(authoringCalls()[0][2]).toMatchObject({ module: 'M3', client_program_id: PROGRAM });
  });

  it('Biostatistics Open passes its saved document rather than depending on list order', async () => {
    const targets: ReturnType<typeof consumeEditorTarget>[] = [];
    const onNav = vi.fn(() => targets.push(consumeEditorTarget()));
    render(<Biostatistics {...props('biostatistics', onNav)} />);
    await waitFor(() => expect(document.querySelector('.bs-doc-render')?.textContent).toContain('Sample Size Rationale'));
    fireEvent.click(screen.getByRole('button', { name: 'Open in document editor' }));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('document-authoring'));
    expect(targets[0]).toMatchObject({ docId: DOC_ID, programId: PROGRAM, sectionCode: 'sample_size_rationale' });
  });

  it('a late correspondence lifecycle receipt cannot navigate or show status in the next project', async () => {
    const pending = deferred<Response>(); patchReply = () => pending.promise;
    const onNav = vi.fn(); fireEvent.click(await cmcCorrespondence(onNav));
    await waitFor(() => expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(true));
    expect(authoringCalls()).toHaveLength(2);
    await act(async () => {
      publishShellProject({ id: OTHER_PROGRAM });
      pending.resolve(json(409, { error: 'Synthetic lifecycle conflict from previous project' }));
    });
    await settle();
    expect(onNav).not.toHaveBeenCalled();
    expect(document.querySelector('.de-toast')).toBeNull();
    expect(peekEditorTarget()).toBeNull();
  });
});

async function calculatorInsert() {
  render(<BiostatWorkbench {...props('biostat-workbench')} />);
  for (const [label, value] of [[/Prior mean effect/, '0.4'], [/^Prior SD/, '0.15'], [/^n per arm/, '120']] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }));
  return screen.findByRole('button', { name: 'Insert into document' });
}
async function pvInsert() {
  render(<PvCockpit {...props('pv-cockpit')} />);
  const fields = screen.getAllByRole('textbox');
  for (const [index, value] of ['Synthetic drug', 'Synthetic event', '20', '80', '10', '890'].entries()) {
    fireEvent.change(fields[index], { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Screen' }));
  return screen.findByRole('button', { name: 'Insert into document' });
}

describe('non-navigating specialist insertions retain their current host status', () => {
  it.each([['calculator', calculatorInsert], ['PV', pvInsert]] as const)('%s does not toast an old write into a new project', async (_name, prepare) => {
    const pending = deferred<Response>(); sectionReply = () => pending.promise;
    const button = await prepare();
    const previousMessage = document.querySelector('.de-toast')?.textContent ?? null;
    fireEvent.click(button);
    await waitFor(() => expect(authoringCalls()).toHaveLength(2));
    await act(async () => { publishShellProject({ id: OTHER_PROGRAM }); pending.resolve(sectionReceipt(sectionCode)); });
    await settle();
    expect(document.querySelector('.de-toast')?.textContent ?? null).toBe(previousMessage);
    expect(peekEditorTarget()).toBeNull();
  });
});
