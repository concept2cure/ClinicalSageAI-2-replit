/**
 * Protocol development — the IRB package tab.
 *
 * `docs/design/IRB_SUBMISSION.md` step 4: the IRB capability already exists in
 * this repository and nothing under `client/` reached it. This pane is the
 * reach. It renders `GET /api/irb/submissions/:id/package-manifest` for the IRB
 * submission carrying this protocol's number, with no computation, no scoring
 * and no re-derivation. Every requirement, basis and count below is
 * `server/services/irb/package-manifest.ts`'s own.
 *
 * 2026-11-12: the submission itself is recorded here too. The tab could only
 * read, and told a person to "create the IRB submission first" and to "link the
 * submission in the Submission Center first", neither of which anything in the
 * product could do. The record, its forms and its checks are
 * `IrbSubmissionRecord.tsx`, split out of this file.
 *
 * ── Four states, never blurred ──────────────────────────────────────────────
 *   no submission   no IRB submission is recorded against this protocol number.
 *   unlinked        the IRB submission exists and has never been linked to a
 *                   Submission Center submission, so THERE IS NO PACKAGE. The
 *                   engine still returns a full row set here — every row with
 *                   nothing placed — because there is nowhere for anything to be
 *                   placed. Rendering those rows would present "no package
 *                   exists" as "a package missing everything". They are
 *                   different facts and the second is worse. No rows are drawn.
 *   failed          the read failed. It is never drawn as an empty manifest —
 *                   an error is never rendered as an empty result (CLAUDE.md).
 *   ready           the manifest.
 *
 * ── The headline is counts, not a percentage ────────────────────────────────
 * `undetermined` is a first-class outcome: a requirement this submission does
 * not record enough to judge. A figure computed over requirements that could
 * not be decided would describe an undecided package as a nearly finished one,
 * which is the defect this codebase has already been burned by. There is no
 * percentage on this pane and `irbPackage.test.tsx` asserts the absence of the
 * character itself.
 *
 * ── D3 and D4 ───────────────────────────────────────────────────────────────
 * D3: no IRB has a universal electronic gateway, so the platform never claims a
 * delivery it did not perform. The words "transmitted" and "sent to the IRB"
 * appear nowhere here, and the test asserts it. D4: the engine may find an
 * artifact absent; it may not decide whether the research is approvable, and it
 * does not state the review category the board will apply. Neither does this
 * pane — the submission's `reviewType` is not rendered at all.
 *
 * Colour is never the only signal: every status is a word before it is a tone.
 */
import React, { useEffect, useRef, useState } from 'react';
import * as PG from './ProtocolGov';
import { PaneHead, KV } from './ProtocolDevShared';
import { apiRequest } from '@/lib/queryClient';
import { IrbSubmissionRecord, RecordIrbSubmissionForm, toIrbRecord, type IrbRecord } from './IrbSubmissionRecord';

const str = (v: unknown): string => (v == null ? '' : String(v));

export type IrbSlotRequirement = 'required' | 'conditional' | 'undetermined' | 'optional' | 'not_required';

export interface IrbPlacedArtifactView {
  slot: string;
  leafId: number;
  title: string;
  /** False when the leaf names no document store and key — a placeholder. */
  resolvable: boolean;
}

export interface IrbManifestRowView {
  slot: string;
  label: string;
  requirement: IrbSlotRequirement;
  basis: string;
  /** For `undetermined`: the field that would settle the requirement, by name. */
  settledBy?: string;
  placed: IrbPlacedArtifactView[];
  satisfied: boolean;
  unresolvable: number;
}

export interface IrbManifestCountsView {
  required: number;
  requiredSatisfied: number;
  conditional: number;
  conditionalSatisfied: number;
  undetermined: number;
  unresolvable: number;
  unexpected: number;
}

export interface IrbPackageManifestView {
  rows: IrbManifestRowView[];
  counts: IrbManifestCountsView;
  readyToAssemble: boolean;
  unexpectedSlots: string[];
}

type LoadState =
  | { kind: 'loading' }
  /** This protocol record carries no protocol number, so nothing can be matched. */
  | { kind: 'no-key' }
  /** No IRB submission is recorded against this protocol number. */
  | { kind: 'no-submission'; protocolNumber: string }
  /** The IRB submission exists and is not linked. There is NO PACKAGE. */
  | { kind: 'unlinked'; sub: IrbRecord }
  /** The read failed. NOT an empty manifest. */
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; sub: IrbRecord; linkedSubmissionId: number; manifest: IrbPackageManifestView; siblings: number };

/* ── Reading ───────────────────────────────────────────────────────────────── */

/** The server's refusal, in its own words. */
function refusal(body: unknown, status: number): string {
  const err = (body as { error?: unknown } | null)?.error;
  if (typeof err === 'string') return err;
  const obj = err as { message?: string; code?: string } | undefined;
  return obj?.message || obj?.code || `HTTP ${status}`;
}

const normalise = (s: unknown): string => str(s).trim().toLowerCase();

function asManifest(raw: unknown): IrbPackageManifestView {
  const m = (raw ?? {}) as Partial<IrbPackageManifestView>;
  const counts = (m.counts ?? {}) as Partial<IrbManifestCountsView>;
  const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    rows: Array.isArray(m.rows) ? m.rows : [],
    counts: {
      required: n(counts.required), requiredSatisfied: n(counts.requiredSatisfied),
      conditional: n(counts.conditional), conditionalSatisfied: n(counts.conditionalSatisfied),
      undetermined: n(counts.undetermined), unresolvable: n(counts.unresolvable),
      unexpected: n(counts.unexpected),
    },
    readyToAssemble: m.readyToAssemble === true,
    unexpectedSlots: Array.isArray(m.unexpectedSlots) ? m.unexpectedSlots : [],
  };
}

/** The IRB submissions this organization records, or a refusal. */
async function readSubmissions(): Promise<{ rows: Record<string, unknown>[] } | { failed: string }> {
  const res = await apiRequest('GET', '/api/irb/submissions');
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok || !Array.isArray(json)) return { failed: refusal(json, res.status) };
  return { rows: json as Record<string, unknown>[] };
}

async function loadPackage(protocolNumber: string): Promise<LoadState> {
  const listed = await readSubmissions();
  if ('failed' in listed) return { kind: 'failed', message: listed.failed };

  const matches = listed.rows.filter((r) => normalise(r.protocol_number) === normalise(protocolNumber));
  if (matches.length === 0) return { kind: 'no-submission', protocolNumber };
  const sub = toIrbRecord(matches[0]);

  const res = await apiRequest('GET', `/api/irb/submissions/${sub.id}/package-manifest`);
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) return { kind: 'failed', message: refusal(json, res.status) };

  const linked = json.linkedSubmissionId == null ? null : Number(json.linkedSubmissionId);
  if (linked === null) return { kind: 'unlinked', sub };
  return { kind: 'ready', sub, linkedSubmissionId: linked, manifest: asManifest(json.manifest), siblings: matches.length - 1 };
}

/* ── Requirement vocabulary ────────────────────────────────────────────────── */

/** Undetermined FIRST: it is the actionable state, and the only one a person
 *  can clear by recording something today. */
const REQUIREMENT_ORDER: IrbSlotRequirement[] = ['undetermined', 'required', 'conditional', 'optional', 'not_required'];

/** The requirement as a WORD. "not decided" reads as what it is; nothing here
 *  ever reads as a tick. */
const REQUIREMENT_WORD: Record<IrbSlotRequirement, string> = {
  undetermined: 'not decided',
  required: 'required',
  conditional: 'conditional',
  optional: 'optional',
  not_required: 'not required',
};

/** Neutral for not-decided — an undecided requirement is not a cleared one, and
 *  it is not a fault either. */
const REQUIREMENT_TONE: Record<IrbSlotRequirement, string> = {
  undetermined: 'warn',
  required: 'idle',
  conditional: 'idle',
  optional: 'idle',
  not_required: 'idle',
};

const GROUP_MEANS: Record<IrbSlotRequirement, string> = {
  undetermined:
    'The submission does not record what decides these, so the engine could not judge them. An unrecorded field is not a record that a requirement does not apply — each row names the field that would settle it.',
  required: 'A board expects these of every package of this shape.',
  conditional: 'Required because something this submission records makes them so. The recorded fact is the basis.',
  optional: 'Supporting material boards accept and do not demand.',
  not_required: 'A recorded fact takes these out of scope for this submission.',
};

/* ── Rows ──────────────────────────────────────────────────────────────────── */

function SettledBy({ field }: { field: string }) {
  return (
    <div className="pde-note">
      <span>This submission records nothing about </span>
      <span className="pg-mono">{field}</span>
      <span>; record it to decide this requirement. </span>
      An unrecorded field is not a record that the requirement does not apply, so this is a gap in
      what has been recorded about the study rather than a document missing from the package.
    </div>
  );
}

function Placements({ row }: { row: IrbManifestRowView }) {
  if (row.placed.length === 0) {
    return <div className="pde-note">No document is placed at this slot.</div>;
  }
  return (
    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }} aria-label={`Documents placed at ${row.label}`}>
      {row.placed.map((p) => (
        <li key={p.leafId} data-leaf={p.leafId} data-resolvable={String(p.resolvable)}>
          <span>{p.title || 'This placement records no title.'}</span>
          {!p.resolvable && (
            <div className="pde-refusal">
              Placeholder — this placement names no document the resolver can open, so the slot holds
              a name and nothing else. It is not a document in the package.
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ManifestRow({ row }: { row: IrbManifestRowView }) {
  return (
    <div
      className="pj-card"
      style={{ padding: 10, marginTop: 8 }}
      data-slot={row.slot}
      data-requirement={row.requirement}
      data-satisfied={String(row.satisfied)}
      role="group"
      aria-label={row.label}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="pg-mono" style={{ fontSize: 11 }}>{row.slot}</span>
        <b style={{ fontSize: 12 }}>{row.label}</b>
        <PG.StatusBadge label={REQUIREMENT_WORD[row.requirement]} tone={REQUIREMENT_TONE[row.requirement]} />
        <PG.StatusBadge
          label={row.satisfied ? 'a document is placed here' : 'no document is placed here'}
          tone={row.satisfied ? 'ok' : 'idle'}
        />
      </div>
      {row.basis && <div className="pde-basis">{row.basis}</div>}
      {row.requirement === 'undetermined' && <SettledBy field={row.settledBy || 'a field the engine did not name'} />}
      <Placements row={row} />
    </div>
  );
}

function RequirementGroup({ requirement, rows }: { requirement: IrbSlotRequirement; rows: IrbManifestRowView[] }) {
  return (
    <section
      className="pj-card"
      style={{ padding: 12, marginTop: 10 }}
      data-requirement-group={requirement}
      role="group"
      aria-label={`${REQUIREMENT_WORD[requirement]} artifacts`}
    >
      <div className="pj-card-h">
        <span className="t">{`${REQUIREMENT_WORD[requirement]} — ${rows.length} artifact(s)`}</span>
      </div>
      <div className="pd-pane-s">{GROUP_MEANS[requirement]}</div>
      {rows.map((r) => <ManifestRow key={r.slot} row={r} />)}
    </section>
  );
}

/* ── Headline and the reasons, in words ────────────────────────────────────── */

function Headline({ m }: { m: IrbPackageManifestView }) {
  const c = m.counts;
  return (
    <div className="pj-card" style={{ padding: 12 }}>
      <div className="pj-card-h">
        <span className="t">What this package holds</span>
        <span className="s">Counts, never one figure.</span>
      </div>
      <KV k="Required artifacts placed" v={`${c.requiredSatisfied} of ${c.required}`} />
      <KV k="Conditional artifacts placed" v={`${c.conditionalSatisfied} of ${c.conditional}`} />
      <KV k="Requirements not decided" v={String(c.undetermined)} />
      <KV k="Placements naming no document" v={String(c.unresolvable)} />
      <KV k="Placed outside any expected slot" v={String(c.unexpected)} />
      <div className="pde-note">
        A requirement the submission does not record enough to judge is counted as not decided and is
        never folded into the others. These counts are not divided into one another: a single figure
        over requirements that could not be decided would describe an undecided package as a nearly
        finished one.
      </div>
    </div>
  );
}

/** Why the engine says this is not ready — each reason a recorded fact, none a
 *  judgement about the study. */
function blockingReasons(m: IrbPackageManifestView): string[] {
  const labels = (test: (r: IrbManifestRowView) => boolean): string =>
    m.rows.filter(test).map((r) => r.label).join(', ');
  const out: string[] = [];
  const undecided = labels((r) => r.requirement === 'undetermined');
  if (undecided) {
    out.push(`${m.counts.undetermined} requirement(s) could not be decided: ${undecided}. Each row below names the field that would settle it.`);
  }
  const unmetRequired = labels((r) => r.requirement === 'required' && !r.satisfied);
  if (unmetRequired) out.push(`Required with no document placed: ${unmetRequired}.`);
  const unmetConditional = labels((r) => r.requirement === 'conditional' && !r.satisfied);
  if (unmetConditional) out.push(`Conditional with no document placed: ${unmetConditional}.`);
  if (m.counts.unresolvable > 0) {
    out.push(`${m.counts.unresolvable} placement(s) name no document the resolver can open. A slot holding a placeholder is not a filled slot.`);
  }
  return out;
}

function Readiness({ m }: { m: IrbPackageManifestView }) {
  if (m.readyToAssemble) {
    return (
      <div className="pde-note" role="group" aria-label="Ready to assemble">
        Every required and conditional artifact has a document placed, every requirement has been
        decided, and no placement is a placeholder. The engine reports this package as ready to
        assemble. That is a statement about the package, not about the study.
      </div>
    );
  }
  return (
    <div className="pde-note" role="group" aria-label="Not ready to assemble, and why">
      <div>
        The engine reports this package as not ready to assemble, for the reasons below. Each is a
        fact about what this submission records and what is placed against it.
      </div>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
        {blockingReasons(m).map((r) => <li key={r}>{r}</li>)}
      </ul>
    </div>
  );
}

function Unexpected({ m }: { m: IrbPackageManifestView }) {
  if (m.unexpectedSlots.length === 0) return null;
  return (
    <div className="pde-note" role="group" aria-label="Placed outside any expected slot">
      {`${m.counts.unexpected} document(s) are placed at slots no expectation covers: `}
      <span className="pg-mono">{m.unexpectedSlots.join(', ')}</span>
      {'. They are carried by the submission and no requirement accounts for them.'}
    </div>
  );
}

/* ── The states ────────────────────────────────────────────────────────────── */

function ReadyBody({ state, record }: { state: Extract<LoadState, { kind: 'ready' }>; record: React.ReactNode }) {
  const { manifest: m, sub, linkedSubmissionId, siblings } = state;
  return (
    <>
      {record}
      <div className="pde-note">
        {`IRB submission ${sub.id} — ${sub.title || 'no title recorded'} — against protocol number ${sub.protocolNumber}, linked to Submission Center submission ${linkedSubmissionId}. What is placed below is what that submission carries.`}
        {siblings > 0 && ` ${siblings} further IRB submission(s) record the same protocol number; the most recent is shown.`}
      </div>
      <Headline m={m} />
      <Readiness m={m} />
      <Unexpected m={m} />
      {REQUIREMENT_ORDER.map((req) => {
        const rows = m.rows.filter((r) => r.requirement === req);
        return rows.length === 0 ? null : <RequirementGroup key={req} requirement={req} rows={rows} />;
      })}
    </>
  );
}

interface PackageBodyProps {
  state: LoadState;
  canWrite: boolean;
  /** The submission's own record, for the states that have one. */
  record: (sub: IrbRecord) => React.ReactNode;
  onRecord: () => void;
}

function PackageBody({ state, canWrite, record, onRecord }: PackageBodyProps) {
  switch (state.kind) {
    case 'loading':
      return <div role="status" className="scaf-note">Reading the IRB package manifest…</div>;
    case 'no-key':
      return (
        <div className="pde-note">
          This protocol record carries no protocol number, so no IRB submission can be matched to it.
          Record the protocol number on the cover page first.
        </div>
      );
    case 'no-submission':
      return (
        <>
          <div className="pde-note">
            {`No IRB submission is recorded against protocol number ${state.protocolNumber}. `}
            There is nothing to show because no IRB submission exists for this protocol — this is not a
            package with nothing in it.
            {canWrite ? ' Record the IRB submission to begin.' : ' Someone who can edit this protocol records it here.'}
          </div>
          {canWrite && (
            <div className="pde-actions" style={{ marginTop: 10 }}>
              <PG.Btn icon="plus" variant="outline" onClick={onRecord}>Record the IRB submission</PG.Btn>
            </div>
          )}
        </>
      );
    case 'unlinked':
      return (
        <>
          {record(state.sub)}
          <div className="pde-note">
            {`IRB submission ${state.sub.id} — ${state.sub.title || 'no title recorded'} — exists, but it has never been linked to a Submission Center submission. `}
            There is no package to inspect: nothing can be placed until that link exists. This is not a
            package with nothing in it — it is the absence of a package, and no manifest row is shown
            because none would mean anything.
            {canWrite ? ' Link it to one of this project’s submissions above.' : ''}
          </div>
        </>
      );
    case 'failed':
      return (
        <div className="pde-refusal" role="alert">
          {`The IRB package manifest could not be read — ${state.message}. `}
          No manifest is shown. This is a failed read, not a package with nothing in it.
        </div>
      );
    default:
      return <ReadyBody state={state} record={record(state.sub)} />;
  }
}

/* ── The tab ───────────────────────────────────────────────────────────────── */

export interface IrbPackageTabProps {
  doc: Record<string, unknown>;
  /** False for a viewer, or a protocol row the governed store does not hold: the tab then only reads. */
  canWrite?: boolean;
  /** The open project, whose Submission Center submissions the link is chosen from. */
  programId?: string | null;
  onError?: (message: string) => void;
  onToast?: (message: string) => void;
}

const PANE_SUB =
  'The IRB submission recorded against this protocol number, the artifacts a board expects of it, and which of them the linked Submission Center submission actually carries. Every requirement, basis, check and count is an engine’s. Assembling a package is not delivery — boards run their own portals and inboxes, so what this pane reports is what the record and the package hold and nothing about how either reaches anyone. It states no verdict about the study and names no review pathway.';

export function IrbPackageTab({ doc, canWrite = false, programId = null, onError, onToast }: IrbPackageTabProps) {
  const protocolNumber = str(doc.shortTitle).trim();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reads, setReads] = useState(0);
  const shown = useRef('');
  const [recording, setRecording] = useState(false);
  const reread = () => setReads((n) => n + 1);
  const fail = (m: string) => onError?.(m);
  const say = (m: string) => onToast?.(m);

  useEffect(() => {
    if (!protocolNumber) { setState({ kind: 'no-key' }); return; }
    let live = true;
    /* A re-read after a confirmed write keeps what is on screen until the new
       read lands, so the record does not blink away under the person. */
    const sameProtocol = shown.current === protocolNumber;
    shown.current = protocolNumber;
    setState((prev) => (sameProtocol && (prev.kind === 'ready' || prev.kind === 'unlinked') ? prev : { kind: 'loading' }));
    void (async () => {
      try {
        const next = await loadPackage(protocolNumber);
        if (live) setState(next);
      } catch (e) {
        if (live) setState({ kind: 'failed', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { live = false; };
  }, [protocolNumber, reads]);

  return (
    <div className="pd-pane" role="region" aria-label="IRB package">
      <PaneHead title="IRB package" sub={PANE_SUB} />
      <PackageBody
        state={state} canWrite={canWrite} onRecord={() => setRecording(true)}
        record={(sub) => <IrbSubmissionRecord record={sub} canWrite={canWrite} programId={programId} onChanged={reread} onError={fail} onToast={say} />}
      />
      {recording && (
        <RecordIrbSubmissionForm
          protocolNumber={protocolNumber} title={str(doc.title)} programId={programId}
          onCancel={() => setRecording(false)} onError={fail}
          onDone={(m) => { setRecording(false); say(m); reread(); }}
        />
      )}
    </div>
  );
}
