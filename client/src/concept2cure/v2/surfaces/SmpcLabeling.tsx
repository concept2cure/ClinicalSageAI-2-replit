import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import { SMPC_FIXTURE, type SmpcReadiness, type SmpcSectionRow, type SmpcStatus } from '../fixtures/smpc-qrd-data';
import '../styles/project-home-v2.css';

/**
 * EU SmPC (Summary of Product Characteristics) authoring — QRD template.
 *
 * The EU companion to the live USPI (LabelingPi) surface. Renders the QRD
 * section tree (1–10 with 4.x/5.x/6.x) with each section's authoring status and
 * a submission-readiness rollup, LIVE from GET/POST /api/labeling-smpc
 * (buildSmpcReadiness). Falls back to the QRD fixture with a "Sample data" pill
 * when the backend is unavailable.
 */
const STATUS_TONE: Record<SmpcStatus, string> = { final: 'ok', review: 'warn', draft: 'idle', missing: 'err' };
const STATUS_LABEL: Record<SmpcStatus, string> = { final: 'final', review: 'review', draft: 'draft', missing: 'missing' };
const NEXT_STATUS: Record<SmpcStatus, SmpcStatus> = { missing: 'draft', draft: 'review', review: 'final', final: 'missing' };

export function SmpcLabeling({ onAsk }: SurfaceViewProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const raw = useLive<{ data?: SmpcReadiness }>('/api/labeling-smpc', { data: SMPC_FIXTURE }, [refreshKey]);
  const rd = raw.data?.data;
  const valid = !raw.sample && !!rd && Array.isArray(rd.sections) && rd.sections.length > 0 && !!rd.sections[0]?.number;
  const readiness: SmpcReadiness = valid ? (rd as SmpcReadiness) : SMPC_FIXTURE;
  const sample = !valid;

  async function advance(section: SmpcSectionRow) {
    if (sample) return;
    const next = NEXT_STATUS[section.status];
    setBusy(section.number);
    try {
      const res = await apiRequest('POST', '/api/labeling-smpc', { sectionNumber: section.number, status: next });
      if (res.ok) setRefreshKey((k) => k + 1);
    } catch {
      /* offline — nothing persisted */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page-inner">
      <div className="ph">
        <div className="ph-eyebrow">Labeling · EU SmPC (QRD)</div>
        <h1 className="ph-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Summary of Product Characteristics
          <SampleTag sample={sample} />
        </h1>
        <p className="ph-sub">
          EMA/HMA QRD template ·{' '}
          <strong style={{ color: readiness.ready ? 'var(--ok-600,#1a7f4b)' : 'var(--text-300)' }}>
            {readiness.finalRequired}/{readiness.totalRequired} required sections final
          </strong>{' '}
          ({readiness.completenessPct}%) ·{' '}
          {readiness.ready ? 'All required sections final.' : `${readiness.outstanding.length} required section(s) outstanding.`}
        </p>
      </div>

      <div className="sp-list">
        {readiness.sections.map((s) => (
          <div key={s.number} className="sp-row" style={{ paddingLeft: 12 + s.depth * 20 }}>
            <span className="pg-mono" style={{ minWidth: 44 }}>{s.number}</span>
            <span className="sp-row-b">
              <span className="sp-row-t">{s.title}</span>
              {!s.required && <span className="sp-row-s">optional at first authorisation</span>}
            </span>
            <span className={'rd-chip tone-' + STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</span>
            {!sample && (
              <button
                className="btn ghost"
                disabled={busy === s.number}
                style={{ marginLeft: 8 }}
                onClick={() => advance(s)}
                title={`Advance to "${NEXT_STATUS[s.status]}"`}
              >
                {s.status === 'final' ? 'Reopen' : `→ ${NEXT_STATUS[s.status]}`}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="scaf-note">
        The QRD section structure is the EMA/HMA Quality Review of Documents human product-information template
        (Dir 2001/83/EC Art. 11). A section is submission-ready only when its authored content is <em>final</em>;
        readiness is computed server-side over the required sections. This tracks authoring state — the QRD template
        and linguistic review remain the authority for the filed text.
      </p>

      {onAsk && (
        <button
          className="btn ghost"
          onClick={() => onAsk('Draft the EU SmPC section 4.1 Therapeutic indications from the approved USPI indications, following the QRD template wording conventions.')}
        >
          {I.sparkles} Ask AnA to draft an SmPC section from the USPI
        </button>
      )}
    </div>
  );
}
