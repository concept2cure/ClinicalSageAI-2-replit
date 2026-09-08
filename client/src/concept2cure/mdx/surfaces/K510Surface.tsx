/**
 * 510(k) surface — 7-stage strip · predicate table · SE matrix · eSTAR list.
 * Ported from Surfaces.jsx > K510Surface.
 */

import * as React from 'react';
import { I } from '../icons';
import { K510_ESTAR, K510_PREDICATES, K510_SE_ROWS, K510_STAGES } from '../data/k510';
import type { Predicate } from '../data/k510';
import type { Program } from '../data/programs';
import {
  useK510EstarSections,
  useK510PredicateFallback,
  useK510Predicates,
  useK510SeMatrix,
  type PredicateFallbackRow,
} from '../hooks/useK510';
import {
  predicateDevicesOnFile,
  useDeviceProfile,
  type PredicateDeviceInput,
} from '../hooks/useDeviceProfile';
import { describeSaveFailure } from '../hooks/useFetchJson';
import { useEstarExport, exportStatusLine } from '../hooks/useEstarExport';
import { AskAnaChip } from './AskAnaChip';
import { AnaDraftBanner } from '../components/AnaDraftBanner';
import { PathwayPanes } from './pathway/PathwayPanes';
import { DeviceProfilePanel } from './DeviceProfilePanel';
import { EstarFilingPanel } from './EstarFilingPanel';
import { OfficialEstarPanel, officialEstarTypeFor, officialEstarVariantFor } from './OfficialEstarPanel';
import { useSampleRows, useShowingSample } from '../lib/useSampleRows';
import { useSampleMode } from '../components/DataGate';
import type { EditorSectionRef } from '../../v2/editorTarget';
import { downloadCsv } from '../../v2/download';

/**
 * A candidate row → the claim it would make.
 *
 * Only facts the row actually carries travel: the adapters upstream default a
 * missing holder or product code to '', and an empty string written into
 * `predicate_devices` would reach the official eSTAR as an answer rather than
 * as a blank. `id` is the K-number, which is what identifies a claim of
 * substantial equivalence to FDA.
 */
function claimOf(fields: {
  id: string;
  name: string;
  manufacturer?: string;
  clearanceDate?: string;
  productCode?: string;
}): PredicateDeviceInput {
  const claim: PredicateDeviceInput = { id: fields.id, name: fields.name, kNumber: fields.id };
  const manufacturer = fields.manufacturer?.trim();
  const clearanceDate = fields.clearanceDate?.trim();
  const productCode = fields.productCode?.trim();
  if (manufacturer) claim.manufacturer = manufacturer;
  if (clearanceDate) claim.clearanceDate = clearanceDate;
  if (productCode) claim.productCode = productCode;
  return claim;
}

const claimFromCandidate = (p: Predicate): PredicateDeviceInput =>
  claimOf({ id: p.k, name: p.name, manufacturer: p.holder, clearanceDate: p.cleared, productCode: p.code });

/** openFDA returns a full timestamp; the clearance DATE is what FDA prints. */
const claimFromClearance = (r: PredicateFallbackRow): PredicateDeviceInput =>
  claimOf({
    id: r.kNumber,
    name: r.deviceName,
    manufacturer: r.applicant,
    clearanceDate: r.decisionDate.length > 10 ? r.decisionDate.slice(0, 10) : r.decisionDate,
    productCode: r.productCode,
  });

/**
 * Re-seed the SE-comparison selection for a new candidate list, keeping the
 * K-numbers the new list still offers and falling back to the top candidate
 * when none survive.
 *
 * Returns the SAME set when the selection is unchanged, and that identity is
 * load-bearing rather than a micro-optimisation. `useK510Predicates` re-derives
 * its rows array from the payload on every render, so the effect that calls
 * this re-runs on every render; handing back a fresh Set each time set state
 * on every render and re-rendered the 510(k) screen forever — for exactly as
 * long as predicate intelligence stayed healthy.
 */
export function reseedSelection(
  prev: Set<string>,
  rows: readonly { k: string }[],
): Set<string> {
  if (rows.length === 0) return prev;
  const survivors = new Set([...prev].filter((k) => rows.some((p) => p.k === k)));
  if (survivors.size === 0) survivors.add(rows[0].k);
  const unchanged = survivors.size === prev.size && [...survivors].every((k) => prev.has(k));
  return unchanged ? prev : survivors;
}

export interface K510SurfaceProps {
  program: Program | null;
  onAskAna: (text: string) => void;
  /** Open the one document editor, on the named section when one is given.
   *  Code + label both travel: the editor matches by code first, by title as
   *  the fallback, and reports an honest miss with the label otherwise. */
  onOpenEditor?: (section?: EditorSectionRef) => void;
}

export function K510Surface({ program, onAskAna, onOpenEditor }: K510SurfaceProps) {
  /* No program ⇒ no stage. -1 lights no dot in the strip and the header
     says so, instead of the fixture's "Stage 5 of 7" on a device nobody
     opened. */
  const activeStageIdx = program ? program.stageIdx : -1;
  const programStatus = program?.status ?? 'idle';
  const sampleOn = useSampleMode();
  const programId = program?.id ?? null;

  /* Live data — three independent fetches that fall back to the kit
     fixtures during load and on error. The eSTAR fetch hits a local DB
     endpoint; predicates + SE matrix proxy to the shadow service and
     can 502 in dev — when they do, the fixture renders so the surface
     remains usable. */
  const estar     = useK510EstarSections(programId);
  const predicates = useK510Predicates(programId);
  const seMatrix  = useK510SeMatrix(programId);

  /* Device-profile ident: program UUID first, code as the secondary ident
     (the server's /api/510k/device/profile resolver accepts either). */
  const deviceIdent = program?.id ?? program?.code ?? null;

  /* REDUCED predicate fallback — openFDA clearance records via the LOCAL
     /api/510k/device/predicates endpoint. Queried ONLY once the shadow-
     backed predicate fetch has errored (nulls keep both hooks idle
     otherwise). The saved device profile supplies the query terms, so the
     profile fetch is likewise gated on the fallback being active. */
  const predicateFallbackActive = predicates.rows === null && !!predicates.error;
  /* The device profile is read for the OPEN PROGRAM, not only when the shadow
     service is down: it also carries the predicate of record, which has to be
     visible beside the candidates whether or not predicate intelligence is
     up. (DeviceProfilePanel below holds its own instance of this hook — the
     two are separate reads of the same small row; useFetchJson does not
     cache.) */
  const deviceProfile = useDeviceProfile(deviceIdent);
  const predicateFallback = useK510PredicateFallback(
    predicateFallbackActive ? deviceProfile.profile?.productName ?? program?.title ?? null : null,
    predicateFallbackActive ? deviceProfile.profile?.productCode ?? null : null,
  );

  /* The draft package export — POST /api/510k/estar/build. The package
     assembles server-side from the org's authored sections; the response's
     base64 payload downloads in-browser. The OFFICIAL eSTAR PDF has one home,
     OfficialEstarPanel below, which owns the readiness gate and the field
     preview — this header no longer carries a second Generate control. */
  const estarExport = useEstarExport();
  const exportStatus = exportStatusLine(estarExport.busy, estarExport.outcome);

  /* Locked-never-dead (entitlements contract §4): a 403 NOT_ENTITLED from the
     export routes disables the buttons WITH the reason — a Locked pill plus a
     tooltip and status line naming the real minimum tier — never a reasonless
     dead control, and never conflated with a role 403 or an out-of-credits
     state (blockedByEntitlement is set only by the entitlement gate's shape). */
  const entitlementLocked = estarExport.outcome?.blockedByEntitlement === true;
  const lockedTitle = entitlementLocked
    ? estarExport.outcome?.requiredTier
      ? `Locked — requires the ${estarExport.outcome.requiredTier} plan (device assembly readiness)`
      : 'Locked — requires a higher plan (device assembly readiness)'
    : null;

  const sourcePredicates = useSampleRows(predicates.rows, K510_PREDICATES);
  const sourceSeRows     = useSampleRows(seMatrix.rows, K510_SE_ROWS);
  const sourceEstar      = useSampleRows(estar.rows, K510_ESTAR);
  /* Through the same gate as the rows: outside sample mode an unresolved
     source is zero blockers, never the fixture's one. */
  const estarBlockerCount = estar.rows ? estar.blockerCount : sourceEstar.filter((s) => s.blocker).length;
  const estarTotal = sourceEstar.length;

  const initialSelectedKey = sourcePredicates[0]?.k ?? '';
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(initialSelectedKey ? [initialSelectedKey] : []));
  const [showSelectedOnly, setShowSelectedOnly] = React.useState(false);

  /* Re-seed selection when the live predicate set changes — switching
     program (or shadow coming online) should not leave a stale K-number
     selected from a different program. */
  React.useEffect(() => {
    setSelected((prev) => reseedSelection(prev, sourcePredicates));
  }, [sourcePredicates]);

  const toggle = (k: string) => {
    const n = new Set(selected);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    if (n.size === 0) n.add(k);
    setSelected(n);
  };

  const selectedList = sourcePredicates.filter(p => selected.has(p.k));
  const multi = selectedList.length > 1;
  const subjectName = program?.title ?? 'Subject device';

  /* ── The PREDICATE OF RECORD ──────────────────────────────────────────
     The checkboxes above drive an SE-comparison selection that lives in this
     component and nowhere else. The claim of substantial equivalence is a
     different thing entirely: it is written to regulatory_programs.
     predicate_devices through the governed profile route (role-gated,
     audited), and element [0] of that column is what the official eSTAR's
     predicate submission number and trade name are filled from. So it is
     never inferred from a checkbox — a person claims it, deliberately, and
     the panel says which device the form will carry. */
  const predicateOnFile = predicateDevicesOnFile(deviceProfile.profile?.predicateDevices);
  const predicateUnreadable = predicateOnFile.unreadable > 0;
  const claimedPredicate = predicateUnreadable ? null : predicateOnFile.devices[0] ?? null;
  /* Fixtures are for populating a demo screen, never for writing into a
     submission — an example K-number claimed as a predicate would reach FDA
     as this sponsor's own assertion. */
  const predicatesAreSample = useShowingSample(predicates.rows);
  const [claiming, setClaiming] = React.useState<string | null>(null);

  const claimPredicate = React.useCallback(
    async (device: PredicateDeviceInput | null) => {
      setClaiming(device?.id ?? 'withdraw');
      try {
        await deviceProfile.save({ predicateDevices: device ? [device] : null });
      } finally {
        setClaiming(null);
      }
    },
    [deviceProfile],
  );

  /** The claim control for one candidate row. */
  const claimControl = (device: PredicateDeviceInput, fromSample: boolean) => {
    if (claimedPredicate?.id === device.id) {
      return (
        <div style={{ marginTop: 3, fontSize: 10, color: 'var(--accent-100)' }}>
          Predicate of record
        </div>
      );
    }
    const refusal = fromSample
      ? 'Example rows cannot be claimed as the predicate of record'
      : !deviceIdent
        ? 'Open a device program to claim a predicate of record'
        : null;
    return (
      <button
        type="button"
        className="tb-btn"
        style={{ marginTop: 3, fontSize: 10, padding: '1px 6px' }}
        disabled={refusal !== null || claiming !== null}
        title={refusal ?? `Claim ${device.id} (${device.name}) as the predicate of record`}
        onClick={e => {
          e.stopPropagation();
          void claimPredicate(device);
        }}
      >
        Claim
      </button>
    );
  };

  /** One sentence on what the eSTAR's predicate fields will carry. An
   *  unresolved profile is NOT "no predicate": until the row is read, what the
   *  form will carry is unknown, and saying otherwise is the same failure as
   *  rendering a fixture. */
  const predicateOfRecordLine = () => {
    if (!deviceProfile.profile) {
      if (deviceProfile.error) return 'Predicate of record: the device profile could not be read.';
      return 'Predicate of record: reading the device profile…';
    }
    if (predicateUnreadable) {
      return (
        `Predicate of record: ${predicateOnFile.unreadable} stored ` +
        `${predicateOnFile.unreadable === 1 ? 'entry' : 'entries'} this screen cannot read — ` +
        `the eSTAR fills from the first entry, whatever it holds.`
      );
    }
    if (!claimedPredicate) return 'No predicate of record — the eSTAR predicate fields stay blank.';
    return `Predicate of record: ${claimedPredicate.id} — ${claimedPredicate.name}`;
  };

  const workspace = (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">
            510(k) pathway · {program ? program.title : 'No program selected'}
          </div>
          <div className="section-sub">
            {program
              ? `Stage ${activeStageIdx + 1} of ${K510_STAGES.length} — ${K510_STAGES[activeStageIdx]?.label ?? ''} · ${program.dueLabel}`
              : 'Open a device program to see its stage and filing clock.'}
          </div>
        </div>
        <button
          className="section-more"
          onClick={() =>
            onOpenEditor &&
            onOpenEditor({
              code: 11,
              label: sourceEstar.find((s) => s.id === 11)?.label ?? 'Substantial Equivalence Discussion',
            })
          }
        >
          Open §11 in editor {I.arrowRight}
        </button>
        <button
          className="section-more"
          style={{ marginLeft: 8 }}
          disabled={estarExport.busy || !program || entitlementLocked}
          title={
            lockedTitle ??
            (program
              ? 'Assemble a draft ZIP of rendered section PDFs from your authored content — NOT the official FDA eSTAR PDF that CDRH ingests'
              : 'Select a 510(k) program first')
          }
          onClick={() => {
            if (!program) return;
            void estarExport.exportDraftPackage({ id: program.id, code: program.code, title: program.title });
          }}
        >
          Export 510(k) package {I.download}
        </button>
      </div>

      {exportStatus && (
        <div className="section-sub" role="status" style={{ marginTop: 4 }}>
          {entitlementLocked ? (
            <span className="status-pill review" style={{ marginRight: 6 }}>
              Locked
            </span>
          ) : null}
          {exportStatus}
        </div>
      )}

      <div className="stage-strip">
        {K510_STAGES.map((s, i) => {
          const stateClass =
            i < activeStageIdx
              ? 'complete'
              : i === activeStageIdx
              ? programStatus === 'blocked'
                ? 'blocked'
                : 'active'
              : 'idle';
          return (
            <div key={s.id} className={`stage-node ${stateClass}`}>
              <div className="stage-dot">{i < activeStageIdx ? I.check : i + 1}</div>
              <div className="stage-label">{s.label}</div>
              <div className="stage-meta">{s.meta}</div>
            </div>
          );
        })}
      </div>

      {/* Device intake — profile fields feed classification, predicate
          search (including the reduced openFDA fallback), and eSTAR. */}
      <DeviceProfilePanel ident={deviceIdent} />

      {/* Predicate intelligence is provisioned by a shadow service. When
          the live fetch errors (typical: shadow service not configured in
          this environment) we surface an explicit banner instead of
          silently rendering the kit fixture's example K-numbers — paying
          clients should not see another vendor's predicates as if they
          were their own. */}
      {predicates.error && !predicates.rows && (
        <div
          className="banner-warn"
          role="status"
        >
          <span className="banner-ic">{I.alertCircle}</span>
          <span>
            {sampleOn
              ? 'Predicate intelligence is not reachable for this tenant. The table below shows the ' +
                'canonical example data because sample mode is on; live K-number candidates appear ' +
                'here once the shadow service is reachable.'
              : 'Predicate intelligence is not reachable for this tenant. Live K-number candidates ' +
                'appear here once the shadow service is reachable; until then the reduced openFDA ' +
                'clearance lookup below is the only source.'}
          </span>
        </div>
      )}

      {/* Honest fallback states — when the reduced openFDA lookup itself
          cannot run (or matched nothing), say so instead of showing
          nothing under the banner. */}
      {predicateFallbackActive && predicateFallback.available === false && (
        <div className="section-sub" role="status" style={{ margin: '0 0 8px' }}>
          Reduced openFDA fallback unavailable — {predicateFallback.unavailableReason}
        </div>
      )}
      {predicateFallbackActive &&
        predicateFallback.available === true &&
        (predicateFallback.rows?.length ?? 0) === 0 && (
          <div className="section-sub" role="status" style={{ margin: '0 0 8px' }}>
            Reduced openFDA fallback found no clearance records matching this device profile.
          </div>
        )}

      <div className="col2">
        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Predicate search · K-numbers</div>
                <div className="s">
                  {selected.size} of {sourcePredicates.length} selected · ranked by similarity · check 2+ for side-by-side
                  {predicates.rows === null && !predicates.error && (
                    <span style={{ marginLeft: 6, color: 'var(--text-300)' }}>· loading…</span>
                  )}
                </div>
                {deviceIdent && (
                  <div className="s" style={{ marginTop: 2 }}>
                    {predicateOfRecordLine()}
                    {/* A refused claim is shown BESIDE what is on file, not
                        instead of it — the operator needs both the refusal and
                        the state the form is still in. */}
                    {deviceProfile.saveFailure && (
                      <span style={{ marginLeft: 6, color: 'var(--danger-100, var(--text-200))' }}>
                        {describeSaveFailure(deviceProfile.saveFailure)}
                      </span>
                    )}
                    {claimedPredicate && (
                      <button
                        type="button"
                        className="tb-btn"
                        style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px' }}
                        disabled={claiming !== null}
                        title="Withdraw the predicate of record"
                        onClick={() => void claimPredicate(null)}
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="actions">
                <button
                  className={`tb-btn${showSelectedOnly ? ' on' : ''}`}
                  title={showSelectedOnly ? 'Show all candidates' : 'Show selected only'}
                  onClick={() => setShowSelectedOnly(s => !s)}
                >
                  {I.filter}
                </button>
                <button
                  className="tb-btn"
                  title="Refine query with AnA"
                  onClick={() =>
                    onAskAna(
                      `Refine the predicate search for ${subjectName}. ` +
                        `Currently ${selected.size} of ${sourcePredicates.length} candidates selected — ` +
                        `suggest tighter filters and any K-numbers I might be missing.`,
                    )
                  }
                >
                  {I.sparkles}
                </button>
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="cb"></th>
                  <th>K-number</th>
                  <th>Device</th>
                  <th>Cleared</th>
                  <th>Match</th>
                  <th>Diffs</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sourcePredicates.filter(p => !showSelectedOnly || selected.has(p.k)).map(p => {
                  const isSel = selected.has(p.k);
                  return (
                    <tr key={p.k} className={isSel ? 'multi-selected' : ''} onClick={() => toggle(p.k)}>
                      <td
                        className="cb"
                        onClick={e => {
                          e.stopPropagation();
                          toggle(p.k);
                        }}
                      >
                        <span className="cbox" data-on={isSel}>
                          {I.check}
                        </span>
                      </td>
                      <td>
                        <span className="k-num">{p.k}</span>
                        {claimControl(claimFromCandidate(p), predicatesAreSample)}
                      </td>
                      <td>
                        <div className="k-name">{p.name}</div>
                        <div className="k-holder">{p.holder}</div>
                      </td>
                      <td className="k-date">{p.cleared}</td>
                      <td>
                        <div className="match-cell">
                          <div className="match-bar">
                            <div
                              className={`match-bar-fill ${p.match >= 80 ? '' : p.match >= 60 ? 'warn' : 'err'}`}
                              style={{ width: `${p.match}%` }}
                            />
                          </div>
                          <span className="match-pct">{p.match}%</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-300)', fontVariantNumeric: 'tabular-nums' }}>
                        {p.diffs}
                      </td>
                      <td>
                        <span className={`status-pill ${p.status}`}>{p.status}</span>
                        {onAskAna && (
                          <AskAnaChip
                            onAsk={() => onAskAna(`Compare predicate ${p.k} (${p.name}) against subject device`)}
                            label={`Ask AnA about ${p.k}`}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* Reduced fallback rows — real openFDA clearance records,
                    NOT predicate-intelligence output: no match scoring, no
                    diff counts, not selectable into the SE matrix. The
                    label row keeps that visible. */}
                {predicateFallbackActive &&
                  predicateFallback.rows &&
                  predicateFallback.rows.length > 0 && (
                    <>
                      <tr>
                        <td
                          colSpan={7}
                          role="status"
                          style={{
                            padding: '8px 10px',
                            fontSize: 11,
                            color: 'var(--text-200)',
                            background: 'var(--bg-050)',
                            borderLeft: '3px solid var(--accent-100)',
                          }}
                        >
                          Reduced results — openFDA clearance records (predicate intelligence
                          unavailable)
                        </td>
                      </tr>
                      {predicateFallback.rows.map((r, i) => (
                        <tr key={`fallback-${r.kNumber}-${i}`}>
                          <td className="cb"></td>
                          <td>
                            <span className="k-num">{r.kNumber}</span>
                            {/* Not selectable into the SE matrix — there is no
                                scoring behind these rows — but a real openFDA
                                clearance IS claimable as the predicate of
                                record, which is the one thing about it that
                                does not depend on the shadow service. */}
                            {claimControl(claimFromClearance(r), false)}
                          </td>
                          <td>
                            <div className="k-name">{r.deviceName}</div>
                            <div className="k-holder">{r.applicant}</div>
                          </td>
                          <td className="k-date">
                            {r.decisionDate.length > 10 ? r.decisionDate.slice(0, 10) : r.decisionDate}
                          </td>
                          {/* No match score / diff count exists for reduced
                              results — render an honest dash, never a bar. */}
                          <td style={{ color: 'var(--text-400)' }}>—</td>
                          <td style={{ color: 'var(--text-400)' }}>—</td>
                          <td style={{ color: 'var(--text-300)', fontSize: 11 }}>
                            {r.clearanceType || r.decisionCode || '—'}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">Substantial equivalence matrix</div>
                <div className="s">
                  {subjectName} vs. {multi ? `${selectedList.length} predicates` : selectedList[0]?.name}
                </div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Export SE matrix as CSV"
                  onClick={() => {
                    const headers = multi
                      ? ['Attribute', 'Subject', ...selectedList.map(p => p.k)]
                      : ['Attribute', 'Subject', 'Verdict', 'Predicate', 'Note'];
                    const rows = sourceSeRows.map(r =>
                      multi
                        ? [r.attr, r.subject, ...selectedList.map(() => r.predicate)]
                        : [r.attr, r.subject, r.verdict, r.predicate, r.note ?? ''],
                    );
                    downloadCsv(
                      `${(program?.code ?? 'project').toLowerCase()}-se-matrix.csv`,
                      headers,
                      rows,
                    );
                  }}
                >
                  {I.download}
                </button>
              </div>
            </div>
            {multi ? (
              <>
                <div
                  className="se-matrix-multi header"
                  style={{
                    gridTemplateColumns: `160px 1fr ${selectedList.map(() => '1fr').join(' ')}`,
                  }}
                >
                  <div>Attribute</div>
                  <div className="col-subject">{subjectName}</div>
                  {selectedList.map(p => (
                    <div key={p.k} className="col-predicate">
                      {p.k}
                    </div>
                  ))}
                </div>
                {sourceSeRows.map((r, i) => (
                  <div
                    key={i}
                    className="se-matrix-multi"
                    style={{
                      gridTemplateColumns: `160px 1fr ${selectedList.map(() => '1fr').join(' ')}`,
                    }}
                  >
                    <div className="se-attr">{r.attr}</div>
                    <div className="se-val">{r.subject}</div>
                    {selectedList.map(p => (
                      <div key={p.k} className="se-val" style={{ color: 'var(--text-300)' }}>
                        {r.predicate}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="se-row header">
                  <div>Attribute</div>
                  <div>{subjectName} (Subject)</div>
                  <div style={{ textAlign: 'center' }}>Verdict</div>
                  <div>{selectedList[0]?.k} (Predicate)</div>
                </div>
                {sourceSeRows.map((r, i) => (
                  <div key={i} className="se-row">
                    <div className="se-attr">{r.attr}</div>
                    <div className="se-val">{r.subject}</div>
                    <div className={`se-verdict ${r.verdict}`}>
                      {r.verdict === 'same' && I.check}
                      {r.verdict === 'equivalent' && I.eq}
                      {r.verdict === 'different' && I.minus}
                    </div>
                    <div className="se-val">{r.predicate}</div>
                    {r.note && <div className="se-note">{r.note}</div>}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-hdr">
              <div>
                <div className="t">eSTAR sections</div>
                <div className="s">{estarTotal} sections · {estarBlockerCount} blocker{estarBlockerCount === 1 ? '' : 's'}</div>
              </div>
              <div className="actions">
                <button
                  className="tb-btn"
                  title="Run pre-flight validation"
                  onClick={() =>
                    onAskAna(
                      `Run pre-flight RTA validation on the 510(k) eSTAR module for ${program?.code ?? 'this project'}. ` +
                        `Report blockers, missing required fields, and the overall judgment.`,
                    )
                  }
                >
                  {I.play}
                </button>
              </div>
            </div>
            <div className="estar">
              {sourceEstar.map(s => (
                <React.Fragment key={s.id}>
                  <button
                    className={`estar-row ${s.blocker ? 'blocker' : ''}`}
                    onClick={() => onOpenEditor && onOpenEditor({ code: s.id, label: s.label })}
                    title={`Open ${s.label} in editor`}
                  >
                    <div className="estar-num">§{String(s.id).padStart(2, '0')}</div>
                    <div className="estar-label">{s.label}</div>
                    <span className={`status-pill ${s.status}`}>{s.status}</span>
                    <span className="estar-open">{I.arrowRight}</span>
                  </button>
                  {/* Surface AnA's pending draft so the user can accept or
                      open the editor to refine. The banner reads the live
                      draft provenance from the hook and disappears after
                      a successful accept (estar.refresh re-fetches). */}
                  {s.draft ? (
                    <AnaDraftBanner
                      draft={s.draft}
                      onRefine={() => onOpenEditor && onOpenEditor({ code: s.id, label: s.label })}
                      onAccepted={estar.refresh}
                    />
                  ) : null}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* The official FDA eSTAR PDF — readiness gate, the governed field
          preview and the one Generate control. */}
      {/* The variant follows the program's product type: an IVD program that
          files a 510(k) lands here (pathway k510) and must be produced on the
          IVD eSTAR, not the nIVD one. The type follows the program's
          regulatory path: a De Novo program also lands here (the kit folds
          De Novo into k510) and must be produced as a De Novo, not a 510(k). */}
      <OfficialEstarPanel program={program} type={officialEstarTypeFor(program)} variant={officialEstarVariantFor(program)} />

      {/* eSTAR filing journey — register → assess → produce-gate → track,
          org-scoped from the session. eSTAR covers 510(k)/De Novo too. */}
      <EstarFilingPanel />
    </>
  );

  return (
    <PathwayPanes
      pathway="k510"
      workspace={workspace}
      onAskAna={onAskAna}
      onOpenEditor={onOpenEditor}
      programId={program?.id ?? null}
    />
  );
}
