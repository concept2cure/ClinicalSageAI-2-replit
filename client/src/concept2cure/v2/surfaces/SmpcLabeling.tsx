import React, { useState, useMemo } from 'react';

import { usePublishSurfaceContext } from '../surfaceContext';
import { I } from '../icons';
import { useLiveData, EmptyState, type ShapeGuard } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/**
 * EU SmPC (Summary of Product Characteristics) authoring — QRD template.
 *
 * The EU companion to the live USPI (LabelingPi) surface. Renders the QRD
 * section tree (1–10 with 4.x/5.x/6.x) with each section's authoring status and
 * a submission-readiness rollup, LIVE from GET/POST /api/labeling-smpc
 * (server labeling-smpc.routes.ts → buildSmpcReadiness over the org-scoped
 * c2c_smpc_sections store). Real persisted data, an honest empty state, or an
 * honest error state — never a fabricated fixture.
 */

/* ── Types — the backend's real output shape (server smpc-qrd-catalog.ts:
   buildSmpcReadiness). Every field is computed deterministically server-side
   and always present; there are no nullable columns to guard. ── */
type SmpcStatus = 'missing' | 'draft' | 'review' | 'final';

interface SmpcSectionRow {
  number: string;
  title: string;
  depth: number;
  required: boolean;
  status: SmpcStatus;
}

interface SmpcReadiness {
  sections: SmpcSectionRow[];
  finalRequired: number;
  totalRequired: number;
  completenessPct: number;
  ready: boolean;
  outstanding: string[];
}

/**
 * A 200 is only evidence that something came back. `{ data: [] }` from a list
 * route unwraps to a bare `[]`, which is TRUTHY — it sailed past the `!readiness`
 * empty-state branch below and then `readiness.outstanding.length` threw during
 * render, so the boundary told the user the app was broken instead of the true
 * "we couldn't load this". The same held for `{}`, a 200 error body, and a JSON
 * scalar: none of them are a readiness rollup, and none of them are null either.
 *
 * `sections` and `outstanding` must be arrays rather than merely present:
 * buildSmpcReadiness computes both unconditionally, so a null there is not the
 * "nothing selected yet" case `hasKeys` protects — it is a body that isn't a
 * readiness rollup, and `.map` / `.length` on it crashes just the same.
 */
const isSmpcReadiness: ShapeGuard<SmpcReadiness> = (value): value is SmpcReadiness => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.sections) &&
    Array.isArray(v.outstanding) &&
    'finalRequired' in v &&
    'totalRequired' in v &&
    'completenessPct' in v &&
    'ready' in v
  );
};

const STATUS_TONE: Record<SmpcStatus, string> = { final: 'ok', review: 'warn', draft: 'idle', missing: 'err' };
const STATUS_LABEL: Record<SmpcStatus, string> = { final: 'final', review: 'review', draft: 'draft', missing: 'missing' };
const NEXT_STATUS: Record<SmpcStatus, SmpcStatus> = { missing: 'draft', draft: 'review', review: 'final', final: 'missing' };

export function SmpcLabeling({ onAsk }: SurfaceViewProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  // Live QRD readiness from the governed store. useLiveData unwraps the
  // `{ data }` success envelope, so the payload is the SmpcReadiness object
  // directly (not `.data.data`). The read fails closed server-side to the
  // all-missing QRD skeleton, so a real object is normally present; a null
  // payload or a failed load (e.g. 403 without org) are surfaced honestly —
  // never a fixture. Refetches when refreshKey bumps after a section advance.
  // The guard sends a 200 that isn't a readiness rollup into the error branch
  // below instead of handing it back cast to SmpcReadiness (see isSmpcReadiness).
  const { data: readiness, loading, error } = useLiveData<SmpcReadiness>(
    '/api/labeling-smpc',
    [refreshKey],
    isSmpcReadiness,
  );

  // Real, persisted action: POST /api/labeling-smpc upserts the section status
  // in c2c_smpc_sections and returns refreshed readiness; on success we refetch.
  // A failed write (offline / 403 / 503 pending store) persists nothing and
  // claims nothing.
  async function advance(section: SmpcSectionRow) {
    const next = NEXT_STATUS[section.status];
    setBusy(section.number);
    try {
      const res = await apiRequest('POST', '/api/labeling-smpc', { sectionNumber: section.number, status: next });
      if (res.ok) setRefreshKey((k) => k + 1);
    } catch {
      /* write failed — nothing persisted */
    } finally {
      setBusy(null);
    }
  }

  /* What AnA can see of this screen.
     She knew the user was on "labeling-smpc" and nothing else — not how
     complete the QRD set is, which required sections are still outstanding, or
     whether it is filable — so "are we ready?" could only be answered by the
     user reading their own screen back to her.

     A failed read publishes the failure. `readiness` is absent both when the
     governed store is empty and when the read threw, and reporting "0% complete"
     or "not ready" over an outage would be a filing judgement made from an
     outage. */
  const anaContext = useMemo(() => {
    if (loading) {
      return { summary: 'EU SmPC readiness is still loading; nothing on screen is final yet.' };
    }
    if (error || !readiness) {
      return {
        summary:
          'EU SmPC readiness could not be read, so this screen reports no completeness figure — that is a failed read, not a finding about the labeling set.',
        availableActions: ['Retry the SmPC readiness read'],
      };
    }
    return {
      summary:
        `EU SmPC (QRD): ${readiness.completenessPct}% complete — ` +
        `${readiness.finalRequired} of ${readiness.totalRequired} required sections final; ` +
        (readiness.ready
          ? 'the set reports as ready'
          : `${readiness.outstanding.length} section(s) outstanding`),
      facts: {
        completenessPct: readiness.completenessPct,
        finalRequired: readiness.finalRequired,
        totalRequired: readiness.totalRequired,
        ready: readiness.ready,
        outstanding: readiness.outstanding,
        sectionCount: readiness.sections.length,
      },
      availableActions: [
        'Advance a section through its QRD status (persisted to the governed store)',
        'Review which required sections are still outstanding',
        'Check the completeness figure against the QRD template',
      ],
    };
  }, [loading, error, readiness]);
  usePublishSurfaceContext('labeling-smpc', anaContext);

  return (
    <div className="page-inner">
      <div className="ph">
        <div className="ph-eyebrow">Labeling · EU SmPC (QRD)</div>
        <h1 className="ph-title">Summary of Product Characteristics</h1>
        <p className="ph-sub">
          EMA/HMA QRD template
          {readiness && (
            <>
              {' '}·{' '}
              <strong style={{ color: readiness.ready ? 'var(--ok-600,#1a7f4b)' : 'var(--text-300)' }}>
                {readiness.finalRequired}/{readiness.totalRequired} required sections final
              </strong>{' '}
              ({readiness.completenessPct}%) ·{' '}
              {readiness.ready ? 'All required sections final.' : `${readiness.outstanding.length} required section(s) outstanding.`}
            </>
          )}
        </p>
      </div>

      {loading ? (
        <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading…</div>
      ) : error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the SmPC readiness"
          hint="The QRD section tree and its submission-readiness rollup are computed server-side over the governed SmPC store — sign in and retry, or check the service is reachable."
        />
      ) : !readiness ? (
        <EmptyState
          icon={I.fileText}
          title="No SmPC authoring data yet"
          hint="Set a QRD section's authoring status to start tracking submission readiness."
        />
      ) : (
        <div className="sp-list">
          {readiness.sections.map((s) => (
            <div key={s.number} className="sp-row" style={{ paddingLeft: 12 + s.depth * 20 }}>
              <span className="pg-mono" style={{ minWidth: 44 }}>{s.number}</span>
              <span className="sp-row-b">
                <span className="sp-row-t">{s.title}</span>
                {!s.required && <span className="sp-row-s">optional at first authorisation</span>}
              </span>
              <span className={'rd-chip tone-' + STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</span>
              <button
                className="btn ghost"
                disabled={busy === s.number}
                style={{ marginLeft: 8 }}
                onClick={() => advance(s)}
                title={`Advance to "${NEXT_STATUS[s.status]}"`}
              >
                {s.status === 'final' ? 'Reopen' : `→ ${NEXT_STATUS[s.status]}`}
              </button>
            </div>
          ))}
        </div>
      )}

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
