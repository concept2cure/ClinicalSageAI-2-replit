/**
 * UdiSurface — DOC-FIRST (per PHASE_4_INSTALL.md §1.1).
 *
 * The whole point is producing labels (IFU, package, on-device, patient
 * labeling) and the submission files that register them with FDA GUDID
 * and EU EUDAMED. Documents are the primary zone; the device registry,
 * region×lang matrix, ISO 15223-1 symbol glossary, and MRI matrix
 * collapse into a "Situational awareness" accordion.
 *
 * Cross-program surface (UDI is per-tenant, not per-program).
 * Port basis: design-system/ui_kits/mdx/surfaces/Udi.jsx.
 */

import * as React from 'react';
import { I } from '../icons';
import { DocumentsPanel } from '../components/DocumentsPanel';
import {
  UDI_DEVICES,
  UDI_ISSUES,
  UDI_MRI,
  UDI_SYMBOLS,
} from '../data/udi';
import { UDI_DOC_FRAMEWORKS, UDI_DOCUMENTS } from '../data/udi-docs';
import { useUdi } from '../hooks/useUdi';
import type { KitDocFramework, KitDocument } from '../components/DocumentsPanel';

export interface UdiSurfaceProps {
  onAskAna: (text: string, opts?: { tool?: string }) => void;
  onOpenEditor?: (docId: string) => void;
}

interface UdiBlocker {
  kind: string;
  severity: 'err' | 'warn' | 'low';
  ref: string;
  title: string;
  note: string;
  owner: string;
  age: string;
}

const SEV_ORDER: Record<UdiBlocker['severity'], number> = { err: 0, warn: 1, low: 2 };

export function UdiSurface({ onAskAna, onOpenEditor }: UdiSurfaceProps) {
  const [awarenessOpen, setAwarenessOpen] = React.useState(false);

  const live = useUdi();
  const devices = live.devices ?? UDI_DEVICES;
  const symbols = live.symbols ?? UDI_SYMBOLS;
  const issues = live.issues ?? UDI_ISSUES;
  const mri = live.mri ?? UDI_MRI;
  const documents = UDI_DOCUMENTS as unknown as KitDocument[];
  const frameworks = UDI_DOC_FRAMEWORKS as unknown as KitDocFramework[];

  const labelDocs = documents.filter((d) => d.editor === 'label');
  const submissionDocs = documents.filter((d) => d.editor === 'data-submission');
  const blockedDocs = documents.filter((d) => d.blocker);
  const pendingSig = documents.filter((d) => d.esigState === 'pending').length;
  const avgCompletion = documents.length
    ? Math.round(documents.reduce((s, d) => s + d.completion, 0) / documents.length)
    : 0;

  const blockers = React.useMemo<UdiBlocker[]>(() => {
    const list: UdiBlocker[] = [];
    for (const issue of issues) {
      list.push({
        kind: issue.kind,
        severity: issue.severity as UdiBlocker['severity'],
        ref: issue.id,
        title: issue.msg,
        note: issue.label,
        owner: '—',
        age: issue.since,
      });
    }
    for (const d of documents) {
      if (d.blocker) {
        list.push({
          kind: 'doc',
          severity: 'err',
          ref: d.id,
          title: d.title,
          note: d.blockerNote ?? '—',
          owner: d.owner,
          age: d.lastEdit,
        });
      }
    }
    return list.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  }, [issues, documents]);

  const blockedSummary = blockedDocs
    .map((d) => {
      const parts = d.title.split(' — ')[0].split(' ');
      return parts[parts.length - 1];
    })
    .slice(0, 3)
    .join(' · ');

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workstream</div>
          <h1 className="page-title">UDI and labeling</h1>
          <div className="page-sub">
            {documents.length} label and submission artifacts to deliver. 21 CFR
            801 · ISO 15223-1 · EU MDR Annex I · ASTM F2503.
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost small"
            onClick={() => onOpenEditor?.('doc-master-bx204')}
            type="button"
          >
            {I.eye} Open UDI Master Record
          </button>
          <button
            className="btn primary small"
            onClick={() => onOpenEditor?.('doc-ifu-bx204-en')}
            type="button"
          >
            {I.pencil} Open BX-204 IFU
          </button>
        </div>
      </div>

      <div className="metrics-row metrics-compact">
        <div className="metric-card">
          <div className="metric-label">Documents in flight</div>
          <div className="metric-val">{documents.length}</div>
          <div className="metric-meta">
            {labelDocs.length} labels · {submissionDocs.length} submissions
          </div>
        </div>
        <div className="metric-card" data-tone={blockedDocs.length > 0 ? 'err' : 'ok'}>
          <div className="metric-label">Blocked documents</div>
          <div className="metric-val">{blockedDocs.length}</div>
          <div className="metric-meta">{blockedSummary || '—'}</div>
        </div>
        <div className="metric-card" data-tone="warn">
          <div className="metric-label">Awaiting signature</div>
          <div className="metric-val">{pendingSig}</div>
          <div className="metric-meta">Pending Part 11 e-signature</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg completion</div>
          <div className="metric-val">
            {avgCompletion}
            <span className="unit">%</span>
          </div>
          <div className="metric-meta">Across all label and submission artifacts</div>
        </div>
      </div>

      <DocumentsPanel
        title="Documents in flight"
        subtitle="Tap any row to open in the label editor · sparkle to draft a translation or symbol revision with AnA"
        docs={documents}
        frameworks={frameworks}
        onOpenEditor={onOpenEditor}
        onAskAna={(text) => onAskAna(text)}
      />

      <section className="section">
        <div className="section-head">
          <h2>Blocking label release</h2>
          <span className="section-sub">
            {blockers.filter((b) => b.severity === 'err').length} hard blockers ·{' '}
            {blockers.filter((b) => b.severity === 'warn').length} review pending ·
            ISO symbols · translations · UDI checksums · risk-class confirmation
          </span>
        </div>
        <div className="eng-blockers-feed">
          {blockers.slice(0, 8).map((b, i) => (
            <button
              key={`${b.ref}-${i}`}
              className="eng-blocker-row"
              data-sev={b.severity}
              data-kind={b.kind}
              onClick={() =>
                onAskAna(
                  `${b.ref} — ${b.title}. Walk me through the fix and which label this unblocks.`,
                )
              }
              type="button"
            >
              <span className={`eng-blocker-dot tone-${b.severity}`} />
              <span className="eng-blocker-kind mono tiny">{b.kind}</span>
              <span className="mono small eng-blocker-ref">{b.ref}</span>
              <span className="eng-blocker-title">{b.title}</span>
              <span className="eng-blocker-note">{b.note}</span>
              <span className="eng-blocker-owner">{b.owner}</span>
              <span className="eng-blocker-age">{b.age}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section eng-awareness" data-open={awarenessOpen}>
        <button
          className="eng-awareness-head"
          onClick={() => setAwarenessOpen((o) => !o)}
          aria-expanded={awarenessOpen}
          type="button"
        >
          <span className="eng-awareness-chev">
            {awarenessOpen ? I.down : I.right}
          </span>
          <h2>Situational awareness</h2>
          <span className="section-sub">
            Device registry · region×language matrix · ISO 15223-1 symbols · MRI
            matrix
          </span>
        </button>

        {awarenessOpen && (
          <div className="eng-awareness-body">
            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>Device registry · UDI-DI</h2>
              </div>
              <div className="ctable">
                <div
                  className="ctable-head"
                  style={{
                    gridTemplateColumns: '1.4fr 100px 1fr 100px 1fr 100px 80px',
                  }}
                >
                  <div>Device</div>
                  <div>Class</div>
                  <div>FDA UDI-DI</div>
                  <div>GUDID</div>
                  <div>EU UDI-DI</div>
                  <div>EUDAMED</div>
                  <div>MRI</div>
                </div>
                {devices.map((d) => (
                  <div
                    key={d.id}
                    className="ctable-row"
                    style={{
                      gridTemplateColumns:
                        '1.4fr 100px 1fr 100px 1fr 100px 80px',
                    }}
                  >
                    <div>
                      <div className="ctable-strong">{d.code}</div>
                      <div style={{ color: 'var(--text-400)', fontSize: 12 }}>
                        {d.name}
                      </div>
                    </div>
                    <div>{d.class}</div>
                    <div className="mono small-mono">{d.fda.di}</div>
                    <div>
                      <span className={`udi-status-pill ${d.fda.status}`}>
                        {d.fda.status}
                      </span>
                    </div>
                    <div className="mono small-mono">{d.eu.di}</div>
                    <div>
                      <span className={`udi-status-pill ${d.eu.status}`}>
                        {d.eu.status}
                      </span>
                    </div>
                    <div>
                      <span className={`udi-mri udi-mri-${d.mri}`}>{d.mri}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>ISO 15223-1 symbols</h2>
                <span className="section-sub">
                  {symbols.filter((s) => s.present).length} of {symbols.length}{' '}
                  present on active labels
                </span>
              </div>
              <div className="udi-symbols">
                {symbols.map((s) => (
                  <div
                    key={s.iso}
                    className="udi-symbol"
                    data-on={s.present || undefined}
                  >
                    <div className="udi-symbol-head">
                      <span className="mono tiny">{s.iso}</span>
                      {s.present ? (
                        <span className="udi-symbol-ok">{I.check}</span>
                      ) : (
                        <span className="udi-symbol-warn">{I.alertCircle}</span>
                      )}
                    </div>
                    <div className="udi-symbol-name">{s.name}</div>
                    <div className="udi-symbol-req">Required: {s.required}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="section-head" style={{ marginTop: 0 }}>
                <h2 style={{ fontSize: 14 }}>MRI conditional matrix</h2>
              </div>
              <div className="ctable">
                <div
                  className="ctable-head"
                  style={{
                    gridTemplateColumns: '90px 100px 100px 100px 110px 1fr',
                  }}
                >
                  <div>Device</div>
                  <div>Mode</div>
                  <div>Field</div>
                  <div>SAR</div>
                  <div>Gradient</div>
                  <div>Notes</div>
                </div>
                {mri.map((m) => (
                  <div
                    key={m.device}
                    className="ctable-row"
                    style={{
                      gridTemplateColumns: '90px 100px 100px 100px 110px 1fr',
                    }}
                  >
                    <div className="ctable-strong">{m.device}</div>
                    <div>
                      <span className={`udi-mri udi-mri-${m.mode}`}>{m.mode}</span>
                    </div>
                    <div className="mono small-mono">{m.field}</div>
                    <div className="mono small-mono">{m.sar}</div>
                    <div className="mono small-mono">{m.gradient}</div>
                    <div style={{ color: 'var(--text-300)', fontSize: 12 }}>
                      {m.notes}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </>
  );
}
