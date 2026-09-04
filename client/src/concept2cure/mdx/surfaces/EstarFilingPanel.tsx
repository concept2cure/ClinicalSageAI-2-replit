/**
 * EstarFilingPanel — the eSTAR filing journey, made clickable inside the PMA
 * surface: REGISTER (toggle the four FDA prerequisites → PUT /registration;
 * enter the correspondent and Declaration of Conformity facts the official
 * eSTAR reads from the registration → the same PUT) →
 * SELECT a submission from the catalog → ASSESS filing-readiness against the
 * org's real authored content (POST /filing-readiness) → START TRACKING it
 * (POST /submissions) → ADVANCE its lifecycle (PATCH /submissions/:id).
 *
 * Org-scoped (session cookie); reads always render, writes require editor role
 * and degrade to no-ops (the mutators return null, never throw). Uses the kit's
 * section/health/pma-mod classes for visual consistency.
 */

import * as React from 'react';
import { useEffect, useState } from 'react';
import { EmptyState } from '../../v2/dataConnect';
import {
  useEstarRegistration,
  useEstarSubmissions,
  useEstarCatalog,
  assessFilingReadiness,
  prerequisiteRows,
  registrationPatchToggling,
  correspondentValues,
  correspondentPatch,
  ESTAR_CORRESPONDENT_FIELDS,
  type EstarCorrespondentField,
  type EstarPrerequisiteId,
  type EstarRegistrationPatch,
  type EstarRegistrationRecord,
  type EstarRegistrationView,
  type FilingReadinessResult,
  type EstarSubmissionView,
} from '../hooks/useEstarFiling';
import { IntakeTextField } from './DeviceProfilePanel';

/** Allowed next statuses (mirrors the server lifecycle) for the advance buttons. */
const NEXT_STATUS: Record<string, string[]> = {
  draft: ['filed', 'withdrawn'],
  filed: ['under_review', 'withdrawn'],
  under_review: ['additional_info', 'decision', 'withdrawn'],
  additional_info: ['under_review', 'decision', 'withdrawn'],
  decision: [],
  withdrawn: [],
};

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function statusTone(status: string): string {
  if (status === 'decision') return 'ok';
  if (status === 'withdrawn' || status === 'additional_info') return 'warn';
  return status;
}
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

function VerdictLine({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="pma-mod-foot">
      <span>{label}</span>
      <span className={`status-pill ${ok ? 'ok' : 'warn'}`}>{ok ? 'Ready' : detail ?? 'Not yet'}</span>
    </div>
  );
}

function ReadinessCard({ r }: { r: FilingReadinessResult }) {
  return (
    <div className="pma-mod">
      <div className="pma-mod-hdr">
        <div className="pma-mod-label">{r.label}</div>
        <span className={`status-pill ${r.canFileNow ? 'ok' : 'warn'}`}>
          {r.canFileNow ? 'Can file now' : 'Blocked'}
        </span>
      </div>
      <div className="pma-mod-desc">
        {r.programType.toUpperCase()} · {r.variant}
        {r.currentVersion ? ` · eSTAR ${r.currentVersion}` : ''} · content {r.completeness}%
      </div>
      <VerdictLine label="Registered" ok={r.eligible} detail={`missing ${r.registrationMissing.length}`} />
      <VerdictLine label="Content complete" ok={r.contentReady} detail={`${r.missingSections.length} gaps`} />
      <VerdictLine label="Official template" ok={r.officialTemplateProducible} detail="not vendored" />
      {r.blockers.length > 0 && (
        <div className="pma-mod-desc" style={{ marginTop: 6 }}>
          {r.blockers.map((b, i) => (
            <div key={i}>• {b}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({
  s,
  busy,
  onAdvance,
}: {
  s: EstarSubmissionView;
  busy: boolean;
  onAdvance: (id: string, status: string) => void;
}) {
  const due = formatDate(s.decisionDueAt);
  const nexts = NEXT_STATUS[s.status] ?? [];
  return (
    <div className="pma-mod">
      <div className="pma-mod-hdr">
        <div className="pma-mod-label">{s.title ?? s.catalogKey}</div>
        <span className={`status-pill ${statusTone(s.status)}`}>{formatStatus(s.status)}</span>
      </div>
      <div className="pma-mod-desc">
        {s.programType.toUpperCase()} · {s.variant}
        {s.fdaTrackingNumber ? ` · ${s.fdaTrackingNumber}` : ''}
      </div>
      <div className="pma-mod-foot">
        <span>{due ? `Decision due ${due}` : 'No review clock'}</span>
        <span style={{ display: 'flex', gap: 6 }}>
          {nexts.map((n) => (
            <button
              key={n}
              className="section-more"
              disabled={busy}
              onClick={() => onAdvance(s.id, n)}
              title={`Advance to ${formatStatus(n)}`}
            >
              {formatStatus(n)}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

type CorrespondentForm = Record<EstarCorrespondentField, string>;

/* The correspondent trio shares one row; the Declaration of Conformity pair —
   one legal entity's name and its address — stacks under it, name directly
   above address, because the two must name the same company. */
const CORRESPONDENT_ROW = ESTAR_CORRESPONDENT_FIELDS.filter((f) => !f.field.startsWith('declaration'));
const DECLARATION_ROWS = ESTAR_CORRESPONDENT_FIELDS.filter((f) => f.field.startsWith('declaration'));

function correspondentForm(stored: EstarRegistrationRecord | null | undefined): CorrespondentForm {
  const values = correspondentValues(stored);
  const form = {} as CorrespondentForm;
  for (const f of ESTAR_CORRESPONDENT_FIELDS) form[f.field] = values[f.field] ?? '';
  return form;
}

/**
 * The correspondent / Declaration of Conformity block. Text fields on the org's
 * eSTAR registration, shown as stored (blank when not held — never a
 * placeholder value) and saved through the same PUT as the prerequisites, with
 * those booleans preserved. A rejected write (editor-only) says "Not saved".
 */
function CorrespondentBlock({
  stored,
  satisfied,
  save,
}: {
  stored: EstarRegistrationRecord | null | undefined;
  satisfied: readonly string[] | null | undefined;
  save: (patch: EstarRegistrationPatch) => Promise<EstarRegistrationView | null>;
}) {
  const [form, setForm] = useState<CorrespondentForm>(() => correspondentForm(stored));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  /* Re-seed whenever the stored row changes (first load, refresh after save)
     — never mid-edit from a stale render. */
  useEffect(() => {
    setForm(correspondentForm(stored));
  }, [stored]);

  const base = correspondentForm(stored);
  const dirty = ESTAR_CORRESPONDENT_FIELDS.some((f) => form[f.field].trim() !== base[f.field]);

  async function onSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setStatus(null);
    const saved = await save(correspondentPatch(satisfied, form));
    setSaving(false);
    setStatus(saved ? 'Saved' : 'Not saved — the server rejected the update');
  }

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Correspondent and declaration</div>
          <div className="section-sub">
            Held on the org's eSTAR registration and written into the official eSTAR's
            correspondent and Declaration of Conformity fields. The declaration's company name
            and address are one legal entity, so both are held here. A blank field stays blank in
            the eSTAR.
          </div>
        </div>
      </div>
      <div
        style={{
          margin: '8px 0 12px',
          padding: '12px 14px',
          border: '1px solid var(--border-100)',
          borderRadius: 6,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10 }}>
          {CORRESPONDENT_ROW.map((f) => (
            <IntakeTextField
              key={f.field}
              label={f.label}
              value={form[f.field]}
              maxLength={f.max}
              onChange={(v) => setForm((prev) => ({ ...prev, [f.field]: v }))}
            />
          ))}
        </div>
        {DECLARATION_ROWS.map((f) => (
          <div key={f.field} style={{ marginTop: 10 }}>
            <IntakeTextField
              label={f.label}
              value={form[f.field]}
              maxLength={f.max}
              onChange={(v) => setForm((prev) => ({ ...prev, [f.field]: v }))}
            />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <button
            className="section-more"
            disabled={saving || !dirty}
            title={dirty ? 'Save the changed fields' : 'No changes to save'}
            onClick={() => void onSave()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {status && (
            <span className="section-sub" role="status" style={{ margin: 0 }}>
              {status}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export function EstarFilingPanel() {
  const { registration, loading: regLoading, save } = useEstarRegistration();
  const { submissions, loading: subLoading, startTracking, advance } = useEstarSubmissions();
  const { catalog } = useEstarCatalog();

  const [selectedKey, setSelectedKey] = useState<string>('');
  const [variant, setVariant] = useState<'device' | 'ivd'>('device');
  const [readiness, setReadiness] = useState<FilingReadinessResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const satisfied = registration?.clientRegistration?.satisfied;
  const rows = prerequisiteRows(satisfied);
  const registered = !!registration?.registered;
  const satisfiedCount = rows.filter((r) => r.satisfied).length;

  async function onToggle(id: EstarPrerequisiteId) {
    setBusy(`reg:${id}`);
    await save(registrationPatchToggling(satisfied, id, registration?.registration ?? null));
    setBusy(null);
  }
  async function onSelect(key: string) {
    setSelectedKey(key);
    if (!key) {
      setReadiness(null);
      return;
    }
    setBusy('assess');
    setReadiness(await assessFilingReadiness({ catalogKey: key, variant, useProjectContent: true }));
    setBusy(null);
  }
  async function onStartTracking() {
    if (!selectedKey) return;
    setBusy('track');
    await startTracking({ catalogKey: selectedKey, variant });
    setBusy(null);
  }
  async function onAdvance(id: string, status: string) {
    setBusy(id);
    await advance(id, status);
    setBusy(null);
  }

  return (
    <>
      {/* REGISTER */}
      <div className="section-hdr">
        <div>
          <div className="section-title">eSTAR filing readiness</div>
          <div className="section-sub">
            {regLoading
              ? 'Loading registration…'
              : registered
                ? `Registered · ${satisfiedCount}/4 FDA prerequisites held`
                : 'Not yet registered — toggle the prerequisites you hold'}
          </div>
        </div>
      </div>
      <div className="health">
        {rows.map((r) => (
          <div key={r.id} className="health-card">
            <div className="health-label">{r.label}</div>
            <div className={`health-meta ${r.satisfied ? 'ok' : 'warn'}`}>
              <button
                className="status-pill"
                disabled={busy === `reg:${r.id}`}
                onClick={() => onToggle(r.id)}
                title={r.satisfied ? 'Mark not held' : 'Mark held'}
                style={{ cursor: 'pointer' }}
              >
                {r.satisfied ? 'Held ✓' : 'Mark held'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* CORRESPONDENT + DECLARATION (same registration row, same PUT) */}
      <CorrespondentBlock stored={registration?.registration} satisfied={satisfied} save={save} />

      {/* SELECT + ASSESS */}
      <div className="section-hdr">
        <div>
          <div className="section-title">Assess a submission</div>
          <div className="section-sub">Filing-readiness against your authored content</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={variant} onChange={(e) => setVariant(e.target.value as 'device' | 'ivd')}>
            <option value="device">Device (nIVD)</option>
            <option value="ivd">IVD</option>
          </select>
          <select value={selectedKey} onChange={(e) => onSelect(e.target.value)}>
            <option value="">Select a submission…</option>
            {(catalog ?? []).map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <button className="section-more" disabled={!readiness || busy === 'track'} onClick={onStartTracking}>
            Start tracking
          </button>
        </div>
      </div>
      {readiness && (
        <div className="pma-modules">
          <ReadinessCard r={readiness} />
        </div>
      )}

      {/* TRACK */}
      <div className="section-hdr">
        <div>
          <div className="section-title">Tracked submissions</div>
          <div className="section-sub">
            {subLoading
              ? 'Loading…'
              : submissions && submissions.length > 0
                ? `${submissions.length} filing${submissions.length === 1 ? '' : 's'} tracked`
                : 'No tracked filings yet'}
          </div>
        </div>
      </div>
      {submissions && submissions.length > 0 ? (
        <div className="pma-modules">
          {submissions.map((s) => (
            <SubmissionCard key={s.id} s={s} busy={busy === s.id} onAdvance={onAdvance} />
          ))}
        </div>
      ) : (
        !subLoading && (
          /* An empty result rendered NOTHING — the whole body was conditioned on
             having rows, so a program with no tracked filings got a header and
             blank space, which reads as a surface that failed to draw rather
             than one with nothing in it.
             The panel states the precondition instead, because the only control
             here ("Start tracking") is disabled exactly when this state shows:
             tracking requires a filing-readiness assessment, and without one the
             button cannot fire. Naming that is the honest substitute for a CTA
             that would not work. */
          <EmptyState
            title="No tracked filings yet"
            hint="Select a submission type and run a filing-readiness assessment; tracking becomes available once it has one."
            regulation="Serves the eSTAR submission record (FDA 510(k) / De Novo)"
            testId="estar-no-filings"
          />
        )
      )}
    </>
  );
}
