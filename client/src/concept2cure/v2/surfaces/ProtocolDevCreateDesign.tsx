import React, { useRef, useState } from 'react';
import { apiCall, apiErrorText } from '../apiCall';
import { C2CForm, type C2CFormConfig } from '../C2CForm';
import type { StudyDesign } from '../../../../../server/services/study-design/study-design-types';

const FORM: C2CFormConfig = {
  eyebrow: 'Protocol · study design', title: 'Create a study design', governed: true,
  sub: 'Save a draft design and bind it to this protocol. Its recorded inputs run through the design gates; missing estimands, statistical assumptions and other inputs remain findings.',
  submitLabel: 'Create and bind design',
  fields: [
    { key: 'title', label: 'Study design title', type: 'text', required: true },
    { key: 'phase', label: 'Phase', type: 'select', required: true, options: ['FIH', '1', '1b', '2', '2b', '3', '3b', '4'], half: true },
    { key: 'indication', label: 'Indication', type: 'text', required: true, half: true },
    { key: 'objective', label: 'Primary objective', type: 'textarea', required: true },
    { key: 'endpointName', label: 'Primary endpoint name', type: 'text', required: true },
    { key: 'endpointType', label: 'Endpoint type', type: 'select', required: true,
      options: ['continuous', 'binary', 'time_to_event', 'ordinal', 'count', 'composite', 'patient_reported'], half: true },
    { key: 'timepoint', label: 'Endpoint timepoint', type: 'text', half: true },
    { key: 'endpointDefinition', label: 'Endpoint definition', type: 'textarea', required: true },
    { key: 'population', label: 'Target population', type: 'textarea', required: true },
    { key: 'inferentialFrame', label: 'Inferential framework', type: 'select', required: true,
      options: ['superiority', 'non_inferiority', 'equivalence'], half: true },
    { key: 'structuralDesign', label: 'Study structure', type: 'select', required: true,
      options: ['parallel_group', 'crossover', 'factorial', 'dose_ranging', 'single_arm', 'adaptive', 'platform', 'basket', 'umbrella', 'mams'], half: true },
    { key: 'controlType', label: 'Control type', type: 'select', required: true,
      options: ['placebo', 'active', 'dose_response', 'external', 'historical', 'none'], half: true },
    { key: 'controlJustification', label: 'Control justification', type: 'textarea' },
    { key: 'intervention', label: 'Investigational intervention (optional)', type: 'text' },
    { key: 'reason', label: 'Reason for change (governed)', type: 'textarea', required: true,
      placeholder: 'Why this design is being created and linked — at least 8 characters.' },
  ],
};

/** Only entered facts are recorded. Empty scientific inputs stay empty. */
export function initialStudyDesign(values: Record<string, string>, programId: string): StudyDesign {
  return {
    programId, title: values.title.trim(), phase: values.phase as StudyDesign['phase'], indication: values.indication.trim(), status: 'draft',
    objectives: [{ level: 'primary', order: 1, text: values.objective.trim(), endpointName: values.endpointName.trim() }],
    endpoints: [{ role: 'primary', name: values.endpointName.trim(), type: values.endpointType as StudyDesign['endpoints'][number]['type'],
      definition: values.endpointDefinition.trim(), ...(values.timepoint?.trim() ? { timepoint: values.timepoint.trim() } : {}) }],
    estimands: [],
    framework: { inferentialFrame: values.inferentialFrame as StudyDesign['framework']['inferentialFrame'],
      structuralDesign: values.structuralDesign as StudyDesign['framework']['structuralDesign'],
      controlType: values.controlType as StudyDesign['framework']['controlType'],
      ...(values.controlJustification?.trim() ? { controlJustification: values.controlJustification.trim() } : {}) },
    population: { targetDescription: values.population.trim(), analysisPopulations: [], eligibility: [] },
    arms: values.intervention?.trim() ? [{ name: values.intervention.trim(), interventions: [{ name: values.intervention.trim(), role: 'investigational' }] }] : [],
    statisticalPlan: { plannedAnalyses: [] },
  };
}

async function confirmedPost(path: string, body: Record<string, unknown>) {
  const result = await apiCall('POST', path, body);
  if (!result.ok) {
    throw Object.assign(new Error(apiErrorText(result, 'Could not confirm the governed study design change.')), { status: result.status });
  }
  return result.body;
}

interface CreateDesignProps {
  documentId: number; programId: string; onCancel: () => void;
  onDone: () => void; onSaved: () => void;
}

function designReason(values: Record<string, string>, saved: { reason: string } | null): string {
  return (saved?.reason || values.reason || '').trim();
}

export function CreateDesignDrawer({ documentId, programId, onCancel, onDone, onSaved }: CreateDesignProps) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ studyId: string; reason: string } | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const bind = async (receipt: { studyId: string; reason: string }) => {
    await confirmedPost(`/api/protocol-development/documents/${documentId}/study-design`, { studyDesignId: receipt.studyId, reason: receipt.reason });
    onDone();
  };
  const submit = async (values: Record<string, string>) => {
    if (unconfirmed) { onCancel(); return; }
    if (running.current) return;
    const reason = designReason(values, saved);
    if (reason.length < 8) { setError('The governed reason must be at least 8 characters. Nothing was written.'); return; }
    running.current = true; setBusy(true); setError(null);
    let receipt = saved;
    try {
      if (!receipt) {
        const json = await confirmedPost('/api/study-design/persist', { design: initialStudyDesign(values, programId), reason });
        if (typeof json?.studyId !== 'string' || !json.studyId.trim()) {
          throw new Error('The server did not confirm a saved design id. Close and check the persisted design picker before submitting again.');
        }
        receipt = { studyId: json.studyId, reason }; setSaved(receipt); onSaved();
      }
      await bind(receipt);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      if (!receipt && !(cause as { status?: number })?.status) setUnconfirmed(true);
      setError(receipt ? `Study design ${receipt.studyId} was saved. Binding to this protocol failed: ${detail} Retry binding or use the persisted design picker; no second design will be created by this retry.` : `Could not confirm design creation: ${detail}`);
    } finally { running.current = false; setBusy(false); }
  };
  const config: C2CFormConfig = unconfirmed ? {
    eyebrow: 'Protocol · unconfirmed save', title: 'Check persisted study designs',
    sub: 'The save outcome is unknown. Close and check the persisted design picker before creating another design.', submitLabel: 'Close', fields: [],
  } : saved ? {
    eyebrow: 'Protocol · saved study design', title: 'Bind saved study design', governed: true,
    sub: `Design ${saved.studyId} is already persisted. Retry only its link to this protocol.`, submitLabel: 'Retry binding', fields: [],
  } : FORM;
  return <>
    <C2CForm key={saved?.studyId || 'new'} config={{ ...config, notice: error || undefined, busy: busy ? 'Saving governed changes…' : undefined }} onCancel={onCancel} onSubmit={submit} />
  </>;
}
