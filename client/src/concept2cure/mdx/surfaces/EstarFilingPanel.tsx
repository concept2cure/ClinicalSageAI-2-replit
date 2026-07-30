/**
 * EstarFilingPanel — the eSTAR filing journey, made clickable inside the PMA
 * surface: REGISTER (toggle the four FDA prerequisites → PUT /registration) →
 * SELECT a submission from the catalog → ASSESS filing-readiness against the
 * org's real authored content (POST /filing-readiness) → START TRACKING it
 * (POST /submissions) → ADVANCE its lifecycle (PATCH /submissions/:id).
 *
 * Org-scoped (session cookie); reads always render, writes require editor role
 * and degrade to no-ops (the mutators return null, never throw). Uses the kit's
 * section/health/pma-mod classes for visual consistency.
 */

import * as React from 'react';
import { useState } from 'react';
import {
  useEstarRegistration,
  useEstarSubmissions,
  useEstarCatalog,
  assessFilingReadiness,
  prerequisiteRows,
  registrationPatchToggling,
  type EstarPrerequisiteId,
  type FilingReadinessResult,
  type EstarSubmissionView,
} from '../hooks/useEstarFiling';

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
    await save(registrationPatchToggling(satisfied, id));
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
      {submissions && submissions.length > 0 && (
        <div className="pma-modules">
          {submissions.map((s) => (
            <SubmissionCard key={s.id} s={s} busy={busy === s.id} onAdvance={onAdvance} />
          ))}
        </div>
      )}
    </>
  );
}
