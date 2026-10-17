// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const m = vi.hoisted(() => ({ api: vi.fn(), sign: vi.fn(), imported: vi.fn() }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: m.api }));
vi.mock('../../_shared/components/EsignModal', () => ({ EsignModal: ({ open, onSign }: any) => open ? <button onClick={() => onSign({ meaning: 'review', reason: 'Reviewed retained measured results', password: 'secret-password', totp: '123456' }).then(m.sign)}>Confirm reviewed signature</button> : null }));
vi.mock('../editor/SourceImportDialog', async original => ({ ...await original<typeof import('../editor/SourceImportDialog')>(),
  SourceImportDialog: ({ source, onOpenDocument }: any) => <button onClick={() => { m.imported(source); onOpenDocument('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); }}>Open verified working copy</button> }));
import { BlaAssessmentWorkbench } from '../surfaces/BlaAssessmentWorkbench';
import { IvdAssessmentWorkbench, enteredIvdrFacts } from '../surfaces/IvdAssessmentWorkbench';
import { enteredMeasurements } from '../surfaces/AssessmentWorkbenchKit';
import { enteredNativeBlaInput } from '../surfaces/BlaAssessmentInputs';
import { clearShellProject, publishShellProject } from '../shellProject';
import { peekEditorTarget } from '../editorTarget';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
beforeEach(() => { m.api.mockReset(); m.sign.mockReset(); m.imported.mockReset(); publishShellProject({ id: PROGRAM, title: 'Actual open program' }); });
afterEach(() => { cleanup(); clearShellProject(); });
function fill(values: Record<string,string>) {
  const form = within(screen.getByRole('dialog'));
  for (const [label,value] of Object.entries(values)) fireEvent.change(form.getByLabelText(new RegExp(label)), { target: { value } });
  return form;
}
const common = { 'Saved assessment title': 'Recorded evidence', 'Reason for saving': 'Retaining these actual scientific facts' };

describe('deferred assessment UI completion', () => {
  it('rejects missing or nonfinite measured data and unanswered device facts', () => {
    expect(enteredMeasurements('1, 2e-3; -4')).toEqual([1,.002,-4]);
    for (const text of ['', 'NaN', 'Infinity', '1, missing', '1e309']) expect(() => enteredMeasurements(text)).toThrow();
    expect(() => enteredIvdrFacts({ deviceName: 'Assay', intendedPurpose: 'Diagnosis' })).toThrow('explicitly');
  });
  it('keeps unknown scientific facts unrecorded across the other native BLA forms',()=>{
    expect(enteredNativeBlaInput('analytical-similarity',{referenceProduct:'Recorded reference',attribute:'Potency',tier:'1',reference:'95,96',test:'96,97'})).toMatchObject({attributes:[{tier:1,reference:[95,96],test:[96,97]}]});
    const immune=enteredNativeBlaInput('immunogenicity',{label:'Actual arm',nSubjects:'20',adaPositive:'3',chronicDosing:'Yes'});
    expect(immune).toEqual({arms:[{label:'Actual arm',nSubjects:20,adaPositive:3}],riskFactors:{chronicDosing:true}});
    expect(()=>enteredNativeBlaInput('immunogenicity',{label:'Actual arm',nSubjects:'20',adaPositive:'30'})).toThrow('cannot exceed');
    expect(enteredNativeBlaInput('filing-risk',{form356h:'No',inspectionReady:'Yes',stabilityMonths:'6'})).toEqual({readiness:{inspectionReady:true,stabilityMonths:6},administrative:{form356h:false}});
  });
  it('creates the first BLA draft from entered measurements, reads its saved snapshot and signs that exact id', async () => {
    let saved: any = null;
    m.api.mockImplementation(async (method: string, path: string, input: any) => {
      if (method === 'GET' && path.includes('?programId=')) return ok({ assessments: saved ? [saved] : [] });
      if (method === 'GET') return ok(saved);
      if (path.endsWith('/comparability')) {
        expect(input).toMatchObject({ programId: PROGRAM, persist: true, attributes: [{ name: 'Potency', preChange: [95,96,97], postChange: [96,97,98], criticality: 'high' }] });
        saved = { id: ID, program_id: PROGRAM, title: input.title, kind: 'comparability', status: 'draft', verdict: 'comparable', input, result: { conclusion: 'comparable', summary: 'Exact retained engine result' } };
        return ok({ result: saved.result, assessment: saved });
      }
      expect(path).toBe(`/api/biopharma/bla/assessments/${ID}/sign`);
      expect(input).toMatchObject({ meaning: 'review', reason: 'Reviewed retained measured results', password: 'secret-password', mfaToken: '123456' });
      saved.status = 'signed'; return ok({ id: ID, status: 'signed', signatureId: 'real-signature', signedAt: '2026-10-14T03:00:00Z', sha256Chain: 'a'.repeat(64) });
    });
    render(<BlaAssessmentWorkbench />);
    await screen.findByText('No assessments are saved for this program.');
    fireEvent.click(screen.getByRole('button', { name: 'Assess Q5E comparability' }));
    const form = fill({ ...common, 'Manufacturing change': 'Changed purification step', 'Quality attribute': 'Potency', 'Attribute criticality': 'high', 'Pre-change lot measurements': '95,96,97', 'Post-change lot measurements': '96,97,98' });
    fireEvent.click(form.getByRole('button', { name: 'Compute and save draft' }));
    await screen.findByText(/Exact retained engine result/);
    fireEvent.click(screen.getByRole('button', { name: 'Review and sign saved assessment' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reviewed signature' }));
    await waitFor(() => expect(m.sign).toHaveBeenCalledWith(expect.objectContaining({ hash: 'a'.repeat(64), signedAt: '2026-10-14T03:00:00Z', meaning: 'review' })));
  });
  it('never claims a BLA save on an unconfirmed response or blindly retries the POST', async () => {
    m.api.mockImplementation(async (method: string) => ok(method === 'GET' ? { assessments: [] } : { result: { conclusion: 'comparable' }, assessment: null }));
    render(<BlaAssessmentWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: 'Assess Q5E comparability' }));
    const form = fill({ ...common, 'Manufacturing change': 'Change', 'Quality attribute': 'Potency', 'Attribute criticality': 'high', 'Pre-change lot measurements': '1,2', 'Post-change lot measurements': '2,3' });
    fireEvent.click(form.getByRole('button', { name: 'Compute and save draft' }));
    await screen.findByText(/Save was not confirmed/);
    await waitFor(() => expect((form.getByRole('button', { name: 'Compute and save draft' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(form.getByRole('button', { name: 'Compute and save draft' }));
    await screen.findByText(/Refresh and check saved records before submitting again/);
    expect(m.api.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
  });
  it('saves explicit IVDR facts and hands the exact saved assessment into verified Authoring import', async () => {
    let saved: any = null;
    m.api.mockImplementation(async (method: string, path: string, input: any) => {
      if (method === 'GET') return ok({ rows: path.includes('/documents') ? [] : saved ? [saved] : [] });
      expect(path).toBe('/api/ivd-assessments/classification');
      expect(input).toMatchObject({ programId: PROGRAM, facts: { intendedPurpose: 'Select patients for treatment', isCompanionDiagnostic: true, bloodScreening: false, isSelfTest: false } });
      expect(input.result).toBeUndefined();
      saved = { id: ID, program_id: PROGRAM, title: input.title, assessment_type: 'ivdr_classification', inputs: input.facts, result: { classification: 'C', ruleTrace: ['Recorded rule trace'] }, verdict: 'C' };
      return ok(saved);
    });
    const onNav = vi.fn(); render(<IvdAssessmentWorkbench onNav={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assess IVDR classification' }));
    const form = fill({ ...common, 'Device name': 'Entered CDx assay', 'Intended purpose': 'Select patients for treatment', 'Self-test': 'No', 'Near-patient test': 'No', 'Companion diagnostic': 'Yes', 'Detects a transmissible agent': 'No', 'Screens blood': 'No', 'Detects cancer': 'No', 'Prenatal screening': 'No', 'Genetic test': 'No' });
    fireEvent.click(form.getByRole('button', { name: 'Assess and save draft' }));
    await screen.findByText(/Recorded rule trace/);
    fireEvent.click(screen.getByRole('button', { name: 'Create working copy for review and signing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open verified working copy' }));
    expect(m.imported).toHaveBeenCalledWith({ kind: 'ivd-assessment', documentId: ID });
    expect(peekEditorTarget()).toMatchObject({ docId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', programId: PROGRAM });
    expect(onNav).toHaveBeenCalledWith('document-authoring');
  });
  it('generates an FSN draft from entered action facts and reads the actual saved payload', async () => {
    let saved: any = null;
    m.api.mockImplementation(async (method: string, path: string, input: any) => {
      if (method === 'GET') return ok({ rows: path.includes('/documents') && saved ? [saved] : [] });
      expect(path).toBe('/api/ivd-assessments/documents/fsn');
      expect(input.facts).toMatchObject({ affectedLots: ['L-7','L-8'], actionType: 'recall', riskToHealth: 'Recorded false negative risk' });
      saved = { id: ID, program_id: PROGRAM, doc_type: 'fsn', title: input.title, status: 'draft', payload: { documentType: 'FSN', riskToHealth: input.facts.riskToHealth } }; return ok(saved);
    });
    render(<IvdAssessmentWorkbench onNav={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Draft Field Safety Notice' }));
    const form = fill({ ...common, Manufacturer: 'Manufacturer Ltd', 'Affected device': 'Assay X', 'Affected lots': 'L-7,L-8', 'Field action': 'recall', 'Reason for the field action': 'Lot issue', 'Risk to health': 'Recorded false negative risk', 'Recommended user action': 'Stop use', 'Contact details': 'manufacturer@example.test' });
    fireEvent.click(form.getByRole('button', { name: 'Generate and save draft' }));
    await screen.findByText(/Recorded false negative risk/);
    expect(await screen.findByText('Saved document status: draft')).toBeTruthy();
  });
  it('requires the open program and never creates an inferred program association', () => {
    clearShellProject(); render(<><BlaAssessmentWorkbench /><IvdAssessmentWorkbench /></>);
    expect(screen.queryByRole('button', { name: 'Assess Q5E comparability' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assess IVDR classification' })).toBeNull();
    expect(m.api).not.toHaveBeenCalled();
  });
});
