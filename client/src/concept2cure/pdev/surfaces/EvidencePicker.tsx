/**
 * PDEV Evidence picker — attach an evidence object to an activity.
 *
 * Search + select an evidence object, pick the link type + strength,
 * write a rationale, then route through <GovernedConfirmDialog> to attach.
 *
 * Port basis: ui_kits/pdev/Evidence.jsx.
 *
 * The kit's POOL fixture is gone (per CLAUDE.md "Seed data fixtures must
 * not land in v2"): this searches live against GET /api/evidence-objects,
 * which reads the REAL, canonical `evidence_objects` graph — the same
 * org-scoped store the attach POST resolves against. No fixture, no
 * fallback rows: the picker renders real rows or an honest empty state
 * only. If the store is unprovisioned the endpoint returns an empty
 * envelope (or 404 before mount), and the picker shows its empty-state
 * directing the user to upload an evidence object first.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import type {
  PdevActivityView,
  PdevEvidenceLinkType,
  PdevEvidenceStrength,
} from '../data/types';
import { usePdevEvidenceAttach } from '../hooks/usePdevData';
import {
  GovernedConfirmDialog,
  type ConfirmConfig,
} from '../../_shared/components/GovernedConfirmDialog';

interface EvidenceObjectRow {
  id: string;
  title: string;
  type: string;
  category: string;
  source: string;
}

interface EvidencePickerProps {
  programId: string;
  activity: PdevActivityView;
  onClose: () => void;
  onAttached: () => void;
}

const LINK_TYPES: ReadonlyArray<PdevEvidenceLinkType> = [
  'supports',
  'contradicts',
  'references',
  'supersedes',
];
const STRENGTHS: ReadonlyArray<PdevEvidenceStrength> = ['strong', 'moderate', 'weak'];

export function PdevEvidencePicker({
  programId,
  activity,
  onClose,
  onAttached,
}: EvidencePickerProps) {
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<EvidenceObjectRow | null>(null);
  const [linkType, setLinkType] = React.useState<PdevEvidenceLinkType>('supports');
  const [strength, setStrength] = React.useState<PdevEvidenceStrength>('strong');
  const [rationale, setRationale] = React.useState('');
  const [pending, setPending] = React.useState<ConfirmConfig | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<EvidenceObjectRow[] | null>(null);
  const [searchError, setSearchError] = React.useState<string | null>(null);

  const attach = usePdevEvidenceAttach();

  /* Debounced server-side search against an evidence-objects list endpoint.
     If the endpoint returns 404 (not wired yet in this slice), surface the
     empty-state rather than failing the whole picker. */
  React.useEffect(() => {
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const url = `/api/evidence-objects?programId=${encodeURIComponent(programId)}${
          query ? `&q=${encodeURIComponent(query)}` : ''
        }`;
        const res = await fetch(url, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (res.status === 404) {
          setResults([]);
          setSearchError(null);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: EvidenceObjectRow[] };
        setResults(json.data);
        setSearchError(null);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [programId, query]);

  /* Takes the ConfirmResult now.
     This was `onConfirm={() => onAttach()}` — a zero-argument arrow, silently
     assignable to the dialog's `(result: ConfirmResult) => void` prop — so the
     reason the operator typed under "Captured verbatim in the audit log" was
     dropped on the floor, and the server had no field to receive it either. */
  const onAttach = async (reasonForChange?: string) => {
    if (!selected) return;
    setConfirmError(null);
    try {
      await attach.run({
        programId,
        activityKey: activity.registry.key,
        evidenceObjectId: selected.id,
        linkType,
        strength,
        rationale: rationale.trim(),
        reasonForChange,
      });
      onAttached();
      onClose();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Attach failed');
    }
  };

  return (
    <div
      className="pdev-sheet-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="pdev-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Attach evidence"
      >
        <div className="pdev-sheet-head">
          <div>
            <div className="pdev-sheet-eyebrow">Attach evidence · governed</div>
            <div className="pdev-sheet-title">Attach to {activity.registry.key}</div>
          </div>
          <button
            className="pdev-sheet-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <PdevIcon name="close" />
          </button>
        </div>

        <div className="pdev-sheet-body">
          <div className="pdev-search-input">
            <span className="ico">
              <PdevIcon name="search" />
            </span>
            <input
              placeholder="Search evidence objects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search"
            />
          </div>

          <div className="pdev-evidence-list">
            {searchError && (
              <div className="pdev-empty">{searchError}</div>
            )}
            {results === null && !searchError && (
              <div className="pdev-empty">Searching…</div>
            )}
            {results?.length === 0 && (
              <div className="pdev-empty">
                No evidence objects yet — upload one in the evidence library
                before attaching.
              </div>
            )}
            {results?.map((e) => (
              <button
                key={e.id}
                className="pdev-evidence-pick-row"
                data-on={selected?.id === e.id || undefined}
                onClick={() => setSelected(e)}
                type="button"
              >
                <div className="pdev-evidence-pick-body">
                  <div className="pdev-evidence-title">{e.title}</div>
                  <div className="pdev-evidence-meta mono small">
                    {e.type} · {e.category} · {e.source}
                  </div>
                </div>
                {selected?.id === e.id && (
                  <span className="ico">
                    <PdevIcon name="check" />
                  </span>
                )}
              </button>
            ))}
          </div>

          {selected && (
            <>
              <div className="pdev-sheet-section">
                <div className="lbl">Link type</div>
                <div className="pdev-seg">
                  {LINK_TYPES.map((t) => (
                    <button
                      key={t}
                      className="pdev-seg-btn"
                      data-on={linkType === t || undefined}
                      onClick={() => setLinkType(t)}
                      type="button"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Strength</div>
                <div className="pdev-seg">
                  {STRENGTHS.map((s) => (
                    <button
                      key={s}
                      className="pdev-seg-btn"
                      data-on={strength === s || undefined}
                      onClick={() => setStrength(s)}
                      type="button"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pdev-sheet-section">
                <div className="lbl">Rationale</div>
                <textarea
                  rows={3}
                  placeholder="Why this evidence applies here…"
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div className="pdev-sheet-foot">
          <button
            className="pdev-btn ghost"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="pdev-btn primary"
            disabled={!selected}
            onClick={() =>
              setPending({
                action: 'Attach evidence',
                target: `${selected!.id} → ${activity.registry.key} (${linkType}, ${strength})`,
                resource: activity.registry.key,
                minReason: 10,
                confirmWord: 'yes',
              })
            }
            type="button"
          >
            <PdevIcon name="link" /> Attach
          </button>
        </div>
      </aside>

      {pending && (
        <GovernedConfirmDialog
          open={true}
          {...pending}
          onCancel={() => {
            setPending(null);
            setConfirmError(null);
          }}
          onConfirm={(result) => onAttach(result.reason)}
          submitError={confirmError}
        />
      )}
    </div>
  );
}
