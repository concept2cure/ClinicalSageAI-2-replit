/**
 * AuditSurface — Phase 5 hybrid · cross-program.
 *
 * Dedicated audit log viewer (separate from the 24-hour band on Admin).
 * Date / actor / action / resource filters, paginated event list,
 * SHA-256 chain visualization, signed-PDF export. Reuses the Admin
 * surface's compliance-export DocumentsPanel for the audit-export
 * artifacts (those rows ARE audit documents).
 *
 * Cross-program. Port basis:
 * design-system/ui_kits/mdx/surfaces/Audit.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  AUDIT_ACTIONS,
  AUDIT_EVENTS,
  AUDIT_KPIS,
  AUDIT_RESOURCES,
} from '../data/audit';
import { ADM_DOC_FRAMEWORKS, ADM_DOCUMENTS } from '../data/admin-docs';
import { useAudit } from '../hooks/useAudit';
import type {
  KitDocFramework,
  KitDocument,
} from '../components/DocumentsPanel';

export interface AuditSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  onOpenEditor?: (docId: string) => void;
}

export function AuditSurface({ onAskAna, onOpenEditor }: AuditSurfaceProps) {
  const [actionFilter, setActionFilter] = React.useState<string>('all');
  const [resourceFilter, setResourceFilter] = React.useState<string>('all');
  const [query, setQuery] = React.useState<string>('');

  const live = useAudit({
    action: actionFilter !== 'all' ? actionFilter : undefined,
    resource: resourceFilter !== 'all' ? resourceFilter : undefined,
    query: query || undefined,
  });
  const events = live.events ?? AUDIT_EVENTS;
  const actions = live.actions ?? AUDIT_ACTIONS;
  const resources = live.resources ?? AUDIT_RESOURCES;
  const kpis = live.kpis ?? AUDIT_KPIS;

  /* When the live endpoint isn't filtering for us (fixture mode), apply
     the same filter logic client-side so the surface behaves consistently
     in both modes. */
  const filtered = events.filter(
    (e) =>
      (actionFilter === 'all' || e.action === actionFilter) &&
      (resourceFilter === 'all' || e.resource === resourceFilter) &&
      (!query ||
        `${e.target}${e.actorName}${e.reason ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );

  /* Audit-export documents are exactly the Admin compliance-export
     subset filtered to part-11. Reuse so the export rail and the audit
     log surface a single source. */
  const exportDocs = (ADM_DOCUMENTS as unknown as KitDocument[]).filter(
    (d) => d.framework === 'part-11',
  );
  const exportFrameworks = (ADM_DOC_FRAMEWORKS as unknown as KitDocFramework[]).filter(
    (f) => f.id === 'part-11',
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">System</div>
          <h1 className="page-title">Audit log</h1>
          <div className="page-sub">
            21 CFR Part 11 §11.10(e) — every regulated mutation recorded,
            SHA-256 chained, 7-year minimum retention. Export at any range as
            a signed PDF.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() =>
              onAskAna(
                'Verify the audit log SHA-256 chain integrity across the full retention window. Surface any breaks.',
              )
            }
            type="button"
          >
            {I.shield} Verify chain
          </button>
          <button
            className="btn primary small"
            onClick={() =>
              onAskAna(
                'Export the audit log for the selected range as a signed PDF, including SHA-256 chain manifest.',
              )
            }
            type="button"
          >
            {I.download} Export range
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        {kpis.map((k, i) => (
          <div key={i} className="metric-card" data-tone={k.tone ?? ''}>
            <div className="metric-label">{k.label}</div>
            <div className="metric-val">
              {k.metric}
              {k.unit && <span className="unit">{k.unit}</span>}
            </div>
            <div className="metric-meta">{k.meta}</div>
          </div>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Filter</h2>
          <span className="section-sub">
            {filtered.length} of {events.length} events shown
          </span>
        </div>
        <div className="audit-filters">
          <div className="audit-search">
            <span className="ico">{I.search}</span>
            <input
              placeholder="Search actor, target, reason…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search audit events"
            />
          </div>
          <div className="seg small">
            <button
              className="seg-btn"
              data-on={actionFilter === 'all' || undefined}
              onClick={() => setActionFilter('all')}
              type="button"
            >
              All actions
            </button>
            {actions.slice(0, 4).map((a) => (
              <button
                key={a.id}
                className="seg-btn"
                data-on={actionFilter === a.id || undefined}
                onClick={() => setActionFilter(a.id)}
                type="button"
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="seg small">
            <button
              className="seg-btn"
              data-on={resourceFilter === 'all' || undefined}
              onClick={() => setResourceFilter('all')}
              type="button"
            >
              All resources
            </button>
            {resources.slice(0, 4).map((r) => (
              <button
                key={r.id}
                className="seg-btn"
                data-on={resourceFilter === r.id || undefined}
                onClick={() => setResourceFilter(r.id)}
                type="button"
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Events · chained</h2>
          <span className="section-sub">
            Each row&apos;s hash is computed over (prev_hash || event_payload) ·
            click an entry to verify cryptographically
          </span>
        </div>
        <div className="audit-chain">
          {filtered.map((e, i) => (
            <button
              key={e.id}
              className="audit-event"
              data-action={e.action}
              onClick={() =>
                onAskAna(
                  `Verify audit entry ${e.id} — show me the canonical payload, the previous-hash, the computed SHA-256, and confirm the chain link.`,
                )
              }
              type="button"
            >
              <div className="audit-event-link">
                <span className="audit-chain-dot" />
                {i < filtered.length - 1 && (
                  <span className="audit-chain-line" />
                )}
              </div>
              <div className="audit-event-body">
                <div className="audit-event-head">
                  <span className="mono small audit-event-id">{e.id}</span>
                  <span className="audit-event-when">{e.when}</span>
                  <span className={`audit-action-tag audit-action-${e.action}`}>
                    {e.action}
                  </span>
                  <span className="audit-event-resource">{e.resource}</span>
                  <span className="audit-event-target">{e.target}</span>
                </div>
                <div className="audit-event-meta">
                  <span className="audit-event-actor">
                    {e.actorName === 'system' ? (
                      <span style={{ color: 'var(--text-400)' }}>system</span>
                    ) : (
                      e.actorName
                    )}
                  </span>
                  <span className="dot-sep">·</span>
                  <span>{e.role}</span>
                  {e.reason && (
                    <>
                      <span className="dot-sep">·</span>
                      <span className="audit-event-reason">
                        &quot;{e.reason}&quot;
                      </span>
                    </>
                  )}
                </div>
                <div className="audit-event-hash">
                  <span className="audit-hash-lbl">SHA-256</span>
                  <span className="mono tiny audit-hash-val">{e.sha}</span>
                  <span className="audit-hash-lbl">prev</span>
                  <span className="mono tiny audit-hash-prev">{e.prev}</span>
                  {e.chain === 'ok' && (
                    <span className="audit-chain-ok">{I.check} chain ok</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <DocumentsPanel
        title="Audit exports"
        subtitle="Scheduled and on-demand signed PDFs from the audit log"
        docs={exportDocs}
        frameworks={exportFrameworks}
        onOpenEditor={onOpenEditor}
        onAskAna={(text) => onAskAna(text)}
      />
    </>
  );
}
