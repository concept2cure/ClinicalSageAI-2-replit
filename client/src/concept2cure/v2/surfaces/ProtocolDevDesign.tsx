/**
 * Protocol development — the Study design tab.
 *
 * docs/design/PROTOCOL_DESIGN_CONVERGENCE.md, steps 1d and 2. The repository
 * holds a complete USDM / ICH M11 design-as-data spine
 * (server/services/study-design) with five projections and a deterministic
 * gate engine, and the protocol surface referenced none of it. This tab is the
 * link.
 *
 * ── What is shown, and what is not claimed ───────────────────────────────────
 * With NO design bound the panel says exactly that and offers the bind action.
 * It draws no findings list, no percentage and no projection control, because
 * a protocol with no design has not passed anything and must not look as
 * though it has.
 *
 * With a design bound it shows the design's identity and the DESIGN GATES'
 * findings — ICH E9 / E9(R1) / E10 / E3 and ICH M11 §2/§3/§4/§6/§7/§10/§17 —
 * exactly as `validateDesign()` produced them on the server, in the same
 * `PG.FindingsList` shape the protocol's other registers already use. Nothing
 * on this screen decides a severity or computes a number.
 *
 * With a link that names a design this organisation cannot read, it says the
 * link is unresolved. An error is never rendered as an empty result.
 */
import React, { useEffect, useState } from 'react';
import * as PG from './ProtocolGov';
import { PaneHead, KV } from './ProtocolDevShared';
import { apiRequest } from '@/lib/queryClient';
import { C2CForm, type C2CFormFieldOption } from '../C2CForm';
import { ProjectionsPanel } from './ProtocolDevProjections';

type Obj = Record<string, unknown>;
const MIN_REASON = 8;

export interface PdevStudyDesignView {
  studyId: string; resolved: boolean; title: string; phase: string; indication: string;
  status: string; linkedAt: string; riskLevel: string; canAdvance: boolean; blocksApproval: boolean;
  counts: { critical: number; major: number; minor: number; info: number };
  summary: string; standardsChecked: string[];
  findings: Array<{ code: string; section: string; sev: string; title: string; text: string; standard: string; endpoint: string; fix: string }>;
}

/** The server's refusal, in its own words. */
function refusal(body: unknown, status: number): string {
  const err = (body as { error?: unknown } | null)?.error;
  if (typeof err === 'string') return err;
  const obj = err as { message?: string; code?: string } | undefined;
  return obj?.message || obj?.code || `HTTP ${status}`;
}

async function send(method: 'GET' | 'POST', path: string, body?: Obj): Promise<Obj> {
  const res = await apiRequest(method, path, body as never);
  const json = (await res.json().catch(() => null)) as Obj | null;
  if (!res.ok) throw new Error(refusal(json, res.status) + ' Nothing was written.');
  return json ?? {};
}

/* ── The bind drawer ───────────────────────────────────────────────────── */

interface DesignRow { studyId: string; title: string; phase: string; indication: string; status: string }

/** This tenant's persisted designs, for the bind drawer's picker. */
function useTenantDesigns(active: boolean) {
  const [rows, setRows] = useState<DesignRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let live = true;
    void (async () => {
      try {
        const j = await send('GET', '/api/study-design');
        if (live) setRows((Array.isArray(j.designs) ? j.designs : []) as DesignRow[]);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [active]);
  return { rows, error };
}

interface BindDrawerProps {
  documentId: number;
  onCancel: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}

function BindDrawer({ documentId, onCancel, onDone, onError }: BindDrawerProps) {
  const { rows, error } = useTenantDesigns(true);

  if (error) {
    return (
      <C2CForm
        key="bind-error"
        config={{
          eyebrow: 'Protocol · study design', title: 'Bind a study design',
          sub: 'The study-design store could not be read, so there is nothing to choose from. ' + error,
          submitLabel: 'Close', fields: [],
        }}
        onCancel={onCancel}
        onSubmit={onCancel}
      />
    );
  }
  if (rows === null) {
    return (
      <C2CForm
        key="bind-loading"
        config={{ eyebrow: 'Protocol · study design', title: 'Bind a study design', sub: 'Reading this organisation’s persisted designs…', submitLabel: 'Cancel', fields: [] }}
        onCancel={onCancel}
        onSubmit={onCancel}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <C2CForm
        key="bind-none"
        config={{
          eyebrow: 'Protocol · study design', title: 'Bind a study design',
          sub: 'This organisation has no persisted study design yet. Design one in Biostatistics and persist it; it can then be bound here.',
          submitLabel: 'Close', fields: [],
        }}
        onCancel={onCancel}
        onSubmit={onCancel}
      />
    );
  }

  const options: C2CFormFieldOption[] = rows.map((d) => ({
    value: d.studyId,
    label: [d.title, d.phase && 'Phase ' + d.phase, d.indication].filter(Boolean).join(' · '),
  }));

  const submit = async (v: Record<string, string>) => {
    if ((v.reason ?? '').trim().length < MIN_REASON) {
      onError(`The governed reason must be at least ${MIN_REASON} characters. Nothing was written.`);
      return;
    }
    try {
      await send('POST', `/api/protocol-development/documents/${documentId}/study-design`, {
        studyDesignId: v.studyDesignId, reason: v.reason.trim(),
      });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  /* Keyed so this form MOUNTS FRESH once the option list has loaded. C2CForm
     seeds its field state in a useState initializer; without a key React
     reuses the loading form's state and the pre-selected design is lost. */
  return (
    <C2CForm
      key="bind-ready"
      config={{
        eyebrow: 'Protocol · study design', title: 'Bind a study design',
        sub: 'The protocol becomes a projection of this design object. Read-only: nothing is generated into the protocol’s sections, and the design is not modified.',
        governed: true, submitLabel: 'Bind design',
        fields: [
          { key: 'studyDesignId', label: 'Study design', type: 'select', required: true, options, default: options[0].value },
          { key: 'reason', label: 'Reason for change (governed)', type: 'textarea', required: true, placeholder: 'Why this design is the one this protocol projects — at least 8 characters; written to the audit trail.' },
        ],
      }}
      onCancel={onCancel}
      onSubmit={submit}
    />
  );
}

function UnbindDrawer({ documentId, onCancel, onDone, onError }: BindDrawerProps) {
  const submit = async (v: Record<string, string>) => {
    if ((v.reason ?? '').trim().length < MIN_REASON) {
      onError(`The governed reason must be at least ${MIN_REASON} characters. Nothing was written.`);
      return;
    }
    try {
      await send('POST', `/api/protocol-development/documents/${documentId}/study-design/remove`, { reason: v.reason.trim() });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <C2CForm
      config={{
        eyebrow: 'Protocol · study design', title: 'Unbind study design',
        sub: 'The design is untouched. This protocol stops claiming to be a projection of it, and its design-gate findings leave this screen.',
        governed: true, submitLabel: 'Unbind design',
        fields: [{ key: 'reason', label: 'Reason for change (governed)', type: 'textarea', required: true, placeholder: 'Why the link is being removed — at least 8 characters; written to the audit trail.' }],
      }}
      onCancel={onCancel}
      onSubmit={submit}
    />
  );
}

/* ── The bound design ──────────────────────────────────────────────────── */

function DesignIdentity({ sd }: { sd: PdevStudyDesignView }) {
  return (
    <div className="pj-card" style={{ padding: 12 }}>
      <div className="pj-card-h">
        <span className="t">{sd.title}</span>
        <span className="s">{[sd.phase && 'Phase ' + sd.phase, sd.indication, sd.status].filter(Boolean).join(' · ')}</span>
      </div>
      <KV k="Study design id" v={sd.studyId} />
      <KV k="Bound" v={sd.linkedAt ? sd.linkedAt.slice(0, 10) : 'date not recorded'} />
      <KV k="Standards evaluated" v={sd.standardsChecked.length ? sd.standardsChecked.join(', ') : 'none reported by the gate engine'} />
    </div>
  );
}

function DesignGates({ sd }: { sd: PdevStudyDesignView }) {
  return (
    <div style={{ marginTop: 12 }}>
      <h3 className="pd-pane-t" style={{ fontSize: 13 }}>Design gates</h3>
      <div className="pd-pane-s">
        The deterministic gate engine’s findings on the design object — ICH E9, E9(R1), E10 and E3,
        and ICH M11 §2/§3/§4/§6/§7/§10/§17. These are findings on the DESIGN, not on this document’s text.
      </div>
      {sd.summary && <div className="pde-note">{sd.summary}</div>}
      <div className="pd-kv">
        <span className="pd-kv-k">Risk level</span>
        <span className="pd-kv-v pg-mono">{sd.riskLevel || 'not rated'}</span>
      </div>
      <div className="pd-kv">
        <span className="pd-kv-k">Blocks approval</span>
        <span className="pd-kv-v pg-mono">{sd.blocksApproval ? 'yes' : 'no'}</span>
      </div>
      <PG.FindingsList
        findings={sd.findings.map((f) => ({
          sev: f.sev,
          text: [f.code, f.title].filter(Boolean).join(' — ') + '. ' + f.text +
            (f.standard ? ` (${f.standard})` : '') + (f.fix ? ` Fix: ${f.fix}` : ''),
        })) as never}
      />
    </div>
  );
}

/* ── The tab ───────────────────────────────────────────────────────────── */

export interface StudyDesignTabProps {
  doc: Record<string, unknown>;
  /** False when the protocol row carries no governed document id. */
  canWrite: boolean;
  /** Re-read GET /api/protocol-dev once the server has confirmed the write. */
  onChanged?: () => void;
  onError?: (m: string) => void;
  onToast?: (m: string) => void;
}

export function StudyDesignTab({ doc, canWrite, onChanged, onError, onToast }: StudyDesignTabProps) {
  const [drawer, setDrawer] = useState<'bind' | 'unbind' | null>(null);
  const documentId = Number(doc.id);
  const sd = (doc.studyDesign ?? null) as PdevStudyDesignView | null;

  const done = (message: string) => { setDrawer(null); onToast?.(message); onChanged?.(); };
  const failed = (m: string) => { setDrawer(null); onError?.(m); };

  const actions = sd
    ? [{ label: 'Unbind study design', icon: 'close', onAct: () => setDrawer('unbind'), variant: 'outline', disabled: !canWrite }]
    : [{ label: 'Bind a study design', icon: 'link', onAct: () => setDrawer('bind'), variant: 'primary', disabled: !canWrite }];

  return (
    <div className="pd-pane" role="region" aria-label="Study design">
      <PaneHead
        title="Study design"
        sub="The USDM / ICH M11 design object this protocol is a projection of. The protocol document carries the registers; the design object carries the estimands, the endpoints, the statistical plan and the schedule."
        actions={actions}
      />

      {!sd && (
        <div className="pde-note">
          No study design is bound to this protocol. Nothing on this protocol has been checked against
          the design gates, and the design’s projections are unavailable until one is bound. Binding a
          design is read-only — it generates nothing into the protocol’s sections.
        </div>
      )}

      {sd && !sd.resolved && (
        <div className="pde-refusal" role="alert">
          This protocol names study design <span className="pg-mono">{sd.studyId}</span>, but it
          could not be read for this organisation. Nothing below is a verdict on the design — unbind
          the link, or restore the design, before treating this protocol as a projection of anything.
        </div>
      )}

      {sd && sd.resolved && (
        <>
          <DesignIdentity sd={sd} />
          <DesignGates sd={sd} />
          <ProjectionsPanel studyId={sd.studyId} designTitle={sd.title} />
        </>
      )}

      {drawer === 'bind' && canWrite && (
        <BindDrawer
          documentId={documentId}
          onCancel={() => setDrawer(null)}
          onDone={() => done('Study design bound — the protocol now renders the design gates’ findings.')}
          onError={failed}
        />
      )}
      {drawer === 'unbind' && canWrite && (
        <UnbindDrawer
          documentId={documentId}
          onCancel={() => setDrawer(null)}
          onDone={() => done('Study design unbound — the design itself is unchanged.')}
          onError={failed}
        />
      )}
    </div>
  );
}
