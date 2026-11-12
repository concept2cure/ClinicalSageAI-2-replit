/**
 * Protocol development, IRB package tab: what is on file for the IRB submission.
 *
 * Split out of IrbSubmissionRecord.tsx. The board's determinations, the sites,
 * the consent documents, the amendments and the reportable events each had a
 * governed write on `/api/irb` and no caller, and none could be read back
 * (docs/design/IRB_SUBMISSION.md step 5):
 *
 *   GET  /api/irb/submissions/:id/record              what is on file
 *   POST /api/irb/submissions/:id/reviews             the board's determination
 *   POST /api/irb/submissions/:id/sites
 *   POST /api/irb/submissions/:id/consent-documents
 *   POST /api/irb/submissions/:id/amendments
 *   POST /api/irb/submissions/:id/reportable-events
 *
 * A determination is the board's, recorded by a person from the board's
 * letter. An approval is an electronic signature (21 CFR 11.50, 11.200): it
 * goes through the one signing dialog, and the signature says who recorded the
 * approval and answers for the record. It is not the board's signature, and
 * the dialog says so. Nothing here decides anything about the study (D4), and
 * nothing is delivered to a board (D3).
 *
 * Nothing is appended locally: after a confirmed write the register is read
 * again from the server.
 */
import React, { useEffect, useState } from 'react';
import * as PG from './ProtocolGov';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { EsignModal, type EsigSignedManifest } from '../../_shared/components/EsignModal';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { useAuthUser } from '@/services/portal/authService';
import { printedSigner } from './ProtocolDevSigning';
import { apiRequest, errorCodeOf, serverMessage } from '@/lib/queryClient';


/* ── Writing, shared with IrbSubmissionRecord.tsx ──────────────────────────── */

export interface IrbFormProps {
  onCancel: () => void;
  /** Fires only after the server confirms the write. */
  onDone: (message: string) => void;
  onError: (message: string) => void;
}

/** A governed write, or the server's refusal in its own words. Nothing is kept locally. */
export async function governedWrite(method: 'POST' | 'PATCH', path: string, body: Record<string, unknown>, what: string): Promise<Record<string, unknown>> {
  const res = await apiRequest(method, path, body);
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.status === 401) throw new Error('Not recorded: your session isn’t authenticated.');
  if (!res.ok) {
    const detail = serverMessage(json) ?? errorCodeOf(json) ?? `HTTP ${res.status}`;
    throw new Error(`Couldn’t ${what}: ${detail}`);
  }
  return json ?? {};
}

export const REASON_FIELD = {
  key: 'reason', label: 'Reason for change (governed)', type: 'textarea' as const, required: true,
  placeholder: 'Why this is being recorded. At least 8 characters; written to the audit trail.',
};

export function reasonOf(v: Record<string, string>): string {
  const reason = (v.reason ?? '').trim();
  if (reason.length < 8) throw new Error('The governed reason must be at least 8 characters.');
  return reason;
}

/* ── What is on file ───────────────────────────────────────────────────────── */

interface OnFile {
  reviews: Array<{ id: number; reviewType: string; outcome: string; conditions: string | null; determinationDate: string | null }>;
  sites: Array<{ id: number; siteName: string; principalInvestigator: string | null; localContext: string | null; status: string }>;
  consentDocuments: Array<{ id: number; documentName: string; version: string; status: string; approvedDate: string | null }>;
  amendments: Array<{ id: number; description: string; substantive: boolean; status: string }>;
  reportableEvents: Array<{ id: number; eventType: string; description: string; reportedDate: string | null; status: string }>;
}
type OnFileState = { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; onFile: OnFile };

const rows = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

async function readOnFile(id: number): Promise<OnFileState> {
  const res = await apiRequest('GET', `/api/irb/submissions/${id}/record`);
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) return { kind: 'failed', message: serverMessage(json) ?? errorCodeOf(json) ?? `HTTP ${res.status}` };
  return {
    kind: 'ready',
    onFile: {
      reviews: rows(json.reviews), sites: rows(json.sites), consentDocuments: rows(json.consentDocuments),
      amendments: rows(json.amendments), reportableEvents: rows(json.reportableEvents),
    },
  };
}

/** The board's own review category, as it recorded it. A fact from its letter, not a suggestion. */
const REVIEW_TYPE_OPTIONS = [
  { value: 'full_board', label: 'Full board (convened)' },
  { value: 'expedited', label: 'Expedited' },
  { value: 'exempt', label: 'Exempt' },
];
const REVIEW_TYPE_WORD: Record<string, string> = { full_board: 'full board (convened)', expedited: 'expedited', exempt: 'exempt' };
const OUTCOME_WORD: Record<string, string> = {
  approved: 'approved', modifications_required: 'modifications required', deferred: 'deferred', disapproved: 'disapproved',
};
const EVENT_OPTIONS = [
  { value: 'unanticipated_problem', label: 'Unanticipated problem' },
  { value: 'serious_adverse_event', label: 'Serious adverse event' },
  { value: 'protocol_deviation', label: 'Protocol deviation' },
  { value: 'noncompliance', label: 'Noncompliance' },
  { value: 'other', label: 'Other' },
];
const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

/* ── The governed forms ────────────────────────────────────────────────────── */

export type IrbRegisterKind = 'determination' | 'site' | 'consent' | 'amendment' | 'event';

const EYEBROW = 'Protocol · IRB submission';
const DETERMINATION_FIELDS = [
  { key: 'reviewType', label: 'The board’s review', type: 'select' as const, required: true, half: true, options: REVIEW_TYPE_OPTIONS,
    desc: 'The category the board reviewed under, from its letter.' },
  { key: 'determinationDate', label: 'Determination date', type: 'date' as const, required: true, half: true },
];

const FORMS: Record<IrbRegisterKind, C2CFormConfig> = {
  determination: {
    eyebrow: EYEBROW, title: 'Record a determination',
    sub: 'The board’s decision, from its letter, when it is not an approval. It becomes the submission’s status. An approval is recorded separately, because it is signed. Recorded as a governed action.',
    governed: true, submitLabel: 'Record determination',
    fields: [
      { key: 'outcome', label: 'The board’s decision', type: 'select', required: true,
        options: [{ value: 'modifications_required', label: 'Modifications required' }, { value: 'deferred', label: 'Deferred' }, { value: 'disapproved', label: 'Disapproved' }] },
      ...DETERMINATION_FIELDS,
      { key: 'conditions', label: 'Conditions or required changes', type: 'textarea', placeholder: 'What the board asked for, in its words' },
      REASON_FIELD,
    ],
  },
  site: {
    eyebrow: EYEBROW, title: 'Add a site',
    sub: 'A site this submission covers. More than one site with no single IRB of record is a finding of the record checks. Recorded as a governed action.',
    governed: true, submitLabel: 'Add site',
    fields: [
      { key: 'siteName', label: 'Site name', type: 'text', required: true },
      { key: 'principalInvestigator', label: 'Principal investigator', type: 'text' },
      { key: 'localContext', label: 'Local context', type: 'textarea', placeholder: 'State law, institutional requirements or community considerations the board should know' },
      REASON_FIELD,
    ],
  },
  consent: {
    eyebrow: EYEBROW, title: 'Add a consent document',
    sub: 'A consent document on file for this submission, by its own name and version. It is recorded as a draft. Recorded as a governed action.',
    governed: true, submitLabel: 'Add consent document',
    fields: [
      { key: 'documentName', label: 'Document name', type: 'text', required: true, placeholder: 'e.g. Main informed consent form' },
      { key: 'version', label: 'Version', type: 'text', required: true, half: true, placeholder: 'The version the document carries' },
      REASON_FIELD,
    ],
  },
  amendment: {
    eyebrow: EYEBROW, title: 'Record an amendment',
    sub: 'A change to approved research needs the board’s review before it is put into effect (45 CFR 46.108(a)(3)(iii); 21 CFR 56.108(a)(4)). Recorded as a governed action.',
    governed: true, submitLabel: 'Record amendment',
    fields: [
      { key: 'description', label: 'What changes', type: 'textarea', required: true },
      /* No preselected answer: "not substantive" chosen by default would be an assessment nobody made. */
      { key: 'substantive', label: 'Substantive change?', type: 'select', required: true, half: true, options: YES_NO,
        desc: 'Yes if it changes risk, the consent, the population or the design.' },
      REASON_FIELD,
    ],
  },
  event: {
    eyebrow: EYEBROW, title: 'Record a reportable event',
    sub: 'An event reported to the board (45 CFR 46.108(a)(4); 21 CFR 56.108(b)). The date is the date it was reported to the board, which is done in the board’s own portal or inbox. Recorded as a governed action.',
    governed: true, submitLabel: 'Record event',
    fields: [
      { key: 'eventType', label: 'Event', type: 'select', required: true, half: true, options: EVENT_OPTIONS },
      { key: 'reportedDate', label: 'Date reported to the board', type: 'date', required: true, half: true },
      { key: 'description', label: 'What happened', type: 'textarea', required: true },
      REASON_FIELD,
    ],
  },
};

const text = (v: string | undefined): string | undefined => ((v ?? '').trim() ? (v as string).trim() : undefined);

/** The request each form makes. Empty optionals are left out, never sent as ''. */
function registerRequest(kind: IrbRegisterKind, v: Record<string, string>): { path: string; body: Record<string, unknown>; what: string; said: string } {
  const reason = reasonOf(v);
  const opt = (pairs: Record<string, string | undefined>) => Object.fromEntries(Object.entries(pairs).filter(([, value]) => value !== undefined));
  switch (kind) {
    case 'determination':
      return { path: 'reviews', what: 'record the determination', said: `Determination recorded: ${OUTCOME_WORD[v.outcome] ?? v.outcome}.`,
        body: { reviewType: v.reviewType, outcome: v.outcome, determinationDate: v.determinationDate, ...opt({ conditions: text(v.conditions) }), reason } };
    case 'site':
      return { path: 'sites', what: 'add the site', said: 'Site added.',
        body: { siteName: (v.siteName ?? '').trim(), ...opt({ principalInvestigator: text(v.principalInvestigator), localContext: text(v.localContext) }), reason } };
    case 'consent':
      return { path: 'consent-documents', what: 'add the consent document', said: 'Consent document added.',
        body: { documentName: (v.documentName ?? '').trim(), version: (v.version ?? '').trim(), reason } };
    case 'amendment':
      return { path: 'amendments', what: 'record the amendment', said: 'Amendment recorded.',
        body: { description: (v.description ?? '').trim(), substantive: v.substantive === 'yes', reason } };
    default:
      return { path: 'reportable-events', what: 'record the event', said: 'Reportable event recorded.',
        body: { eventType: v.eventType, description: (v.description ?? '').trim(), reportedDate: v.reportedDate, reason } };
  }
}

function IrbRegisterForm({ kind, submissionId, onCancel, onDone, onError }: IrbFormProps & { kind: IrbRegisterKind; submissionId: number }) {
  const submit = async (v: Record<string, string>) => {
    try {
      const request = registerRequest(kind, v);
      await governedWrite('POST', `/api/irb/submissions/${submissionId}/${request.path}`, request.body, request.what);
      onDone(request.said);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  return <C2CForm config={FORMS[kind]} onCancel={onCancel} onSubmit={submit} />;
}

/* ── The approval: what the board decided, then the signature ──────────────── */

interface ApprovalDraft { reviewType: string; determinationDate: string; expirationDate?: string; conditions?: string }

const APPROVAL_FORM: C2CFormConfig = {
  eyebrow: EYEBROW, title: 'Record the board’s approval',
  sub: 'From the board’s approval letter. Recording an approval is an electronic signature: the next step asks for your password and the meaning of your signature. It records who entered the approval. It is not the board’s signature.',
  submitLabel: 'Continue to sign',
  fields: [
    ...DETERMINATION_FIELDS,
    { key: 'expirationDate', label: 'Expiration date the board set', type: 'date', half: true,
      desc: 'Leave empty if the letter sets none. The approval lifecycle then computes one and says it is computed.' },
    { key: 'conditions', label: 'Conditions of approval', type: 'textarea' },
  ],
};

/** A decision act takes these two meanings (server/services/part11/signature-meanings.ts). */
const APPROVAL_MEANINGS: ReadonlyArray<EsigMeaning> = ['responsibility', 'approval'];

function ApprovalSigning({ draft, submissionId, title, onClose, onSigned }: {
  draft: ApprovalDraft; submissionId: number; title: string; onClose: () => void; onSigned: () => void;
}) {
  const authUser = useAuthUser();
  const onSign = async (input: { meaning: string; reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> => {
    const result = await governedWrite('POST', `/api/irb/submissions/${submissionId}/reviews`, {
      reviewType: draft.reviewType, outcome: 'approved', determinationDate: draft.determinationDate,
      ...(draft.expirationDate ? { expirationDate: draft.expirationDate } : {}),
      ...(draft.conditions ? { conditions: draft.conditions } : {}),
      reason: reasonOf({ reason: input.reason }), meaning: input.meaning, password: input.password,
      ...(input.totp ? { mfaToken: input.totp } : {}),
    }, 'record the approval');
    onSigned();
    return {
      meaning: input.meaning as EsigMeaning,
      reason: input.reason,
      signedAt: typeof result.signedAt === 'string' ? result.signedAt : '',
      ...(typeof result.sha256Chain === 'string' ? { hash: result.sha256Chain } : {}),
    };
  };
  return (
    <EsignModal
      open
      action="Record the board’s approval"
      target={`IRB submission ${submissionId} · ${title || 'no title recorded'}`}
      targetMeta={`The board approved on ${draft.determinationDate}. You are recording its decision from its letter and answer for this record; this is your signature, not the board’s.`}
      meanings={APPROVAL_MEANINGS}
      defaultMeaning="responsibility"
      signedRows={[
        { label: 'Determination date', value: draft.determinationDate },
        { label: 'Expiration the board set', value: draft.expirationDate || 'none recorded' },
      ]}
      signer={printedSigner(authUser)}
      requireMfa={authUser?.mfaEnabled === true}
      onClose={onClose}
      onSign={onSign}
    />
  );
}

/* ── The register ──────────────────────────────────────────────────────────── */

function Section({ title, count, action, onAction, children }: { title: string; count: number; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={title} style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 12.5 }}>{`${title} (${count})`}</b>
        {action && onAction && <PG.Btn icon="plus" variant="ghost" onClick={onAction}>{action}</PG.Btn>}
      </div>
      {count === 0 ? <div className="pde-note">None recorded.</div> : <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55 }}>{children}</ul>}
    </div>
  );
}

function OnFileSections({ onFile, add }: { onFile: OnFile; add?: (kind: IrbRegisterKind | 'approval') => void }) {
  return (
    <>
      <div role="group" aria-label="Board determinations" style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 12.5 }}>{`Board determinations (${onFile.reviews.length})`}</b>
          {add && (
            <span className="pde-actions">
              <PG.Btn icon="plus" variant="ghost" onClick={() => add('determination')}>Record a determination</PG.Btn>
              <PG.Btn icon="penLine" variant="ghost" onClick={() => add('approval')}>Record approval</PG.Btn>
            </span>
          )}
        </div>
        {onFile.reviews.length === 0
          ? <div className="pde-note">None recorded. The board has made no decision on this record.</div>
          : (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55 }}>
              {onFile.reviews.map((r) => (
                <li key={r.id}>
                  {`${r.determinationDate || 'no date recorded'}: ${OUTCOME_WORD[r.outcome] ?? r.outcome}, ${REVIEW_TYPE_WORD[r.reviewType] ?? r.reviewType} review.`}
                  {r.conditions && <span>{` ${r.conditions}`}</span>}
                </li>
              ))}
            </ul>
          )}
      </div>
      <Section title="Sites" count={onFile.sites.length} action="Add a site" onAction={add && (() => add('site'))}>
        {onFile.sites.map((s) => (
          <li key={s.id}>{`${s.siteName}${s.principalInvestigator ? `, ${s.principalInvestigator}` : ''} (${PG.inWords(s.status).toLowerCase()}).`}{s.localContext && <span>{` ${s.localContext}`}</span>}</li>
        ))}
      </Section>
      <Section title="Consent documents" count={onFile.consentDocuments.length} action="Add a consent document" onAction={add && (() => add('consent'))}>
        {onFile.consentDocuments.map((c) => <li key={c.id}>{`${c.documentName}, version ${c.version} (${PG.inWords(c.status).toLowerCase()}).`}</li>)}
      </Section>
      <Section title="Amendments" count={onFile.amendments.length} action="Record an amendment" onAction={add && (() => add('amendment'))}>
        {onFile.amendments.map((a) => <li key={a.id}>{`${a.description} (${a.substantive ? 'substantive' : 'not substantive'}; ${PG.inWords(a.status).toLowerCase()}).`}</li>)}
      </Section>
      <Section title="Reportable events" count={onFile.reportableEvents.length} action="Record a reportable event" onAction={add && (() => add('event'))}>
        {onFile.reportableEvents.map((e) => (
          <li key={e.id}>{`${PG.inWords(e.eventType)}, reported ${e.reportedDate || 'on no recorded date'}: ${e.description} (${PG.inWords(e.status).toLowerCase()}).`}</li>
        ))}
      </Section>
    </>
  );
}

export interface IrbRegistersProps {
  submissionId: number;
  title: string;
  canWrite: boolean;
  /** Bumped by the record above when it wrote, so this reads again too. */
  reads: number;
  /** Called after a confirmed write here: the record and its checks read again. */
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}

export function IrbRegisters({ submissionId, title, canWrite, reads, onChanged, onError }: IrbRegistersProps) {
  const [state, setState] = useState<OnFileState>({ kind: 'loading' });
  const [form, setForm] = useState<IrbRegisterKind | 'approval' | null>(null);
  const [approval, setApproval] = useState<ApprovalDraft | null>(null);

  useEffect(() => {
    let live = true;
    void readOnFile(submissionId)
      .then((s) => { if (live) setState(s); })
      .catch((e: unknown) => { if (live) setState({ kind: 'failed', message: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [submissionId, reads]);

  const done = (message: string) => { setForm(null); onChanged(message); };
  const draftApproval = (v: Record<string, string>) => {
    setForm(null);
    setApproval({ reviewType: v.reviewType, determinationDate: v.determinationDate, expirationDate: text(v.expirationDate), conditions: text(v.conditions) });
  };

  return (
    <section className="pj-card" style={{ padding: 12, marginTop: 10 }} role="group" aria-label="On file for this submission">
      <div className="pj-card-h"><span className="t">On file for this submission</span><span className="s">What has been recorded, as recorded.</span></div>
      {state.kind === 'loading' && <div role="status" className="scaf-note">Reading what is on file…</div>}
      {state.kind === 'failed' && (
        <div className="pde-refusal" role="alert">
          {`What is on file could not be read: ${state.message}. `}
          Nothing is listed. This is a failed read, not a submission with nothing on file.
        </div>
      )}
      {state.kind === 'ready' && <OnFileSections onFile={state.onFile} add={canWrite ? setForm : undefined} />}
      {form && form !== 'approval' && (
        <IrbRegisterForm kind={form} submissionId={submissionId} onCancel={() => setForm(null)} onDone={done} onError={onError} />
      )}
      {form === 'approval' && <C2CForm config={APPROVAL_FORM} onCancel={() => setForm(null)} onSubmit={draftApproval} />}
      {approval && (
        <ApprovalSigning
          draft={approval} submissionId={submissionId} title={title}
          onClose={() => setApproval(null)} onSigned={() => onChanged('The board’s approval was recorded and signed.')}
        />
      )}
    </section>
  );
}
