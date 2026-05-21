/**
 * PDEV IND assembly surface — module-by-module readiness + Compile CTA.
 *
 * Per PHASE_7_INSTALL.md §8 Phase 7.3:
 *   - 5-module grid (m1-m5) via `grid-template-columns: repeat(5, 1fr)`
 *   - Compile CTA disabled when overallReadiness < threshold; force
 *     option available with 30-char reason + 'yes-transmit' confirm.
 *
 * Port basis: design-system/ui_kits/pdev/Surfaces.jsx > PdevAssembly.
 */

import * as React from 'react';
import { PdevIcon } from '../icons';
import type { PdevIndAssemblyPayload } from '../data/types';
import { usePdevCompileInd } from '../hooks/usePdevData';
import {
  PdevConfirmDialog,
  type ConfirmConfig,
} from '../components/ConfirmDialog';

interface AssemblyProps {
  programId: string;
  programCode: string;
  /** Project ID needed by the compile endpoint to route to the existing
   *  ESG / eCTD export pipeline. Provided by the parent. */
  projectId: number | null;
  payload: PdevIndAssemblyPayload;
  onAskAna: (text: string) => void;
  onCompiled: () => void;
}

function moduleTone(readiness: number): 'ok' | 'warn' | 'err' {
  if (readiness >= 80) return 'ok';
  if (readiness >= 50) return 'warn';
  return 'err';
}

export function PdevAssemblySurface({
  programId,
  programCode,
  projectId,
  payload,
  onAskAna,
  onCompiled,
}: AssemblyProps) {
  const [pending, setPending] = React.useState<{
    config: ConfirmConfig;
    force: boolean;
  } | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const compile = usePdevCompileInd();

  const belowThreshold = payload.overallReadiness < payload.threshold;

  const open = (force: boolean) => {
    setPending({
      force,
      config: {
        action: force ? 'Force-compile IND assembly' : 'Compile IND assembly',
        target: `${programCode} · readiness ${payload.overallReadiness}% (threshold ${payload.threshold}%)`,
        resource: programCode,
        minReason: 30,
        confirmWord: 'yes-transmit',
      },
    });
  };

  const onConfirm = async ({ reason }: { reason: string }) => {
    if (!pending || projectId === null) return;
    setConfirmError(null);
    try {
      await compile.run({
        programId,
        submissionId: projectId,
        force: pending.force,
        readinessThreshold: payload.threshold,
        reason,
      });
      setPending(null);
      onCompiled();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Compile failed');
    }
  };

  return (
    <>
      <div className="pdev-page-header">
        <div>
          <div className="pdev-page-eyebrow">PDEV · {programCode}</div>
          <h1 className="pdev-page-title">IND assembly readiness</h1>
          <div className="pdev-page-sub">
            Readiness view only. eCTD publishing runs through the existing
            assembly pipeline once mandatory documents are in place.
          </div>
        </div>
        <div className="pdev-page-actions">
          <button
            className="pdev-btn ghost"
            onClick={() =>
              onAskAna('Show me what is missing from each IND module')
            }
            type="button"
          >
            <PdevIcon name="sparkles" /> Diagnose gaps
          </button>
        </div>
      </div>

      <section className="pdev-section">
        <div className="pdev-assembly-grid">
          {payload.modules.map((m) => {
            const tone = moduleTone(m.readiness);
            return (
              <div
                key={m.id}
                className="pdev-assembly-module"
                data-tone={tone}
              >
                <div className="pdev-assembly-module-head">
                  <span className="pdev-assembly-module-label">{m.label}</span>
                  <span className="pdev-assembly-module-num mono">
                    {m.readiness}%
                  </span>
                </div>
                <div className="pdev-assembly-module-bar">
                  <div
                    className="pdev-assembly-module-fill"
                    style={{ width: `${m.readiness}%` }}
                  />
                </div>
                <div className="pdev-assembly-module-counts">
                  <div className="pdev-count">
                    <span className="mono">
                      {m.mandatory.present}/{m.mandatory.total}
                    </span>
                    <span className="lbl">mandatory</span>
                  </div>
                  <div className="pdev-count">
                    <span className="mono">
                      {m.total.present}/{m.total.total}
                    </span>
                    <span className="lbl">all docs</span>
                  </div>
                </div>
                <div className="pdev-assembly-module-blockers">
                  {m.blockers.slice(0, 3).map((b, i) => (
                    <div key={i} className="pdev-assembly-blocker">
                      <span className="pdev-sev-dot tone-warn" />
                      <span>{b}</span>
                    </div>
                  ))}
                  {m.blockers.length > 3 && (
                    <div className="pdev-assembly-more">
                      +{m.blockers.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="pdev-section pdev-compile-section">
        <div className="pdev-compile-card">
          <div className="pdev-compile-body">
            <div className="pdev-compile-eyebrow">
              Most consequential action · audit-flagged
            </div>
            <div className="pdev-compile-title">Compile IND assembly</div>
            <div className="pdev-compile-sub">
              Current readiness {payload.overallReadiness}% · threshold{' '}
              {payload.threshold}%.{' '}
              {belowThreshold
                ? 'Below threshold — force-compile available with a 30-character reason.'
                : 'Threshold met — package compilation will be transmitted to the assembly pipeline.'}
            </div>
            {projectId === null && (
              <div className="pdev-compile-warning">
                No backing project — compile requires a project linkage. Set
                one up in the program admin first.
              </div>
            )}
          </div>
          <div className="pdev-compile-actions">
            <button
              className="pdev-btn primary large"
              disabled={belowThreshold || projectId === null || compile.loading}
              onClick={() => open(false)}
              type="button"
            >
              <PdevIcon name="rocket" /> Compile IND assembly (readiness{' '}
              {payload.overallReadiness}%)
            </button>
            {belowThreshold && projectId !== null && (
              <button
                className="pdev-btn ghost"
                onClick={() => open(true)}
                type="button"
              >
                Force compile…
              </button>
            )}
          </div>
        </div>
      </section>

      {pending && (
        <PdevConfirmDialog
          open={true}
          {...pending.config}
          onCancel={() => {
            setPending(null);
            setConfirmError(null);
          }}
          onConfirm={onConfirm}
          submitError={confirmError}
        />
      )}
    </>
  );
}
