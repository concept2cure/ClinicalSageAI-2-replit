import { serverMessage } from '@/lib/queryClient';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import React, { useState, useEffect, useRef } from 'react';
import { I } from '../icons';
import { AnswerLead } from '../AnswerLead';
import { assessmentState, mayReassure } from '../assessmentState';
import type { SurfaceViewProps } from '../surfaceViews';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import { EmptyState, liveGetOrNull, useLiveData, useLiveRows } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import {
  specRowsFromApi,
  specCreateBody,
  specUpdateBody,
  type CmcSpecRow,
  type QualitySpecApiRow,
} from './cmcSpec';
import {
  batchRowsFromApi,
  batchCreateBody,
  batchReleaseBody,
  type CmcBatch,
  type BatchApiRow,
} from './cmcBatch';
/* CMC registers bound to org-scoped endpoints that already existed server-side,
   read AND written. Kept in a sibling module so the loading/error/empty triage
   and the create/edit write path are each written once rather than per card —
   see ./cmcRegisters. */
import {
  CmMethodLibrary,
  CmQcTesting,
  CmContainerClosures,
  CmReferenceStandards,
  CmImpurityProfiles,
  CmDissolutionProfiles,
  CmMaterialSpecs,
  CmFormulationRecords,
  CmManufacturingProcesses,
  CmCharacterizationStudies,
  CmChangeRegister,
  CmComparabilityStudies,
  CmProcessValidation,
  CmDrugSubstances,
  CmDrugProducts,
} from './cmcRegisters';
import { CmModule3Build } from './CmcModule3Build';
import { CmQuality } from './CmcQuality';
import {
  stabilityForm,
  stabilityBody,
  stabilityResultForm,
  stabilityResultBody,
  stabilityCloseoutForm,
  qualifyBody,
  stabilityCloseoutBody,
  readStabilityResults,
  type StabilityResult,
} from './cmcRegisterForms';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import { ceremonyOpen } from '../ceremony';
import {
  cmcProjectId,
  cmcProjectUuid,
  cmcWriteError,
  cmcWriteFailed,
  cmcWriteThrew,
  cmcAssessmentThrew,
} from './cmcShared';
import { openProgramAction } from '../programAction';
import { C2CToast, useToast } from '../toast';
import { useAuth } from '@/services/portal/authService';
import { useNavEntitlements } from '../navEntitlements';
import { CmcRegisterLinks, reportCmcLinkage } from './CmcRegisterLinks';
/* The project steps' band, over this work area's destinations: one idiom
   for "what is open, what to do on it, what comes next" across the product. */
import { StageBand } from './ProjectStages';
import { CmcVariationAssessment } from './CmcVariationAssessment';
import { RecordHistoryPanel } from './cmcRecordHistory';
/* Agency questions on Module 3 are the letter's record (2026-10-19, P-38 /
   P-39 item 1): read once at this module's root, shown by the Overview, the
   per-tab signposts and Program records, and worked on the letter in
   Communication. See ./cmcAgencyQuestions. */
import {
  CmcEarlierQuestionFile,
  CmcModule3QuestionIndex,
  CmcQuestionsContextProvider,
  cmcQuestionFacts,
  earlierFileState,
  earlierNotClosed,
  module3Figure,
  module3HasOverdue,
  openLetterInCommunication,
  outstandingAt,
  useCmcQuestions,
  useCmcQuestionsRead,
} from './cmcAgencyQuestions';
import '../styles/project-home-v2.css';

/* ═══════════════════════════════════════════════════════════════════
   CMC -- Module 3 operating system.

   Real-data standard: a surface renders REAL persisted data, an honest
   EMPTY state, or an honest ERROR state — never an in-file fixture
   presented as content.

   ── The shape of this module ──────────────────────────────────────
   The CMC surfaces were readers. Overview was anchored to the live board
   (GET /api/cmc/module3-board), specifications and batch records could be
   written, and everything else — the method library, QC testing, stability,
   process validation, change control, comparability, drug substance, drug
   product — was a read-only register whose create endpoint had existed,
   unbound, since the CMC schema landed. The tabs downstream of that data
   (blueprint, global, program records) were honest empties for the same
   reason: nothing in the product could produce what they needed.

   That is what the module now closes. Each register carries its own entry
   (./cmcRegisterForms, ./cmcRegisters), and because every one of those
   creates upserts a canonical Module 3 source object on write
   (services/cmc-write-through.ts), the data a CMC team records here is
   exactly the source layer POST /api/cmc/module3-os/compile/:projectId
   composes §3.2.S / §3.2.P from. Two new surfaces stand on the other end
   of that pipe: ./CmcModule3Build (build state, compile, contradictions,
   readiness, the fail-closed export gate, provenance) and ./CmcQuality
   (CQAs, CPPs, control strategy, the ICH check).

   What stays an honest empty stays one: no shelf life is projected that a
   study has not been closed out with. Agency questions are not CMC's to keep
   (2026-10-19, decisions P-38 and P-39 item 1): they are recorded, answered
   and approved by signature on the letter they came in, in Communication.
   CMC reads them from there (./cmcAgencyQuestions), shows the ones about
   Module 3 and opens each on its letter; its own earlier file
   (reg_questions) is read-only history. Canonical config (ICH Q-series / CTD 3.2.S / 3.2.P catalogs,
   market lists) remain reference configuration. Deferred variation assessment
   calls the server classifier; its browser rule set is retired. The launch
   Change control tab records changes without postapproval classifications.

   Overrides the thin SURFACE_VIEWS['cmc'] with this full module.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Types ── */

/**
 * One destination in the CMC module's own navigation.
 *
 * `blurb` and `now` are the two fields the project's steps carry
 * (`LifecycleStage`, fixtures/project-home-data.tsx): what the destination is,
 * and what to do on it in one sentence a new client can act on. Both are
 * static guidance about the destination and never a claim about this program's
 * state — the same rule the project steps keep, for the same reason: a
 * sentence that reads as a measurement is one nobody measured.
 *
 * The shape is a superset of `LifecycleStage`'s required fields, so
 * `StageBand` renders these destinations with no second band
 * (surfaces/ProjectStages.tsx).
 */
interface CmcNavItem { id: string; label: string; icon: string; blurb: string; now: string; }
interface CmcPortfolio {
  sub: string; product: string; region: string; type: string;
  rpi: number | null; ir: number | null;
  /** 'spine' = the canonical submission core (real sequences + placed leaves);
      'rpi' = the legacy preparedness store. Spine rows carry the Module 3
      facts; legacy rows carry the engine's score. Neither fakes the other's. */
  source?: 'spine' | 'rpi';
  m3Leaves?: number | null;
  sequences?: number | null;
}
interface CmcSection {
  key: string; path: string; st: string; _new?: boolean;
  /** The compiler's own score for the section (null when it never scored it)
      and the required inputs it found missing — read from the section's
      compiled record by the same rule the approve route and the export gate
      refuse on (server/services/cmc/compiled-record.ts). */
  completeness?: number | null; missingInputs?: string[];
}

/* ── Live board types (GET /api/cmc/module3-board -> { success, data }) ──
   useLiveData unwraps the { success, data } envelope, so the hook payload is
   the display object directly (portfolio / sections / kpis / meta). rpi / ir /
   rpiAverage / section counts are number | null — honestly null when the
   backend cannot measure them; rendered as "—", never fabricated. */
interface CmcBoardKpis { submissions: number | null; rpiAverage: number | null; sectionsApproved: number | null; sectionsTotal: number | null; readyPercent: number | null; }
interface CmcBoardMeta {
  projectId: string | null; portfolioProvisioned: boolean; sectionsProvisioned: boolean | null; generatedAt: string;
  /** true = that register's read FAILED — as opposed to unprovisioned, or
      provisioned and empty. A failed read is rendered as an error, never as an
      empty register: "no sections" over a store that did not answer is a claim
      nothing established. */
  sectionsUnreadable?: boolean | null; portfolioUnreadable?: boolean;
}
interface CmcBoardData {
  portfolio?: CmcPortfolio[];
  sections?: CmcSection[] | null;
  kpis?: CmcBoardKpis;
  meta?: CmcBoardMeta;
}

/* ── Navigation + AnA prompt starters (UI config / affordances — not data) ── */

/* The sub-tabs follow the work, not the schema: each one is where a role on a
   CMC team spends its day, and every one of them now has both halves — the
   register they read and the entry the record is made through.

     Drug substance / Drug product   §3.2.S / §3.2.P owners, formulation
     Specifications                  analytical development and QC
     Stability                       the stability coordinator
     Batch records                   manufacturing science / MSAT
     Change control                  change control and QA
     Quality by design               the control-strategy and ICH-compliance view
     Module 3 build                  regulatory CMC — compile, resolve, export
     Program records                 QA — the provenance chain */
/* Nine destinations, down from twelve.
   • Drug substance + Drug product were two ~40-line wrappers over one register
     each; they are one destination now, exactly as Specifications already
     carries two registers. Both §3.2.S and §3.2.P material is still here.
   • Copilot held nothing but chat entry points — a tab existing to launch chat
     is the pattern chat-first design forbids, and the AnA panel already carries
     CMC actions on EVERY tab via ANA_SURFACE_CTX. Its prompts moved there, so
     they went from reachable on one tab to reachable on all nine.
   • Postapproval variation assessment remains deferred. The launch Change
     control tab records evidence and dispositions; a deployment permitting
     deferred work reaches the canonical classifier with its real inputs. */
/* Each destination says what it is and what to do on it (2026-10-25, the
   client journey's pass 2 applied to this work area:
   docs/design/CLIENT_JOURNEY_2026-10-25.md). Nine labels were nine nouns, and
   the only sentence beside them was each screen's own `CmHead meta`, which
   describes what the screen HOLDS. A client who opened CMC could not tell
   which destination the work in front of them belonged to, nor what to do
   once there — the founder's recorded complaint about the catalog, inside one
   work area. The order is the order the work is done, so the band's "Next"
   reads as the path through Module 3. */
const CMC_NAV: CmcNavItem[] = [
  {
    id: 'overview', label: 'Overview', icon: 'beaker',
    blurb: 'How far Module 3 has got, and what is blocking it',
    now: 'Start here. See how far Module 3 has got, what the export gate still refuses, and which agency questions on Module 3 are open — then open the destination that holds the work.',
  },
  {
    id: 'materials', label: 'Substance & product', icon: 'atom',
    blurb: 'CTD §3.2.S and §3.2.P — the active substance and the finished product',
    now: 'Record the substance and the product: how each is manufactured, the materials and reference standards it is made with, the impurities found in it, and the container it is packaged in.',
  },
  {
    id: 'specs', label: 'Specifications', icon: 'clipboardList',
    blurb: 'Release and shelf-life limits, and the methods behind them',
    now: 'Record each attribute’s release and shelf-life limits with the analytical method that measures it, then approve the specification under your signature. A limit whose method is not validated cannot be approved.',
  },
  {
    id: 'stability', label: 'Stability', icon: 'barChart',
    blurb: 'ICH Q1A(R2) studies and the shelf life they support',
    now: 'Register each study with its storage condition and batches, enter the results as the timepoints are read, then close the study out with the shelf life those results support.',
  },
  {
    id: 'batch', label: 'Batch records', icon: 'grid',
    blurb: 'Manufacture, yield, deviations and disposition',
    now: 'Log each batch as it is manufactured, with its yield and any deviation, then release it under your signature once its testing is complete.',
  },
  {
    id: 'change', label: 'Change control', icon: 'gitBranch',
    blurb: 'Changes to the substance, product or process, and what they affect',
    now: 'Record each change with its justification and disposition, and see which Module 3 sections read the evidence it touches, so those sections are rebuilt before the next approval.',
  },
  {
    id: 'quality', label: 'Quality by design', icon: 'sigma',
    blurb: 'The control strategy and the ICH check over these records',
    now: 'Derive this project’s critical attributes and process parameters from the records above, generate its control strategy, and run the ICH check to see which requirements are not yet met.',
  },
  {
    id: 'build', label: 'Module 3 build', icon: 'layers',
    blurb: 'Compile §3.2, resolve what contradicts, approve and export',
    now: 'Compile §3.2 from these records, resolve every contradiction the sweep finds, approve each section under signature, then check the export gate before placing the module into a submission sequence.',
  },
  {
    id: 'pathway', label: 'Project records', icon: 'scroll',
    blurb: 'Who did what, and the agency’s questions about it',
    now: 'Read what was done and by whom: each section’s audit chain, the approval gates it passed, and the agency questions asked about Module 3.',
  },
];

const CMC_SUGGEST: Record<string, string[]> = {
  overview: ['Run the ICH compliance check and show every gap', 'Generate the drug-substance control strategy', 'What is blocking my shelf-life claim?'],
  materials: ['Draft the §3.2.S.2.2 manufacturing process description', 'Summarise the impurity profile for this substance', 'Draft the §3.2.P.1 composition table', 'What does §3.2.P.2 pharmaceutical development still need?'],
  specs: ['Justify the release and shelf-life limits for aggregation', 'Flag any specification without a validated method', 'Compare release vs shelf-life limits across DS and DP'],
  stability: ['Project shelf life from the long-term data with an ICH Q1E fit', 'Are my primary batches combinable for one shelf-life claim?', 'Show every study trending toward a limit', 'Draft the stability summary for §3.2.S.7'],
  batch: ['Summarize deviations across the last 10 batches', 'Show batches still pending release', 'Trend yield across drug-product batches'],
  change: ['Record this change and its justification', 'Which Module 3 evidence does this change affect?', 'Review my open changes and their recorded dispositions'],
  pathway: ['Summarise every governed action taken on this Module 3', 'Which contradictions were resolved, and how?', 'Draft an audit-trail summary for an inspector'],
};


/* ── Inline helpers ──
   `useToast` / `C2CToast` / the project-in-context read / the write-error
   reader now live in ./cmcShared: the CMC module is nine surfaces across four
   files, and a toast that reports a failure is not something to reimplement
   per file. */

/* Markdown rendering is `renderSafeMarkdown` (marked + DOMPurify), the
   codebase's one audited markdown-to-HTML path -- see
   components/ana/renderSafeMarkdown.ts.

   This file used to carry its own 13-line `mdToHtml`: a regex approximation of
   markdown whose first act was a hand-rolled `&`/`<`/`>` escape. Two other
   surfaces carried the same function, two of the three byte-identical. Three
   copies of an escaper feeding three `dangerouslySetInnerHTML` sinks is three
   places to get HTML escaping right and three places for one to drift, in a
   product where the text being rendered is a document the user wrote or
   uploaded.

   The replacement is not merely deduplication. `renderSafeMarkdown` runs a real
   markdown parser and then reduces the result to an explicit tag/attribute
   allowlist, so `<script>`, inline event handlers and `javascript:` URLs are
   removed rather than depended upon never to arrive -- and it is already
   covered by its own tests, which the hand-rolled copies never were. */

/* ── Governed §11.50 e-sign form config ──
   The note this carried ("Draft approval only — this is not yet persisted as a
   21 CFR §11 electronic signature or audit entry") was written when the form had
   no approval endpoint behind it. Both of its callers now have one, and both of
   those endpoints re-authenticate the signer before any write and record a
   hash-chained governed action:

     specifications  POST /api/cmc/specifications/:id/approve
                     verifyReauth + recordGovernedAction, then approval_status
     §3.2 sections   POST /api/cmc/module3-os/sections/:pid/:key/approve
                     verifyReauth, refuses on an unresolved critical
                     contradiction, snapshots an approved version, writes a
                     cmc_provenance_events entry keyed to the signer

   Leaving the old note in place is not the safe side of the honesty rule. It
   tells a signer their signature is not being recorded at the moment it is —
   which is exactly the misunderstanding §11.50 exists to prevent, and it invites
   someone to sign more casually than the record deserves. The copy now states
   what actually happens. */
/* What the approve route and the export gate refuse on, read the same way
   here: a compiled record under 100, a required input still named missing, or
   no score at all — a section the composer never scored is "nothing
   established", not "complete". A row without the figures (an older payload)
   fails closed to incomplete: the server would refuse the signature anyway. */
function sectionIncomplete(s: CmcSection): boolean {
  return s.completeness !== 100 || (s.missingInputs ?? []).length > 0;
}
/** Why the control is withheld, in the signer's terms — the same shape the approve route's 409 uses. */
function incompleteReason(s: CmcSection): string {
  const missing = s.missingInputs ?? [];
  return (
    '§' + s.key + (s.completeness == null ? ' has no compiled completeness record' : ' is ' + s.completeness + '% complete') +
    ' and cannot be approved.' +
    (missing.length ? ' Missing required inputs: ' + missing.join(', ') + '.' : '') +
    ' Record the inputs on the Module 3 build board and recompile.'
  );
}

/* ── What a signature is over ────────────────────────────────────────────────
   A §11.50 signature is a signature over CONTENT. Until this panel existed the
   only thing the product showed a signer at the moment of approving §3.2.S.4
   was its key, its percentage and its missing inputs: the narrative and tables
   the approve route hashes and snapshots were served by no route and rendered
   on no screen, so the signature was over a section NUMBER.

   This is the read step, and it is not skippable — "Approve section" opens it,
   and the signature form opens from inside it. It shows the section exactly as
   it will be filed (the markdown comes from the one renderer the eCTD leaf and
   the governed artifact are both built from), the compiler's own verdict, and
   the source records the words rest on. A section whose content could not be
   read offers no signature at all: signing what you could not see is the thing
   this panel exists to prevent. */
interface CmcSectionRead {
  sectionKey: string; title: string; approvalState: string; stale: boolean; staleReason: string | null;
  completeness: number | null; missingInputs: string[]; narrative: string;
  tables: Array<{ title: string; headers: string[]; rows: string[][] }> | null;
  tablesUnknown: boolean; markdown: string; compiledHash: string | null; updatedAt: string | null;
  lineage: Array<{ sourceType: string | null; sourceKey: string | null; changedSinceCompile: boolean }>;
}

function CmcSectionReview({
  projectId, section, onCancel, onSign,
}: {
  /* onSign carries the content hash THIS panel displayed, so the signature is
     refused if the section is recompiled between the read and the signing
     (the server's SECTION_CHANGED). */
  projectId: string; section: CmcSection; onCancel: () => void; onSign: (compiledHash: string | null) => void;
}) {
  const read = useLiveData<CmcSectionRead>(
    projectId ? `/api/cmc/module3-os/sections/${encodeURIComponent(projectId)}/${encodeURIComponent(section.key)}` : null,
  );
  const d = read.data;
  const changed = (d?.lineage ?? []).filter((l) => l.changedSinceCompile);
  return (
    <div className="de-bd" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="de" role="dialog" aria-modal="true" aria-label={`Read section ${section.key} before signing`}>
        <div className="de-h">
          <div>
            <div className="de-h-eye">Read before you sign — 21 CFR §11.50</div>
            <div className="de-h-t">§{section.key}{d?.title ? ` — ${d.title}` : ''}</div>
            <div className="de-h-s">This is the content your signature covers, as it will be filed.</div>
          </div>
          <button className="de-x" onClick={onCancel} aria-label="Close">{I.close}</button>
        </div>
        <div className="de-body">
          {read.loading && <div className="pj-dim">Loading the compiled section…</div>}
          {!read.loading && (read.error || !d) && (
            <EmptyState
              title="This section could not be read"
              hint={read.error || 'The compiled section did not load. It cannot be signed until it can be read — this is a failed read, not an empty section.'}
            />
          )}
          {d && (
            <>
              <div className="pj-dim" style={{ marginBottom: 10 }}>
                {d.completeness == null ? 'No compiled completeness record' : `${d.completeness}% complete`}
                {d.missingInputs.length > 0 ? ` · missing: ${d.missingInputs.join('; ')}` : ''}
                {d.compiledHash ? ` · content hash ${d.compiledHash.slice(0, 12)}…` : ''}
              </div>
              {d.stale && (
                <div className="pj-con" style={{ marginBottom: 10 }}>
                  <div className="pj-con-t">This section is stale</div>
                  <div className="pj-con-d">{d.staleReason || 'A source changed after it was built. Recompile before approving.'}</div>
                </div>
              )}
              {d.tablesUnknown && (
                <div className="pj-con" style={{ marginBottom: 10 }}>
                  <div className="pj-con-t">Its tables are not known</div>
                  <div className="pj-con-d">
                    This section was compiled before its tables were stored, so what is shown below may be missing them.
                    Recompile and re-approve it before it can be filed.
                  </div>
                </div>
              )}
              {changed.length > 0 && (
                <div className="pj-con" style={{ marginBottom: 10 }}>
                  <div className="pj-con-t">{changed.length} source record(s) changed since this was compiled</div>
                  <div className="pj-con-d">{changed.map((c) => c.sourceKey || c.sourceType).join(', ')}</div>
                </div>
              )}
              <div dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(d.markdown) }} />
              <div className="pj-dim" style={{ marginTop: 14 }}>
                Composed from {d.lineage.length} source record(s):{' '}
                {d.lineage.map((l) => l.sourceKey || l.sourceType).filter(Boolean).join(', ') || '—'}
              </div>
            </>
          )}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onCancel}>Cancel</button>
          <button
            className="de-btn primary"
            disabled={!d}
            title={d ? 'Open the signature form for this section' : 'The section must be readable before it can be signed'}
            onClick={() => onSign(d?.compiledHash ?? null)}
          >{I.lock} Sign & approve</button>
        </div>
      </div>
    </div>
  );
}

function signForm(target: string): C2CFormConfig {
  return {
    eyebrow: '21 CFR §11.50 — e-signature', title: 'Sign to approve', sub: target, submitLabel: 'Sign & approve',
    governed: 'Your credentials are verified before this is written, and the signature, its meaning and your reason are recorded to the hash-chained audit trail against your account.',
    fields: [
      /* The values are the tokens the approve endpoints record, not display
         strings: the meaning is part of the signed record, so what the signer
         chooses and what an inspector later reads must be the same word. */
      /* Authorship is NOT offered. This form signs an approval — of a Module 3
         section or of a specification — and §11.50(a)(3)'s "authorship" meaning
         is what switches the four-eyes check off (`requiresIndependence`). The
         platform closed the same hole on freeze/dispatch, where a release
         signer could be the sequence's creator by choosing it (2026-10-05);
         the section-approve route now refuses it, and there is no authoring
         act at either endpoint for that meaning to describe, so offering it
         could only produce a refusal the signer could not have predicted.
         (The specification approval's own four-eyes check is not in this
         change; it simply never needed an authorship meaning either.) */
      { key: 'meaning', label: 'Meaning of signature', type: 'select', options: [
        { value: 'approval', label: 'Approval' },
        { value: 'review', label: 'Review' },
        { value: 'responsibility', label: 'Responsibility' },
      ], default: 'approval', required: true },
      { key: 'reason', label: 'Reason', type: 'textarea', placeholder: 'Reason for this approval...', required: true, desc: `At least ${GOVERNED_REASON_MIN} characters. It is recorded with the signature exactly as written.` },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Re-enter your password', required: true, half: true },
      { key: 'totp', label: 'Authenticator', type: 'text', placeholder: '6-digit code', half: true },
    ],
  };
}

/* ── Cross-surface navigation helpers ── */
function cmcNav(onNav: ((id: string) => void) | undefined, id: string) {
  if (id === 'dossier') {
    const openTab = (window as unknown as { __cmSetTab?: (tab: string) => void }).__cmSetTab;
    if (openTab) openTab('build');
    else onNav?.('cmc');
    return;
  }
  onNav?.(id);
}
function cmcCtx(label: string) { try { if ((window as any).C2C) (window as any).C2C.setContext({ entityType: 'cmc', entityId: label, entityLabel: label }); } catch { /* noop */ } }
function cmcTask(label: string) { cmcCtx(label); try { if ((window as any).C2C) (window as any).C2C.open('task'); } catch { /* noop */ } }
function cmcCollab(label: string) { cmcCtx(label); try { if ((window as any).C2C) (window as any).C2C.open('collab'); } catch { /* noop */ } }

/* ── Shared subcomponents ── */

function CmConnectBar({ nav }: { nav?: (id: string) => void }) {
  return (
    <div className="cm-connect">
      <span className="cm-connect-l">This work flows into</span>
      <button onClick={() => cmcNav(nav, 'dossier')}>{I.folder} Module 3 dossier</button>
      <button onClick={() => cmcNav(nav, 'document-authoring')}>{I.penLine} Document editor</button>
      <button onClick={() => cmcNav(nav, 'vault')}>{I.vault} Vault</button>
      <button onClick={() => cmcNav(nav, 'projects')}>{I.folder} Project</button>
      <button onClick={() => cmcTask('CMC — Module 3')}>{I.checkSquare} Tasking</button>
      <button onClick={() => cmcCollab('CMC — Module 3')}>{I.messageSquare} Collaborate</button>
    </div>
  );
}

/* "Open in", not "Push to": these buttons navigate with context — they write
   nothing. The data itself flows without them: every register save
   write-throughs to the canonical §3.2 source layer, and each compile files a
   governed artifact the Vault lists under "Governed artifacts › Module 3". A button
   claiming to "save to Vault" while saving nothing was the dishonest copy the
   relabel removes. */
function CmPush({ label, nav, bar }: { label: string; nav?: (id: string) => void; bar?: boolean }) {
  return (
    <span className={bar ? 'cm-push cm-pushbar' : 'cm-push'}>
      <span className="lbl">Open in</span>
      <button onClick={() => { cmcCtx(label); cmcNav(nav, 'dossier'); }} title="Open the Module 3 dossier with this in context">{I.gitBranch} Module 3 doc</button>
      <button onClick={() => { cmcCtx(label); cmcNav(nav, 'vault'); }} title="Open the Vault — compiled §3.2 artifacts are filed there automatically">{I.vault} Vault</button>
      <button onClick={() => cmcTask(label)} title="Create a task">{I.checkSquare} Task</button>
      <button onClick={() => cmcCollab(label)} title="Collaborate">{I.messageSquare} Discuss</button>
    </span>
  );
}

interface CmHeadProps {
  title: string;
  meta: string;
  ask?: (text: string) => void;
  suggest?: string[];
  actions?: React.ReactNode;
}
function CmHead({ title, meta, ask, suggest, actions }: CmHeadProps) {
  return (
    <>
      <div className="cm-head">
        <div><div className="cm-kicker">CMC — Module 3 operating system</div><h1 className="cm-title">{title}</h1><div className="cm-meta">{meta}</div></div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}{ask && <button className="reg-cta" onClick={() => ask((suggest && suggest[0]) || 'Help me with Module 3')}>{I.sparkles} Ask AnA</button>}</div>
      </div>
      {suggest && <div className="sp-starters" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>{suggest.map((s, i) => (<button key={i} className="sp-starter" onClick={() => ask && ask(s)}><span className="sk">{I.sparkles}</span><span>{s}</span></button>))}</div>}
    </>
  );
}

/* A KPI is a figure first; `onClick` makes it a door as well. The interactive
   variant is a real <button> carrying the SAME class and children — the
   .c2c-v2 button reset (app-v2.css) zeroes the chrome and .reg-kpi supplies
   the identical box — so the tile looks the same, reads as a control to a
   screen reader, and gains the focus ring. A tile with nothing behind it stays
   a plain <div>: a clickable dead end is noise, not an affordance. */
function Kpi({ l, v, s, tone, onClick, title }: { l: string; v: React.ReactNode; s?: string; tone?: string; onClick?: () => void; title?: string }) {
  const body = <><div className="reg-kpi-v">{v}</div><div className="reg-kpi-l">{l}{s ? ' — ' + s : ''}</div></>;
  if (onClick) return <button type="button" className="reg-kpi" data-tone={tone} title={title} onClick={onClick}>{body}</button>;
  return <div className="reg-kpi" data-tone={tone}>{body}</div>;
}

/* ═══════════ Overview -- LIVE portfolio + governed section approvals ═══════════ */

export function CmOverview({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  /* Live board -- GET /api/cmc/module3-board[?projectId]. useLiveData unwraps the
     { success, data } envelope, so `board.data` is the display payload directly:
     real portfolio + KPIs, an honest empty, or an honest error — never a fixture.
     Portfolio is org-scoped; the governed section list is per-project, so it is
     null until a project is in context. */
  const ctxProjectId = cmcProjectId();
  const boardPath = ctxProjectId
    ? '/api/cmc/module3-board?projectId=' + encodeURIComponent(ctxProjectId)
    : '/api/cmc/module3-board';
  const board = useLiveData<CmcBoardData>(boardPath);
  const data = board.data;

  const port: CmcPortfolio[] = data && Array.isArray(data.portfolio) ? data.portfolio : [];
  /* null = no project in context (sections are inherently per-project); [] = a
     project is in context but has no governed sections yet. */
  const liveSections: CmcSection[] | null = data && Array.isArray(data.sections) ? data.sections : null;
  const kpis = data?.kpis;
  const meta = data?.meta;
  /* true = that register's read FAILED. The board answers `sections: []` /
     `portfolio: []` for a failed read exactly as for an empty one; only these
     flags tell them apart, and the surface used to ignore them — so a store
     that did not answer rendered as "no governed CMC sections authored". */
  const sectionsUnreadable = meta?.sectionsUnreadable === true;
  const portfolioUnreadable = meta?.portfolioUnreadable === true || kpis?.submissions === null;

  /* Governed section-approval working set — seeded from the live governed store.
     useLiveData memoizes its result in state, so `liveSections` is a stable
     reference between renders (it changes only when the fetch re-resolves), so
     this re-seed effect does not loop. */
  const [secs, setSecs] = useState<CmcSection[]>([]);
  useEffect(() => {
    setSecs((liveSections ?? []).map((s) => ({ ...s })));
  }, [liveSections]);
  const [sign, setSign] = useState<CmcSection | null>(null);
  /** The content hash the signer read in the review panel, sent with the signature. */
  const [signHash, setSignHash] = useState<string | null>(null);
  /* The section being READ before it is signed. "Approve section" opens this;
     the signature form opens from inside it, never directly. */
  const [review, setReview] = useState<CmcSection | null>(null);
  const [toast, fireToast] = useToast();

  /* rpi / ir are number | null -- honestly null when the backend cannot measure a
     submission. Prefer the backend KPIs (identical guarded computation server-side)
     and guard every reduce/sort so a null never NaNs a value; render "—" for null. */
  const rpiNums = port.map((r) => r.rpi).filter((v): v is number => typeof v === 'number');
  const computedAvgRpi = rpiNums.length ? Math.round(rpiNums.reduce((a, b) => a + b, 0) / rpiNums.length) : null;
  const avgRpi: number | null = kpis ? kpis.rpiAverage : computedAvgRpi;
  /* Agency questions overdue on THIS program (2026-10-19, P-38 / P-39 item 1).
     The figure is the server's, read once at the module root from the
     program's letters: questions not answered as they stand on a letter past
     its due date (response-logic letterOverdue). An approved answer is never
     in it. It is per program, so with no program open there is no figure, and
     a read that failed is "not established", never 0. The earlier CMC file is
     not in it; its not-closed count is stated beside it.
     Each count is said as what it counts (review of 2026-10-19): the letters
     the overdue questions are on; Module 3 letters with nothing to answer
     recorded; letters overdue only on their other questions (an approved
     Module 3 answer is never shown as overdue); questions with no section and
     letters with neither, never added together. */
  const questions = useCmcQuestions();
  const fig = module3Figure(questions);
  const irUnknown = fig.state !== 'ready';
  const irOverdue = fig.state === 'ready' ? fig.questionsOverdue : null;
  const m3Overdue = module3HasOverdue(fig);
  const overdueSecs = fig.overdueSections;
  /* null while the earlier file is read or when its read failed: not "none". */
  const earlierOpen = earlierNotClosed(questions);
  const earlierUnread = earlierFileState(questions) === 'unreadable';
  /* What the figure leaves out keeps the Overview from an all-clear, and so
     does an earlier file whose open count is not established. */
  const questionsComplete = fig.state === 'ready' && fig.withheld === 0 && fig.unclassifiedOutstanding === 0
    && fig.overdueLettersWithoutQuestions === 0 && earlierOpen === 0;
  const openOverdueLetters = () => {
    if (fig.firstOverdueLetterId && nav) openLetterInCommunication(nav, fig.firstOverdueLetterId);
    else (window as unknown as { __cmSetTab?: (id: string) => void }).__cmSetTab?.('pathway');
  };

  const approved = secs.filter((s) => s.st === 'approved').length;
  const readyPct = secs.length ? Math.round(100 * approved / secs.length) : 0;
  const readyTone = readyPct >= 80 ? 'ok' : readyPct >= 50 ? 'warn' : 'err';
  const stTone = (s: string) => s === 'approved' ? 'ok' : s === 'review' ? 'warn' : 'dim';

  /* Export readiness is READ from the gate's own evaluation, never derived
     here. The card used to say "Export ready" at 80% approved — while the gate
     requires every section approved, none stale, every approved one complete,
     every one with lineage, and a governed-state verdict. On the live case
     that motivated this work (21/21 approved, three at 0% complete) the card
     was green while the gate refused. The percentage stays as what it is:
     approvals. */
  const readiness = useLiveData<{
    totalSections: number; approvedSections: number; staleSections: number; openCriticalContradictions: number;
    sectionsWithoutProvenance: number; incompleteApprovedSections: string[]; governedStateEvaluated: boolean; exportReady: boolean;
  }>(ctxProjectId ? '/api/cmc/module3-os/readiness/' + encodeURIComponent(ctxProjectId) : null);
  const readinessReasons = (() => {
    const r = readiness.data;
    if (!r || r.exportReady) return [];
    const reasons: string[] = [];
    if (r.totalSections > 0 && r.approvedSections < r.totalSections) reasons.push(`${r.totalSections - r.approvedSections} not approved`);
    if (r.incompleteApprovedSections?.length) reasons.push(`${r.incompleteApprovedSections.length} approved but incomplete (§${r.incompleteApprovedSections.join(', §')})`);
    if (r.staleSections > 0) reasons.push(`${r.staleSections} stale`);
    if (r.sectionsWithoutProvenance > 0) reasons.push(`${r.sectionsWithoutProvenance} without source lineage`);
    if (r.openCriticalContradictions > 0) reasons.push(`${r.openCriticalContradictions} critical contradiction(s) open`);
    if (!r.governedStateEvaluated) reasons.push('governed state not evaluated');
    return reasons;
  })();

  // doSign — REAL, awaited section approval against the governed Module 3
  // operating-system endpoint (POST /api/cmc/module3-os/sections/:projectId/
  // :sectionKey/approve, server/api/cmc/module3OperatingSystemRoutes.ts). The
  // backend refuses (409) on an unresolved critical contradiction or on a
  // section whose own compiled record is incomplete, else snapshots a new
  // approved version, sets approval_state, and writes a cmc_provenance_events
  // audit entry keyed to the authenticated user. The reason + reauth captured by
  // the sign form are forwarded, and the server VERIFIES the re-auth before any
  // write (verifyReauth, module3OperatingSystemRoutes.ts — fail closed, same as
  // spec-approve and batch-release).
  // Only reflects approval on a real 2xx; nothing is fabricated on failure.
  const doSign = async (v: Record<string, string>) => {
    if (!sign) return;
    const target = sign;
    if (!ctxProjectId) {
      fireToast('Open a project first — section approval is recorded per project.', 'error');
      return;
    }
    try {
      const res = await apiRequest(
        'POST',
        '/api/cmc/module3-os/sections/' +
          encodeURIComponent(ctxProjectId) +
          '/' +
          encodeURIComponent(target.key) +
          '/approve',
        {
          reason: v.reason,
          // §11.50(a)(3) — the meaning the signer chose, recorded with the
          // signature rather than collected and dropped.
          meaning: v.meaning,
          /* What was read is what is signed: the hash the review panel showed.
             The server refuses (409 SECTION_CHANGED) if the section was
             recompiled since. */
          compiledHash: signHash,
          reauth: { password: v.password, totp: v.totp || undefined },
        },
      );
      const json = await res.json().catch(() => null);
      if (res.ok) reportCmcLinkage(json, 'CMC record');
      if (res.status === 409) {
        /* 409 is the server refusing the signature for a STATED reason — an
           unresolved critical contradiction, or a section whose compiled record
           is incomplete. Render the reason it gave: the hard-coded "resolve the
           critical contradictions first" sent a signer looking for
           contradictions that did not exist. */
        fireToast(
          'Cannot approve ' + target.key + ' — ' + (serverMessage(json) ?? 'the server refused the signature (HTTP 409).'),
          'error',
        );
        return;
      }
      if (!res.ok) {
        fireToast('Couldn’t approve section ' + target.key + ' — ' + specErr(json, res.status) + '. Nothing was persisted.', 'error');
        return;
      }
      setSecs((ss) => ss.map((x) => (x.key === target.key ? { ...x, st: 'approved', _new: true } : x)));
      const ver = (json as { versionNumber?: number })?.versionNumber;
      const chain = (json as { governance?: { sha256Chain?: string } })?.governance?.sha256Chain;
      fireToast(
        'Section ' + target.key + ' approved and signed' +
          (ver ? ' · v' + ver : '') +
          (chain ? ' · ' + String(chain).slice(0, 12) + '…' : '') + '.',
      );
      setSign(null);
    } catch (e) {
      fireToast('Couldn’t approve section ' + target.key + ' — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };

  const rpiRankable = port.filter((p): p is CmcPortfolio & { rpi: number } => typeof p.rpi === 'number');
  const lowSub = rpiRankable.length ? [...rpiRankable].sort((a, b) => a.rpi - b.rpi)[0] : null;
  const inReview = secs.filter((s) => s.st === 'review');
  const drafts = secs.filter((s) => s.st === 'draft');
  const nextSec = inReview[0] || drafts[0];
  /* ── BP-W0-3, the same defect as the NDA cockpit ───────────────────────────
     With zero submissions this lead read "Your Module 3 spans 0 submissions --
     preparedness is still computing across the portfolio" over a board that had
     finished loading and had nothing to compute, and then reassured with
     "You're building steadily" over nothing being built. `not-assessed` was
     wearing the vocabulary of work in progress.

     Here `assessmentRan` CAN be true, unlike the RtF log: a governed section
     carries a state (draft / review / approved) that only exists because
     someone moved it, so a non-empty section set is positive evidence that the
     package is genuinely being assessed. The gate is `secs.length`, not
     `approved === 0`. */
  /* A failed register read is unreadable, not not-assessed: the narrative must
     not count sections or reassure over a store that did not answer. */
  const cmcState = assessmentState({
    loading: board.loading,
    unreadable: Boolean(board.error) || sectionsUnreadable || portfolioUnreadable,
    scopeExists: port.length > 0,
    findingCount: (irOverdue ?? 0) + (fig.state === 'ready' ? fig.lettersWithoutQuestionsOverdue : 0),
    assessmentRan: secs.length > 0,
  });
  const cmLead = (
    <AnswerLead
      /* Both arms of the inner ternary used to resolve to 'calm', so the
         'good' tone AnswerLead provides was unreachable here while the
         NDA cockpit — same session, same assessmentState taxonomy — used it
         for the identical state. Two sibling surfaces rendering one state in
         two visual languages is the drift this work is meant to remove. */
      tone={m3Overdue ? 'urgent' : cmcState === 'assessed-clear' && questionsComplete ? 'good' : 'calm'}
      eyebrow={(cmcState === 'not-assessed' || cmcState === 'unreadable') && port.length === 0
        ? 'Is your CMC package ready'
        : 'Is your CMC package ready across all ' + port.length + ' submissions'}
      headline={cmcState === 'unreadable'
        ? <>{board.error
            ? 'The Module 3 board'
            : sectionsUnreadable && portfolioUnreadable
              ? 'The submission portfolio and the governed §3.2 section register'
              : sectionsUnreadable
                ? 'The governed §3.2 section register'
                : 'The submission portfolio'} could not be read.</>
        : cmcState === 'loading'
          ? <>Reading your Module 3 portfolio&hellip;</>
          : port.length === 0
            ? <>No CMC submissions are in scope yet.</>
            : avgRpi != null && lowSub
              ? <>Your Module 3 averages <b>RPI {avgRpi}</b> — the <b>{lowSub.sub}</b> at {lowSub.rpi} is what's holding the portfolio back.</>
              : <>Your Module 3 spans <b>{port.length}</b> {port.length === 1 ? 'submission' : 'submissions'}{avgRpi != null ? <> at an <b>RPI {avgRpi}</b> average</> : <>, with no preparedness index computed for {port.length === 1 ? 'it' : 'any of them'} yet</>}.</>}
      body={cmcState === 'unreadable'
        ? <>This is a failed read, not an empty register. Nothing shown or omitted here should be taken as the state of your CMC package. Sign in to your tenant and retry.</>
        : cmcState === 'loading'
          ? <>Nothing is being asserted about readiness until the read settles.</>
          : port.length === 0
            ? <>Module 3 readiness is measured across an organization's submissions, and there are none recorded. Nothing about this package has been assessed. Create a submission and add its CMC sections, and its specifications, batch analyses, stability data and change control appear here.</>
            : fig.state === 'unreadable'
              ? <>This project's agency questions could not be read, so the number overdue is <b>not established</b> — treat it as unknown, not as none. {nextSec ? <>Of what did read: §{nextSec.key} ({nextSec.path}) is still in {nextSec.st}, one of {inReview.length + drafts.length} sections not yet approved.</> : null}</>
              : fig.state === 'ready' && fig.questionsOverdue
              ? <>On this project, <b>{fig.questionsOverdue} Module 3 {fig.questionsOverdue === 1 ? 'question is' : 'questions are'} overdue</b> on {fig.lettersOverdue} {fig.lettersOverdue === 1 ? 'letter' : 'letters'}{overdueSecs.length ? <> (§{overdueSecs.join(', §')})</> : null}. They are answered and approved on the letter, in Communication. {fig.lettersWithoutQuestionsOverdue ? <>{fig.lettersWithoutQuestionsOverdue} more Module 3 {fig.lettersWithoutQuestionsOverdue === 1 ? 'letter is' : 'letters are'} overdue with no question to answer recorded. </> : null}{nextSec ? <>And §{nextSec.key} ({nextSec.path}) is still in {nextSec.st}, one of {inReview.length + drafts.length} sections not yet approved.</> : null}</>
              : fig.state === 'ready' && fig.lettersWithoutQuestionsOverdue
              ? <>On this project, <b>{fig.lettersWithoutQuestionsOverdue} Module 3 {fig.lettersWithoutQuestionsOverdue === 1 ? 'letter is' : 'letters are'} overdue</b> with no question to answer recorded on {fig.lettersWithoutQuestionsOverdue === 1 ? 'it' : 'them'}. Record {fig.lettersWithoutQuestionsOverdue === 1 ? 'its' : 'their'} questions on the letter, or mark it as needing no response, in Communication. {nextSec ? <>And §{nextSec.key} ({nextSec.path}) is still in {nextSec.st}.</> : null}</>
              : secs.length === 0
                ? <>No governed CMC sections have been authored for {port.length === 1 ? 'this submission' : 'these submissions'} yet, so section approval has nothing to report.</>
                : <>{approved} of {secs.length} sections are approved{nextSec ? <>. §{nextSec.key} ({nextSec.path}) is the next one to move — clear it{lowSub ? <> and {lowSub.sub} climbs with it</> : null}</> : null}.</>}
      /* "You're building steadily" is a claim about work in progress, so it
         requires evidence that work is in progress. mayReassure gates it on the
         assessed-clear state and on a non-zero readiness percentage; every
         other state renders no reassurance rather than a softened one. */
      /* No reassurance while a question is overdue, or while anything the
         figure leaves out (letters withheld from this person, questions with
         no section, the earlier file's open rows) could be. The sentence that
         stood here promised to "route the sign-offs", which CMC cannot do: a
         response is signed on its letter. */
      reassure={!irUnknown && !m3Overdue && questionsComplete && mayReassure(cmcState, readyPct)
        ? "You're building steadily. I'll help you move the next section to approved."
        : undefined}
      action={m3Overdue
        ? { label: 'Open the overdue letters in Communication', onClick: openOverdueLetters,
            alt: { label: 'Open the Module 3 build board', onClick: () => (window as any).__cmSetTab && (window as any).__cmSetTab('build') } }
        : { label: 'Advance the next section', onClick: () => ask('Prepare §' + (nextSec ? nextSec.key : '') + ' ' + (nextSec ? nextSec.path : '') + ' for approval'),
        /* The second action goes where the section actually moves: the build
           board, which is the only surface that can compile it, show what is
           blocking it and clear the export gate. */
        alt: { label: 'Open the Module 3 build board', onClick: () => (window as any).__cmSetTab && (window as any).__cmSetTab('build') } }}
      secondary="Or work the portfolio and build state below."
    />
  );
  return (
    <div className="cm-body">
      <CmHead title="Module 3 overview" meta={`${portfolioUnreadable ? '—' : port.length} submissions — RPI ${avgRpi == null ? '—' : avgRpi} average`} ask={ask} suggest={CMC_SUGGEST.overview} />
      {board.loading ? (
        <EmptyState icon={I.beaker} title="Loading the Module 3 board…" busy testId="cmc-board-loading" />
      ) : board.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the Module 3 board"
          hint="The org-scoped CMC board didn't respond. It aggregates your regulatory submissions, preparedness index, and governed §3.2 sections — sign in and retry, or check the service is reachable."
        />
      ) : (
        <>
          {cmLead}
          {/* No KPI strip here. `cmLead` immediately above narrates the same
              numbers — submissions, RPI, sections approved — in a sentence
              that also says which one to act on. The ONE tile that stays is
              agency questions overdue, as a door: the questions behind it are
              listed on Program records, and each opens on its letter.
              Since 2026-10-19 it is per program and the server's figure (the
              letters' own overdue verdict, P-39 item 1): '—' with no program
              open or when the read failed, never 0 for "not read"; a positive
              count is a button; what it did not count is said with it. */}
          <div className="cm-kpis" style={{ gridTemplateColumns: 'minmax(150px, 320px)' }}>
            <Kpi
              l="Module 3 questions overdue on this project"
              v={irUnknown ? '—' : irOverdue}
              /* Green only for an all-clear: a zero over a partial figure, an
                 unread earlier file, or a Module 3 letter overdue with nothing
                 recorded is a plain figure, not a reassurance. */
              tone={irUnknown ? undefined : irOverdue ? 'err' : questionsComplete && !m3Overdue ? 'ok' : undefined}
              s={fig.state === 'no-program'
                ? 'counted per project; open one'
                : fig.state === 'loading'
                  ? "reading the project's letters"
                  : fig.state === 'unreadable'
                    ? 'count not established, the agency questions could not be read'
                    : [
                        fig.lettersOverdue ? `on ${fig.lettersOverdue} ${fig.lettersOverdue === 1 ? 'letter' : 'letters'}` : '',
                        fig.lettersWithoutQuestionsOverdue
                          ? `${fig.lettersWithoutQuestionsOverdue} Module 3 ${fig.lettersWithoutQuestionsOverdue === 1 ? 'letter' : 'letters'} overdue with no question to answer recorded`
                          : '',
                        fig.lettersOverdueOnOtherQuestions
                          ? `${fig.lettersOverdueOnOtherQuestions} ${fig.lettersOverdueOnOtherQuestions === 1 ? 'letter' : 'letters'} overdue on other questions, Module 3's answered`
                          : '',
                        fig.unclassifiedOutstanding
                          ? `${fig.unclassifiedOutstanding} outstanding ${fig.unclassifiedOutstanding === 1 ? 'question' : 'questions'} with no CTD section not counted`
                          : '',
                        fig.overdueLettersWithoutQuestions
                          ? `${fig.overdueLettersWithoutQuestions} overdue ${fig.overdueLettersWithoutQuestions === 1 ? 'letter' : 'letters'} with no question or section not counted`
                          : '',
                        fig.withheld ? `${fig.withheld} ${fig.withheld === 1 ? 'letter' : 'letters'} you cannot open not counted` : '',
                      ].filter(Boolean).join('; ') || undefined}
              onClick={!irUnknown && (irOverdue ?? 0) > 0
                ? () => (window as unknown as { __cmSetTab?: (id: string) => void }).__cmSetTab?.('pathway')
                : undefined}
              title={!irUnknown && (irOverdue ?? 0) > 0 ? 'Open the Module 3 agency questions, overdue first' : undefined}
            />
          </div>
          {/* The earlier file is organization-wide and its rows are on no
              letter until a person records them there: said as that, never as
              more of this program's overdue questions. A read that failed is
              said, so its silence is not taken for "nothing open". */}
          {earlierOpen ? (
            <div className="cm-meta" style={{ marginBottom: 12 }} data-testid="cmc-earlier-file-line">
              The earlier CMC question file (organization-wide, read-only) holds {earlierOpen} {earlierOpen === 1 ? 'question' : 'questions'} not
              closed there. {earlierOpen === 1 ? 'It is' : 'They are'} not in this figure, and nothing moves {earlierOpen === 1 ? 'it' : 'them'} onto a
              letter: record each one still open on its letter in Communication.
            </div>
          ) : earlierUnread ? (
            <div className="cm-meta" style={{ marginBottom: 12 }} role="note" data-testid="cmc-earlier-file-line">
              The earlier CMC question file could not be read; whether it holds open questions is not known.
            </div>
          ) : null}
          {/* Section approvals first: it is the only content on this page a
              CMC lead can act on. The portfolio and build-state cards below
              are reference material, and reference material does not go
              above the thing you came here to do. */}
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Section approvals</span><span className="s">governed — 21 CFR §11</span></div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {sectionsUnreadable ? (
                <div style={{ padding: 12 }}>
                  <EmptyState
                    tone="error"
                    icon={I.alertTriangle}
                    title="The Module 3 sections could not be read"
                    hint="This is a failed read, not an empty register: the governed §3.2 section store did not answer, so nothing here says whether this project has sections or what state they are in. Retry, or check the service is reachable."
                    testId="cmc-sections-unreadable"
                  />
                </div>
              ) : liveSections === null ? (
                <div style={{ padding: 12 }}>
                  <EmptyState icon={I.fileText} title="Open a project to see its Module 3 sections" hint="The governed §3.2.S / §3.2.P section list is per project, with each section's approval state." action={openProgramAction(nav)} />
                </div>
              ) : secs.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <EmptyState icon={I.fileText} title="No Module 3 sections yet" hint="This project has no governed §3.2 sections yet. They appear here with their approval state once created." />
                </div>
              ) : (
                /* Completeness sits beside the state because the two are
                   signed together: an approval is a claim about content that
                   was reviewed, and the compiler's record says whether the
                   content is there. Found live: 21/21 approved, three at 0%,
                   and this table showed neither the figure nor the gap. An
                   incomplete section gets no live control — the approve route
                   refuses it (409) and the export gate refuses the project. */
                <table className="reg-tbl"><thead><tr><th>Section</th><th>Path</th><th>Completeness</th><th>State</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
                <tbody>{secs.map((s) => {
                  const incomplete = sectionIncomplete(s);
                  const missing = s.missingInputs ?? [];
                  return (
                  <tr key={s.key} className={s._new ? 'de-row-new' : undefined}><td className="mono" style={{ fontWeight: 600 }}>{s.key}</td><td>{s.path}</td>
                    <td>
                      {s.completeness == null
                        ? <span className="cm-meta">not established — never scored by the compiler</span>
                        : <b className={incomplete ? 'sp-tone-warn' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>{s.completeness}%</b>}
                      {missing.length > 0 && <div className="cm-meta">missing: {missing.join(', ')}</div>}
                    </td>
                    <td>
                      <span className={'rd-chip tone-' + stTone(s.st)}>{s.st}</span>
                      {incomplete && <span className="rd-chip tone-err" style={{ marginLeft: 6 }} title={incompleteReason(s)}>incomplete</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {s.st === 'approved'
                        ? <span className="cm-meta">{I.check} approved</span>
                        : incomplete
                          ? <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <button className="nda-open" disabled title={incompleteReason(s)}>{I.lock} Approve section</button>
                              <button
                                className="cm-linkish"
                                title="Record the missing inputs and recompile on the Module 3 build board"
                                onClick={() => (window as unknown as { __cmSetTab?: (id: string) => void }).__cmSetTab?.('build')}
                              >Open the build board</button>
                            </span>
                          : <button className="nda-open" onClick={() => setReview(s)}>{I.lock} Approve section</button>}
                    </td>
                  </tr>);
                })}</tbody></table>
              )}
            </div>
            {secs.length > 0 && <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Approved Module 3 sections'} nav={nav} bar /></div>}
          </div>
          <div className="pj-card" style={{ marginBottom: 16 }}>
            <div className="pj-card-h"><span className="t">Portfolio</span><span className="s">{portfolioUnreadable ? '—' : port.length} submissions</span></div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {portfolioUnreadable ? (
                <div style={{ padding: 12 }}>
                  <EmptyState
                    tone="error"
                    icon={I.alertTriangle}
                    title="The submission portfolio could not be read"
                    hint="This is a failed read, not an empty register: the submission store did not answer, so no submission, preparedness index or overdue count shown or omitted here is established. Retry, or check the service is reachable."
                    testId="cmc-portfolio-unreadable"
                  />
                </div>
              ) : port.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <EmptyState icon={I.fileText} title="No submissions yet" hint="Your regulatory submissions (BLA / MAA / NDA / J-NDA) appear here with their preparedness index and overdue information requests." />
                </div>
              ) : (
                <table className="reg-tbl"><thead><tr><th>Submission</th><th>Product</th><th>Region</th><th>Type</th><th>Module 3</th><th>RPI</th><th>IR overdue</th></tr></thead>
                <tbody>{port.map((r, i) => (<tr key={i}><td style={{ fontWeight: 600 }}>{r.sub}</td><td>{r.product}</td><td>{r.region}</td><td><span className="reg-pill neutral">{r.type}</span></td>
                  {/* Spine rows carry the facts a CMC lead reads first: placed
                      Module 3 leaves and sequences from the REAL submission
                      core. Legacy preparedness rows honestly show none. */}
                  <td>{r.source === 'spine' ? <span className="cm-meta">{r.m3Leaves ?? 0} placed · {r.sequences ?? 0} seq</span> : <span className="cm-meta">—</span>}</td>
                  <td>{r.rpi == null ? '—' : r.rpi}</td><td>{r.ir == null ? '—' : r.ir}</td></tr>))}</tbody></table>
              )}
            </div>
          </div>
          {secs.length > 0 && (
            <div className="pj-card" style={{ marginBottom: 16 }}>
              <div className="pj-card-h"><span className="t">Module 3 build state</span><span className="s">§3.2.S — §3.2.P</span></div>
              <div className="pj-card-b">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div className="cm-projbar" style={{ flex: 1 }}><span className="fill" style={{ width: readyPct + '%', background: readyTone === 'ok' ? 'var(--success)' : readyTone === 'warn' ? 'var(--accent-100)' : 'var(--warning)' }} /></div>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }} title="Sections approved">{readyPct}% approved</b>
                  {readiness.loading ? (
                    <span className="rd-chip tone-dim" role="status">Evaluating export readiness…</span>
                  ) : readiness.error || !readiness.data ? (
                    <span className="rd-chip tone-err" role="alert" title={readiness.error || 'no readiness verdict was returned'}>Export readiness could not be read</span>
                  ) : readiness.data.exportReady ? (
                    <span className="rd-chip tone-ok">Export ready</span>
                  ) : (
                    <span className="rd-chip tone-warn" title={readinessReasons.join('; ')}>Not export ready</span>
                  )}
                </div>
                <div className="cm-meta">
                  {approved} of {secs.length} sections approved — {drafts.length} draft
                  {!readiness.loading && readiness.data && !readiness.data.exportReady && readinessReasons.length > 0
                    ? <> — export blocked: {readinessReasons.join('; ')}</>
                    : null}
                  {!readiness.loading && (readiness.error || !readiness.data)
                    ? <> — the export gate's verdict could not be read, so readiness is not established; this is a failed read, not a pass.</>
                    : null}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {review && (
        <CmcSectionReview
          projectId={ctxProjectId || ''}
          section={review}
          onCancel={() => setReview(null)}
          onSign={(compiledHash) => { setSignHash(compiledHash); setSign(review); setReview(null); }}
        />
      )}
      {sign && <C2CForm config={signForm('Section ' + sign.key + ' — ' + sign.path)} onCancel={() => setSign(null)} onSubmit={doSign} />}      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Specifications — create / edit / approve ═══════════ */

/** Extract an honest error string from a failed CMC write response. */
function specErr(json: unknown, status: number): string {
  const j = json as { details?: Array<{ message?: string }> } | null;
  // A named field beats any generic sentence, so the zod detail stays first.
  const detail = j?.details?.[0]?.message;
  if (typeof detail === 'string' && detail.trim()) return detail;
  // `j?.error` used to lead, which rendered the enum instead of the sentence.
  return serverMessage(json) ?? `The server did not accept the change (HTTP ${status}).`;
}

/* ── Agency-question signpost — outstanding questions citing THIS tab's work ──
   The record of truth is the letter, in Communication; Program records lists
   the program's Module 3 questions. This bar is an extra signpost rendered
   only when an outstanding question (not answered as it stands, on a letter
   not closed) cites a section this tab owns, matched on whole CTD segments
   (3.2.S.2 is not 3.2.S.20). It asserts presence, never absence: with no
   program, or a read that failed, it stays silent and Program records says
   why. Its door opens the most urgent question on its letter. */
function CmCorrNotice({ prefixes, noun, nav }: { prefixes: string[]; noun: string; nav?: (id: string) => void }) {
  /* "Outstanding" is the server's flag on each question. When the server
     listed a page of the program's questions, these rows are a lower bound,
     and the count says "at least". */
  const { rows, partial } = outstandingAt(useCmcQuestions(), prefixes);
  if (rows.length === 0) return null;
  const overdue = rows.filter((q) => q.overdue).length;
  const first = rows[0];
  return (
    <div className={'pj-con' + (overdue ? '' : ' is-ok')} style={{ marginBottom: 12 }} data-testid="cmc-corr-notice">
      <span className="ico">{overdue ? I.alertTriangle : I.globe}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="pj-con-t">
            {partial ? 'At least ' : ''}{rows.length} outstanding agency {rows.length === 1 ? 'question references' : 'questions reference'} {noun}
            {overdue ? ` — ${overdue} overdue` : ''}
          </div>
          <div className="pj-con-d">§{first.section} · {first.questionText.slice(0, 90)}{first.questionText.length > 90 ? '…' : ''}</div>
        </div>
        {nav ? (
          <button className="nda-open" onClick={() => openLetterInCommunication(nav, first.letter.id, first.id)}>
            {I.scroll} Open its letter in Communication
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The save toast; an edit of an approved specification withdrew its approval. */
function specSavedToast(json: unknown, attr: string): string {
  const withdrawn = (json as { approvalWithdrawn?: boolean } | null)?.approvalWithdrawn === true;
  return 'Specification saved · ' + attr + (withdrawn ? ' · approval withdrawn: approve it again before it is filed.' : '');
}

function CmSpecs({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  /* REAL slice: the specifications workbench is bound to the governed
     quality_specifications table (server/api/cmc/specificationRoutes.ts,
     mounted at /api/cmc/specifications). Reads GET /:projectId, creates via
     POST /, edits via the ungoverned PUT /:id, and approves ONLY through the
     governed POST /:id/approve endpoint (§11 re-authentication + hash-chained
     recordGovernedAction). The jsonb ↔ display-column shape gap is crossed by
     the reversible, unit-tested mapping in ./cmcSpec. Specifications are
     per-project, so the surface needs a project in context (window.C2C_PROJECT,
     the same source the board uses); without one it renders an honest prompt,
     never a fixture, and no write is fabricated on failure. */
  const projectId = cmcProjectUuid();
  const live = useLiveRows<QualitySpecApiRow>(
    projectId ? '/api/cmc/specifications/' + encodeURIComponent(projectId) : null,
  );
  const mapped = React.useMemo<CmcSpecRow[]>(
    () => (live.loading || live.error ? [] : specRowsFromApi(live.rows)),
    [live.loading, live.error, live.rows],
  );
  const [rows, setRows] = useState<CmcSpecRow[]>([]);
  // Seed the optimistic store once the live specifications file resolves;
  // `mapped` is a stable reference while loading/errored, so this only fires on
  // a real resolution and never thrashes user-added optimistic rows.
  const seededRef = React.useRef<CmcSpecRow[] | null>(null);
  useEffect(() => {
    if (mapped !== seededRef.current) {
      seededRef.current = mapped;
      setRows(mapped);
    }
  }, [mapped]);
  const [edit, setEdit] = useState<CmcSpecRow | 'new' | null>(null);
  const [sign, setSign] = useState<CmcSpecRow | null>(null);
  /* One specification's recorded changes, open at a time — the same panel the
     other sixteen registers use, over this register's own revision log. */
  const [historyFor, setHistoryFor] = useState<{ id: string | number; subject: string } | null>(null);
  const [toast, fireToast] = useToast();
  const stTone = (s: string) => s === 'approved' ? 'ok' : s === 'review' ? 'warn' : s === 'reject' ? 'err' : 'dim';
  const FORM = (row: CmcSpecRow | null): C2CFormConfig => ({
    eyebrow: 'CMC — 3.2.S.4.1', title: row ? 'Edit specification' : 'New specification', sub: 'Release and shelf-life limits for a drug substance or drug product',
    submitLabel: row ? 'Save changes' : 'Create specification', fields: [
      { key: 'attr', label: 'Quality attribute', type: 'text', required: true, default: row ? row.attr : '', placeholder: 'e.g. Charge variants' },
      { key: 'material', label: 'Material', type: 'select', options: ['Drug substance', 'Drug product'], required: true, default: row ? row.material : 'Drug substance', half: true },
      { key: 'method', label: 'Analytical method', type: 'text', default: row ? row.method : '', placeholder: 'e.g. SE-HPLC', half: true },
      { key: 'release', label: 'Release limit', type: 'text', default: row ? row.release : '', placeholder: 'e.g. <= 2.0%', half: true },
      { key: 'shelf', label: 'Shelf-life limit', type: 'text', default: row ? row.shelf : '', placeholder: 'e.g. <= 3.0%', half: true },
      { key: 'ich', label: 'ICH reference', type: 'text', default: row ? row.ich : 'ICH Q6B', half: true },
      { key: 'st', label: 'Status', type: 'seg', options: ['draft', 'review'], default: row && row.st !== 'approved' ? row.st : 'draft', half: true },
      { key: 'justification', label: 'Justification', type: 'textarea', placeholder: 'Rationale for the limits and method' },
      /* An approved specification is revised in place: the server withdraws
         the approval and records why (services/cmc/signed-record.ts). */
      ...(row?.st === 'approved'
        ? [{ key: 'reason', label: 'Reason for change', type: 'textarea' as const, required: true, desc: `At least ${GOVERNED_REASON_MIN} characters.`, placeholder: 'What changed and why — the trend reviewed, the method revised, the agency comment answered…' }]
        : []),
    ],
    ...(row?.st === 'approved'
      ? { governed: 'This specification is approved. Saving a change withdraws the approval: it returns to draft and must be approved again before it is filed. Your name, the time and the reason are recorded.' }
      : {}),
  });
  // save — REAL, awaited write. POST creates / PUT updates against the governed
  // specifications file and adopts the SERVER's row (real id + persisted values).
  // Nothing is added on failure; the success toast fires only after the write is
  // confirmed. approval_status is never sent here — approval is governed-only.
  const save = async (v: Record<string, string>) => {
    if ((!edit || edit === 'new') && !projectId) {
      fireToast('Open a project first — specifications are recorded per project.', 'error');
      return;
    }
    try {
      if (edit && edit !== 'new') {
        const id = edit.id;
        const res = await apiRequest('PUT', '/api/cmc/specifications/' + id, specUpdateBody(v));
        const json = await res.json().catch(() => null);
      if (res.ok) reportCmcLinkage(json, 'CMC record');
        if (!res.ok) { fireToast('Couldn’t save the specification — ' + specErr(json, res.status) + '. Nothing was persisted.', 'error'); return; }
        const adopted = specRowsFromApi([(json as { data?: QualitySpecApiRow })?.data].filter(Boolean) as QualitySpecApiRow[])[0];
        setRows((rs) => rs.map((x) => x.id === id ? { ...(adopted ?? x), _new: true } : x));
        fireToast(specSavedToast(json, adopted?.attr ?? v.attr));
      } else {
        const res = await apiRequest('POST', '/api/cmc/specifications', specCreateBody(v, projectId));
        const json = await res.json().catch(() => null);
      if (res.ok) reportCmcLinkage(json, 'CMC record');
        if (!res.ok) { fireToast('Couldn’t create the specification — ' + specErr(json, res.status) + '. Nothing was saved.', 'error'); return; }
        const adopted = specRowsFromApi([(json as { data?: QualitySpecApiRow })?.data].filter(Boolean) as QualitySpecApiRow[])[0];
        if (!adopted) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
        setRows((rs) => [{ ...adopted, _new: true }, ...rs.filter((r) => r.id !== adopted.id)]);
        fireToast('Specification created · ' + adopted.attr + ' · ' + adopted.st);
      }
      setEdit(null);
    } catch (e) {
      fireToast('Couldn’t save the specification — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };
  // doSign — REAL governed approval. POSTs to the ONLY approval path
  // (/:id/approve), which re-authenticates (password + TOTP) and records a
  // hash-chained governed action before flipping approval_status. Adopts the
  // server's approved row; a failed re-auth (401) is surfaced honestly and the
  // specification stays unapproved. No local "approved" flip is fabricated.
  const doSign = async (v: Record<string, string>) => {
    if (!sign) return;
    const target = sign;
    try {
      const res = await apiRequest('POST', '/api/cmc/specifications/' + target.id + '/approve', {
        reason: v.reason,
        meaning: v.meaning,
        reauth: { password: v.password, totp: v.totp || undefined },
      });
      const json = await res.json().catch(() => null);
      if (res.ok) reportCmcLinkage(json, 'CMC record');
      if (res.status === 401) { fireToast('Approval not signed — re-authentication failed. The specification was not approved.', 'error'); return; }
      if (!res.ok) { fireToast('Couldn’t approve the specification — ' + specErr(json, res.status) + '. Nothing was persisted.', 'error'); return; }
      const adopted = specRowsFromApi([(json as { data?: QualitySpecApiRow })?.data].filter(Boolean) as QualitySpecApiRow[])[0];
      setRows((rs) => rs.map((x) => x.id === target.id ? { ...(adopted ?? { ...x, st: 'approved' }), _new: true } : x));
      const chain = (json as { governance?: { sha256Chain?: string } })?.governance?.sha256Chain;
      fireToast('Specification "' + target.attr + '" approved and signed' + (chain ? ' · ' + String(chain).slice(0, 12) + '…' : '') + '.');
      setSign(null);
    } catch (e) {
      fireToast('Couldn’t approve the specification — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };
  const noMethodCount = rows.filter((r) => r.noMethod).length;
  return (
    <div className="cm-body">
      <CmHead title="Specifications" meta="Release and shelf-life limits — drug substance and drug product" ask={ask} suggest={CMC_SUGGEST.specs}
        actions={<button className="nda-open" onClick={() => setEdit('new')} disabled={!projectId} title={!projectId ? 'Open a project to record specifications' : ''}>{I.plus} New specification</button>} />
      <CmCorrNotice prefixes={['3.2.S.4', '3.2.P.5']} noun="these specifications" nav={nav} />
      {noMethodCount > 0 && <div className="pj-con" style={{ marginBottom: 14 }}><span className="ico">{I.alertTriangle}</span><div><div className="pj-con-t">{noMethodCount} specification without a validated method</div><div className="pj-con-d">A specification cannot be approved until its analytical method is validated (ICH Q2). Add the method, or ask AnA to draft the validation justification.</div></div></div>}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Specification table</span><span className="s">{rows.length} attributes</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div style={{ padding: 12 }}>
              {!projectId ? (
                <EmptyState icon={I.clipboardList} title="Open a project to manage its specifications" hint="Release and shelf-life limits are recorded per project in the governed specifications file (§3.2.S.4.1 / §3.2.P.5.1). Open a project, then create or review its specifications here." action={openProgramAction(nav)} />
              ) : live.loading ? (
                <EmptyState icon={I.clipboardList} title="Loading specifications…" busy />
              ) : live.error ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load specifications" hint="The governed specifications file didn’t respond. Sign in to your tenant and retry." />
              ) : (
                <EmptyState icon={I.clipboardList} title="No specifications yet" hint="Release and shelf-life limits for your drug substance and drug product appear here. Use New specification to record the first one — it is persisted to the governed specifications file." />
              )}
            </div>
          ) : (
            <table className="reg-tbl"><thead><tr><th>Attribute</th><th>Material</th><th>Method</th><th>Release</th><th>Shelf life</th><th>ICH</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className={r._new ? 'de-row-new' : undefined}>
                <td style={{ fontWeight: 600 }}>{r.attr}</td><td>{r.material}</td>
                <td>{r.method || <span className="sp-tone-warn">no method</span>}</td>
                <td>{r.release || '--'}</td><td>{r.shelf || '--'}</td><td className="mono">{r.ich}</td>
                <td><span className={'rd-chip tone-' + stTone(r.st)}>{r.st}</span></td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="nda-open" onClick={() => setEdit(r)}>{I.penLine} Edit</button>
                  {r.st !== 'approved' && <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => setSign(r)} disabled={r.noMethod} title={r.noMethod ? 'Validate the method before approval' : ''}>{I.lock} Approve</button>}
                  {/* The limits an inspector asks about first were the one
                      register whose changes could not be read in the product:
                      the route existed and nothing called it. */}
                  <button
                    className="nda-open"
                    style={{ marginLeft: 6 }}
                    onClick={() => setHistoryFor(historyFor?.id === r.id ? null : { id: r.id, subject: `${r.attr} — ${r.material}` })}
                    title="Every recorded change to this specification, with both values"
                  >
                    {I.history} History
                  </button>
                </td>
              </tr>))}</tbody></table>
          )}
        </div>
        {rows.length > 0 && <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Approved specifications -> §3.2.S.4.1'} nav={nav} bar /></div>}
      </div>
      {historyFor && (
        <RecordHistoryPanel
          registerPath="specifications"
          recordId={historyFor.id}
          subject={historyFor.subject}
          onClose={() => setHistoryFor(null)}
        />
      )}
      {/* specification (the limit) -> method (how it is measured) -> QC test
          (the measurement actually performed against it) -> reference standard
          (what the measurement is reported against). */}
      <CmMethodLibrary />
      <CmQcTesting />
      <CmReferenceStandards />
      {/* The impurity file and the dissolution profile are both specification
          content: §3.2.S.3.2 / §3.2.P.5.5 set the impurity limits a release
          test is judged against, and §3.2.P.5 carries the dissolution
          criterion. */}
      <CmImpurityProfiles />
      <CmDissolutionProfiles />
      {edit && <C2CForm config={FORM(edit === 'new' ? null : edit)} onCancel={() => setEdit(null)} onSubmit={save} />}
      {sign && <C2CForm config={signForm(sign.attr + ' — ' + sign.material)} onCancel={() => setSign(null)} onSubmit={doSign} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Stability -- study register, pull-point results, shelf life ═══════════ */

/* ── Stability study (org-scoped GET /api/cmc/stability-studies -> { success, data }) ──
   useLiveRows unwraps the { success, data } envelope, so each row is the display
   object directly. This is the REAL, org-scoped stability register
   (shared/schema.ts stabilityStudies).

   ── What changed here ────────────────────────────────────────────────────────
   The register was read-only and the GET projected six columns, so the surface
   could describe a study and never its data — and the ICH Q1E shelf-life panel
   said, correctly, that it had no per-timepoint series to project from. It had
   none because nothing in the product could record one: `stability_data`,
   `time_points`, `test_parameters` and `shelf_life` are columns on this table
   that no screen ever wrote, and `start_date` (NOT NULL) could not cross the
   JSON boundary at all until the route learned to coerce an ISO string.

   So the series is now entered where the study lives: register a study with its
   pull schedule, record each pull-point result against it, and close it out with
   the shelf life the data support. The projection panel reports what is
   RECORDED — the measured series and how it sits against its acceptance
   criteria — and still refuses to extrapolate a shelf life the studies do not
   yet justify. An ICH Q1E regression over three primary batches is a statistical
   claim about a submission; it is not something to infer from one study's
   points, and a shelf-life number invented here would be the single most
   dangerous fabricated value in the product. */
interface StabilityStudyApiRow {
  id: number;
  studyTitle: string | null;
  productName: string;
  batchNumber?: string | null;
  strength?: string | null;
  scope?: string | null;
  climaticZone?: string | null;
  studyType: string | null;
  storageConditions: string[] | null;
  duration: number | null;
  testParameters?: string[] | null;
  timePoints?: string[] | null;
  stabilityData?: unknown;
  shelfLife?: string | null;
  notes?: string | null;
  status: string | null;
  startDate?: string | null;
  plannedEndDate?: string | null;
}

const STAB_STORAGE_LABEL: Record<string, string> = {
  LT: 'Long-term', ACC: 'Accelerated', INT: 'Intermediate', REF: 'Refrigerated', STR: 'Stress',
};
function stabStorage(codes: string[] | null): string {
  if (!Array.isArray(codes) || codes.length === 0) return '--';
  return codes.map((c) => STAB_STORAGE_LABEL[c] || c).join(', ');
}
function stabStatusTone(s: string | null): string {
  const v = String(s || '').toUpperCase();
  if (v === 'ACTIVE' || v === 'COMPLETED') return 'ok';
  if (v === 'PAUSED' || v === 'ON-HOLD') return 'warn';
  if (v === 'CANCELLED') return 'err';
  return 'dim';
}

/** The condition string a study was placed at, for labelling its results. */
function stabConditionText(codes: string[] | null | undefined): string | undefined {
  if (!Array.isArray(codes)) return undefined;
  const named = codes.find((c) => !STAB_STORAGE_LABEL[c]);
  return named || (codes[0] ? STAB_STORAGE_LABEL[codes[0]] : undefined);
}

/* ── ICH Q1E estimate (POST /api/cmc/stability-studies/:id/shelf-life) ──
   The estimator itself is `services/cmc/shelf-life.ts`: an ordinary
   least-squares fit of the attribute against time, solved to where the
   one-sided 95% confidence limit meets the specification limit. It is
   deterministic and tested, and it had no HTTP route in the CMC family until
   now — so the single calculation a stability programme exists to produce could
   not be reached from the product.

   Every field below can say "not estimable, and here is why": a parameter with
   too few numeric points, or with no recorded acceptance criterion for the
   confidence bound to intersect, is reported as such rather than dropped or
   given a default limit. */
interface Q1eEstimate {
  parameter: string;
  estimable: boolean;
  reason?: string;
  shelfLife?: number;
  specLimit?: number;
  direction?: 'increasing' | 'decreasing';
  pointsUsed?: number;
  pointsRecorded?: number;
  pointsUsable?: number;
  exceedsEvaluatedRange?: boolean;
  regression?: { slope: number; intercept: number; r2: number; residualSd: number; n: number; df: number };
  notes?: string[];
}
/**
 * `POST /api/cmc/stability-studies/:id/trending` — out-of-trend results, the
 * fitted slope and the projected crossing of the recorded criterion, per
 * attribute and storage condition.
 *
 * ── Why this is here now (2026-10-25) ───────────────────────────────────────
 * The engine (`services/cmc/stability-trending.ts`) and the route were written
 * and had NO caller in the product, while THIS tab's own AnA starter has said
 * "Show every study trending toward a limit" the whole time: the question was
 * offered, the deterministic answer existed, and the only way to it was chat
 * (`assess_recorded_stability_trend`). Measured by a reachability sweep over
 * all 99 CMC routes against every client source file.
 *
 * Every figure and every refusal below is the server's. A series the engine
 * would not fit is shown WITH its reason, never omitted — a trend table that
 * silently drops the attributes it could not judge reads as a study with no
 * drift in them.
 */
export interface TrendSeriesRow {
  parameter: string;
  condition: string;
  pointsRecorded: number;
  pointsUsable: number;
  criterionRecordedAs: string | null;
  outcome:
    | { ok: false; reason: string; detail: string; pointsUsable: number }
    | {
        ok: true; method: string; alpha: number; pointsUsed: number; distinctTimePoints: number;
        evaluated: number; observedPeriod: number;
        outOfTrend: Array<{ time: number; value: number; predicted: number; interval: { lower: number; upper: number } }>;
        slope: { estimate: number; ci: [number, number]; significant: boolean };
        projection: { bound: 'lower' | 'upper'; limit: number; time: number } | null;
      };
}
/**
 * What a fitted series may be said to be doing.
 *
 * The SAME three branches `stabilityTrendSentence` uses to write §3.2.S.7
 * (`server/services/module3Composer.ts`): a slope whose confidence interval
 * includes zero establishes NO trend, whatever the projection arithmetic says,
 * and the projection is only a statement about the limit when the slope is
 * significantly non-zero.
 *
 * Written down here because the first version of this panel showed "heading
 * toward: upper limit 1 at 23.37 mo" for a series the engine had measured as
 * `significant: false` — the screen telling a CMC lead the opposite of what the
 * dossier text, over the same engine output, would say about the same study.
 * A projection is arithmetic; whether it means anything is a statistical
 * question, and only one of the two is a claim the product may make.
 */
export function trendClaim(o: TrendSeriesRow['outcome']): { tone: 'warn' | 'dim'; text: string } {
  if (!o.ok) return { tone: 'dim', text: '--' };
  if (!o.slope.significant) {
    return { tone: 'dim', text: 'no trend established (slope not significant)' };
  }
  if (!o.projection) return { tone: 'dim', text: 'heads away from the limit' };
  return {
    tone: 'warn',
    text: `${o.projection.bound} limit ${o.projection.limit} at ${o.projection.time} mo`,
  };
}

/** A series whose trend toward its limit IS established. The figure the panel
 *  reports and the toast counts are the same one, by construction. */
export function headingToward(report: TrendReport): TrendSeriesRow[] {
  return report.series.filter((x) => trendClaim(x.outcome).tone === 'warn');
}

export interface TrendReport {
  studyId: number | string;
  basis: string;
  alpha: number;
  unassignedObservations: Array<{ parameter?: string; detail?: string }>;
  series: TrendSeriesRow[];
}

interface Q1eReport {
  basis: string;
  scopeLimit: string;
  maxTimeEvaluated: number;
  limitingParameter: string | null;
  supportedShelfLife: number | null;
  estimates: Q1eEstimate[];
}

/* ── Batch poolability (POST /api/cmc/stability-studies/poolability) ──
   The question a single-study fit cannot answer: may these batches be combined
   into ONE registered shelf life, or must the claim fall back to the shortest?
   ICH Q1E answers it with two sequential ANCOVA F-tests at α = 0.25 — equality
   of slopes, then, only if that passes, equality of intercepts.

   The engine (`services/cmc/shelf-life-poolability.ts`) was reachable only as
   an AnA tool taking hand-typed numbers, so the decision could not be run
   against the studies of record.

   Like the single-study fit, every field can say "not assessable, and why":
   batches that disagree on the acceptance criterion, an attribute only one
   batch recorded, a batch with too few numeric points. Each is named. */
interface AncovaTest {
  f: number;
  pValue: number;
  poolable: boolean;
  dfNumerator: number;
  dfDenominator: number;
}
interface PoolAssessment {
  parameter: string;
  assessable: boolean;
  reason?: string;
  specLimit?: number;
  direction?: 'increasing' | 'decreasing';
  contributingBatches?: string[];
  excludedBatches?: Array<{ batchId: string; reason: string }>;
  conflictingCriteria?: Array<{ batchId: string; limit: number; direction: string }>;
  slopeTest?: AncovaTest;
  interceptTest?: AncovaTest | null;
  poolable?: boolean;
  decision?: 'pooled' | 'minimum-of-batches';
  shelfLife?: number;
  perBatchShelfLives?: Array<{ batchId: string; shelfLife: number; exceedsEvaluatedRange: boolean }>;
  pooledShelfLife?: number | null;
  notes?: string[];
}
interface PoolReport {
  basis: string;
  scopeLimit: string;
  storageCondition: string | null;
  batches: string[];
  limitingParameter: string | null;
  supportedShelfLife: number | null;
  limitingDecision: string | null;
  assessments: PoolAssessment[];
}

/** An F-test rendered as what it decided, with the statistic kept visible. */
function AncovaCell({ test }: { test: AncovaTest | null | undefined }) {
  if (!test) return <span className="cm-meta">not reached</span>;
  return (
    <>
      <span className={'rd-chip tone-' + (test.poolable ? 'ok' : 'err')}>
        {test.poolable ? 'equal' : 'differ'}
      </span>
      <div className="cm-meta">
        F({test.dfNumerator},{test.dfDenominator}) = {test.f} · p = {test.pValue}
      </div>
    </>
  );
}

/** Sort pull points numerically — '12' must follow '9', not precede it. */
function byTimePoint(a: StabilityResult, b: StabilityResult): number {
  const na = parseFloat(a.timePoint);
  const nb = parseFloat(b.timePoint);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a.timePoint).localeCompare(String(b.timePoint));
}

function CmStability({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const projectId = cmcProjectUuid();
  const live = useLiveRows<StabilityStudyApiRow>('/api/cmc/stability-studies');
  const [rows, setRows] = useState<StabilityStudyApiRow[]>([]);
  const seededRef = useRef<StabilityStudyApiRow[] | null>(null);
  useEffect(() => {
    if (live.loading || live.error) return;
    if (live.rows !== seededRef.current) {
      seededRef.current = live.rows;
      setRows(live.rows);
    }
  }, [live.loading, live.error, live.rows]);

  const [registering, setRegistering] = useState(false);
  const [recording, setRecording] = useState<StabilityStudyApiRow | null>(null);
  /* The study's §11.10(e) change history — who recorded it, who changed it and
     what each change moved (URS-CMC-026). This register is not a RegisterCard,
     so it needs its own action; a register whose edits are recorded and never
     shown is the half of §11.10(e) an inspector reads for a changed record. */
  const [historyFor, setHistoryFor] = useState<StabilityStudyApiRow | null>(null);
  const [closing, setClosing] = useState<StabilityStudyApiRow | null>(null);
  /* ICH Q1E estimates, keyed by study. Held per study rather than globally
     because the estimate belongs to the batch and condition it was fitted from —
     a shelf life is not a property of the programme. */
  const [q1e, setQ1e] = useState<Record<number, Q1eReport>>({});
  /* One trend report per study, keyed by study id — the same shape the Q1E fit
     beside it uses, so a study can carry both and neither replaces the other. */
  const [trend, setTrend] = useState<Record<number, TrendReport>>({});
  const [trending, setTrending] = useState<number | null>(null);
  const [estimating, setEstimating] = useState<number | null>(null);
  /* Poolability is a property of a SET of batches, so unlike the per-study fit
     there is one selection and one result at a time. */
  const [poolPick, setPoolPick] = useState<number[]>([]);
  const [pool, setPool] = useState<PoolReport | null>(null);
  const [pooling, setPooling] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [toast, fireToast] = useToast();
  const { user } = useAuth();
  const recordedBy = user?.displayName || user?.email || undefined;

  const active = rows.filter((r) => String(r.status || '').toUpperCase() === 'ACTIVE').length;

  /* Every recorded result across the programme, and the ones that fell outside
     their acceptance criteria — the number a stability coordinator is actually
     tracking, computed from the recorded series and nothing else. */
  const allResults = rows.flatMap((r) => readStabilityResults(r.stabilityData));
  const oos = allResults.filter((r) => !r.withinSpecification);

  /** Adopt the server's row after a write; never the values that were typed. */
  const adopt = (json: unknown): StabilityStudyApiRow | null => {
    const row = (json as { data?: StabilityStudyApiRow } | null)?.data;
    return row && typeof row === 'object' ? row : null;
  };

  const registerStudy = async (v: Record<string, string>) => {
    try {
      const res = await apiRequest('POST', '/api/cmc/stability-studies', stabilityBody(v, projectId));
      const json = await res.json().catch(() => null);
      if (res.ok) reportCmcLinkage(json, 'CMC record');
      if (!res.ok) { fireToast(cmcWriteFailed('stability study', json, res.status), 'error'); return; }
      const row = adopt(json);
      if (!row) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
      setRows((rs) => [row, ...rs]);
      setRegistering(false);
      fireToast(`Study registered · ${row.studyTitle || row.productName} · batch ${row.batchNumber || '--'}.`);
    } catch (e) {
      fireToast(cmcWriteThrew('stability study', e), 'error');
    }
  };

  const recordResult = async (v: Record<string, string>) => {
    if (!recording) return;
    const study = recording;
    try {
      // The existing series is read from the study and the new point appended,
      // so a pull recorded today never overwrites the pulls before it.
      const body = stabilityResultBody(v, study.stabilityData, {
        condition: stabConditionText(study.storageConditions),
        recordedBy,
      });
      const res = await apiRequest('PUT', '/api/cmc/stability-studies/' + study.id, {
        ...body,
        ...(projectId ? { projectId } : {}),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) reportCmcLinkage(json, 'CMC record');
      if (!res.ok) { fireToast(cmcWriteFailed('stability result', json, res.status), 'error'); return; }
      const row = adopt(json);
      if (!row) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
      setRows((rs) => rs.map((r) => (r.id === study.id ? row : r)));
      setRecording(null);
      setExpanded(study.id);
      const within = v.withinSpecification !== 'no';
      fireToast(
        `${v.parameter} at ${v.timePoint} months recorded: ${v.result}` +
          (within ? '.' : ' — OUTSIDE the acceptance criteria. Raise this through your OOS procedure.'),
      );
    } catch (e) {
      fireToast(cmcWriteThrew('stability result', e), 'error');
    }
  };

  /**
   * Run the ICH Q1E fit over what this study has actually recorded.
   *
   * The result is EVIDENCE, not a claim: it is never written to the study's
   * `shelf_life` column. That column holds the shelf life the organisation
   * claims, which is a regulatory decision a person makes on the close-out form
   * after reading this.
   */
  const estimateQ1e = async (study: StabilityStudyApiRow) => {
    if (estimating != null) return;
    setEstimating(study.id);
    try {
      const res = await apiRequest('POST', '/api/cmc/stability-studies/' + study.id + '/shelf-life', {});
      const json = await res.json().catch(() => null);
      if (res.ok) reportCmcLinkage(json, 'CMC record');
      if (!res.ok) {
        fireToast(cmcWriteError(json, res.status), 'error');
        return;
      }
      const report = (json as { data?: Q1eReport })?.data;
      if (!report) { fireToast('The estimate returned an unexpected shape — reload and retry.', 'error'); return; }
      setQ1e((m) => ({ ...m, [study.id]: report }));
      const notEstimable = report.estimates.filter((e) => !e.estimable).length;
      fireToast(
        report.supportedShelfLife != null
          ? `Q1E: ${report.supportedShelfLife} months supported, limited by ${report.limitingParameter}` +
            (notEstimable ? ` · ${notEstimable} parameter${notEstimable === 1 ? '' : 's'} not estimable` : '') + '.'
          : 'Q1E could not estimate any parameter on this study — see the reason against each below.',
        report.supportedShelfLife != null ? 'ok' : 'error',
      );
    } catch (e) {
      fireToast(cmcAssessmentThrew('estimate the shelf life', e), 'error');
    } finally {
      setEstimating(null);
    }
  };

  /**
   * Assess this study's recorded series for drift.
   *
   * EVIDENCE, not a verdict on the study: an out-of-trend point is a signal to
   * investigate, and a projected crossing says where the fitted line meets the
   * limit IF the trend continues. Neither sets a shelf life — the close-out
   * does, under signature — and the panel says so rather than letting a
   * projection read as a claim.
   */
  const assessTrending = async (study: StabilityStudyApiRow) => {
    if (trending != null) return;
    setTrending(study.id);
    try {
      const res = await apiRequest('POST', '/api/cmc/stability-studies/' + study.id + '/trending', {});
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        /* A 409 is the engine refusing the WHOLE study for a stated reason (no
           usable series at all). Shown as that reason, never as "no drift". */
        fireToast(cmcWriteError(json, res.status), 'error');
        return;
      }
      const report = (json as { data?: TrendReport })?.data;
      if (!report || !Array.isArray(report.series)) {
        fireToast('The trend assessment returned an unexpected shape — reload and retry.', 'error');
        return;
      }
      setTrend((m) => ({ ...m, [study.id]: report }));
      const heading = headingToward(report).length;
      const oot = report.series.reduce((n, x) => n + (x.outcome.ok ? x.outcome.outOfTrend.length : 0), 0);
      const notAssessed = report.series.filter((x) => !x.outcome.ok).length;
      const assessed = report.series.length - notAssessed;
      fireToast(
        /* Three cases, not two. A study whose results open NO series at all is
           not "0 series could not be assessed, see the reason against each of
           the 0 below" — there is nothing below, and pointing a reader at an
           empty table is how an unanswered question reads as an answered one. */
        report.series.length === 0
          ? 'This study’s recorded results open no attribute/condition series, so nothing was assessed for drift. ' +
            'A series needs results recorded against the same parameter at the same storage condition.'
          : assessed === 0
            ? `No series on this study could be assessed — see the reason against each of the ${notAssessed} below.`
            : `${assessed} series assessed · ${oot} out-of-trend result(s) · ${heading} heading toward a limit` +
              (notAssessed ? ` · ${notAssessed} not assessed` : '') + '.',
        report.series.length === 0 || assessed === 0 || oot > 0 || heading > 0 ? 'error' : 'ok',
      );
    } catch (e) {
      fireToast(cmcAssessmentThrew('assess the stability trend', e), 'error');
    } finally {
      setTrending(null);
    }
  };

  /**
   * Run the ICH Q1E combinability test across the selected batches.
   *
   * Like the single-study fit this is EVIDENCE. A "pooled" verdict does not set
   * a shelf life; it establishes that one figure may be claimed for all the
   * batches rather than the shortest. The claim is still made on the close-out.
   *
   * The server owns every eligibility rule (one product, one storage condition,
   * distinct batches) and returns the reason it refused. Those rules are not
   * re-implemented here — a client copy would drift, and the copy that drifts
   * is the one that lets an invalid assessment through.
   */
  const assessPoolability = async () => {
    if (pooling || poolPick.length < 2) return;
    setPooling(true);
    try {
      const res = await apiRequest('POST', '/api/cmc/stability-studies/poolability', {
        studyIds: poolPick,
      });
      const json = await res.json().catch(() => null);
      if (res.ok) reportCmcLinkage(json, 'CMC record');
      if (!res.ok) {
        setPool(null);
        fireToast(cmcWriteError(json, res.status), 'error');
        return;
      }
      const report = (json as { data?: PoolReport })?.data;
      if (!report) { fireToast('The assessment returned an unexpected shape — reload and retry.', 'error'); return; }
      setPool(report);
      const notAssessable = report.assessments.filter((a) => !a.assessable).length;
      fireToast(
        report.supportedShelfLife != null
          ? `${report.limitingDecision === 'pooled' ? 'Batches are combinable' : 'Batches are not combinable'} — ${report.supportedShelfLife} months supported, limited by ${report.limitingParameter}` +
            (notAssessable ? ` · ${notAssessable} attribute${notAssessable === 1 ? '' : 's'} not assessable` : '') + '.'
          : 'No attribute could be assessed across these batches — see the reason against each below.',
        report.supportedShelfLife != null ? 'ok' : 'error',
      );
    } catch (e) {
      fireToast(cmcAssessmentThrew('assess batch poolability', e), 'error');
    } finally {
      setPooling(false);
    }
  };

  /**
   * The close-out, in the two acts the server governs it as: the shelf life and
   * its basis recorded by an ordinary (audited) edit, then the terminal status
   * under a 21 CFR Part 11 signature.
   *
   * Sending them as one PUT is what this surface did until 2026-10-19, and the
   * server took it — the shelf-life claim §3.2.S.7.1 prints was recorded with
   * no signature at all.
   *
   * If the edit lands and the signature does not, the shelf life is recorded
   * and the study is still running. That is recoverable and it is what
   * happened, so the toast says exactly that rather than reporting a close-out
   * that did not occur.
   */
  const closeOut = async (v: Record<string, string>) => {
    if (!closing) return;
    const study = closing;
    try {
      const recorded = await apiRequest('PUT', '/api/cmc/stability-studies/' + study.id, {
        ...stabilityCloseoutBody(v),
        ...(projectId ? { projectId } : {}),
      });
      const recordedJson = await recorded.json().catch(() => null);
      if (!recorded.ok) { fireToast(cmcWriteFailed('shelf life', recordedJson, recorded.status), 'error'); return; }

      const signed = await apiRequest('POST', `/api/cmc/stability-studies/${study.id}/close-out`, qualifyBody(v));
      const signedJson = await signed.json().catch(() => null);
      if (!signed.ok) {
        /* The shelf life IS recorded; only the signature failed. Say both. */
        const why = cmcWriteFailed('close-out', signedJson, signed.status);
        fireToast(`${why} The shelf life is recorded; the study is still running until the close-out is signed.`, 'error');
        const partial = adopt(recordedJson);
        if (partial) setRows((rs) => rs.map((r) => (r.id === study.id ? partial : r)));
        return;
      }
      reportCmcLinkage(signedJson, 'CMC record');
      const row = adopt(signedJson);
      if (!row) { fireToast('Signed, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
      setRows((rs) => rs.map((r) => (r.id === study.id ? row : r)));
      setClosing(null);
      fireToast(`${row.studyTitle || row.productName} closed out under your signature: ${row.shelfLife}.`);
    } catch (e) {
      fireToast(cmcWriteThrew('close-out', e), 'error');
    }
  };

  return (
    <div className="cm-body">
      <CmHead
        title="Stability program"
        meta="ICH Q1A(R2) / Q1E — long-term, intermediate, accelerated and stress studies"
        ask={ask}
        suggest={CMC_SUGGEST.stability}
        actions={<button className="nda-open" onClick={() => setRegistering(true)}>{I.plus} Register study</button>}
      />
      <CmCorrNotice prefixes={['3.2.S.7', '3.2.P.8']} noun="the stability program" nav={nav} />
      <div className="cm-kpis">
        {/* Two tiles, not six. "Studies", "Long-term" and "Accelerated" were
            classification counts nobody acts on — the register below is sorted
            and filterable and answers them better. "Results recorded" is a
            volume metric, and the shelf-life evidence card already states it in
            context. What is left is the pair a stability coordinator actually
            decides on: how much is running, and how much is out of limits. */}
        <Kpi l="Active studies" v={active} tone={active ? 'ok' : undefined} />
        <Kpi l="Outside limits" v={oos.length} tone={oos.length ? 'err' : 'ok'} />
      </div>
      {oos.length > 0 && (
        <div className="pj-con" style={{ marginBottom: 14 }}>
          <span className="ico">{I.alertTriangle}</span>
          <div>
            <div className="pj-con-t">{oos.length} stability {oos.length === 1 ? 'result is' : 'results are'} outside the acceptance criteria</div>
            <div className="pj-con-d">
              {oos.slice(0, 3).map((r) => `${r.parameter} at ${r.timePoint} mo (${r.result})`).join(', ')}
              {oos.length > 3 ? ` and ${oos.length - 3} more` : ''}. A result outside its limit is an OOS event before it is a shelf-life question — it belongs in your OOS procedure, and it constrains what §3.2.S.7 / §3.2.P.8 can claim.
            </div>
          </div>
        </div>
      )}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Stability register</span>
          {/* The register table carries no project column — it is the
              ORGANIZATION's study register by design, while §3.2.S.7/P.8
              compose from the project-scoped canonical layer the write-through
              feeds. Say which scope this list is, so this tab and the build
              tab cannot appear to disagree about what "this project's
              stability" contains. */}
          <span className="s">
            {rows.length} studies — ICH Q1A(R2) · organization-wide register
            {projectId
              ? ' — new results are linked to the open project'
              : ' — open a project to link new results to its Module 3'}
          </span>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div style={{ padding: 12 }}>
              {live.loading ? (
                <EmptyState icon={I.barChart} title="Loading stability studies…" busy />
              ) : live.error ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load stability studies" hint="The org-scoped stability register didn’t respond. Sign in to your tenant and retry." />
              ) : (
                <EmptyState icon={I.barChart} title="No stability studies yet" hint="Register a study with the batch it is run on, the ICH condition it is placed at and its pull schedule. Each pull-point result you then record against it is the evidence §3.2.S.7 / §3.2.P.8 is written from." />
              )}
            </div>
          ) : (
            <table className="reg-tbl">
              <thead>
                <tr>
                  <th>Study</th><th>Product</th><th>Batch</th><th>Scope</th><th>Type</th>
                  <th>Storage</th><th>Duration</th><th>Results</th><th>Shelf life</th><th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const results = readStabilityResults(r.stabilityData);
                  const failing = results.filter((x) => !x.withinSpecification).length;
                  const isOpen = expanded === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr>
                        <td style={{ fontWeight: 600 }}>{r.studyTitle || <span className="cm-meta">Untitled study</span>}</td>
                        <td>{r.productName}</td>
                        <td className="mono">{r.batchNumber || '--'}</td>
                        <td>{r.scope === 'DS' ? '§3.2.S.7' : '§3.2.P.8'}</td>
                        <td>{r.studyType || '--'}</td>
                        <td>{stabStorage(r.storageConditions)}</td>
                        <td>{r.duration != null ? r.duration + ' mo' : '--'}</td>
                        <td>
                          {results.length === 0 ? (
                            <span className="cm-meta">none</span>
                          ) : (
                            <button className="cm-linkish" onClick={() => setExpanded(isOpen ? null : r.id)}>
                              {results.length} recorded{failing ? <span className="sp-tone-warn"> · {failing} OOS</span> : null}
                            </button>
                          )}
                        </td>
                        <td>{r.shelfLife || <span className="cm-meta">not set</span>}</td>
                        <td><span className={'rd-chip tone-' + stabStatusTone(r.status)}>{r.status || 'draft'}</span></td>
                        <StabilityRowActions
                          study={r}
                          hasResults={results.length > 0}
                          busy={{ estimating, trending }}
                          historyOpenFor={historyFor?.id ?? null}
                          on={{ record: setRecording, estimate: estimateQ1e, trend: assessTrending, closeOut: setClosing, history: setHistoryFor }}
                        />
                      </tr>
                      {isOpen && results.length > 0 && (
                        <tr>
                          <td colSpan={11} style={{ background: 'var(--bg-050)' }}>
                            <table className="reg-tbl cm-subtable">
                              <thead>
                                <tr><th>Pull (months)</th><th>Parameter</th><th>Result</th><th>Specification</th><th>Within limits</th><th>Tested</th><th>Recorded by</th></tr>
                              </thead>
                              <tbody>
                                {[...results].sort(byTimePoint).map((x, i) => (
                                  <tr key={i}>
                                    <td className="mono">{x.timePoint}</td>
                                    <td>{x.parameter}</td>
                                    <td style={{ fontWeight: 600 }}>{x.result}</td>
                                    <td>{x.specification || '--'}</td>
                                    <td>
                                      <span className={'rd-chip tone-' + (x.withinSpecification ? 'ok' : 'err')}>
                                        {x.withinSpecification ? 'within' : 'OOS'}
                                      </span>
                                    </td>
                                    <td>{x.testedOn ? new Date(x.testedOn).toLocaleDateString() : '--'}</td>
                                    <td>{x.recordedBy || '--'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {rows.length > 0 && <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Stability register -> §3.2.S.7'} nav={nav} bar /></div>}
      </div>
      {historyFor && (
        <RecordHistoryPanel
          registerPath="stability-studies"
          recordId={historyFor.id}
          subject={`Stability study · ${historyFor.studyTitle || historyFor.productName}`}
          onClose={() => setHistoryFor(null)}
        />
      )}
      <div className="pj-card" style={{ marginTop: 16 }}>
        <div className="pj-card-h"><span className="t">Shelf-life evidence</span><span className="s">ICH Q1E</span></div>
        <div className="pj-card-b">
          {allResults.length === 0 ? (
            <EmptyState
              icon={I.barChart}
              title="No pull-point results recorded yet"
              hint="Record results against a registered study and they are summarised here as the evidence behind a shelf-life claim."
            />
          ) : (
            <>
              <div className="cm-meta" style={{ marginBottom: 10 }}>
                {allResults.length} {allResults.length === 1 ? 'result' : 'results'} across {rows.filter((r) => readStabilityResults(r.stabilityData).length > 0).length} {rows.filter((r) => readStabilityResults(r.stabilityData).length > 0).length === 1 ? 'study' : 'studies'} ·
                {' '}{allResults.length - oos.length} within acceptance criteria, {oos.length} outside ·
                {' '}longest pull point recorded: {Math.max(...allResults.map((r) => parseFloat(r.timePoint) || 0))} months
              </div>
              <table className="reg-tbl">
                <thead><tr><th>Pool</th><th>Study</th><th>Batch</th><th>Condition</th><th>Longest pull</th><th>Within limits</th><th>Q1E estimate</th><th>Recorded shelf life</th></tr></thead>
                <tbody>
                  {rows.filter((r) => readStabilityResults(r.stabilityData).length > 0).map((r) => {
                    const res = readStabilityResults(r.stabilityData);
                    const longest = Math.max(...res.map((x) => parseFloat(x.timePoint) || 0));
                    const bad = res.filter((x) => !x.withinSpecification).length;
                    const fit = q1e[r.id];
                    return (
                      <tr key={r.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={poolPick.includes(r.id)}
                            aria-label={`Include ${r.studyTitle || r.productName}${r.batchNumber ? ` (batch ${r.batchNumber})` : ''} in the poolability assessment`}
                            onChange={(e) =>
                              setPoolPick((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))
                            }
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.studyTitle || r.productName}</td>
                        <td>{r.batchNumber || <span className="cm-meta">--</span>}</td>
                        <td>{stabConditionText(r.storageConditions) || '--'}</td>
                        <td>{longest} mo</td>
                        <td><span className={'rd-chip tone-' + (bad ? 'err' : 'ok')}>{res.length - bad}/{res.length}</span></td>
                        <td>
                          {!fit ? (
                            <span className="cm-meta">not run</span>
                          ) : fit.supportedShelfLife == null ? (
                            <span className="sp-tone-warn">not estimable</span>
                          ) : (
                            <>
                              <b>{fit.supportedShelfLife} mo</b>
                              <div className="cm-meta">limited by {fit.limitingParameter}</div>
                            </>
                          )}
                        </td>
                        <td>{r.shelfLife || <span className="cm-meta">not set</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Per-parameter detail for every study that has been fitted —
                  including, explicitly, the parameters that could NOT be fitted
                  and the reason each one could not. A Q1E table that silently
                  omits the attributes it failed on reads as a cleaner result
                  than the data support. */}
              {rows.filter((r) => q1e[r.id]).map((r) => {
                const fit = q1e[r.id];
                return (
                  <div key={r.id} style={{ marginTop: 14 }}>
                    <div className="cm-sub-head">
                      ICH Q1E — {r.studyTitle || r.productName} · batch {r.batchNumber || '--'}
                    </div>
                    <table className="reg-tbl cm-subtable">
                      <thead>
                        <tr><th>Parameter</th><th>Estimate</th><th>Spec limit</th><th>Trend</th><th>Points</th><th>R²</th><th>Detail</th></tr>
                      </thead>
                      <tbody>
                        {fit.estimates.map((e, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{e.parameter}</td>
                            <td>
                              {e.estimable ? (
                                <>
                                  <b>{e.shelfLife} mo</b>
                                  {e.exceedsEvaluatedRange && (
                                    <div className="cm-meta">stays within spec across the whole {fit.maxTimeEvaluated}-month search</div>
                                  )}
                                </>
                              ) : (
                                <span className="sp-tone-warn">not estimable</span>
                              )}
                            </td>
                            <td>{e.estimable ? e.specLimit : '--'}</td>
                            <td>{e.estimable ? e.direction : '--'}</td>
                            <td>{e.estimable ? e.pointsUsed : `${e.pointsUsable ?? 0}/${e.pointsRecorded ?? 0}`}</td>
                            <td>{e.regression ? e.regression.r2 : '--'}</td>
                            <td className="cm-meta">{e.estimable ? (e.notes ?? []).join(' ') : e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="cm-meta">{fit.basis}. {fit.scopeLimit}</div>
                  </div>
                );
              })}

              {/* ── Out-of-trend and drift, per study ──
                  Beside the Q1E fits because they answer different questions
                  about the same series: Q1E asks how long the data support,
                  trending asks whether the series is moving and where it is
                  heading. A series the engine would not fit is listed with its
                  reason, not dropped. */}
              {rows.filter((r) => trend[r.id]).map((r) => {
                const report = trend[r.id];
                if (report.series.length === 0) {
                  /* A citation and a header row over no rows reads as a study
                     that was assessed and found clean. It was not assessed. */
                  return (
                    <div key={`trend-${r.id}`} style={{ marginTop: 14 }} data-testid={`cmc-trend-${r.id}`}>
                      <div className="cm-sub-head">
                        Out-of-trend and drift — {r.studyTitle || r.productName} · batch {r.batchNumber || '--'}
                      </div>
                      <EmptyState
                        icon={I.barChart}
                        title="Nothing on this study could be assessed for drift"
                        hint="A series needs results recorded against the same parameter at the same storage condition. No such series is recorded here, so no trend is being claimed either way."
                        testId={`cmc-trend-none-${r.id}`}
                      />
                    </div>
                  );
                }
                return (
                  <div key={`trend-${r.id}`} style={{ marginTop: 14 }} data-testid={`cmc-trend-${r.id}`}>
                    <div className="cm-sub-head">
                      Out-of-trend and drift — {r.studyTitle || r.productName} · batch {r.batchNumber || '--'}
                    </div>
                    <table className="reg-tbl cm-subtable">
                      <thead>
                        <tr><th>Parameter</th><th>Condition</th><th>Points</th><th>Slope (per month)</th><th>Out of trend</th><th>Heading toward</th><th>Detail</th></tr>
                      </thead>
                      <tbody>
                        {report.series.map((x, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{x.parameter}</td>
                            <td>{x.condition || '--'}</td>
                            <td>{x.outcome.ok ? `${x.outcome.pointsUsed}/${x.pointsRecorded}` : `${x.pointsUsable}/${x.pointsRecorded}`}</td>
                            <td className="mono">
                              {x.outcome.ok
                                ? <>{x.outcome.slope.estimate}{x.outcome.slope.significant ? '' : <span className="cm-meta"> (not significant)</span>}</>
                                : '--'}
                            </td>
                            <td>
                              {x.outcome.ok
                                ? x.outcome.outOfTrend.length === 0
                                  ? <span className="rd-chip tone-ok">none</span>
                                  : <span className="rd-chip tone-err">{x.outcome.outOfTrend.length} at {x.outcome.outOfTrend.map((o) => o.time).join(', ')} mo</span>
                                : <span className="cm-meta">not assessed</span>}
                            </td>
                            <td>
                              {(() => {
                                const claim = trendClaim(x.outcome);
                                return <span className={claim.tone === 'warn' ? 'sp-tone-warn' : 'cm-meta'}>{claim.text}</span>;
                              })()}
                            </td>
                            {/* The engine's own words for a refusal; for an
                                assessed series, what the figures were produced
                                over — so a slope is never read as covering
                                more of the study than it does. */}
                            <td className="cm-meta">
                              {x.outcome.ok
                                ? `${x.outcome.evaluated} of ${x.outcome.distinctTimePoints} pull point(s) judged over ${x.outcome.observedPeriod} months` +
                                  (x.criterionRecordedAs ? ` · against ${x.criterionRecordedAs}` : ' · no criterion recorded on these results')
                                : x.outcome.detail}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="cm-meta">
                      {report.basis} A projected crossing is where the fitted line meets the limit if the trend
                      continues; it is evidence for an investigation, not a shelf life. The shelf life is claimed
                      on the study’s close-out, under signature.
                    </div>
                    {report.unassignedObservations.length > 0 && (
                      /* Never silently dropped: a result the engine could not
                         place in a series is part of the study's data. */
                      <div role="status" className="sp-tone-warn" style={{ fontSize: 11.5, marginTop: 4 }}>
                        {report.unassignedObservations.length} recorded observation(s) could not be placed in any series and were not assessed.
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ── Batch poolability ──
                  Sits under the same table its selection is made in, because
                  the decision to pool is made while reading the per-study fits,
                  not on a separate screen. */}
              <div className="cm-sub-head" style={{ marginTop: 18 }}>Batch poolability — ICH Q1E ANCOVA</div>
              <div className="cm-meta" style={{ marginBottom: 8 }}>
                Tick two or more batches of the same product at the same storage condition, then
                assess whether they may be combined into one shelf-life claim. If the slopes or
                intercepts differ, the claim falls back to the shortest batch.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="nda-open"
                  disabled={poolPick.length < 2 || pooling}
                  onClick={assessPoolability}
                  title={poolPick.length < 2 ? 'Select at least two batches' : 'Run the ICH Q1E combinability test'}
                >
                  {I.sigma} {pooling ? 'Assessing…' : 'Assess poolability'}
                </button>
                <span className="cm-meta">
                  {poolPick.length === 0
                    ? 'No batches selected.'
                    : `${poolPick.length} batch${poolPick.length === 1 ? '' : 'es'} selected${poolPick.length < 2 ? ' — poolability compares batches, so it needs at least two' : ''}.`}
                </span>
                {poolPick.length > 0 && (
                  <button className="cm-linkish" onClick={() => { setPoolPick([]); setPool(null); }}>
                    Clear selection
                  </button>
                )}
              </div>

              {pool && (
                <div style={{ marginTop: 14 }}>
                  <div className="cm-meta" style={{ marginBottom: 8 }}>
                    {pool.batches.join(', ')} · {pool.storageCondition || 'condition not recorded'} ·
                    {' '}{pool.supportedShelfLife != null
                      ? <>supported shelf life <b>{pool.supportedShelfLife} months</b>, limited by {pool.limitingParameter} ({pool.limitingDecision === 'pooled' ? 'pooled' : 'shortest batch'})</>
                      : <>no attribute could be assessed</>}
                  </div>
                  <table className="reg-tbl cm-subtable">
                    <thead>
                      <tr>
                        <th>Parameter</th><th>Slopes</th><th>Intercepts</th><th>Decision</th>
                        <th>Shelf life</th><th>Batches</th><th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pool.assessments.map((a, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{a.parameter}</td>
                          <td>{a.assessable ? <AncovaCell test={a.slopeTest} /> : <span className="cm-meta">--</span>}</td>
                          <td>{a.assessable ? <AncovaCell test={a.interceptTest} /> : <span className="cm-meta">--</span>}</td>
                          <td>
                            {!a.assessable ? (
                              <span className="sp-tone-warn">not assessable</span>
                            ) : (
                              <span className={'rd-chip tone-' + (a.decision === 'pooled' ? 'ok' : 'warn')}>
                                {a.decision === 'pooled' ? 'combinable' : 'shortest batch'}
                              </span>
                            )}
                          </td>
                          <td>
                            {a.assessable ? (
                              <>
                                <b>{a.shelfLife} mo</b>
                                {a.decision === 'minimum-of-batches' && a.perBatchShelfLives && (
                                  <div className="cm-meta">
                                    per batch: {a.perBatchShelfLives.map((p) => `${p.batchId} ${p.shelfLife}`).join(', ')} mo
                                  </div>
                                )}
                              </>
                            ) : '--'}
                          </td>
                          <td className="cm-meta">
                            {(a.contributingBatches ?? []).join(', ') || '--'}
                            {(a.excludedBatches ?? []).length > 0 && (
                              <div>
                                excluded: {a.excludedBatches!.map((e) => `${e.batchId} (${e.reason})`).join('; ')}
                              </div>
                            )}
                          </td>
                          <td className="cm-meta">
                            {a.assessable
                              ? (a.notes ?? []).join(' ')
                              : <>
                                  {a.reason}
                                  {(a.conflictingCriteria ?? []).length > 0 && (
                                    <div>
                                      {a.conflictingCriteria!.map((c) => `${c.batchId}: ${c.direction === 'increasing' ? '≤' : '≥'} ${c.limit}`).join(' vs ')}
                                    </div>
                                  )}
                                </>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="cm-meta">{pool.basis}. {pool.scopeLimit}</div>
                </div>
              )}

              <div className="cm-meta" style={{ marginTop: 10 }}>
                Both figures are <b>evidence, not a claim</b>: they are computed from the recorded
                results and are never written to a study’s shelf life. Setting the shelf life the
                organisation stands behind is a regulatory decision made on the close-out form.
              </div>
            </>
          )}
        </div>
        <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'§3.2.S.7 stability summary'} nav={nav} bar /></div>
      </div>
      {registering && <C2CForm config={stabilityForm()} onCancel={() => setRegistering(false)} onSubmit={registerStudy} />}
      {recording && (
        <C2CForm
          config={stabilityResultForm({ timePoints: recording.timePoints, testParameters: recording.testParameters })}
          onCancel={() => setRecording(null)}
          onSubmit={recordResult}
        />
      )}
      {closing && (
        <C2CForm
          config={stabilityCloseoutForm({ shelfLife: closing.shelfLife })}
          onCancel={() => setClosing(null)}
          onSubmit={closeOut}
        />
      )}
      <C2CToast msg={toast} />
    </div>
  );
}

/* ═══════════ Batch records -- release eligibility ═══════════ */

function CmBatch({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  /* REAL slice: bound to the governed cmc_batch_records table
     (server/api/cmc/batchRecordRoutes.ts, mounted at /api/cmc/batch-records).
     Reads GET /:projectId, logs a batch via POST /, and releases ONLY through
     the governed POST /:id/release endpoint (§11 re-authentication + hash-chained
     recordGovernedAction, carrying a disposition decision). The jsonb yield/
     deviation columns are crossed by the reversible, unit-tested mapping in
     ./cmcBatch. Batches are per-project; without a project in context the
     surface renders an honest prompt, never a fixture, and no write is
     fabricated on failure. */
  const projectId = cmcProjectUuid();
  const live = useLiveRows<BatchApiRow>(
    projectId ? '/api/cmc/batch-records/' + encodeURIComponent(projectId) : null,
  );
  const mapped = React.useMemo<CmcBatch[]>(
    () => (live.loading || live.error ? [] : batchRowsFromApi(live.rows)),
    [live.loading, live.error, live.rows],
  );
  const [rows, setRows] = useState<CmcBatch[]>([]);
  const seededRef = React.useRef<CmcBatch[] | null>(null);
  useEffect(() => {
    if (mapped !== seededRef.current) {
      seededRef.current = mapped;
      setRows(mapped);
    }
  }, [mapped]);
  const [form, setForm] = useState(false);
  const [releasing, setReleasing] = useState<CmcBatch | null>(null);
  const [toast, fireToast] = useToast();
  const { user } = useAuth();
  const releasedByName = user?.displayName || user?.email || 'current user';
  /* Open deviations are closed before a release (21 CFR 211.192). Yield is
     not a release criterion: the "yield >= 90%" rule this button used was
     stated by no regulation. What a release IS signed over — the batch's
     recorded, reviewed QC results — the server checks, and says what is
     missing (services/cmc/batch-release-evidence.ts). */
  const eligible = (r: CmcBatch) => r.dev === 0;
  const pending = rows.filter((r) => r.st === 'pending').length;
  const devs = rows.reduce((a, r) => a + r.dev, 0);
  const avgY = rows.length ? Math.round(rows.reduce((a, r) => a + r.yield, 0) / rows.length) : 0;
  // add — REAL, awaited create against the governed batch file; adopts the
  // SERVER's row (real db id + persisted values). Nothing is added on failure.
  const add = async (v: Record<string, string>) => {
    if (!projectId) { fireToast('Open a project first — batch records are logged per project.', 'error'); return; }
    try {
      const res = await apiRequest('POST', '/api/cmc/batch-records', batchCreateBody(v, projectId));
      const json = await res.json().catch(() => null);
      if (res.ok) reportCmcLinkage(json, 'CMC record');
      if (!res.ok) { fireToast('Couldn’t log the batch — ' + specErr(json, res.status) + '. Nothing was saved.', 'error'); return; }
      const adopted = batchRowsFromApi([(json as { data?: BatchApiRow })?.data].filter(Boolean) as BatchApiRow[])[0];
      if (!adopted) { fireToast('Saved, but the server returned an unexpected shape — reload to see it.', 'error'); return; }
      setRows((rs) => [{ ...adopted, _new: true }, ...rs.filter((r) => r.dbId !== adopted.dbId)]);
      setForm(false);
      fireToast('Batch ' + adopted.id + ' logged · ' + adopted.st);
    } catch (e) {
      fireToast('Couldn’t log the batch — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };
  // doRelease — REAL governed release. POSTs to the ONLY release path
  // (/:id/release): re-authenticates (password + TOTP) and records a
  // hash-chained governed action with the disposition decision before setting
  // the batch status. Adopts the server's row; a failed re-auth (401) is
  // surfaced honestly and the batch stays unreleased.
  const doRelease = async (v: Record<string, string>) => {
    if (!releasing) return;
    const target = releasing;
    if (target.dbId == null) { fireToast('This batch isn’t in the governed file yet — reload before releasing it.', 'error'); return; }
    try {
      const res = await apiRequest('POST', '/api/cmc/batch-records/' + target.dbId + '/release', batchReleaseBody(v, releasedByName));
      const json = await res.json().catch(() => null);
      if (res.ok) reportCmcLinkage(json, 'CMC record');
      if (res.status === 401) { fireToast('Release not signed — re-authentication failed. The batch was not released.', 'error'); return; }
      if (!res.ok) { fireToast('Couldn’t release the batch — ' + specErr(json, res.status) + '. Nothing was persisted.', 'error'); return; }
      const adopted = batchRowsFromApi([(json as { data?: BatchApiRow })?.data].filter(Boolean) as BatchApiRow[])[0];
      setRows((rs) => rs.map((x) => x.dbId === target.dbId ? { ...(adopted ?? { ...x, st: 'released' }), _new: true } : x));
      const chain = (json as { governance?: { sha256Chain?: string } })?.governance?.sha256Chain;
      fireToast('Batch ' + target.id + ' ' + (adopted?.st ?? 'released') + (chain ? ' · signed ' + String(chain).slice(0, 12) + '…' : '') + '.');
      setReleasing(null);
    } catch (e) {
      fireToast('Couldn’t release the batch — ' + (e instanceof Error ? e.message : String(e)) + '.', 'error');
    }
  };
  return (
    <div className="cm-body">
      <CmHead title="Batch records" meta="Manufacture, yield, deviations and disposition" ask={ask} suggest={CMC_SUGGEST.batch}
        actions={<button className="nda-open" onClick={() => setForm(true)} disabled={!projectId} title={!projectId ? 'Open a project to log batch records' : ''}>{I.plus} Log batch</button>} />
      <div className="cm-kpis">
        <Kpi l="Batches" v={rows.length} />
        <Kpi l="Pending release" v={pending} tone={pending ? 'warn' : 'ok'} />
        <Kpi l="Open deviations" v={devs} tone={devs ? 'warn' : 'ok'} />
        <Kpi l="Avg yield" v={avgY + '%'} />
      </div>
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Batch disposition</span><span className="s">released over the batch’s recorded, reviewed QC results — open deviations closed first</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {rows.length === 0 ? (
            <div style={{ padding: 12 }}>
              {!projectId ? (
                <EmptyState icon={I.grid} title="Open a project to manage its batch records" hint="Manufactured batches with their yield, deviations, and disposition are recorded per project in the governed batch file. Open a project, then log or release its batches here." action={openProgramAction(nav)} />
              ) : live.loading ? (
                <EmptyState icon={I.grid} title="Loading batch records…" busy />
              ) : live.error ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load batch records" hint="The governed batch file didn’t respond. Sign in to your tenant and retry." />
              ) : (
                <EmptyState icon={I.grid} title="No batch records yet" hint="Manufactured batches with their yield, deviations, and disposition appear here. Use Log batch to record the first one — it is persisted to the governed batch file." />
              )}
            </div>
          ) : (
            <table className="reg-tbl"><thead><tr><th>Batch</th><th>Stage</th><th>Yield</th><th>Deviations</th><th>Eligible</th><th>Status</th><th style={{ textAlign: 'right' }}>Action</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.dbId ?? r.id} className={r._new ? 'de-row-new' : undefined}>
                <td className="mono" style={{ fontWeight: 600 }}>{r.id}</td><td>{r.stage}</td>
                <td>{r.yield}%</td>
                <td className={r.dev ? 'sp-tone-warn' : ''}>{r.dev}</td>
                <td>{eligible(r) ? <span className="rd-chip tone-ok">yes</span> : <span className="rd-chip tone-warn">no</span>}</td>
                <td><span className={'rd-chip tone-' + (r.st === 'released' ? 'ok' : r.st === 'rejected' ? 'err' : 'warn')}>{r.st}</span></td>
                <td style={{ textAlign: 'right' }}>{r.st === 'pending' && <button className="nda-open" onClick={() => setReleasing(r)} disabled={!eligible(r)} title={!eligible(r) ? 'Close the open deviations first' : ''}>{I.check} Release</button>}</td>
              </tr>))}</tbody></table>
          )}
        </div>
      </div>
      {/* Batch records are the process as run; process validation is the
          evidence that the process is capable of running that way — and the
          capability indices are what the batches as run actually show against
          the specification, which is a different question from either. */}
      <CmProcessCapability projectId={projectId} />
      <CmProcessValidation />
      {form && <C2CForm config={{ eyebrow: 'Batch — new', title: 'Log a batch record', sub: 'Recorded to the governed batch file for this project', submitLabel: 'Log batch', fields: [
        { key: 'id', label: 'Batch number', type: 'text', placeholder: 'e.g. BX204-DP-2407', required: true },
        { key: 'stage', label: 'Stage', type: 'select', options: ['Drug substance', 'Drug product'], required: true, half: true },
        { key: 'yield', label: 'Yield (%)', type: 'number', min: 0, max: 100, required: true, half: true },
        { key: 'dev', label: 'Open deviations', type: 'number', min: 0, default: '0' },
      ] }} onCancel={() => setForm(false)} onSubmit={add} />}
      {releasing && <C2CForm config={{ eyebrow: 'Batch disposition — §11 e-signature', title: 'Release batch ' + releasing.id, sub: 'Signed over the QC results recorded against this batch: a release needs every one reviewed and passing; a conditional release states what is outstanding. Recorded to the hash-chained audit trail, signed by ' + releasedByName + '.', submitLabel: 'Sign & release', fields: [
        { key: 'decision', label: 'Disposition', type: 'seg', options: ['approved', 'conditional', 'rejected'], default: 'approved', half: true },
        { key: 'reason', label: 'Reason', type: 'textarea', placeholder: 'Disposition rationale (recorded with the signature)…', required: true },
        { key: 'password', label: 'Password', type: 'password', placeholder: 'Re-enter your password', required: true, half: true },
        { key: 'totp', label: 'Authenticator', type: 'text', placeholder: '6-digit code', half: true },
      ] }} onCancel={() => setReleasing(null)} onSubmit={doRelease} />}
      <C2CToast msg={toast} />
    </div>
  );
}

/**
 * One stability study's governed actions.
 *
 * Extracted when the Trend action took the register row's render arrow past the
 * complexity cap. Each button's disabled state and title come from ONE fact —
 * whether the study has recorded results — because every one of these acts
 * reads that series, and a button that is live over no data is an action that
 * can only fail.
 */
function StabilityRowActions({ study, hasResults, busy, historyOpenFor, on }: {
  study: StabilityStudyApiRow;
  hasResults: boolean;
  busy: { estimating: number | null; trending: number | null };
  historyOpenFor: number | null;
  on: {
    record: (s: StabilityStudyApiRow) => void;
    estimate: (s: StabilityStudyApiRow) => void | Promise<void>;
    trend: (s: StabilityStudyApiRow) => void | Promise<void>;
    closeOut: (s: StabilityStudyApiRow) => void;
    history: (s: StabilityStudyApiRow | null) => void;
  };
}) {
  const noSeries = 'Record pull-point results first — there is nothing to ';
  return (
    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
      <button className="nda-open" onClick={() => on.record(study)}>{I.plus} Result</button>
      <button
        className="nda-open"
        style={{ marginLeft: 6 }}
        onClick={() => void on.estimate(study)}
        disabled={busy.estimating != null || !hasResults}
        title={hasResults ? 'Fit ICH Q1E over this study’s recorded results' : noSeries + 'fit'}
      >
        {I.sigma} {busy.estimating === study.id ? 'Fitting…' : 'Estimate Q1E'}
      </button>
      <button
        className="nda-open"
        style={{ marginLeft: 6 }}
        onClick={() => void on.trend(study)}
        disabled={busy.trending != null || !hasResults}
        title={hasResults ? 'Assess this study’s recorded series for drift toward its limits' : noSeries + 'trend'}
      >
        {I.barChart} {busy.trending === study.id ? 'Assessing…' : 'Trend'}
      </button>
      <button className="nda-open" style={{ marginLeft: 6 }} onClick={() => on.closeOut(study)}>{I.checkCircle} Shelf life</button>
      <button
        className="nda-open"
        style={{ marginLeft: 6 }}
        title="Who recorded this study, who changed it, and what each change moved"
        onClick={() => on.history(historyOpenFor === study.id ? null : study)}
      >
        {I.history} History
      </button>
    </td>
  );
}

/* ═══════════ Process capability over the recorded batch results ═══════════ */

/**
 * `GET /api/cmc/projects/:projectId/process-capability`, on the screen where
 * the batches are.
 *
 * ── Why this is here now (2026-10-25) ───────────────────────────────────────
 * The route, its engine (`services/cmc/process-capability.ts`, ISO 22514-2
 * indices with the moving-range sigma) and the source reader
 * (`recorded-capability.ts`) were all written and had NO caller in the product:
 * a reachability sweep over all 99 CMC routes found three in that state, and
 * this was the one a CMC lead asks for by name. "Is this process capable
 * against the specification we set" could be answered by AnA in chat
 * (`assess_recorded_process_capability`) or by compiling §3.2.S.4.4 and reading
 * the section — and nowhere on the screen that holds the batches.
 *
 * ── What it may claim ───────────────────────────────────────────────────────
 * Nothing it did not read. Every number and every refusal is the server's: the
 * indices, the verdict, the batches excluded for a non-numeric result, the
 * batches outside the specification, and `statement` — the server's own
 * sentence for a project whose results open no series. A failed read is the
 * failure, never "not capable" and never an empty report: a capability report
 * that silently names no test reads as a set of tests that passed.
 */
interface CapabilitySeriesRow {
  test: string;
  resultsOnFile: number;
  criterion: string | null;
  outcome:
    | { ok: true; n: number; mean: number; sdOverall: number; cp: number | null; cpk: number; pp: number | null; ppk: number;
        batchesOutOfSpecification: string[]; excludedBatches: string[]; preliminary: boolean; verdict: string; notes: string[]; citation: string }
    | { ok: false; code: string; message: string; excludedBatches: string[] };
}
interface CapabilityRead {
  projectId: string;
  resultsOnFile: number;
  assessed: boolean;
  statement: string | null;
  /** Sample types outside the register's vocabulary, which belong to neither
   *  material. Named rather than dropped: before 2026-10-26 a result recorded
   *  against one was silently read as drug substance. */
  unattributableSampleTypes?: string[];
  sides: Record<'drug_substance' | 'drug_product', { series: CapabilitySeriesRow[]; statements: string[] }>;
}

/** A 200 that is not this shape is a mismatch, not a project with no capability. */
function isCapabilityRead(value: unknown): value is CapabilityRead {
  const v = value as CapabilityRead | null;
  return Boolean(v && typeof v === 'object' && typeof v.assessed === 'boolean' && v.sides && typeof v.sides === 'object');
}

const CAPABILITY_SIDES: Array<{ key: 'drug_substance' | 'drug_product'; label: string; section: string }> = [
  { key: 'drug_substance', label: 'Drug substance', section: '§3.2.S.4.4' },
  { key: 'drug_product', label: 'Drug product', section: '§3.2.P.5.4' },
];

/** The citation of the first series the engine assessed; none if it assessed none. */
function citationOf(series: CapabilitySeriesRow[]): string | null {
  for (const s of series) if (s.outcome.ok) return s.outcome.citation;
  return null;
}

function capabilityTone(outcome: CapabilitySeriesRow['outcome']): string {
  if (!outcome.ok) return 'dim';
  return outcome.verdict === 'capable' ? 'ok' : outcome.verdict === 'marginal' ? 'warn' : 'err';
}

function CapabilityRow({ row, side }: { row: CapabilitySeriesRow; side: { label: string; section: string } }) {
  const o = row.outcome;
  const num = (v: number | null) => (v === null ? '—' : String(v));
  return (
    <tr>
      <td>
        {/* The material the series belongs to, named on the row. The two sides
            were flattened into one unlabelled table, so a test run on BOTH the
            substance and the product showed two rows of the same name with two
            different indices and nothing to tell them apart — and an index
            attributed to the wrong material is a false statement about a
            specification. The §3.2 section each side composes into is named
            too, because that is what a reader is about to go and check. */}
        <div style={{ fontWeight: 600 }}>{row.test}</div>
        <div className="cm-meta">{side.label} · {side.section}</div>
      </td>
      <td style={{ fontSize: 11.5, color: 'var(--text-300)' }}>{row.criterion ?? 'none recorded'}</td>
      <td className="mono">{o.ok ? o.n : '—'}</td>
      <td className="mono">{o.ok ? num(o.ppk) : '—'}</td>
      <td className="mono">{o.ok ? num(o.cpk) : '—'}</td>
      <td><span className={'rd-chip tone-' + capabilityTone(o)}>{o.ok ? o.verdict : 'not assessed'}</span></td>
      <td style={{ fontSize: 11.5, color: 'var(--text-300)' }}>
        {/* The server's own words, in both directions: its refusal, or the
            caveats it attached to an index it did produce. A batch excluded or
            out of specification is NAMED, because a capability index that
            quietly absorbed it is the number this panel exists to not show. */}
        {o.ok
          ? [
              /* `preliminary` is NOT restated here: the server's own notes
                 already carry "Preliminary: n batches…" in full, and saying it
                 twice read as two separate caveats. The flag stays on the
                 payload for a caller that needs the fact without the prose. */
              o.batchesOutOfSpecification.length ? `out of specification: ${o.batchesOutOfSpecification.join(', ')}` : null,
              o.excludedBatches.length ? `no numeric result: ${o.excludedBatches.join(', ')}` : null,
              ...o.notes,
            ].filter(Boolean).join(' · ') || '—'
          : o.message}
      </td>
    </tr>
  );
}

function CmProcessCapability({ projectId }: { projectId?: string }) {
  const read = useLiveData<CapabilityRead>(
    projectId ? '/api/cmc/projects/' + encodeURIComponent(projectId) + '/process-capability' : null,
    [projectId],
    isCapabilityRead,
  );
  if (!projectId) return null;
  const data = read.loading || read.error ? null : read.data;
  /* Each series carries the side it came from: the key must be unique (two
     sides can hold the same test method, and React silently keeps one row for
     a duplicate key) and the row must say which material it is about. */
  const series = data
    ? CAPABILITY_SIDES.flatMap((s) => (data.sides[s.key]?.series ?? []).map((row) => ({ row, side: s })))
    : [];
  return (
    <div className="pj-card" data-testid="cmc-process-capability">
      <div className="pj-card-h">
        <span className="t">Process capability</span>
        <span className="s">
          Pp / Ppk / Cp / Cpk over this program’s recorded batch results, against the criterion each was judged
          against — the same assessment the compiled §3.2.S.4.4 and §3.2.P.5.4 carry
        </span>
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        {read.loading ? (
          <div style={{ padding: 12 }}>
            <EmptyState icon={I.sigma} title="Assessing the recorded batch results…" busy testId="cmc-capability-loading" />
          </div>
        ) : read.error ? (
          <div style={{ padding: 12 }}>
            {/* Never rendered as "not capable" and never as an empty report. */}
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Process capability was not assessed"
              hint={`The assessment could not be read (${read.status ?? 'no status'}). Nothing is being claimed about this process’s capability.`}
              testId="cmc-capability-error"
            />
          </div>
        ) : !data?.assessed ? (
          <div style={{ padding: 12 }}>
            <EmptyState
              icon={I.sigma}
              title="Process capability is not assessed for this project"
              hint={data?.statement ?? undefined}
              testId="cmc-capability-none"
            />
          </div>
        ) : (
          <>
            {data.statement && (
              /* An assessment that produced series can STILL have left results
                 out. The server's own sentence says which, so a reader is not
                 left reading a complete-looking table over a partial set. */
              <div role="status" style={{ padding: '8px 12px', color: 'var(--warning)', fontSize: 11.5 }}>
                {data.statement}
              </div>
            )}
            <table className="reg-tbl">
              <thead>
                <tr><th>Test</th><th>Criterion</th><th>Batches</th><th>Ppk</th><th>Cpk</th><th>Verdict</th><th>Note</th></tr>
              </thead>
              <tbody>
                {series.map(({ row, side }) => (
                  <CapabilityRow key={`${side.key}:${row.test}`} row={row} side={side} />
                ))}
              </tbody>
            </table>
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-400)' }}>
              {/* The engine's own citation, from a series it actually assessed.
                  Read with a guard rather than a non-null assertion: a report
                  where every series was refused has no citation to print, and
                  asserting one there is a crash on the honest case. */}
              {citationOf(series.map((s) => s.row))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Postapproval filing assessment is deferred; the launch app records changes
   against the US IND's Module 3 without manufacturing a marketing category. */
export function CmChange({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const { launchScopeEnforced } = useNavEntitlements();
  return (
    <div className="cm-body">
      <CmHead title="Change control" meta="Record the change, its basis and its Module 3 impact" ask={ask} suggest={CMC_SUGGEST.change} />
      {launchScopeEnforced === false ? (
        <CmcVariationAssessment nav={nav} followup={(sections) => sections.length ? <CmCorrNotice prefixes={sections} noun="the sections this change affects" nav={nav} /> : null} />
      ) : (
        <div className="pj-card"><div className="pj-card-b">
          <h2>Postapproval variation assessment is outside this release</h2>
          <p>This release composes small-molecule Module 3 for a US IND. A PAS, CBE or international marketing variation does not classify an IND change. Record the change and review the affected evidence here; no postapproval or multi-market filing category is inferred.</p>
        </div></div>
      )}
      <CmChangeRegister />
      <CmComparabilityStudies />
    </div>
  );
}

/* ═══════════ Substance & product -- Global matrix -- Program records ═══════════ */

/**
 * §3.2.S and §3.2.P — the substance and the product, and the two registers whose
 * evidence each section's control depends on.
 *
 * These were two separate tabs, each a wrapper over one register plus a push
 * bar. They are one destination because they are one question a formulation or
 * substance scientist works through together, and because Specifications
 * already establishes the pattern of a tab carrying more than one register.
 * Nothing was removed: all four registers below are the same components bound to
 * the same endpoints.
 */
function CmMaterials({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  return (
    <div className="cm-body">
      <CmHead
        title="Substance & product"
        meta="CTD §3.2.S / §3.2.P — the active substance and the finished product, their manufacture and control"
        ask={ask}
        suggest={CMC_SUGGEST.materials}
      />
      <div className="cm-sub-head">Drug substance — §3.2.S</div>
      <CmDrugSubstances />
      {/* The method library sits with the substance because §3.2.S.4.2 is the
          analytical procedures section: the substance's control depends on it. */}
      <CmMethodLibrary />
      {/* What the substance IS (§3.2.S.3.1) and how it is MADE (§3.2.S.2.2).
          Both sections have been demanded by the composer since it was written
          and had no producer: characterisation had no table at all, and the
          process wrote into a table the compliance checker read and no screen
          filled. Each row states which side of the dossier it files under, so
          one register serves the drug product's §3.2.P.3.3 too. */}
      <CmCharacterizationStudies />
      <CmManufacturingProcesses />

      <div className="cm-sub-head">Drug product — §3.2.P</div>
      <CmDrugProducts />
      {/* Process validation is the §3.2.P.3.5 evidence that the product's
          process does what its description says. */}
      <CmProcessValidation />

      {/* The formulation IS the product's composition (§3.2.P.1), and the
          materials are what it is made of and what each is controlled to
          (§3.2.P.4 for an excipient, §3.2.S.2.3 for a raw material). */}
      <CmFormulationRecords />
      <CmMaterialSpecs />

      <div className="cm-sub-head">Container closure — §3.2.S.6 / §3.2.P.7</div>
      {/* The system that holds the material, and the extractables/leachables
          package behind it. Both sections composed from nothing until this
          register existed; each row states which of the two it files under. */}
      <CmContainerClosures />

      <div className="pj-card" style={{ marginTop: 16 }}>
        <div className="pj-card-b" style={{ paddingTop: 4 }}>
          <CmPush label={'Substance & product data -> §3.2.S / §3.2.P'} nav={nav} bar />
        </div>
      </div>
    </div>
  );
}

/* ═══════════ Program records ═══════════
   The audit chain, for real. This tab said "No audit activity yet" while
   GET /api/cmc/module3-os/provenance/:projectId/:sectionKey served the events
   and GET /api/cmc/module3-os/contradictions/:projectId served the open
   findings.

   Agency questions (2026-10-19, P-38 / P-39 item 1). This tab used to be a
   second home for them: log, assign, send for review, draft into an authoring
   document, close and reopen, each a status update on CMC's own file with no
   signature. They are now the letter's record. The tab lists the program's
   Module 3 questions read from their letters (./cmcAgencyQuestions), each with
   one door, "Open on its letter", into Communication, where it is recorded,
   answered and approved by signature; and the earlier file as read-only
   history. CMC writes nothing about agency questions. */

interface ProvenanceRow {
  eventType: string;
  eventPayload: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string | null;
  sectionKey: string;
}

export function CmPathway({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const projectId = cmcProjectId();
  const sections = useLiveRows<{ sectionKey: string; sectionPath: string; approvalState: string; stale: boolean; updatedAt: string }>(
    projectId ? '/api/cmc/module3-os/sections/' + encodeURIComponent(projectId) : null,
  );
  const contradictions = useLiveRows<{ id: string; severity: string; contradictionType: string; details: string; status: string; updatedAt: string }>(
    projectId ? '/api/cmc/module3-os/contradictions/' + encodeURIComponent(projectId) : null,
  );

  /* The provenance chain is served per section, so the programme-wide view is
     the union across the sections this project actually has. Sections are
     fetched first and their event streams are then read in parallel; a section
     whose stream fails is reported rather than silently dropped, because a
     missing link in an audit chain is exactly the thing not to hide. */
  const [events, setEvents] = useState<ProvenanceRow[]>([]);
  const [chainState, setChainState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [chainError, setChainError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || sections.loading) return;
    if (sections.error) { setChainState('error'); setChainError(sections.error); return; }
    if (sections.rows.length === 0) { setEvents([]); setChainState('ready'); return; }
    let cancelled = false;
    setChainState('loading');
    setChainError(null);
    void (async () => {
      const failures: string[] = [];
      const all: ProvenanceRow[] = [];
      await Promise.all(
        sections.rows.map(async (s) => {
          const r = await liveGetOrNull<ProvenanceRow[]>(
            '/api/cmc/module3-os/provenance/' + encodeURIComponent(projectId) + '/' + encodeURIComponent(s.sectionKey),
          );
          if (r.error) { failures.push(s.sectionKey); return; }
          for (const e of Array.isArray(r.data) ? r.data : []) all.push({ ...e, sectionKey: s.sectionKey });
        }),
      );
      if (cancelled) return;
      all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setEvents(all);
      setChainError(failures.length ? `${failures.length} section${failures.length === 1 ? '' : 's'} (${failures.join(', ')}) could not be read — this chain is incomplete.` : null);
      setChainState('ready');
    })();
    return () => { cancelled = true; };
  }, [projectId, sections.loading, sections.error, sections.rows]);

  const resolved = contradictions.rows.filter((c) => c.status === 'resolved');
  const open = contradictions.rows.filter((c) => c.status !== 'resolved');

  return (
    <div className="cm-body">
      <CmHead title="Project records" meta="Agency questions on Module 3, approval gates and the audit chain" ask={ask} suggest={CMC_SUGGEST.pathway} />
      <CmcModule3QuestionIndex nav={nav} />
      <CmcEarlierQuestionFile nav={nav} />
      {!projectId ? (
        <div className="pj-card">
          <div className="pj-card-b">
            <EmptyState
              icon={I.scroll}
              title="Open a project to see its records"
              hint="The Module 3 audit chain and the contradiction history are recorded per project."
              action={openProgramAction(nav)}
              regulation="Serves the per-project audit history (21 CFR Part 11 §11.10(e))"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="cm-kpis">
            <Kpi l="Governed events" v={events.length} />
            <Kpi l="Sections tracked" v={sections.rows.length} />
            <Kpi l="Contradictions resolved" v={resolved.length} tone={resolved.length ? 'ok' : undefined} />
            <Kpi l="Still open" v={open.length} tone={open.length ? 'warn' : 'ok'} />
          </div>


          <div className="pj-card" style={{ marginBottom: 16 }}>
            <div className="pj-card-h">
              <span className="t">Audit chain</span>
              <span className="s">governed actions across every §3.2 section</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {chainError && (
                <div style={{ padding: '10px 12px 0' }}>
                  <div className="pj-con">
                    <span className="ico">{I.alertTriangle}</span>
                    <div><div className="pj-con-t">Part of the chain could not be read</div><div className="pj-con-d">{chainError}</div></div>
                  </div>
                </div>
              )}
              {events.length === 0 ? (
                <div style={{ padding: 12 }}>
                  {chainState === 'loading' || sections.loading ? (
                    <EmptyState icon={I.scroll} title="Reading the provenance chain…" />
                  ) : chainState === 'error' ? (
                    <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the audit chain" hint={chainError ?? 'The Module 3 section list did not respond.'} />
                  ) : (
                    <EmptyState
                      icon={I.scroll}
                      title="No governed activity yet"
                      hint="Compiles, refreshes, approvals and contradiction resolutions are written to the provenance store as they happen. Compile Module 3 and the chain starts here."
                    />
                  )}
                </div>
              ) : (
                <table className="reg-tbl">
                  <thead><tr><th>When</th><th>Section</th><th>Event</th><th>Actor</th><th>Detail</th></tr></thead>
                  <tbody>
                    {events.slice(0, 200).map((e, i) => (
                      <tr key={i}>
                        <td className="cm-meta">{e.createdAt ? new Date(e.createdAt).toLocaleString() : '--'}</td>
                        <td className="mono">{e.sectionKey}</td>
                        <td><span className={'rd-chip tone-' + (e.eventType === 'approved' ? 'ok' : e.eventType === 'refreshed' ? 'warn' : 'dim')}>{e.eventType}</span></td>
                        <td>{e.createdBy || 'system'}</td>
                        <td className="cm-meta">{provenanceDetail(e.eventPayload)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {events.length > 200 && (
              <div className="pj-card-b" style={{ paddingTop: 0 }}>
                <div className="cm-meta">Showing the 200 most recent of {events.length} events.</div>
              </div>
            )}
          </div>

          <div className="pj-card">
            <div className="pj-card-h">
              <span className="t">Contradiction history</span>
              <span className="s">{resolved.length} resolved — {open.length} open</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {contradictions.rows.length === 0 ? (
                <div style={{ padding: 12 }}>
                  {contradictions.loading ? (
                    <EmptyState icon={I.shieldAlert} title="Loading contradiction history…" busy />
                  ) : contradictions.error ? (
                    <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load contradiction history" hint={contradictions.error} />
                  ) : (
                    <EmptyState icon={I.shieldCheck} title="No contradictions recorded" hint="Run the sweep from the Module 3 build tab; every finding and its resolution is kept here." />
                  )}
                </div>
              ) : (
                <table className="reg-tbl">
                  <thead><tr><th>Severity</th><th>Type</th><th>Detail</th><th>Status</th><th>Last change</th></tr></thead>
                  <tbody>
                    {contradictions.rows.map((c) => (
                      <tr key={c.id}>
                        <td><span className={'rd-chip tone-' + (String(c.severity).toLowerCase() === 'critical' ? 'err' : 'warn')}>{c.severity}</span></td>
                        <td className="mono">{c.contradictionType}</td>
                        <td>{c.details}</td>
                        <td><span className={'rd-chip tone-' + (c.status === 'resolved' ? 'ok' : 'warn')}>{c.status}</span></td>
                        <td className="cm-meta">{c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="pj-card-b" style={{ paddingTop: 0 }}><CmPush label={'Module 3 audit chain'} nav={nav} bar /></div>
          </div>
        </>
      )}
    </div>
  );
}

/** A provenance payload summarised for a table cell, never stringified raw. */
function provenanceDetail(payload: Record<string, unknown> | null): string {
  if (!payload || typeof payload !== 'object') return '--';
  const parts: string[] = [];
  const push = (label: string, value: unknown) => {
    if (value == null || value === '') return;
    parts.push(`${label} ${Array.isArray(value) ? value.join(', ') : String(value)}`);
  };
  push('completeness', payload.completeness != null ? `${payload.completeness}%` : null);
  push('missing', Array.isArray(payload.missingInputs) && payload.missingInputs.length ? payload.missingInputs : null);
  push('reason', payload.reason);
  push('note', payload.resolutionNote);
  push('version', payload.versionNumber);
  if (!parts.length) {
    const keys = Object.keys(payload);
    return keys.length ? keys.slice(0, 4).join(', ') : '--';
  }
  return parts.join(' · ');
}

/* ═══════════ CmcModule shell — sub-tab router ═══════════ */

const CMC_SURF: Record<string, React.ComponentType<{ ask: (text: string) => void; nav?: (id: string) => void }>> = {
  overview: CmOverview,
  materials: CmMaterials,
  specs: CmSpecs,
  stability: CmStability,
  batch: CmBatch,
  change: CmChange,
  quality: CmQuality,
  build: CmModule3Build,
  pathway: CmPathway,
};

export function CmcModule({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const [tab, setTab] = useState('overview');
  /* The Overview's answer-lead offers "Open change simulator" and the Module 3
     build tab is reachable from Overview the same way, so the setter is
     published for those cross-tab jumps. Assigned in an effect rather than
     during render: a render-phase side effect on a global is exactly the kind
     of write React may run twice or discard. */
  useEffect(() => {
    (window as unknown as { __cmSetTab?: (id: string) => void }).__cmSetTab = setTab;
    return () => {
      delete (window as unknown as { __cmSetTab?: (id: string) => void }).__cmSetTab;
    };
  }, []);

  /* AnA's hands on this screen — the surface-action bus (shared registry:
     cmc.open-tab, identity-resolved). The handler drives the SAME setter the
     sub-tab buttons and __cmSetTab drive. The tab list is a static constant,
     so there is deliberately NO loading guard, NO retry, and NO ready signal —
     a not-ready refusal here would be dishonest. The wave-2 limitation
     (pane forms child-local and invisible here) is closed by the ceremony
     channel: the pane forms — spec edits, batch e-sign releases, stability
     registrations — all render through C2CForm, which reports itself, so a
     switch that would unmount a person's half-completed ceremony refuses.
     The human's own tab buttons still carry no guard; AnA acting on someone's
     behalf holds a higher bar than their own hands. */
  useSurfaceActionHandlers('cmc', {
    'cmc.open-tab': (params) => {
      const target = (params.tab ?? '').trim();
      const meta = CMC_NAV.find((n) => n.id === target);
      if (!meta) return { ok: false, reason: `No CMC tab named "${params.tab}".` };
      if (tab === target) return { ok: true, detail: `Already on ${meta.label}` };
      if (ceremonyOpen()) {
        return {
          ok: false,
          reason:
            'A governed form is open on this screen — switching tabs would discard it. ' +
            'Let the person finish or cancel it first.',
        };
      }
      setTab(target);
      return { ok: true, detail: `Opened ${meta.label}` };
    },
  });

  /* ── What AnA is told about this screen ──
     `useAnaChat` forwards a surface's published context to the orchestrator as
     `module_context`, so this is what makes a generic question ("what should I
     do next?") answerable here without the user restating their situation. The
     shell alone knows only that the surface is "cmc" — not which of the twelve
     sub-tabs is open, nor what is on it.

     Readiness is READ, never assembled: GET /api/cmc/module3-os/readiness is the
     same endpoint the build board renders, so AnA and the board cannot disagree.
     While that fetch is loading or errored the facts are simply ABSENT — telling
     her a percentage nobody measured would make her confidently wrong, which is
     the failure this channel is most able to cause.

     Per surfaceContext's own budget rule: the nouns and numbers a user could
     point at, never raw API bodies, and never anything the screen is hiding. */
  const anaProjectId = cmcProjectId();
  const anaReadiness = useLiveData<{
    totalSections: number; approvedSections: number; staleSections: number;
    openCriticalContradictions: number; exportReady: boolean;
  }>(anaProjectId ? '/api/cmc/module3-os/readiness/' + encodeURIComponent(anaProjectId) : null);
  const tabLabel = CMC_NAV.find((n) => n.id === tab)?.label ?? 'Overview';
  const r = anaReadiness.loading || anaReadiness.error ? null : anaReadiness.data;
  /* The program's agency questions on Module 3, read ONCE here and provided to
     the Overview figure, the per-tab signposts and Program records, so AnA's
     facts below are the figure the screen shows (2026-10-19, P-39 item 1).
     They are spread only once measured: a program open, the read resolved and
     not failed. No action is offered for them: CMC opens letters, it does not
     work them. */
  const questionsRead = useCmcQuestionsRead();
  const q = cmcQuestionFacts(questionsRead);
  const qKey = JSON.stringify(q);
  const anaContext = React.useMemo(
    () => ({
      summary:
        `The user is on the ${tabLabel} tab of the CMC Module 3 operating system` +
        (r
          ? `. ${r.approvedSections} of ${r.totalSections} §3.2 sections are approved` +
            (r.staleSections ? `, ${r.staleSections} went stale after approval` : '') +
            (r.openCriticalContradictions ? `, ${r.openCriticalContradictions} critical contradiction(s) are unresolved` : '') +
            `. Final export ${r.exportReady ? 'would pass' : 'is blocked'}.`
          : '.') +
        q.sentence,
      facts: {
        tab,
        tabLabel,
        /* Spread only once measured, so a fact is never a guess. */
        ...(r
          ? {
              sectionsApproved: r.approvedSections,
              sectionsTotal: r.totalSections,
              staleSections: r.staleSections,
              openCriticalContradictions: r.openCriticalContradictions,
              exportReady: r.exportReady,
            }
          : {}),
        ...q.facts,
      },
      /* Her vocabulary for "drive this screen" requests: the tabs by name, plus
         the governed actions this module actually performs. */
      availableActions: [
        ...CMC_NAV.map((n) => `open the ${n.label} tab`),
        'compile Module 3 from the canonical sources',
        'run the contradiction sweep',
        'check the final-export gate',
        'run the ICH compliance check',
        'generate the control strategy',
        'estimate shelf life from the recorded stability results (ICH Q1E)',
        'assess whether stability batches are combinable (ICH Q1E ANCOVA poolability)',
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- q is rebuilt each render; qKey is its value
    [tab, tabLabel, r?.totalSections, r?.approvedSections, r?.staleSections, r?.openCriticalContradictions, r?.exportReady, qKey],
  );
  usePublishSurfaceContext('cmc', anaContext);

  const Surf = CMC_SURF[tab] || CmOverview;
  return (
    <CmcQuestionsContextProvider value={questionsRead}>
      <div className="cm">
        <div className="cm-sub">
          {CMC_NAV.map((n) => (<button key={n.id} className="cm-subtab" data-on={tab === n.id || undefined} onClick={() => setTab(n.id)} title={n.blurb}>{I[n.icon] || I.grid}{n.label}</button>))}
        </div>
        {/* `sequenced` suppresses the project lifecycle's Submit sentence when a
            program has no sequence. No destination here is that step, so the
            flag cannot apply; it is passed because the band is the project's
            and keeps the project's signature. */}
        <div style={{ margin: '12px 24px 0' }}>
          <StageBand stage={tab} lifecycle={CMC_NAV} onStage={setTab} sequenced />
        </div>
        <CmConnectBar nav={onNav} />
        <CmcRegisterLinks onRecovered={() => setTab('build')} />
        <Surf ask={ask} nav={onNav} />
      </div>
    </CmcQuestionsContextProvider>
  );
}
