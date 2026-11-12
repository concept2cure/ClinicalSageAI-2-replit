/**
 * The trial master file of a project's study: a section of the Vault's Required
 * documents view.
 *
 * The founder, 2026-11-10: "I don't see the TMF on the vault UI anywhere." The
 * eTMF lives inside the Vault and files against the project's protocol-design
 * study (P-74, P-75; docs/design/ETMF_CONVERGENCE_2026-10-30.md). It is a
 * section, split out of the Vault: not a tab, a screen, a card or a surface id
 * (RULE 4). The eTMF was admitted to the Vault app on 2026-11-12 (P-124 item
 * 6): the Vault renders this after VaultCoverage where the organisation can use
 * the eTMF, its header button asks the section to come into view
 * (`revealRequest`), and the `etmf` surface (surfaces/Etmf.tsx) is the door
 * that opens the Vault here (`openVaultTrialMasterFile`). Until then the `etmf` surface hosted it
 * (docs/evidence/D2-ETMF/2026-11-10-vault-section/,
 * docs/evidence/D2-ETMF/2026-11-12-admission/).
 *
 * The section carries what the retired eTMF screen showed (P-122, 2026-11-10:
 * a customer seeing their own work wins over minimalism, and nothing a screen
 * showed is removed or closed away without a founder decision), so it travels
 * into the Vault with it. Top to bottom, for the study on screen:
 *   - which records are checked: the essential records, or all records;
 *   - the verdict in a sentence, the three figures (zones complete, records
 *     filed, records open), what "filed" rests on, and that timeliness and QC
 *     are not assessed;
 *   - Ask AnA which gaps an inspector would raise, and the package download;
 *   - each zone, then each of its records by name, with its zone and code,
 *     what it is filed against or that it is missing, and its acts
 *     (VaultTmfFiling.tsx);
 *   - the inspection package shown as a document, with the download again in
 *     its bar (VaultTmfPackage.tsx).
 * Its reads, requests and words are vaultTmf.ts.
 *
 * A verdict the server could not determine is said as not determined. A read
 * that failed or was refused is said as that, through the one read classifier,
 * and is never an empty trial master file. Changing the study or the scope
 * shows a read in flight, never the previous answer under the new name.
 * Nothing is read until the view that holds the section is first on screen.
 */
import React, { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TmfCompletenessResult, ZoneCompleteness } from '../../../../../server/services/etmf/tmf-completeness';
import { useLiveData, type DataState } from '../dataConnect';
import { I } from '../icons';
import { VaultTmfDeclareForm, VaultTmfFileForm, VaultTmfRemoveForm } from './VaultTmfFiling';
import { PackageDownloadButton, PackageDownloadNote, TmfFiguresLine, VaultTmfPackage, usePackageDownload } from './VaultTmfPackage';
import { VaultViewOnly, useVaultCanWrite } from './VaultViewOnly';
import {
  FILINGS_READ, FILINGS_UNREAD, NOT_ASSESSED, SCOPE_LABEL, SCOPE_SENTENCE, STUDIES_READ, TMF_READ, basisSentence, isCompletenessOf, isFilingList,
  isStudyList, readFailure, recordSentence, recordsOf, studyLabel, tmfAskPrompt, tmfBase, tmfVerdict, tmfVerdictSentence,
  type ReadFailureWords, type TmfFiling, type TmfNote, type TmfRecord, type TmfScope, type TmfStudy, type TmfVaultDocument, type TmfVerdict,
} from './vaultTmf';

export { tmfVerdict, tmfVerdictSentence } from './vaultTmf';
export type { TmfScope, TmfVaultDocument, TmfVerdict } from './vaultTmf';

export const VAULT_TMF_SECTION_ID = 'vault-trial-master-file';

/**
 * Bring the section into view. Deferred one task, so the view the host has just
 * opened is on screen first. Called by the section itself, for a host's request
 * (`revealRequest`), once its read has settled.
 */
function revealVaultTrialMasterFile(): void {
  setTimeout(() => {
    const section = document.getElementById(VAULT_TMF_SECTION_ID);
    if (!section) return;
    if (typeof section.scrollIntoView === 'function') section.scrollIntoView({ block: 'start' });
    section.focus({ preventScroll: true });
  }, 0);
}

/* The eTMF's own page (surfaces/Etmf.tsx, the module's path in the Apps catalog) opens the Vault on this section, once:
   the section lives in the Vault (P-75; admitted 2026-11-12). Browser storage can be unavailable; then the Vault opens
   on its library and the person opens Required documents. */
const VAULT_TMF_ASK = 'c2c.vault.openTmf';
export function openVaultTrialMasterFile(onNav: (id: string) => void): void {
  try { sessionStorage.setItem(VAULT_TMF_ASK, '1'); } catch { /* the Vault opens on its library */ }
  onNav('vault');
}
/** Whether the Vault was asked to open on this section; the ask is used once. */
export function takeVaultTmfAsk(): boolean {
  try {
    const asked = sessionStorage.getItem(VAULT_TMF_ASK) === '1';
    sessionStorage.removeItem(VAULT_TMF_ASK);
    return asked;
  } catch { return false; }
}

const NO_DOCUMENTS: readonly TmfVaultDocument[] = [];

/** What the section is showing, as it was read: for a host that tells AnA what is on screen (the eTMF page). */
export type TmfSectionState =
  | { study: null; studies: DataState<{ designs: TmfStudy[] }> }
  | { study: TmfStudy; scope: TmfScope; completeness: DataState<TmfCompletenessResult> };
interface Host { heading: string; onState?: (state: TmfSectionState) => void; onAsk?: (prompt: string) => void; onVaultChanged?: () => void }
const HostContext = React.createContext<Host>({ heading: 'Trial master file' });

/** Tell the host what is on screen, when it changes. Null: a part deeper in the section is telling it. */
function useTellHost(state: TmfSectionState | null): void {
  const { onState } = useContext(HostContext);
  const latest = useRef(state);
  latest.current = state;
  const key = JSON.stringify(state);
  useEffect(() => { if (latest.current) onState?.(latest.current); }, [key, onState]);
}

type Act = { code: string; kind: 'file' | 'remove' | 'declare' };

interface ZoneProps {
  zone: ZoneCompleteness; filings: ReadonlyMap<string, TmfFiling> | null; documents: readonly TmfVaultDocument[];
  /** Offer the acts: a role that may write the Vault. They wait while a read is in flight. */
  canWrite: boolean; busy: boolean; act: Act | null; onAct: (act: Act | null) => void;
  form: (record: TmfRecord, kind: Act['kind']) => React.ReactNode;
}

/** A record's act: its visible word, and a name that says which record it acts on. */
function RowAct({ label, name, busy, onAct }: { label: string; name: string; busy: boolean; onAct: () => void }) {
  return <button type="button" className="btn ghost small" disabled={busy} aria-label={name} onClick={onAct}>{label}</button>;
}

/** A zone's line, then each of its records: its name, its zone and code, and what it is filed against or that it is missing. */
function ZoneRows({ zone, filings, documents, canWrite, busy, act, onAct, form }: ZoneProps) {
  return (
    <>
      <div className="vd-dr-row vd-cov-mod" data-testid={`vault-tmf-zone-${zone.number}`}>
        <span className="vd-dr-kind">Zone {zone.number}</span>
        <span className="vd-dr-name">{zone.name}</span>
        <span className="vd-dr-detail">
          {zone.present.length} of {zone.required.length} filed
          {(zone.notApplicable?.length ?? 0) > 0 ? ` · ${zone.notApplicable.length} not applicable` : ''}
        </span>
      </div>
      {recordsOf(zone, filings).map((r) => (
        <React.Fragment key={r.code}>
          <div className="vd-dr-row" data-testid={`vault-tmf-record-${r.code}`} data-state={r.state}>
            <span className="vd-dr-name" title={r.name}>{r.name}</span>
            <span className="vd-dr-kind mono" data-testid={`vault-tmf-code-${r.code}`}>Zone {r.zone} · {r.code}</span>
            <span className="vd-dr-detail">{recordSentence(r, documents)}</span>
            {canWrite && r.state !== 'filed'
              ? <RowAct label="File a document" name={`File a document as ${r.name}`} busy={busy} onAct={() => onAct({ code: r.code, kind: 'file' })} /> : null}
            {/* Declared only where nothing is filed: a filing is removed first, with its own reason. */}
            {canWrite && r.state === 'missing' && !r.filing
              ? <RowAct label="Not applicable…" name={`Declare ${r.name} not applicable to this study`} busy={busy} onAct={() => onAct({ code: r.code, kind: 'declare' })} /> : null}
            {canWrite && r.filing && r.state === 'not_applicable'
              ? <RowAct label="Withdraw" name={`Withdraw the declaration that ${r.name} does not apply`} busy={busy} onAct={() => onAct({ code: r.code, kind: 'remove' })} /> : null}
            {canWrite && r.filing && r.state !== 'not_applicable'
              ? <RowAct label="Remove" name={`Remove the filing of ${r.name}`} busy={busy} onAct={() => onAct({ code: r.code, kind: 'remove' })} /> : null}
          </div>
          {/* Open only from a button above, so only for a role that may write; a re-read does not close it. */}
          {act?.code === r.code ? form(r, act.kind) : null}
        </React.Fragment>
      ))}
    </>
  );
}

/* ── The section ── */

/** Which records are checked: the essential ones, or all. Two options, in the heading row. */
function ScopeChoice({ scope, onScope }: { scope: TmfScope; onScope: (scope: TmfScope) => void }) {
  return (
    <div className="seg" role="group" aria-label="Records checked" data-testid="vault-tmf-scope">
      {(['essential', 'all'] as const).map((s) => (
        <button key={s} type="button" className="seg-b" aria-pressed={scope === s} data-on={scope === s || undefined} onClick={() => onScope(s)}>
          {SCOPE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/**
 * The section's head: its heading, which study it is of, then the scope and
 * the study chooser. One place for every state, and each control in its own
 * slot, so the chooser keeps its focus when the scope appears beside it.
 */
function SectionHead({ headingId, sub, scope, chooser }: { headingId: string; sub?: string; scope?: React.ReactNode; chooser?: React.ReactNode }) {
  const { heading } = useContext(HostContext);
  return (
    <div className="pj-sec-h">
      <h2 id={headingId}>{heading}</h2>
      {sub ? <span className="sec-sub">{sub}</span> : null}
      {scope || chooser ? <div className="pj-sec-acts">{scope ?? null}{chooser ?? null}</div> : null}
    </div>
  );
}

function ReadFailureNote({ failure, onRetry, testId }: { failure: ReadFailureWords; onRetry: () => void; testId: string }) {
  return (
    <p className="vd-dr-err" role="alert" data-testid={testId}>
      {failure.message}{' '}
      {failure.retryable ? <button type="button" className="btn ghost small" onClick={onRetry}>Try again</button> : null}
    </p>
  );
}

/** What the last act came to: a filing or a removal. Kept when a read after it fails. */
function SaidNote({ note }: { note: TmfNote | null }) {
  if (!note) return null;
  return <div className={note.tone === 'error' ? 'vd-dr-err' : 'vd-d-idx'} role={note.tone === 'error' ? 'alert' : 'status'} data-testid="vault-tmf-note">{note.text}</div>;
}
const Line = ({ id, children }: { id?: string; children: React.ReactNode }) => <p className="vd-seals-empty" role="status" data-testid={id}>{children}</p>;

/** Ask AnA which gaps an inspector would raise for this study. Offered where the host has a conversation to ask in. */
function AskAna({ study }: { study: TmfStudy }) {
  const { onAsk } = useContext(HostContext);
  if (!onAsk) return null;
  return (
    <button type="button" className="btn ghost small" onClick={() => onAsk(tmfAskPrompt(study))} data-testid="vault-tmf-ask">
      {I.sparkles} Ask AnA which gaps an inspector would raise
    </button>
  );
}

/** What the read says: the verdict in a sentence, the three figures, then what "filed" rests on and what is not assessed. */
function Assessment({ verdict, result }: { verdict: TmfVerdict; result: TmfCompletenessResult }) {
  return (
    <>
      <p className="vd-seals-note" role="status" data-testid="vault-tmf-verdict" data-verdict={verdict}>{tmfVerdictSentence(verdict, result)}</p>
      <TmfFiguresLine result={result} testId="vault-tmf-figures" />
      <p className="vd-dr-meta" data-testid="vault-tmf-basis">{SCOPE_SENTENCE[result.scope]} {basisSentence(result.basis)}</p>
      <p className="vd-dr-meta" data-testid="vault-tmf-not-assessed">{NOT_ASSESSED}</p>
    </>
  );
}

interface StudyTmfProps { projectId: string; study: TmfStudy; scope: TmfScope; documents: readonly TmfVaultDocument[] }

/** A study's assessed trial master file: what the read says, the zones and their records, then the inspection package. */
function AssessedTmf({ projectId, study, scope, documents, result, rereading, filed, reread, note, say }: StudyTmfProps & {
  result: TmfCompletenessResult; rereading: boolean; filed: DataState<TmfFiling[]>; reread: () => void; note: TmfNote | null; say: (note: TmfNote | null) => void;
}) {
  const canWrite = useVaultCanWrite();
  const { onVaultChanged } = useContext(HostContext);
  const [act, setAct] = useState<Act | null>(null);
  const pkg = usePackageDownload(study.studyId, scope);
  // The one verdict: the line below, the package's cover and its first part all state this value.
  const verdict = tmfVerdict(result);
  const filings = filed.data ? new Map(filed.data.map((f) => [f.artifactCode, f])) : null;
  const filingsFailure = !filings && !filed.loading ? readFailure(filed, FILINGS_READ) : null;
  const done = (said: TmfNote) => { say(said); setAct(null); reread(); };
  const form = (record: TmfRecord, kind: Act['kind']) => {
    if (kind === 'file') {
      return <VaultTmfFileForm projectId={projectId} studyId={study.studyId} record={record} onDone={done} onCancel={() => setAct(null)} onVaultChanged={onVaultChanged} />;
    }
    if (kind === 'declare') return <VaultTmfDeclareForm studyId={study.studyId} record={record} onDone={done} onCancel={() => setAct(null)} />;
    return <VaultTmfRemoveForm record={record} onDone={done} onCancel={() => setAct(null)} />;
  };
  return (
    <>
      <div className="vd-tmf-read">
        {rereading ? <Line>Reading the trial master file again…</Line> : <Assessment verdict={verdict} result={result} />}
        {/* The package download stays here, above the records, where the section has had it; it is also in the package's bar. */}
        <div className="vd-confirm-acts">
          <AskAna study={study} />
          <PackageDownloadButton pkg={pkg} at="verdict" testId="vault-tmf-download-top" />
        </div>
        <PackageDownloadNote pkg={pkg} at="verdict" testId="vault-tmf-download-note" />
      </div>
      <SaidNote note={note} />
      {filingsFailure ? (
        <ReadFailureNote failure={{ ...filingsFailure, message: `${filingsFailure.message} ${FILINGS_UNREAD}` }} onRetry={reread} testId="vault-tmf-filings-error" />
      ) : null}
      {canWrite ? null : <VaultViewOnly act="file a document in the trial master file, remove a filing or declare a record not applicable" testId="vault-tmf-view-only" />}
      <div className="vd-dr-rows vd-cov-rows vd-tmf-rows">
        {result.zones.filter((z) => z.required.length > 0 || (z.notApplicable?.length ?? 0) > 0).map((z) => (
          <ZoneRows key={z.number} zone={z} filings={filings} documents={documents} canWrite={canWrite} busy={rereading || filed.loading}
            act={act} onAct={setAct} form={form} />
        ))}
      </div>
      <VaultTmfPackage study={study} scope={scope} verdict={verdict} result={result} rereading={rereading} pkg={pkg} />
    </>
  );
}

/** One study's trial master file in one scope: its two reads, then what they say. */
function StudyTmf(props: StudyTmfProps) {
  const { study, scope } = props;
  /* Bumped after a write, so the verdict and the list are what the server holds, never a local patch. */
  const [epoch, setEpoch] = useState(0);
  const [note, setNote] = useState<TmfNote | null>(null);
  const base = tmfBase(study.studyId);
  /* The scope is part of the path, so a changed scope is a new read: nothing of the previous scope is shown while
     it is in flight, and an answer that names another study or another scope is not taken as this one's. */
  const answer = useLiveData<TmfCompletenessResult>(`${base}/completeness?scope=${scope}`, [base, scope, epoch], isCompletenessOf(study.studyId, scope));
  const filed = useLiveData<TmfFiling[]>(`${base}/artifacts`, [base, epoch], isFilingList);
  /* A read asked for again (after a write, or by "Try again") is marked as in flight by the hook from an effect,
     one commit later. For that commit the answer in hand is the one from before: it is held as superseded and
     read as in flight, so the verdict of before a write is never shown beside what the write came to. */
  const [superseded, setSuperseded] = useState<{ epoch: number; answer: DataState<TmfCompletenessResult> | null }>({ epoch, answer: null });
  if (superseded.epoch !== epoch) setSuperseded({ epoch, answer });
  const stale = superseded.epoch !== epoch || answer === superseded.answer;
  const completeness: DataState<TmfCompletenessResult> = stale ? { ...answer, loading: true, error: undefined } : answer;
  const reread = () => setEpoch((n) => n + 1);
  useTellHost({ study, scope, completeness });
  if (completeness.data) {
    return <AssessedTmf {...props} result={completeness.data} rereading={completeness.loading} filed={filed} reread={reread} note={note} say={setNote} />;
  }
  return (
    <>
      <SaidNote note={note} />
      <div className="vd-tmf-read">
        {completeness.loading ? <Line id="vault-tmf-reading">Reading the trial master file…</Line>
          : completeness.error ? <ReadFailureNote failure={readFailure(completeness, TMF_READ)} onRetry={reread} testId="vault-tmf-error" />
            : <Line id="vault-tmf-unassessed">The server returned no assessment for this study, so nothing is said about its trial master file.</Line>}
        <AskAna study={study} />
      </div>
    </>
  );
}

/** Which study, where the project has several. */
function StudyChooser({ studies, chosen, onChoose }: { studies: TmfStudy[]; chosen: string; onChoose: (studyId: string) => void }) {
  return (
    <select className="c2c-input vd-cov-pick" aria-label="Study" value={chosen} onChange={(e) => onChoose(e.target.value)} data-testid="vault-tmf-study">
      <option value="">Choose a study…</option>
      {studies.map((s) => <option key={s.studyId} value={s.studyId}>{studyLabel(s)}</option>)}
    </select>
  );
}

/** Beside the heading: the study the section is of, or how many there are to choose from. */
function headSub(study: TmfStudy | null, count: number): string | undefined {
  if (study) return `Of ${studyLabel(study)}`;
  return count > 1 ? `${count} studies in this project` : undefined;
}

const NO_STUDY = 'This project has no study yet, so it has no trial master file. A study is created in Protocol design, on the Study design tab of the project’s protocol.';

/** The project's studies: one is used, several are chosen between, none is said plainly. */
function ProjectTmf({ projectId, headingId, documents }: { projectId: string; headingId: string; documents: readonly TmfVaultDocument[] }) {
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState('');
  /* Held here, above the study: it stays as chosen when another study is. */
  const [scope, setScope] = useState<TmfScope>('essential');
  const path = `/api/study-design?program_id=${encodeURIComponent(projectId)}`;
  const studies = useLiveData<{ designs: TmfStudy[] }>(path, [path, attempt], isStudyList);
  const list = studies.data?.designs;
  const count = list?.length ?? 0;
  const study = (list?.length === 1 ? list[0] : list?.find((s) => s.studyId === chosen)) ?? null;
  // The host hears of the studies only while no study is on screen; a study's own read tells the rest.
  useTellHost(study ? null : { study: null, studies });
  const chooser = list && count > 1 ? <StudyChooser studies={list} chosen={study?.studyId ?? ''} onChoose={setChosen} /> : null;
  const body = () => {
    if (!list) {
      return studies.loading ? <Line>Reading this project’s studies…</Line>
        : <ReadFailureNote failure={readFailure(studies, STUDIES_READ)} onRetry={() => setAttempt((n) => n + 1)} testId="vault-tmf-error" />;
    }
    if (list.length === 0) return <Line id="vault-tmf-no-study">{NO_STUDY}</Line>;
    if (!study) return <Line id="vault-tmf-choose">A trial master file is of one study. Choose the study to see its trial master file.</Line>;
    return <StudyTmf key={study.studyId} projectId={projectId} study={study} scope={scope} documents={documents} />;
  };
  return (
    <>
      <SectionHead headingId={headingId} sub={headSub(study, count)} scope={study ? <ScopeChoice scope={scope} onScope={setScope} /> : null} chooser={chooser} />
      {body()}
    </>
  );
}

export function VaultTrialMasterFile({ projectId, active, documents = NO_DOCUMENTS, heading = 'Trial master file', onState, onAsk, onVaultChanged, revealRequest = 0 }: {
  projectId: string | null;
  /** The view that holds the section is on screen. Nothing is read before it first is. */
  active: boolean;
  documents?: readonly TmfVaultDocument[];
  /** The section's heading, for a host whose page is already titled "Trial master file". */
  heading?: string;
  /** Told what the section is showing, as it changes: for a host that tells AnA. */
  onState?: (state: TmfSectionState) => void;
  /** Ask AnA in the host's conversation. Without it the section offers no question. */
  onAsk?: (prompt: string) => void;
  /** Told when a filing form put a document into this project's Vault, or may have: for a host that lists the Vault. */
  onVaultChanged?: () => void;
  /** Bring the section into view: each new number is one request, from the host's header button or because the host
   *  was opened on the section (openVaultTrialMasterFile). It is honoured once the section's read has settled, so the
   *  records are on the page; scrolled to before that, the page was too short to bring the section to the top. */
  revealRequest?: number;
}) {
  const [opened, setOpened] = useState(active);
  useEffect(() => { if (active) setOpened(true); }, [active]);
  // The project whose read has settled at least once: a verdict, a refusal, no study, or a choice of studies.
  const [settledFor, setSettledFor] = useState<string | null>(null);
  const tell = useCallback((state: TmfSectionState) => {
    onState?.(state);
    if (!(state.study === null ? state.studies.loading : state.completeness.loading)) setSettledFor(projectId);
  }, [onState, projectId]);
  const settled = projectId !== null && settledFor === projectId;
  const revealedFor = useRef(0);
  useEffect(() => {
    if (!revealRequest || revealedFor.current === revealRequest || !active || !settled) return;
    revealedFor.current = revealRequest;
    revealVaultTrialMasterFile();
  }, [revealRequest, active, settled]);
  const headingId = useId();
  const host = useMemo(() => ({ heading, onState: tell, onAsk, onVaultChanged }), [heading, tell, onAsk, onVaultChanged]);
  if (!projectId) return null;
  return (
    <HostContext.Provider value={host}>
      <section className="pj-sec" id={VAULT_TMF_SECTION_ID} tabIndex={-1} aria-labelledby={headingId} data-testid="vault-tmf">
        {opened ? <ProjectTmf projectId={projectId} headingId={headingId} documents={documents} /> : <SectionHead headingId={headingId} />}
      </section>
    </HostContext.Provider>
  );
}
