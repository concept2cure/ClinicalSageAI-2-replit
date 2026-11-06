/**
 * The stored run behind a design's planned N, and its reproduction when asked (R1, 2026-11-06). Split out of
 * `biostatBridge.tsx`, whose design card renders it.
 *
 * GET /api/biostat-bridge/computation-runs/:runId/reproduce answers "reproduce the planned N from the inputs you
 * filed" and "prove it was not edited after it was computed". Nothing called it: the run id was only a phrase in the
 * plan's evidence label. The assessment now names the run (`sizingRun`, bridge-service), and this line asks the
 * server, which recomputes. The four facts are said one by one, because they fail for different reasons
 * (stats/computation-runs.ts). A design whose N differs from its run's says both figures. Nothing here computes.
 */
import React, { useState } from 'react';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import type { DesignAssessment } from './biostatBridge';

/** The reproduce route's reply (stats/computation-runs.ts ReproductionResult, found). */
interface Reproduction {
  runId: number;
  inputsIntact: boolean;
  outputsIntact: boolean;
  reproduced: boolean;
  engineVersionMatches: boolean;
  note?: string;
}

type Check = { busy: boolean; result: Reproduction | null; error: string | null };

const CHANGED = 'changed since the run (their digest no longer matches)';

/** Ask the server to recompute the run. A reply without the four facts is a failed read, not a pass. */
async function readReproduction(runId: number): Promise<Check> {
  try {
    const res = await apiRequest('GET', `/api/biostat-bridge/computation-runs/${runId}/reproduce`);
    const body = (await res.json().catch(() => null)) as { data?: Reproduction } | null;
    if (!res.ok || typeof body?.data?.reproduced !== 'boolean') {
      return { busy: false, result: null, error: serverMessage(body) ?? `The reproduction did not load (HTTP ${res.status}).` };
    }
    return { busy: false, result: body.data, error: null };
  } catch (e) {
    return { busy: false, result: null, error: e instanceof Error && e.message ? e.message : 'The reproduction did not load.' };
  }
}

function ReproductionFacts({ r }: { r: Reproduction }) {
  return (
    <ul aria-label={`Reproduction of stored run #${r.runId}`} style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }}>
      <li>Stored inputs: {r.inputsIntact ? 'intact' : CHANGED}</li>
      <li>Stored outputs: {r.outputsIntact ? 'intact' : CHANGED}</li>
      <li>Recomputed: {r.reproduced ? 'the engine gives the stored result again' : (r.note ?? 'the engine gives a different result')}</li>
      <li>Engine version: {r.engineVersionMatches ? 'the same as the run’s' : 'changed since the run'}</li>
    </ul>
  );
}

/** When the design names no run, or the run could not be read: one sentence, or nothing when there is no N. */
function NoRunLine({ state, recorded }: { state: 'none' | 'unreadable'; recorded: number | null }) {
  if (state === 'unreadable') {
    return <div className="scaf-note" role="status" style={{ fontSize: 12 }}>The stored run behind the planned N could not be read.</div>;
  }
  if (recorded == null) return null;
  return <div className="scaf-note" style={{ fontSize: 12 }}>No stored engine run is recorded for the planned N of {recorded}.</div>;
}

export function SizingRunCheck({ assessment }: { assessment: DesignAssessment }) {
  const [check, setCheck] = useState<Check>({ busy: false, result: null, error: null });
  const run = assessment.sizingRun;
  const recorded = assessment.readiness.plannedSampleSize ?? null;
  if (!run) return null;
  if (run.state !== 'found') return <NoRunLine state={run.state} recorded={recorded} />;
  const computed = run.plannedSampleSize;
  const differs = recorded != null && computed != null && recorded !== computed;
  const reproduce = async () => {
    setCheck({ busy: true, result: null, error: null });
    setCheck(await readReproduction(run.runId));
  };
  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>{`Stored run #${run.runId}, ${run.recordedAt.slice(0, 10)}, computed ${computed ?? '—'} subjects.`}</span>
        <button type="button" className="btn ghost small" disabled={check.busy} onClick={() => void reproduce()}>
          {check.busy ? 'Recomputing…' : 'Check it reproduces'}
        </button>
      </div>
      {differs && <div role="status">The design records {recorded}; the run computed {computed}. The design’s figure was changed after the run.</div>}
      {check.error && <div className="pde-refusal" role="alert">The reproduction could not be read. {check.error}</div>}
      {check.result && <ReproductionFacts r={check.result} />}
    </div>
  );
}
