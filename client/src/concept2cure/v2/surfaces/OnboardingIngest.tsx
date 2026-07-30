/**
 * OnboardingIngest — the client-facing upload → review → apply flow (P2/P3).
 *
 * Ties together the three pieces that already exist:
 *   1. POST /api/onboarding/ingest  — AnA reads one document and returns values
 *      whose provenance it VERIFIED against the document text.
 *   2. <OnboardingProposalReview>   — the human approval gate.
 *   3. POST /api/onboarding/commit  — the governed, audited write, which
 *      re-reads the server's own proposals (the request only names ids).
 *
 * Honesty in this surface:
 *  - It states plainly that nothing is saved until the human applies it.
 *  - Extraction warnings (unreadable pages, discarded unverifiable values) are
 *    shown, not hidden — a client sees what was dropped.
 *  - The result reports exactly what was applied AND what was not, with the
 *    reason, rather than claiming blanket success.
 */
import React, { useCallback, useRef, useState } from 'react';
import { I } from '../icons';
import { apiRequest } from '@/lib/queryClient';
import { getAuthHeaders } from '@/utils/authToken';
import type { SurfaceViewProps } from '../surfaceViews';
import type { OnboardingIngestResult, OnboardingProposalField } from '@shared/types/onboarding-ingest';
import { OnboardingProposalReview } from './OnboardingProposalReview';
import '../styles/onboarding-review.css';

interface CommitOutcome {
  applied: Array<{ targetField: string; ok: boolean; error?: string }>;
  writes: string[];
  failures: number;
}

type Phase = 'idle' | 'reading' | 'review' | 'committing' | 'done';

export function OnboardingIngest({ onNav }: SurfaceViewProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(OnboardingIngestResult & { runId?: string }) | null>(null);
  const [outcome, setOutcome] = useState<CommitOutcome | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = useCallback(async (file: File) => {
    setError(null);
    setOutcome(null);
    setPhase('reading');
    try {
      const form = new FormData();
      form.append('file', file);
      // Multipart: use fetch directly — apiRequest forces a JSON content type.
      const res = await fetch('/api/onboarding/ingest', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: form,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setError(body?.error || 'That document could not be read.');
        setPhase('idle');
        return;
      }
      setResult(body.data as OnboardingIngestResult & { runId?: string });
      setPhase('review');
    } catch {
      setError('Could not reach the server to read that document.');
      setPhase('idle');
    }
  }, []);

  const commit = useCallback(
    async (approved: OnboardingProposalField[], reason: string) => {
      if (!result?.runId) {
        setError('That review session has expired. Please upload the document again.');
        return;
      }
      setPhase('committing');
      try {
        // Only ids + the human's values travel; the server supplies provenance.
        const res = await apiRequest('POST', '/api/onboarding/commit', {
          runId: result.runId,
          approvals: approved.map((f) => ({ id: f.id, value: f.value })),
          reason,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.success) {
          setError(body?.error || 'Those changes could not be applied.');
          setPhase('review');
          return;
        }
        setOutcome(body.data as CommitOutcome);
        setPhase('done');
      } catch {
        setError('Could not reach the server to apply those changes.');
        setPhase('review');
      }
    },
    [result],
  );

  const reset = () => {
    setResult(null);
    setOutcome(null);
    setError(null);
    setPhase('idle');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="opr">
      {phase !== 'review' && phase !== 'committing' && (
        <div className="opr-head">
          <div>
            <div className="opr-eyebrow">AnA · onboarding</div>
            <h2 className="opr-title">Set up from a document</h2>
            <div className="opr-sub">
              Upload a prior filing, company profile, protocol or spec. AnA reads it and suggests
              values for your workspace — quoting the exact place it found each one.{' '}
              <b>Nothing is saved until you review and apply it.</b>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="opr-warnings" role="alert">
          <div className="opr-warn-h">{I.alertTriangle} {error}</div>
        </div>
      )}

      {phase === 'idle' && (
        <div className="opr-group">
          <div className="opr-group-h">Document</div>
          <div className="opr-field">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              className="opr-field-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f);
              }}
            />
            <div className="opr-field-foot">
              <span className="opr-prov">PDF, Word or plain text</span>
            </div>
          </div>
        </div>
      )}

      {phase === 'reading' && (
        <div className="opr-group">
          <div className="opr-group-h">Reading your document…</div>
          <div className="opr-empty">
            AnA is looking for values it can trace back to a specific place in the document.
          </div>
        </div>
      )}

      {(phase === 'review' || phase === 'committing') && result && (
        <>
          {result.groups.length === 0 ? (
            <div className="opr-group">
              <div className="opr-group-h">Nothing could be verified</div>
              <div className="opr-empty">
                AnA could not find values it was able to trace back to this document, so it has not
                suggested any. Nothing was invented to fill the gap.
              </div>
              {result.warnings.map((w, i) => (
                <div key={i} className="opr-empty">{w}</div>
              ))}
              <div className="opr-commit-actions">
                <button type="button" className="opr-cancel" onClick={reset}>Try another document</button>
              </div>
            </div>
          ) : (
            <OnboardingProposalReview
              groups={result.groups}
              sources={result.sources}
              warnings={result.warnings}
              committing={phase === 'committing'}
              onCommit={commit}
              onCancel={reset}
            />
          )}
        </>
      )}

      {phase === 'done' && outcome && (
        <div className="opr-group">
          <div className="opr-group-h">What was applied</div>
          {outcome.applied.map((a, i) => (
            <div key={i} className="opr-field">
              <div className="opr-field-top">
                <span className="opr-field-label">{a.targetField}</span>
                <span className={`opr-conf${a.ok ? '' : ' low'}`}>{a.ok ? 'applied' : 'not applied'}</span>
              </div>
              {a.error && <div className="opr-field-foot"><span className="opr-prov">{a.error}</span></div>}
            </div>
          ))}
          <div className="opr-field-foot" style={{ marginTop: 10 }}>
            <span className="opr-prov">
              {outcome.writes.length > 0
                ? 'Applied changes are recorded in the Part 11 audit trail.'
                : 'No changes were written.'}
            </span>
          </div>
          <div className="opr-commit-actions">
            <button type="button" className="opr-cancel" onClick={reset}>Read another document</button>
            <button type="button" className="opr-commit-btn" onClick={() => onNav('project-home')}>
              Continue to your workspace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
