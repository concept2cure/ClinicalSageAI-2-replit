// @vitest-environment jsdom
/** Actual specialist controls, canonical writer and editor-target channel.
 * Only transport is synthetic; no provider or alternate editor is involved. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SurfaceViewProps } from '../surfaceViews';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));

import { ReportEngine } from '../surfaces/ReportEngine';
import { Biostatistics } from '../surfaces/Biostatistics';
import { BiostatWorkbench } from '../surfaces/BiostatWorkbench';
import { PvCockpit } from '../surfaces/PvCockpit';
import { CmChange, CmPathway } from '../surfaces/CmcModule';
import { CmQuality } from '../surfaces/CmcQuality';
import { authService } from '@/services/portal/authService';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
import { publishShellProject } from '../shellProject';

const PROGRAM = '0b9f6c2e-5d4a-4c3b-9a21-7e6f5d4c3b2a';
const OTHER_PROGRAM = 'abcd1234-1234-4234-8234-1234567890ab';
const DOC_ID = 'saved-specialist-document';
const SECTION_ID = 'saved-specialist-section';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const docReceipt = (bound: boolean | null = true, programId = PROGRAM) => json(201, {
  success: true,
  document: { id: DOC_ID, title: 'Saved specialist document', module: 'M5', client_program_id: programId },
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
let readReply: (url: string) => Response | Promise<Response>;
let protocolTitle: string;
const listReceipt = (programId = PROGRAM) => json(200, { success: true, documents: [
  { id: DOC_ID, title: 'Saved specialist document', program_id: programId },
] });
const detailReceipt = () => json(200, { success: true, document: {
  id: DOC_ID, title: 'Saved specialist document', client_program_id: PROGRAM,
} });
const sectionsReceipt = (rows: unknown[] = []) => json(200, { success: true, sections: rows });
function authoringReads() {
  return apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && String(url).startsWith('/api/authoring/'));
}
function correspondencePatches() { return apiRequest.mock.calls.filter(([method]) => method === 'PATCH'); }

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
      title: protocolTitle, indication: 'Synthetic indication', phase: '2',
      sample_size: 240, duration_weeks: 24, primary_endpoint: 'Synthetic outcome', risk_factors: [],
    }, similar_protocols: [] },
  });
  return json(200, { success: true, data: [] });
}
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); clearEditorTarget();
  await adopt();
  publishShellProject({ id: PROGRAM, title: 'Synthetic specialist project' });
  createReply = () => docReceipt();
  sectionCode = 'recommendations';
  sectionReply = () => sectionReceipt(sectionCode);
  patchReply = () => json(200, { success: true, data: { id: 9, status: 'DRAFTED' } });
  protocolTitle = 'Synthetic protocol';
  readReply = url => url.includes('?') ? listReceipt() : url.endsWith('/sections') ? sectionsReceipt() : detailReceipt();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'GET' && url.startsWith('/api/authoring/')) return readReply(url);
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

describe('independent actual caller recovery admission', () => {
  it('Biostatistics Open and Attach share one synchronous creation lane', async () => {
    const pending = deferred<Response>(); createReply = () => pending.promise;
    render(<Biostatistics {...props('biostatistics')} />);
    await waitFor(() => expect(document.querySelector('.bs-doc-render')?.textContent).toContain('Sample Size Rationale'));
    const open = screen.getByRole('button', { name: 'Open in document editor' });
    const attach = screen.getByRole('button', { name: 'File it to the dossier' });
    act(() => { fireEvent.click(open); fireEvent.click(attach); });
    expect(authoringCalls()).toHaveLength(1);
    await act(async () => pending.resolve(docReceipt()));
    await settle();
  });
  it('Reporting retains an unknown document attempt and prevents repeat creation', async () => {
    createReply = () => { throw new TypeError('Synthetic lost document response'); };
    await reporting(); openReport(); await settle();
    openReport(); await settle();
    expect(authoringCalls()).toHaveLength(1);
  });
  it('Reporting retains a known document after a lost section response', async () => {
    sectionReply = () => { throw new TypeError('Synthetic lost section response'); };
    await reporting(); openReport(); await settle();
    openReport(); await settle();
    expect(authoringCalls().filter(([, url]) => url === '/api/authoring/docs')).toHaveLength(1);
    expect(authoringCalls().filter(([, url]) => url === '/api/authoring/sections')).toHaveLength(1);
  });
});

async function clickRecovery(label: string) {
  fireEvent.click(await screen.findByRole('button', { name: label })); await settle();
}
async function prepareBiostatistics() {
  const view = render(<Biostatistics {...props('biostatistics')} />);
  await waitFor(() => expect(document.querySelector('.bs-doc-render')?.textContent).toContain('Sample Size Rationale'));
  return { ...view, action: screen.getByRole('button', { name: 'File it to the dossier' }) };
}
async function prepareCalculator() {
  const view = render(<BiostatWorkbench {...props('biostat-workbench')} />);
  for (const [label, value] of [[/Prior mean effect/, '0.4'], [/^Prior SD/, '0.15'], [/^n per arm/, '120']] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Compute' }));
  return { ...view, action: await screen.findByRole('button', { name: 'Insert into document' }) };
}
async function preparePv() {
  const view = render(<PvCockpit {...props('pv-cockpit')} />);
  for (const [index, value] of ['Synthetic drug', 'Synthetic event', '20', '80', '10', '890'].entries()) {
    fireEvent.change(screen.getAllByRole('textbox')[index], { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Screen' }));
  return { ...view, action: await screen.findByRole('button', { name: 'Insert into document' }) };
}
async function prepareChange() {
  const view = render(<CmChange ask={vi.fn()} nav={vi.fn()} />);
  fireEvent.change(screen.getByLabelText(/Describe the change/), { target: { value: 'Synthetic supplier change requiring reviewer assessment.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Simulate change' }));
  return { ...view, action: screen.getByRole('button', { name: 'Open in editor' }) };
}
async function prepareQuality() {
  const view = render(<CmQuality ask={vi.fn()} nav={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate control strategy' }));
  return { ...view, action: await screen.findByRole('button', { name: 'Open in editor' }) };
}
async function prepareCorrespondence(onNav = vi.fn()) {
  const view = render(<CmPathway ask={vi.fn()} nav={onNav} />);
  await screen.findByText('Synthetic shelf-life question.');
  return { ...view, onNav, action: screen.getByTitle(/Create a governed response draft/) };
}

describe('the six existing modules retain uncertain writes beside their real controls', () => {
  it.each([
    ['Biostatistics', prepareBiostatistics], ['calculator', prepareCalculator],
    ['PV', preparePv], ['CMC change', prepareChange], ['CMC quality', prepareQuality],
    ['CMC correspondence', prepareCorrespondence],
  ] as const)('%s cannot create a second document while the first identity is unknown', async (_name, prepare) => {
    createReply = () => { throw new TypeError('Synthetic transport interrupted after document request'); };
    const { action } = await prepare();
    fireEvent.click(action); await settle();
    expect(await screen.findByRole('button', { name: 'Check working documents' })).toBeTruthy();
    fireEvent.click(action); await settle();
    expect(authoringCalls()).toHaveLength(1);
    expect(authoringReads()).toHaveLength(0);
    expect(correspondencePatches()).toHaveLength(0);
  });
});

describe('read-only recovery and deliberate saved-text continuation', () => {
  it('checks a known parent and resumes only the original section payload after the source result changes', async () => {
    sectionReply = () => json(403, { success: false, error: 'Synthetic text refusal' });
    const { onNav } = await reporting(); openReport(); await settle();
    expect(authoringCalls()).toHaveLength(2);
    const original = { ...authoringCalls()[1][2] };
    protocolTitle = 'Changed protocol result';
    fireEvent.change(screen.getByLabelText('Protocol synopsis'), { target: { value: 'Changed source protocol for independent test.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze protocol' })); await settle();
    await clickRecovery('Check document sections');
    expect(authoringReads().map(([, url]) => url)).toEqual([
      `/api/authoring/docs?status=all&programId=${PROGRAM}`,
      `/api/authoring/docs/${DOC_ID}`, `/api/authoring/docs/${DOC_ID}/sections`,
    ]);
    expect(authoringCalls()).toHaveLength(2);
    expect(onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull();
    expect(await screen.findByRole('button', { name: 'Continue saving text' })).toBeTruthy();
    sectionReply = () => sectionReceipt();
    await clickRecovery('Continue saving text');
    expect(authoringCalls()).toHaveLength(3);
    expect(authoringCalls()[2]).toEqual(['POST', '/api/authoring/sections', original]);
    expect(String(original.content)).toContain('Synthetic protocol');
    expect(String(original.content)).not.toContain('Changed protocol result');
    expect(onNav).not.toHaveBeenCalled();
    await clickRecovery('Open saved document');
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(peekEditorTarget()).toMatchObject({ docId: DOC_ID, programId: PROGRAM, sectionCode: 'recommendations' });
  });

  it('preserves a matching section code with different text and opens that exact row only on inspection', async () => {
    sectionReply = () => { throw new TypeError('Synthetic section response lost'); };
    readReply = url => url.includes('?') ? listReceipt() : url.endsWith('/sections') ? sectionsReceipt([
      { id: 'another-writers-section', doc_id: DOC_ID, code: ' RECOMMENDATIONS ', title: 'Independent saved text', content: '<p>Another reviewer wrote this.</p>' },
    ]) : detailReceipt();
    const { onNav } = await reporting(); openReport(); await settle();
    await clickRecovery('Check document sections');
    expect(authoringCalls()).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Continue saving text' })).toBeNull();
    expect(onNav).not.toHaveBeenCalled();
    await clickRecovery('Open document to review');
    expect(peekEditorTarget()).toMatchObject({ docId: DOC_ID, programId: PROGRAM });
    expect(authoringCalls()).toHaveLength(2);
    expect(correspondencePatches()).toHaveLength(0);
  });

  it('a scoped inventory check never guesses which unknown document response belonged to this request', async () => {
    createReply = () => { throw new TypeError('Synthetic unknown document identity'); };
    const { onNav } = await reporting(); openReport(); await settle();
    await clickRecovery('Check working documents');
    expect(authoringReads()).toHaveLength(1);
    expect(authoringCalls()).toHaveLength(1);
    expect(peekEditorTarget()).toBeNull();
    expect(onNav).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Open saved document' })).toBeNull();
    createReply = () => docReceipt();
    openReport(); await settle();
    expect(authoringCalls().filter(([, url]) => url === '/api/authoring/docs')).toHaveLength(2);
  });

  it('repeated explicit open reuses the exact confirmed receipt without another document or section write', async () => {
    readReply = url => url.includes('?') ? listReceipt() : url.endsWith('/sections') ? sectionsReceipt([
      { id: SECTION_ID, doc_id: DOC_ID, code: 'recommendations', title: 'Saved specialist document', content: '<p>Saved working text.</p>' },
    ]) : detailReceipt();
    const { onNav } = await reporting(); openReport(); await settle();
    expect(onNav).toHaveBeenCalledTimes(1);
    clearEditorTarget(); openReport(); await settle();
    expect(authoringCalls()).toHaveLength(2);
    expect(onNav).toHaveBeenCalledTimes(2);
    expect(peekEditorTarget()).toMatchObject({ docId: DOC_ID, programId: PROGRAM, sectionCode: 'recommendations' });
  });

  it('a failed correspondence lifecycle PATCH leaves the saved draft inspectable without replaying that PATCH', async () => {
    patchReply = () => json(409, { success: false, error: 'Synthetic concurrent correspondence change' });
    const { onNav, action } = await prepareCorrespondence();
    fireEvent.click(action); await settle();
    expect(authoringCalls()).toHaveLength(2);
    expect(correspondencePatches()).toHaveLength(1);
    expect(onNav).not.toHaveBeenCalled();
    expect(await screen.findByText(/The draft was created, but the correspondence file was not updated/)).toBeTruthy();
    await clickRecovery('Open saved document');
    expect(authoringCalls()).toHaveLength(2);
    expect(correspondencePatches()).toHaveLength(1);
    expect(peekEditorTarget()).toMatchObject({ docId: DOC_ID, programId: PROGRAM, sectionCode: 'agency_question_response' });
  });

  it('checking an interrupted correspondence section never advances the agency-question lifecycle', async () => {
    sectionReply = () => { throw new TypeError('Synthetic unknown response draft text'); };
    readReply = url => url.includes('?') ? listReceipt() : url.endsWith('/sections') ? sectionsReceipt([
      { id: SECTION_ID, doc_id: DOC_ID, code: 'agency_question_response', title: 'Saved response', content: '<p>Saved before disconnect.</p>' },
    ]) : detailReceipt();
    const { onNav, action } = await prepareCorrespondence();
    fireEvent.click(action); await settle();
    await clickRecovery('Check document sections');
    expect(authoringCalls()).toHaveLength(2);
    expect(correspondencePatches()).toHaveLength(0);
    expect(onNav).not.toHaveBeenCalled();
    await clickRecovery('Open document to review');
    expect(correspondencePatches()).toHaveLength(0);
    expect(peekEditorTarget()).toMatchObject({ docId: DOC_ID, programId: PROGRAM });
  });
});

describe('late explicit recovery cannot publish across account or project visits', () => {
  it.each(['project-away-and-back', 'account', 'organization', 'unmount'] as const)('%s suppresses a late inventory check', async change => {
    createReply = () => { throw new TypeError('Synthetic unknown creation'); };
    const pending = deferred<Response>(); readReply = () => pending.promise;
    const { onNav, unmount } = await reporting(); openReport(); await settle();
    fireEvent.click(await screen.findByRole('button', { name: 'Check working documents' }));
    expect(authoringReads()).toHaveLength(1);
    await act(async () => {
      if (change === 'unmount') unmount();
      else if (change === 'project-away-and-back') {
        publishShellProject({ id: OTHER_PROGRAM }); publishShellProject({ id: PROGRAM });
      } else await adopt(change === 'account' ? '72' : '71', change === 'organization' ? '9' : '8');
      pending.resolve(listReceipt());
    });
    await settle();
    expect(onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull();
    expect(screen.queryByText('Saved specialist document · ' + DOC_ID)).toBeNull();
    expect(authoringCalls()).toHaveLength(1);
    if (change === 'project-away-and-back') {
      openReport(); await settle();
      expect(authoringCalls()).toHaveLength(1);
    }
  });

  it.each(['check', 'continuation'] as const)('an older %s finalizer cannot release a newer project save', async older => {
    const oldRead = deferred<Response>(); const oldSection = deferred<Response>();
    const newerDocument = deferred<Response>();
    const { onNav } = await reporting();
    if (older === 'check') {
      createReply = () => { throw new TypeError('Synthetic unknown original document'); };
      openReport(); await settle(); readReply = () => oldRead.promise;
      fireEvent.click(await screen.findByRole('button', { name: 'Check working documents' }));
    } else {
      sectionReply = () => json(403, { success: false, error: 'Synthetic section refusal' });
      openReport(); await settle(); await clickRecovery('Check document sections');
      sectionReply = () => oldSection.promise;
      fireEvent.click(await screen.findByRole('button', { name: 'Continue saving text' }));
    }
    await act(async () => { publishShellProject({ id: OTHER_PROGRAM }); });
    createReply = () => newerDocument.promise;
    const newerOpen = screen.getByRole('button', { name: 'Open in document editor' });
    fireEvent.click(newerOpen); await settle();
    const writesBeforeOldFinishes = authoringCalls().length;
    expect(authoringCalls().filter(([, url]) => url === '/api/authoring/docs')).toHaveLength(2);
    await act(async () => {
      if (older === 'check') oldRead.resolve(listReceipt());
      else oldSection.resolve(sectionReceipt());
    });
    await settle(); fireEvent.click(newerOpen); await settle();
    expect(authoringCalls()).toHaveLength(writesBeforeOldFinishes);
    expect(onNav).not.toHaveBeenCalled();
    expect(peekEditorTarget()).toBeNull();
    sectionReply = () => sectionReceipt();
    await act(async () => newerDocument.resolve(docReceipt(true, OTHER_PROGRAM)));
    await settle();
    expect(onNav).toHaveBeenCalledTimes(1);
    expect(peekEditorTarget()).toMatchObject({ docId: DOC_ID, programId: OTHER_PROGRAM, sectionCode: 'recommendations' });
  });
});

describe('fresh verification preserves intervening saved work', () => {
  it('a section saved after Check prevents section-only continuation from overwriting it', async () => {
    sectionReply = () => json(409, { success: false, error: 'Synthetic section conflict' });
    const { onNav } = await reporting(); openReport(); await settle();
    await clickRecovery('Check document sections');
    readReply = url => url.includes('?') ? listReceipt() : url.endsWith('/sections') ? sectionsReceipt([
      { id: 'intervening-section', doc_id: DOC_ID, code: 'RECOMMENDATIONS', title: 'Current saved work', content: '<p>Preserve this later edit.</p>' },
    ]) : detailReceipt();
    await clickRecovery('Continue saving text');
    expect(authoringCalls()).toHaveLength(2);
    expect(authoringReads()).toHaveLength(6);
    expect(onNav).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Continue saving text' })).toBeNull();
    await clickRecovery('Open document to review');
    expect(peekEditorTarget()).toMatchObject({ docId: DOC_ID, programId: PROGRAM, sectionCode: 'RECOMMENDATIONS' });
  });
  it('the confirmed empty document opens without inventing a section target', async () => {
    sectionReply = () => json(403, { success: false, error: 'Synthetic section refusal' });
    await reporting(); openReport(); await settle();
    await clickRecovery('Check document sections');
    await clickRecovery('Open document to review');
    expect(authoringCalls()).toHaveLength(2);
    expect(peekEditorTarget()).toMatchObject({ docId: DOC_ID, programId: PROGRAM, sectionCode: null });
  });
  it('an empty section list cannot establish a parent missing from the scoped inventory', async () => {
    sectionReply = () => { throw new TypeError('Synthetic unknown section'); };
    readReply = () => json(200, { success: true, documents: [] });
    await reporting(); openReport(); await settle();
    await clickRecovery('Check document sections');
    expect(authoringReads()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Continue saving text' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open document to review' })).toBeNull();
    openReport(); await settle(); expect(authoringCalls()).toHaveLength(2);
  });
  it.each(['missing-section', 'refused-read'] as const)('a repeated completed action stays held after %s instead of creating another copy', async state => {
    const { onNav } = await reporting(); openReport(); await settle();
    expect(onNav).toHaveBeenCalledTimes(1); clearEditorTarget();
    if (state === 'refused-read') readReply = () => json(403, { success: false, error: 'Synthetic revoked read permission' });
    openReport(); await settle();
    expect(authoringCalls()).toHaveLength(2);
    expect(onNav).toHaveBeenCalledTimes(1);
    expect(peekEditorTarget()).toBeNull();
    openReport(); await settle(); expect(authoringCalls()).toHaveLength(2);
  });
});
