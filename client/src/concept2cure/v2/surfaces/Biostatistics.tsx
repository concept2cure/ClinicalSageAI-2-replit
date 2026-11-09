import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { getSurfaceMeta } from '../registryModel';
import { useLiveRows, EmptyState, ProjectBack } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import type { SurfaceViewProps } from '../surfaceViews';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';
import { useAuthoringHandoff, openSavedAuthoring, statisticalOriginMatches, type AuthoringHandoffResult, type StatisticalDraftHandoff } from '../authoringHandoff';
import { AuthoringHandoffNotice } from '../AuthoringHandoffNotice';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { consumeNavParams } from '../navParams';
import { captureShellProjectGuard, readShellProject, shellProgramId, type ShellProject } from '../shellProject';
import { authService } from '@/services/portal/authService';
import { stableStringify } from '@shared/canonical-json';
import { setEditorTarget } from '../editorTarget';
import { isDeviceFamily } from '@shared/constants/domain/product-types';
import {
  AGENCY_LABELS,
  ENDPOINT_TYPE_LABELS,
  STUDY_TYPE_LABELS,
  TRACK_LABELS,
  vocabLabel,
  vocabOptions,
  vocabPhrase,
  type VocabularyMap,
} from '@shared/biostat-vocabulary';
import {
  DesignBridgePanel,
  FilingPlacementNote,
  StudyDesignCard,
  placementForDoc,
  resolveDesign,
  useBridgeDesigns,
  useDesignAssessment,
  verdictTone,
  verdictWord,
  type DesignAssessment,
} from './biostatBridge';
import { statusWords } from '../editor/CanvasDocumentList';
import { AdaptiveMonitoringPanel } from './adaptiveMonitoring';
import { BiostatKnowledgePanel } from './biostatKnowledge';

/* ═══════════════════════════════════════════════════════════════════
   Biostatistics — a document-producing statistical workbench.

   The center of gravity is the DELIVERABLE: the governed statistical
   document (real prose), regenerated whenever the design changes.

   ── Nothing on this screen is computed in the browser ──────────────
   Until 2026-10-11 this file carried `BiostatEngine`, a ~220-line
   in-browser re-implementation of the server engine — its own normal
   CDF (Abramowitz & Stegun 7.1.26, error 7.5e-8), its own quantile,
   its own sizing formulas, a second copy of those formulas in a
   scenario loop, and a smaller judgment rule set beside the real one.
   Alongside it sat browser copies of the document generators, the
   domain adapter and the regulatory customizer.

   It was the engine users actually touched, it was pinned to no
   published reference value, and it carried every defect the server
   engine had fixed: a silent HR = 0.5 substitution for any effect
   reaching 1 (`Math.log(hr > 0 ? hr : 0.5)`), equivalence sized with
   z(1−α/2)/z(1−β) where TOST needs z(1−α)/z(1−β/2), a hard-coded
   0.05 diagnostic margin with silent 0.90/0.90/0.50 defaults, and a
   silent 0.85 device performance goal. Its four copies of the sizing
   arithmetic did not agree with each other.

   Two divergent implementations of one computation, with the
   unvalidated one under the user's cursor, is disqualifying under
   computer-system validation — and the working agreement allows one
   canonical implementation per capability. The canonical one is
   server/services/ana-biostats/*, reference-pinned and reachable:

     • POST /api/ana-biostats/compute  → { validation, computation,
       judgment, domain, regulatory, interpretation }
     • POST /api/ana-biostats/document → the governed document, built
       from that same computation and judgment, so the prose and the
       figures cannot disagree.

   This surface posts the design and renders what comes back. The
   engine REFUSES rather than assuming (a missing diagnostic margin,
   a missing AUC target, an effect ≥ 1 for time-to-event, an
   unsupported agreement design), and a refusal is shown as the
   engine's own sentence — never as a blank panel, a zero, or a
   generic failure. BiostatWorkbench.tsx is the house style for that
   and this follows it.

   WHAT WAS REMOVED FROM THE SCREEN, AND WHERE IT LIVES NOW. The
   design summary used to carry an "N events" chip, read off the
   browser copy's `events` field. The server's ComputationResult has
   no such field — the required event count is part of the sizing
   formula it returns, which is printed under the summary and again
   in the document's "Formula" section. A standalone event-count
   projection is its own deterministic engine, reachable on the
   Biostatistics workbench surface (client/src/concept2cure/v2/
   surfaces/BiostatWorkbench.tsx, the `event-projection` calculator
   declared in biostatCalculators.ts).
   ═══════════════════════════════════════════════════════════════════ */

/* ── Types: the server's contract (server/services/ana-biostats/types.ts) ── */

/** The engine's `StatisticalInput`. This surface's controls write it directly. */
interface EngineInput {
  clientTrack: string;
  regulatoryBody?: string;
  studyType: string;
  objectiveType: string;
  endpointType: string;
  alpha: number;
  powerTarget: number;
  effectSize: number;
  variance?: number;
  attritionRate: number;
  allocationRatio: number;
  numberOfGroups?: number;
  numberOfEndpoints?: number;
  controlRate?: number;
  treatmentRate?: number;
  eventRate?: number;
  sensitivity?: number;
  specificity?: number;
  prevalence?: number;
  interimAnalyses?: number;
  nonInferiorityMargin?: number;
  equivalenceMargin?: number;
  /* The ROC design (auc_roc): the engine sizes it by the Hanley–McNeil
     variance. request-input.ts and input-normalizer.ts have carried these
     since the contract was written; until 2026-10-11 no control wrote them,
     so the method was unreachable from the product. */
  aucTarget?: number;
  aucNull?: number;
  /* The 2×2 crossover. Same story: on the wire, off the form. */
  crossoverPeriods?: number;
  withinSubjectCorrelation?: number;
  /* An agreement (kappa) design. The engine refuses it, naming the published
     methods and the inputs it would need — which is the honest answer, and is
     worth showing rather than leaving the design unexpressible. */
  agreementTarget?: number;
  comparatorType?: string;
  estimandStrategy?: string;
  missingDataMethod?: string;
  indication?: string;
  phase?: string;
}

interface InputWarning { field: string; message: string; suggestion?: string }
interface InputError { field: string; message: string; required: boolean }

interface InputValidationResult {
  valid: boolean;
  normalizedInput: EngineInput;
  warnings: InputWarning[];
  errors: InputError[];
  prefilled: string[];
}

interface ComputationAssumption {
  parameter: string;
  /** A string when the engine recorded a refused add-on rather than a figure. */
  value: number | string;
  source: string;
  sensitivity: string;
}

interface ComputationResult {
  method: string;
  sampleSize: { perGroup: number; total: number; groups: number };
  power: number;
  effectSize: number;
  alpha: number;
  adjustedSampleSize?: number;
  adjustedTotal?: number;
  attritionAdjusted: boolean;
  criticalValue?: number;
  testStatistic?: string;
  formula: string;
  assumptions: ComputationAssumption[];
}

interface JudgmentDimension {
  name: string;
  verdict: string;
  score: number;
  rationale: string;
  flags: string[];
}

interface FragilityAssessment {
  fragilityIndex: number;
  category: string;
  narrative: string;
}

interface JudgmentResult {
  overallVerdict: string;
  overallRisk: string;
  actionRecommendation: string;
  confidence: { level: string; score: number; factors: string[]; limitations: string[] };
  dimensions: JudgmentDimension[];
  fragility: FragilityAssessment;
  endpointMethodFit: { fit: string; suggestedMethod: string; currentMethod: string; rationale: string; alternatives: string[] };
  escalationReasons: string[];
  roleExplanations: { technical: string; clinical: string; regulatory: string; executive: string };
}

interface DomainAdaptation {
  track: string;
  methodSuggestions: string[];
  designConsiderations: string[];
  endpointGuidance: string[];
  regulatoryNotes: string[];
  riskFactors: string[];
}

interface RegulatoryCustomization {
  body: string;
  statisticalExpectations: string[];
  guidanceReferences: string[];
  riskFramingNotes: string[];
  documentRequirements: string[];
  specificConstraints: string[];
}

interface AnaInterpretation {
  summary: string;
  suggestedNextSteps: string[];
  confidenceStatement: string;
  limitations: string[];
}

/** POST /api/ana-biostats/compute (orchestrator.quickCompute). */
interface ComputeResponse {
  validation: InputValidationResult;
  computation?: ComputationResult;
  judgment?: JudgmentResult;
  domain?: DomainAdaptation;
  regulatory?: RegulatoryCustomization;
  interpretation?: AnaInterpretation;
}

/** POST /api/ana-biostats/document (documentGenerator.generate). */
interface GovernedDocumentResponse {
  type: string;
  title: string;
  content: string;
  version?: number;
  status?: string;
  provenance?: { generatedAt?: string; engineVersion?: string; computationInputs?: EngineInput; [key: string]: unknown };
}

/** A statistical document the engine can generate, as this screen offers it. */
interface DocDef {
  /** The engine's own StatisticalDocumentType — sent as `documentType`. */
  id: string;
  label: string;
  group: string;
  blurb: string;
}

interface BiostatPlan {
  id: string;
  study: string;
  // null when the clinical endpoint is not persisted on the artifact row —
  // the backend returns null rather than fabricating it (honest gap).
  endpoint: string | null;
  // null when statisticalDocumentType was not recorded on the artifact —
  // the backend returns null rather than guessing a document type.
  doc: string | null;
  status: string;
}

interface Preset {
  label: string;
  input: EngineInput;
}

/* ─── Reaching the engine ─────────────────────────────────────────────────────
   Modelled on BiostatWorkbench's `readData` (the house pattern for a server
   refusal), with one difference: these two routes answer with the payload
   itself rather than a `{ data }` envelope, so there is no `.data` to unwrap.

   `apiRequest` THROWS for every non-OK status except 401, so a real refusal
   arrives in the catch, not the branch above it. An ApiRequestError carries the
   status and a message already reduced to a displayable sentence; anything else
   is a browser-native fetch rejection whose message is not user copy. */

type EngineFailure = { ok: false; status: number; message: string | null };

async function postEngine<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | EngineFailure> {
  try {
    const r = await apiRequest('POST', path, body);
    const parsed = (await r.json().catch(() => null)) as unknown;
    if (!r.ok || parsed === null || typeof parsed !== 'object') {
      return { ok: false, status: r.status, message: serverMessage(parsed) };
    }
    return { ok: true, data: parsed as T };
  } catch (e) {
    const known = (e as { name?: unknown })?.name === 'ApiRequestError';
    return {
      ok: false,
      status: known ? (e as { status: number }).status : 0,
      message: known && (e as Error).message ? (e as Error).message : null,
    };
  }
}

/**
 * What to tell the user when the engine did not answer with a result.
 *
 * The engine's own sentence wins wherever it sent one — a `ComputationRefusal`
 * names the input it will not assume and is the only text that tells a
 * statistician what to do next. Our own copy is used only where the server sent
 * none, and never instead of it. The status rides at the END of the sentence,
 * in parentheses: a message that BEGINS with a raw transport status is stripped
 * before render (client/src/lib/queryClient.ts, INTERNAL_MARKERS).
 */
function engineFailureMessage(f: EngineFailure, subject: string): string {
  if (f.status === 401) return `Sign in to your tenant to run the statistical engine.`;
  if (f.message) return f.message;
  if (f.status === 0) return `The statistical engine could not be reached, so ${subject} was not produced.`;
  return `The statistical engine did not produce ${subject} (HTTP ${f.status}).`;
}

/* ─── The statistical documents the engine generates ─────────────────────────
   Data only. Every `id` is a `StatisticalDocumentType` the server's document
   generator implements; the label, group and blurb are this screen's copy. The
   prose itself is generated by the engine from the engine's own result — this
   file holds no document generator. */

const DOC_REGISTRY: DocDef[] = [
  { id: 'sample_size_rationale', label: 'Sample Size Rationale', group: 'Design', blurb: 'The justification reviewers ask for — method, assumptions, result, fragility.' },
  { id: 'full_statistical_analysis_plan', label: 'Statistical Analysis Plan', group: 'Analysis', blurb: 'The full SAP — populations, sample size, methods, estimand, missing data, interims.' },
  { id: 'sap_section_draft', label: 'SAP Section Draft', group: 'Analysis', blurb: 'A focused SAP section for the primary analysis.' },
  { id: 'protocol_statistical_section', label: 'Protocol Statistical Section', group: 'Design', blurb: 'Hypotheses, sample size, primary analysis and populations for the protocol.' },
  { id: 'statistical_methods_section', label: 'CSR S9.7 Methods', group: 'Reporting', blurb: 'ICH E3 S9.7 statistical methods for the clinical study report.' },
  { id: 'statistical_risk_memo', label: 'Statistical Risk Memo', group: 'Governance', blurb: 'Executive risk read with role-specific interpretations and escalation items.' },
  { id: 'design_assumption_note', label: 'Design Assumption Note', group: 'Design', blurb: 'Assumptions and their sensitivity, for the design file.' },
  { id: 'interim_analysis_plan', label: 'Interim Analysis Plan', group: 'Governance', blurb: 'Timing, alpha spending, stopping rules and governance for interim looks.' },
  { id: 'dsmb_charter', label: 'DSMB / DMC Charter', group: 'Governance', blurb: 'Independent data monitoring charter — membership, meetings, stopping guidance.' },
  { id: 'tlf_shell_plan', label: 'TLF Shell Plan', group: 'Reporting', blurb: 'Tables, listings and figures shells by ICH E3 domain.' },
  { id: 'randomization_plan', label: 'Randomization & Blinding', group: 'Design', blurb: 'Allocation, concealment, blinding and unblinding plan.' },
];

const docById = (id: string): DocDef | undefined => DOC_REGISTRY.find((d) => d.id === id);

/* ─── Markdown -> HTML for the document canvas ─── */
/* Markdown rendering is `renderSafeMarkdown` (marked + DOMPurify), the
   codebase's one audited markdown-to-HTML path — see
   components/ana/renderSafeMarkdown.ts. It runs a real markdown parser and then
   reduces the result to an explicit tag/attribute allowlist, so `<script>`,
   inline event handlers and `javascript:` URLs are removed rather than depended
   upon never to arrive. */

/* ── Design presets (engine inputs — not stored data) ── */

const BS_PRESETS: Record<string, Preset> = {
  survival: { label: 'Pivotal OS (survival)', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'time_to_event', alpha: 0.05, powerTarget: 0.90, effectSize: 0.38, eventRate: 0.55, attritionRate: 0.15, allocationRatio: 1, numberOfGroups: 2, numberOfEndpoints: 1, interimAnalyses: 2, comparatorType: 'placebo', estimandStrategy: 'treatment_policy', missingDataMethod: 'MMRM', indication: 'Oncology', phase: 'Phase III' } },
  binary: { label: 'ORR (binary)', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'binary', alpha: 0.05, powerTarget: 0.90, effectSize: 0.15, controlRate: 0.30, treatmentRate: 0.45, attritionRate: 0.15, allocationRatio: 1, numberOfGroups: 2, numberOfEndpoints: 1, comparatorType: 'placebo', phase: 'Phase III' } },
  ni: { label: 'Non-inferiority', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'EMA', studyType: 'non_inferiority', objectiveType: 'efficacy', endpointType: 'continuous', alpha: 0.025, powerTarget: 0.90, effectSize: 0.0, nonInferiorityMargin: -0.4, variance: 1, attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 2, comparatorType: 'active', phase: 'Phase III' } },
  ivd: { label: 'Diagnostic accuracy', input: { clientTrack: 'diagnostics_ivd', regulatoryBody: 'FDA', studyType: 'diagnostic_accuracy', objectiveType: 'diagnostic_accuracy', endpointType: 'sensitivity_specificity', alpha: 0.05, powerTarget: 0.90, effectSize: 0.9, sensitivity: 0.90, specificity: 0.92, prevalence: 0.30, attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 1, numberOfEndpoints: 2 } },
  // Two designs the engine has always sized and no control could ask for.
  roc: { label: 'ROC / AUC', input: { clientTrack: 'diagnostics_ivd', regulatoryBody: 'FDA', studyType: 'diagnostic_accuracy', objectiveType: 'diagnostic_accuracy', endpointType: 'auc_roc', alpha: 0.05, powerTarget: 0.80, effectSize: 0, aucTarget: 0.85, aucNull: 0.50, attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 2 } },
  crossover: { label: '2×2 crossover', input: { clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'continuous', alpha: 0.05, powerTarget: 0.80, effectSize: 0.5, variance: 1, crossoverPeriods: 2, withinSubjectCorrelation: 0.5, attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 2 } },
};

function vf(v: string): number | undefined { return v === undefined || v === null || v === '' ? undefined : parseFloat(v); }

/** The worked example a project with no recorded design opens on: diagnostic
 *  accuracy for a device or diagnostic project, the survival example otherwise.
 *  (2026-10-31: an IVD project opened on an oncology survival preset.) */
function defaultPresetFor(project: ShellProject | null): string {
  return isDeviceFamily(project?.productType) ? 'ivd' : 'survival';
}

/* ── Working documents saved from this page, this session ───────────────────
   "File it to the dossier" filed nothing: it called the same writer as "Open in
   document editor" and created another working document on every click
   (2026-10-31 audit). Filing is the editor's act — "Place into filing"
   (surfaces/AuthoringPlaceIntoFiling.tsx) places an authored document into a
   sequence — so this page says what it does, "Save as a working document", and
   reuses the copy it already saved for the same project, source (the design or
   the example) and document type when the text has not changed. The hand-off's
   own lane remembers only its LAST payload, so saving the rationale, then the
   SAP, then the rationale again minted a third document; this remembers each. */
interface SavedWorkingDoc { docId: string; programId: string; code: string; content: string; title: string; draft: StatisticalDraftHandoff; actor: string }
const statisticalActor = () => `${authService.getUser()?.organizationId ?? ''}:${authService.getUser()?.id ?? ''}`;

type SavedStatisticalResponse = { success?: unknown; document?: { id?: unknown; client_program_id?: unknown;
  provenance?: { statisticalSource?: unknown } } } | null;

function savedStatisticalDocumentMatches(body: SavedStatisticalResponse, prior: SavedWorkingDoc): boolean {
  return body?.success === true && body.document?.id === prior.docId && body.document.client_program_id === prior.programId
    && statisticalOriginMatches(body.document.provenance?.statisticalSource, prior.draft, prior.programId);
}

function statisticalDraftFromPreview(documentType: string, input: EngineInput, preview: GovernedDocumentResponse,
  source: { isExample: boolean; exampleName: string; loadedDesign: DesignAssessment | null }): StatisticalDraftHandoff | undefined {
  const { isExample, exampleName, loadedDesign } = source;
  let basis: StatisticalDraftHandoff['basis'];
  if (isExample) basis = { kind: 'worked_example', label: exampleName };
  else if (loadedDesign?.provenance?.inputsSha256) {
    basis = { kind: 'study_design', studyId: loadedDesign.studyId, designInputsSha256: loadedDesign.provenance.inputsSha256,
      ...(loadedDesign.sizingRun?.state === 'found' ? { sizingRunId: loadedDesign.sizingRun.runId } : {}) };
  } else return undefined;
  return { documentType, input: preview.provenance?.computationInputs ?? input, expectedMarkdown: preview.content, basis };
}

/** Recheck the retained copy's exact statistical basis and section before
 * reuse. An unavailable or changed record stops the action; it never silently
 * creates another document after losing confirmation of this one. */
async function stillSaved(prior: SavedWorkingDoc, current: () => boolean): Promise<boolean> {
  try {
    const res = await apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(prior.docId)}`);
    if (!current()) return false;
    const body = (await res.json().catch(() => null)) as SavedStatisticalResponse;
    if (!current() || !res.ok || !savedStatisticalDocumentMatches(body, prior)) return false;
    const response = await apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(prior.docId)}/sections`);
    const sections = await response.json().catch(() => null);
    return current() && response.ok && sections?.success === true && Array.isArray(sections.sections)
      && sections.sections.some((s: { doc_id?: unknown; code?: unknown }) => s.doc_id === prior.docId && s.code === prior.code);
  } catch {
    return false;
  }
}

/** One engine vocabulary as a select: every value the engine accepts, by its label. */
function VocabSelect({ label, map, value, onChange }: { label: string; map: VocabularyMap; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <label className="bs-f"><span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {value && !Object.prototype.hasOwnProperty.call(map, value) && <option value={value}>{vocabLabel(map, value)}</option>}
        {vocabOptions(map).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/* The design is re-sized on the server, so a keystroke is a request. Coalesce
   the burst a user types into one call; the generation counter below is what
   keeps a late answer from landing on a newer design. */
const COMPUTE_DEBOUNCE_MS = 180;

/** What the engine has said about the design currently on screen. */
type EngineState =
  | { kind: 'computing' }
  | {
      kind: 'ready';
      /** The engine's NORMALIZED input — what it actually sized, defaults disclosed. */
      input: EngineInput;
      computation: ComputationResult;
      judgment: JudgmentResult;
      domain: DomainAdaptation;
      regulatory?: RegulatoryCustomization;
      interpretation?: AnaInterpretation;
      warnings: InputWarning[];
    }
  | { kind: 'refused'; message: string };

/** The governed document, as the engine generated it. */
type DocState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'ready'; markdown: string; title: string; version?: number; status?: string; engineVersion?: string;
      provenance?: GovernedDocumentResponse['provenance']; statisticalDraft?: StatisticalDraftHandoff }
  | { kind: 'failed'; message: string };

/**
 * The page's one ask row (§WA.4.2 rule 4): three starters, the first of which
 * is the question the retired banner opened with — and it branches the same
 * way the banner did, because asking "is my sample size defensible?" over a
 * WORKED EXAMPLE would be asking about somebody else's study.
 */
function BsStarters({ ask, isExample, docLabel, agency }: {
  ask: (text: string) => void;
  isExample: boolean;
  docLabel: string;
  agency: string;
}) {
  const starters = [
    isExample
      ? {
          label: 'Size my own study instead of the example',
          prompt: 'Which of my project’s study designs should I size, and what do you need from me?',
        }
      : {
          label: 'Is my sample size defensible?',
          prompt: `Is the ${docLabel} for this design defensible to ${agency}? Use the engine’s computation and judgment on screen.`,
        },
    { label: `Refine the ${docLabel.toLowerCase()}`, prompt: `Refine the ${docLabel} for this design.` },
    {
      label: 'What will the reviewer question first?',
      prompt: `Which assumption in this design will a ${agency} reviewer question first, and why?`,
    },
  ];
  return (
    <div className="sp-starters" data-layout="row" role="group" aria-label="Ask AnA">
      {starters.map((st) => (
        <button key={st.label} type="button" className="sp-starter" onClick={() => ask(st.prompt)}>
          <span className="sk" aria-hidden="true">{I.sparkles}</span><span>{st.label}</span>
        </button>
      ))}
    </div>
  );
}

/* `ResultLead` — the tinted serif answer banner over this page — is deleted
   (D5 §B.4.3, §WA.4.2 rule 4). It said four things and each has a place:
     • its question    → the page's first starter, which asks AnA the same
                         thing and branches the same way on the worked example;
     • its figures     → the design-assessment section's grey line ("56
                         subjects · 91% power · Inadequate · 4 of 10 checks
                         pass") and the artifact header's meta;
     • its actions     → the header's one primary ("Open in editor" / "Copy
                         example to editor") and the artifact bar's Save;
     • its reassurance → deleted. "I flagged the underpowering honestly" is
                         AnA's voice; the document's own risk section states
                         it, and she says it when asked.
   The helper's rule that a worked example is ALWAYS called one is kept in two
   places rather than one: the artifact's meta and a quiet note above it. */

/* ════ Biostatistics surface ════ */

export function Biostatistics({ onAsk, onNav }: SurfaceViewProps) {
  const handoff = useAuthoringHandoff();
  const saveToAuthoring = handoff.save;
  const ask = onAsk;
  const [preset, setPreset] = useState(() => defaultPresetFor(readShellProject()));
  const [input, setInput] = useState<EngineInput>(() => BS_PRESETS[defaultPresetFor(readShellProject())].input);
  /* A preset is a worked example, not the person's study — edited or not. "Your
     design" is said only when the inputs came from a recorded study design
     (preset === 'design'); an edited example is "Worked example (modified)".
     2026-10-31: it called the oncology example "your superiority design" on a
     psoriasis project, and an edited example became "your design". */
  const [edited, setEdited] = useState(false);
  /* Set once the person picks a preset or changes an input: from then on the
     page never waits for, or replaces their choice with, the project's design. */
  const [personChose, setPersonChose] = useState(false);
  const [docType, setDocType] = useState('sample_size_rationale');
  const [toast, fireToast] = useToast();

  /* ── The study design bridge ──────────────────────────────────────────────
     The engine used to take its study from four presets and nothing else. It
     now loads the program's PERSISTED study designs (the design-as-data spine,
     GET /api/biostat-bridge/designs) and seeds itself from the one the person
     picks — or the one the protocol workspace / AnA handed over on the nav
     channel (`studyId`). The seed is the server adapter's translation of the
     design (with its honest gaps); the numbers on screen are the engine's
     answer for that design, exactly as for a preset. */
  const program = readShellProject();
  const [designReload, setDesignReload] = useState(0);
  const designs = useBridgeDesigns(designReload);
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(() => consumeNavParams('biostatistics')?.studyId ?? null);
  const bridge = useDesignAssessment(selectedStudyId);
  const loadedDesign = bridge.assessment;
  /* With a project open, its own study design is what the engine opens on —
     once, and never over a choice the person made (a design, a preset or an
     edited input). The list is already narrowed to the open project. */
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current || !program || selectedStudyId || designs.loading || designs.rows.length === 0) return;
    autoLoaded.current = true;
    /* The list also carries study records with no design to assess: the server gives them no readiness checks
       (biostatistics-bridge/bridge-service.ts listBridgeDesigns), and their assessment answers 404. Open on the first
       real design; with none, nothing is opened and the worked example stays. A person can still choose any row. */
    const first = designs.rows.find((row) => row.readiness.checks.length > 0);
    if (first) setSelectedStudyId(first.studyId);
  }, [program, selectedStudyId, designs.loading, designs.rows]);
  useEffect(() => {
    const seed = loadedDesign?.adapter.input;
    if (!seed) return;
    // The adapter emits the engine's StatisticalInput, which is exactly what
    // this surface's controls hold and what it posts back to the engine.
    setInput(seed as unknown as EngineInput);
    setPreset('design');
    setEdited(false);
  }, [loadedDesign]);

  // Governed statistical documents — the ONE stored, org-scoped slice of this
  // surface. GET /api/ana-biostats/governed-documents reads real persisted
  // artifacts (concept2cure_artifacts, type 'statistical_summary'), org-scoped.
  // Real rows, an honest empty state, or an honest failed-load state — never a
  // fixture. Narrowed to the open program when one is open (the route resolves
  // the program UUID to the artifact store's project id, tenant-scoped); the
  // card's sub-label says which scope it is showing.
  const govDocsPath = program
    ? '/api/ana-biostats/governed-documents?programId=' + encodeURIComponent(String(program.id))
    : '/api/ana-biostats/governed-documents';
  const govDocs = useLiveRows<BiostatPlan>(govDocsPath);
  const set = (k: string, v: unknown) => { autoLoaded.current = true; setPersonChose(true); setEdited(true); setInput((s) => ({ ...s, [k]: v })); };
  const applyPreset = (k: string) => { autoLoaded.current = true; setPersonChose(true); setPreset(k); setInput(BS_PRESETS[k].input); setEdited(false); };
  /* Keyed on the SOURCE of the inputs, not on whether they were edited. */
  const isExample = preset !== 'design';
  const exampleName = BS_PRESETS[preset]?.label ?? 'preset';
  /* While the open project's study design is still loading, the engine is not
     asked to size a worked example first (2026-10-31: the oncology example
     flashed, with its verdict, before the project's own design replaced it). It
     falls back to an example only when the project has no design the engine can
     size, the read failed, or the person chose one. */
  const designPending = (!!program && (designs.loading || (designs.rows.length > 0 && !selectedStudyId)))
    || (!!selectedStudyId && !bridge.assessment && !bridge.error);
  const holdForDesign = !personChose && preset !== 'design' && designPending;
  /* Project home publishes the project's product type once its read model
     loads, which can be after this page mounted: follow it until the person
     chooses, so a device or diagnostic project is not left on the survival example. */
  const wantedExample = defaultPresetFor(program);
  useEffect(() => {
    if (personChose || edited || preset === 'design' || preset === wantedExample) return;
    setPreset(wantedExample);
    setInput(BS_PRESETS[wantedExample].input);
  }, [wantedExample, personChose, edited, preset]);

  /* ── The design, sized by the engine ─────────────────────────────────────
     One request per settled design. `generation` is bumped on every change, so
     an answer for a design the user has already edited away from is dropped
     rather than painted over the newer one. */
  const [engine, setEngine] = useState<EngineState>({ kind: 'computing' });
  const generation = useRef(0);
  /* Bumped by the retry control. A refusal is a property of the design, not of
     the connection, so "try again" has to be able to ask the identical question
     again — which a dependency on the design alone cannot express. */
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    const gen = ++generation.current;
    setEngine({ kind: 'computing' });
    if (holdForDesign) return undefined;
    const timer = setTimeout(async () => {
      const r = await postEngine<ComputeResponse>('/api/ana-biostats/compute', input);
      if (gen !== generation.current) return;
      if (!r.ok) {
        setEngine({ kind: 'refused', message: engineFailureMessage(r, 'a design') });
        return;
      }
      const { validation, computation, judgment, domain } = r.data;
      if (!validation?.valid) {
        /* The normalizer's own sentences, which name the field and what it
           needs. A list of them beats "invalid input", which tells a
           statistician nothing they can act on. */
        const said = (validation?.errors ?? []).map((e) => e.message).filter(Boolean);
        setEngine({
          kind: 'refused',
          message: said.length
            ? said.join(' ')
            : 'The statistical engine could not size this design and gave no reason.',
        });
        return;
      }
      if (!computation || !judgment || !domain) {
        setEngine({
          kind: 'refused',
          message: 'The statistical engine accepted this design but returned no result for it.',
        });
        return;
      }
      setEngine({
        kind: 'ready',
        input: validation.normalizedInput ?? input,
        computation,
        judgment,
        domain,
        regulatory: r.data.regulatory,
        interpretation: r.data.interpretation,
        warnings: validation.warnings ?? [],
      });
    }, COMPUTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, retryTick, holdForDesign]);

  const docDef = docById(docType);

  /* ── The document, written by the engine from the engine's own result ──── */
  const [doc, setDoc] = useState<DocState>({ kind: 'idle' });
  const docGeneration = useRef(0);
  const ready = engine.kind === 'ready' ? engine : null;

  useEffect(() => {
    const gen = ++docGeneration.current;
    if (!ready || !docDef) { setDoc({ kind: 'idle' }); return; }
    setDoc({ kind: 'generating' });
    let cancelled = false;
    void (async () => {
      const r = await postEngine<GovernedDocumentResponse>('/api/ana-biostats/document', {
        documentType: docDef.id,
        input: ready.input,
      });
      if (cancelled || gen !== docGeneration.current) return;
      if (!r.ok) {
        setDoc({ kind: 'failed', message: engineFailureMessage(r, `the ${docDef.label.toLowerCase()}`) });
        return;
      }
      if (typeof r.data.content !== 'string' || !r.data.content.trim()) {
        setDoc({ kind: 'failed', message: `The engine returned no text for the ${docDef.label.toLowerCase()}.` });
        return;
      }
      setDoc({
        kind: 'ready',
        markdown: r.data.content,
        title: r.data.title,
        version: r.data.version,
        status: r.data.status,
        engineVersion: r.data.provenance?.engineVersion,
        provenance: r.data.provenance,
        statisticalDraft: statisticalDraftFromPreview(docDef.id, ready.input, r.data, { isExample, exampleName, loadedDesign }),
      });
    })();
    return () => { cancelled = true; };
  }, [ready, docDef, isExample, exampleName, loadedDesign]);

  const md = doc.kind === 'ready' ? doc.markdown : '';
  const html = useMemo(() => (md ? renderSafeMarkdown(md) : ''), [md]);

  /* Which controls a design needs is decided by its ENDPOINT, not by the
     sponsor's track — the same correction the engine took on 2026-10-11. A
     pharma sponsor running a diagnostic sub-study is sized by the accuracy
     method, so this form has to let them enter the accuracy targets; before
     this change those three controls appeared on the diagnostics_ivd track
     only, and the ROC and crossover controls did not exist at all. */
  const isAccuracy = input.endpointType === 'sensitivity_specificity' || input.studyType === 'diagnostic_accuracy';
  const isRoc = input.endpointType === 'auc_roc';
  const isAgreement = input.endpointType === 'agreement';
  const isSurv = input.endpointType === 'time_to_event';
  const isBin = input.endpointType === 'binary';
  const isCont = input.endpointType === 'continuous';
  const isNI = input.studyType === 'non_inferiority';
  const isEquiv = input.studyType === 'equivalence';
  /* An effect size is not an input to an accuracy, ROC or agreement design. */
  const usesEffect = !isAccuracy && !isRoc && !isAgreement;
  const n = ready ? (ready.computation.adjustedTotal || ready.computation.sampleSize.total) : 0;

  /* Where THIS document files for the program's application type — from the
     bridge's placement catalog. Null when no design is loaded or the program
     has no filing type; the authoring hand-off then keeps its historical M5. */
  const placement = placementForDoc(loadedDesign, docType);
  const filingModule = placement?.module ?? 'M5';

  /* Save the engine's document through the shared writer, then open its exact
     confirmed document/project/section through the existing editor target.
     Unconfirmed writes keep the document on this surface with an honest notice. */
  const opening = handoff.state?.phase === 'pending';
  const attaching = opening;
  const savedWorking = useRef(new Map<string, SavedWorkingDoc>());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /* What reaches the editor is the document as the page renders it — HTML, the
     same `html` the preview shows. Until 2026-10-31 this sent `md`, the engine's
     Markdown, and the editor stores section content verbatim, so the person
     opened "## Study Context" and "|---|---|" instead of headings and tables. */
  const docTitle = docDef?.label || 'Statistical document';
  /* A worked example is saved under a title that says so, so an oncology
     example can never sit in a project looking like that project's document. */
  const savedTitle = isExample ? `${docTitle} — worked example: ${exampleName}` : docTitle;
  const docCode = docDef?.id || 'statistical_document';
  const statisticalDraft = doc.kind === 'ready' ? doc.statisticalDraft : undefined;
  const savedKey = `${shellProgramId() ?? ''}|${isExample ? 'example:' + preset : 'design:' + (selectedStudyId ?? '')}|${docType}`;
  /* Synchronous when there is nothing to reuse, so a first click reaches the
     writer in the same tick and the hand-off's one creation lane still blocks
     a second, simultaneous click. */
  const savedCandidate = (): SavedWorkingDoc | null => {
    const prior = savedWorking.current.get(savedKey);
    return prior && prior.content === html && prior.programId === shellProgramId() && prior.actor === statisticalActor()
      && stableStringify(prior.draft) === stableStringify(statisticalDraft) ? prior : null;
  };
  const confirmed = async (prior: SavedWorkingDoc): Promise<SavedWorkingDoc | null> => {
    const project = captureShellProjectGuard(), session = authService.captureSessionReadGuard(), actor = statisticalActor();
    const current = () => mounted.current && project() && session.sameRevision() && statisticalActor() === actor;
    if (await stillSaved(prior, current)) return prior;
    if (current()) fireToast('Could not confirm the existing working document and its statistical basis. Check that document before requesting another copy.', 'error');
    return null;
  };
  const remember = (r: AuthoringHandoffResult) => {
    if (r.ok && statisticalDraft) savedWorking.current.set(savedKey, { docId: r.docId, programId: r.programId, code: r.code,
      content: html, title: savedTitle, draft: statisticalDraft, actor: statisticalActor() });
  };
  const write = () => saveToAuthoring({
    // Statistical documentation files under Module 5; the server would default to M3.
    title: savedTitle, module: filingModule, code: docCode, content: html, subject: 'the document', statisticalDraft,
  });

  const openEditor = async () => {
    if (handoff.blocked) return;
    if (!html.trim()) { fireToast('Nothing to open yet — the engine has not returned the document.', 'error'); return; }
    if (!statisticalDraft) { fireToast('Reload the study design before saving its statistical basis.', 'error'); return; }
    const candidate = savedCandidate();
    const prior = candidate ? await confirmed(candidate) : null;
    if (candidate && !prior) return;
    if (prior && onNav) {
      // The copy saved earlier this session, unchanged: open it, write nothing.
      setEditorTarget({ docType: null, docId: prior.docId, programId: prior.programId, code: prior.code });
      onNav('document-authoring');
      return;
    }
    const r = await write();
    // Navigate only after the complete atomic document/section/source receipt.
    // An uncertain result stays here for the existing exact-record recovery.
    if (!r.isCurrent()) return;
    if (!r.ok) { fireToast(r.message, 'error'); return; }
    remember(r);
    if (onNav) openSavedAuthoring(r, onNav);
    else fireToast(r.message);
  };
  /** Save a working document without leaving this surface. It files nothing:
   * placing a document into a submission is the editor's "Place into filing".
   * The server reports governed binding separately; an unbound working copy
   * stays unbound and its reason remains visible in the shared confirmation. */
  const saveWorking = async () => {
    if (handoff.blocked) return;
    if (!html.trim()) { fireToast('Nothing to save yet — the engine has not returned the document.', 'error'); return; }
    if (!statisticalDraft) { fireToast('Reload the study design before saving its statistical basis.', 'error'); return; }
    const candidate = savedCandidate();
    const prior = candidate ? await confirmed(candidate) : null;
    if (candidate && !prior) return;
    if (prior) {
      fireToast(`Already saved as the working document “${prior.title}”. Nothing new was written — open it from Document authoring.`);
      return;
    }
    const r = await write();
    if (!r.isCurrent()) return;
    if (!r.ok) { fireToast(r.message, 'error'); return; }
    remember(r);
    fireToast(r.message + (isExample
      ? ' It is a copy of a worked example, not this project’s study.'
      : placement?.required === 'not_applicable'
        ? ' This is an internal design document, not a submission document for this filing.'
        : ' To file it, open it in the editor and use Place into filing.'));
  };
  const groups = DOC_REGISTRY.reduce<Record<string, DocDef[]>>((m, d) => { (m[d.group] = m[d.group] || []).push(d); return m; }, {});
  /* 'insufficient_information' is the engine's third state — a dimension it had
     nothing to judge against. It is a caution, never a pass and never a fail. */
  /* WHAT ANA SEES HERE. Every number published below is one the engine returned
     for the design on screen; while it is still computing, or when it refused,
     no n/power/verdict is published because none is on screen. The govDocs read
     scopes ONLY the persisted-documents claim — its error must never read as
     zero rows. */
  const anaContext = useMemo(() => {
    const presetLabel = BS_PRESETS[preset]?.label ?? preset;
    const gov = govDocs.loading
      ? 'the governed statistical document list is still loading'
      : govDocs.error
        ? 'the governed statistical document list did not load, so the count of persisted documents is unknown'
        : govDocs.empty
          ? 'no governed statistical documents persisted yet'
          : govDocs.rows.length + ' governed statistical document(s) persisted (org-scoped)';
    const govFacts = !govDocs.loading && !govDocs.error ? { governedDocumentsPersisted: govDocs.rows.length } : {};
    const designFacts = loadedDesign
      ? {
          loadedStudyDesign: { studyId: loadedDesign.studyId, title: loadedDesign.title, readinessPct: loadedDesign.readiness.percent },
          blockingDesignGaps: loadedDesign.adapter.gaps.filter((g) => g.severity === 'blocking').map((g) => g.field),
          applicationType: loadedDesign.filing.applicationType,
          proposedTasks: loadedDesign.proposedTasks.length,
          documentFilesUnder: placement ? (placement.code ?? 'not filed') : null,
        }
      : { loadedStudyDesign: null, persistedDesignsListed: designs.loading || designs.error ? null : designs.rows.length };
    if (engine.kind === 'computing') {
      return {
        summary: 'Biostatistics — the statistical engine is still sizing the design on screen, so no sample size, power or verdict is shown yet; ' + gov + '.',
        facts: { documentType: docDef?.label ?? null, preset: presetLabel, designComputed: false, ...govFacts, ...designFacts },
      };
    }
    if (engine.kind === 'refused') {
      return {
        summary: 'Biostatistics — the statistical engine declined to size the design on screen, so no sample size, power or verdict is shown: '
          + engine.message + ' ' + gov + '.',
        facts: { documentType: docDef?.label ?? null, preset: presetLabel, designComputed: false, engineRefusal: engine.message, ...govFacts, ...designFacts },
      };
    }
    return {
      summary:
        'Biostatistics — a ' + (docDef?.label ?? 'statistical document') + ' drafted for a ' + vocabPhrase(STUDY_TYPE_LABELS, engine.input.studyType)
        + ' design (' + presetLabel + ' preset): ' + n + ' subjects, ' + (engine.computation.power * 100).toFixed(0) + '% power, overall verdict '
        + engine.judgment.overallVerdict + '; ' + gov + '.',
      facts: {
        documentType: docDef?.label ?? null,
        preset: presetLabel,
        subjectsN: n,
        achievedPowerPct: Number((engine.computation.power * 100).toFixed(1)),
        overallVerdict: engine.judgment.overallVerdict,
        statisticalMethod: engine.computation.method,
        engineSummary: engine.interpretation?.summary ?? null,
        ...govFacts,
        ...designFacts,
      },
      availableActions: [
        'Load one of the project\'s persisted study designs into the engine',
        'Adjust any design input or preset — the engine re-sizes the design and rewrites the document',
        'Pick a different statistical document type to generate',
        'Refine the document with AnA',
        'Opening in the editor and saving a working document both create a working document in the project (genesis revision + Part 11 audit row); neither files it — filing is "Place into filing" in the editor. AnA proposes them in conversation, never through screen controls.',
      ],
    };
  }, [engine, docDef, preset, n, govDocs.loading, govDocs.error, govDocs.empty, govDocs.rows, loadedDesign, placement, designs.loading, designs.error, designs.rows.length]);
  /* Both actions change what the engine is asked, not what is filed. Opening in
     the editor and attaching to the dossier stay governed human acts.
     `applyPreset` is the SAME function the chips call. */
  useSurfaceActionHandlers('biostatistics', {
    'biostatistics.load-design': (params) => {
      if (designs.loading) return { ok: false, reason: 'The study designs are still loading.', retry: true };
      if (designs.error) return { ok: false, reason: 'The study designs did not load, so none can be selected.' };
      const r = resolveDesign(designs.rows, String(params.design ?? ''));
      if (!r.ok) return { ok: false, reason: r.reason };
      if (selectedStudyId === r.row.studyId) return { ok: true, detail: `Already loaded "${r.row.title}"` };
      setSelectedStudyId(r.row.studyId);
      return { ok: true, detail: `Loading "${r.row.title}" — the engine re-sizes from the design; nothing is filed` };
    },
    'biostatistics.set-preset': (params) => {
      const target = String(params.preset ?? '');
      const meta = BS_PRESETS[target];
      if (!meta) return { ok: false, reason: `No design preset named "${params.preset}".` };
      if (preset === target) return { ok: true, detail: `Already on the ${meta.label} preset` };
      applyPreset(target);
      return { ok: true, detail: `Applied the ${meta.label} preset — the engine re-sizes the design; nothing is filed` };
    },
    'biostatistics.set-doc-type': (params) => {
      const target = String(params.docType ?? '');
      const found = docById(target);
      if (!found) return { ok: false, reason: `No statistical document type named "${params.docType}".` };
      if (docType === target) return { ok: true, detail: `Already drafting the ${found.label}` };
      setDocType(target);
      return { ok: true, detail: `Switched the document to ${found.label} — filing it stays a human act` };
    },
  });
  /* The ready signal for the hold above. A design named while the list is
     loading gets its answer once the list has settled, loaded or not: the
     handler refuses a failed read itself, and without this the held
     directive waited out the bus's 20 s and was never answered. */
  useEffect(() => {
    if (!designs.loading) notifySurfaceActionReady('biostatistics');
  }, [designs.loading]);

  usePublishSurfaceContext('biostatistics', anaContext);

  const retryCompute = useCallback(() => setRetryTick((t) => t + 1), []);

  /* The row StudyDesignCard selects. `BridgeDesignRow` keys on `studyId`
     and titles on `title` — the spec's `d.id` / `d.label` are not this
     type's fields. */
  const selectedDesign = designs.rows.find((d) => d.studyId === selectedStudyId);
  const agencyLabel = vocabLabel(AGENCY_LABELS, ready?.regulatory?.body || input.regulatoryBody || 'FDA');

  return (
    <div className="page-inner bs" data-work-area="biostatistics">
      {/* The one shared back link (D0-7, dataConnect). It reads the shell
          rather than this screen's `program` prop, which also fixes a defect
          of the copy it replaces: the link appears when a project is opened
          AFTER the screen mounts. `program` stays — it is this screen's data. */}
      <ProjectBack onNav={onNav} />
      <header className="ph">
        <div>
          <h1 className="ph-title">{getSurfaceMeta('biostatistics').label}</h1>
          {/* One sentence (§WA.3 "Type"). The three it replaced said what the
              engine is, that it is deterministic, and that nothing runs in the
              browser; the last is a standards note and moves to the assessment's
              disclosure, where a reviewer looks for it. */}
          <p className="ph-sub">
            {selectedDesign
              ? `Size and judge ${selectedDesign.title}’s design on the statistical engine, and write the documents it needs.`
              : 'Size and judge a study design on the statistical engine, and write the documents it needs.'}
          </p>
        </div>
        <div className="ph-acts">
          {onNav && (
            <button type="button" className="btn ghost" onClick={() => onNav('biostat-workbench')}>
              {I.sigma} Design calculators
            </button>
          )}
          {/* The page's ONE primary: take the document into the one editor. */}
          <button
            type="button"
            className="btn primary"
            onClick={() => void openEditor()}
            disabled={handoff.blocked || doc.kind !== 'ready' || opening || attaching}
            title={handoff.blocked ? 'The editor handoff is blocked — see the notice below' : undefined}
          >
            {I.penLine}{' '}
            {opening ? 'Saving to the editor…' : isExample ? 'Copy example to editor' : 'Open in editor'}
          </button>
        </div>
      </header>

      <BsStarters
        ask={onAsk}
        isExample={isExample}
        docLabel={docDef?.label ?? 'statistical document'}
        agency={agencyLabel}
      />

      <AuthoringHandoffNotice handoff={handoff} onNav={onNav} />
      <div className="bs-doc-layout">
        {/* Left: the study, what to produce, design inputs, the assessment */}
        <div className="bs-side">
          <StudyDesignCard designs={designs} selectedId={selectedStudyId} onSelect={setSelectedStudyId} />
          {/* "what to produce" goes: a heading reading "Document" over a list
              of document names does not need telling what it is (§WA.3). */}
          <section className="pj-sec" aria-label="Document">
            <div className="pj-sec-h"><h2>Document</h2></div>
            <>
              {Object.entries(groups).map(([g, docs]) => (
                <div key={g} className="bs-doc-group">
                  <div className="bs-doc-gl">{g}</div>
                  {docs.map((d) => (
                    <button key={d.id} className={'bs-doc-opt' + (docType === d.id ? ' on' : '')} onClick={() => setDocType(d.id)} title={d.blurb}>
                      <span className="bs-doc-t">{d.label}</span>{docType === d.id && <span className="bs-doc-chk">{I.check}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </>
          </section>
          <section className="pj-sec" aria-label="Design inputs">
            <div className="pj-sec-h">
              <h2>Design inputs</h2>
              <span className="sec-sub">the engine re-sizes it live</span>
            </div>
            <>
              {/* Toggles, with the state in `aria-pressed` as well as the class
                  the tests read. The loaded design's preset was a filled orange
                  — one of this page's four — for a control that chooses which
                  numbers to load, not an act (D5 §B.4.5). */}
              <div className="bs-presets">
                {loadedDesign && <button type="button" className={'bs-preset' + (preset === 'design' ? ' on' : '')} aria-pressed={preset === 'design'} onClick={() => { const seed = loadedDesign.adapter.input; if (seed) { setInput(seed as unknown as EngineInput); setPreset('design'); setEdited(false); } }} disabled={!loadedDesign.adapter.input} title={loadedDesign.adapter.input ? 'The loaded study design' : 'The loaded design cannot be sized until its blocking gaps are resolved'}>{I.sigma} {loadedDesign.title}</button>}
                {Object.entries(BS_PRESETS).map(([k, p]) => <button key={k} type="button" className={'bs-preset' + (preset === k ? ' on' : '')} aria-pressed={preset === k} onClick={() => applyPreset(k)} title="A worked example, not your study">{p.label}</button>)}
              </div>
              {/* Every option is the engine's own vocabulary, by its label
                  (shared/biostat-vocabulary.ts). The study-type list used to
                  omit values the engine accepts, so a dose–response design
                  showed "superiority" — the first option — while being sized
                  as dose–response. */}
              <div className="bs-fields">
                <VocabSelect label="Track" map={TRACK_LABELS} value={input.clientTrack} onChange={(v) => set('clientTrack', v)} />
                <VocabSelect label="Agency" map={AGENCY_LABELS} value={input.regulatoryBody} onChange={(v) => set('regulatoryBody', v)} />
                <VocabSelect label="Study type" map={STUDY_TYPE_LABELS} value={input.studyType} onChange={(v) => set('studyType', v)} />
                <VocabSelect label="Endpoint" map={ENDPOINT_TYPE_LABELS} value={input.endpointType} onChange={(v) => set('endpointType', v)} />
                <label className="bs-f"><span>Alpha</span><input type="number" step="0.005" value={input.alpha} onChange={(e) => set('alpha', vf(e.target.value) || 0.05)} /></label>
                <label className="bs-f"><span>Power</span><input type="number" step="0.05" value={input.powerTarget} onChange={(e) => set('powerTarget', vf(e.target.value) || 0.8)} /></label>
                {usesEffect && <label className="bs-f"><span>{isSurv ? 'HR reduction' : isBin ? 'Delta rate' : 'Effect (d)'}</span><input type="number" step="0.01" value={input.effectSize} onChange={(e) => set('effectSize', vf(e.target.value) || 0)} /></label>}
                {isNI && <label className="bs-f"><span>NI margin</span><input type="number" step="0.05" value={input.nonInferiorityMargin || ''} onChange={(e) => set('nonInferiorityMargin', vf(e.target.value))} /></label>}
                {isEquiv && <label className="bs-f"><span>Equivalence margin</span><input type="number" step="0.05" value={input.equivalenceMargin || ''} onChange={(e) => set('equivalenceMargin', vf(e.target.value))} /></label>}
                {isCont && <label className="bs-f"><span>Variance</span><input type="number" step="0.1" value={input.variance || ''} onChange={(e) => set('variance', vf(e.target.value))} /></label>}
                {isBin && <label className="bs-f"><span>Control rate</span><input type="number" step="0.05" value={input.controlRate || ''} onChange={(e) => set('controlRate', vf(e.target.value))} /></label>}
                {isBin && <label className="bs-f"><span>Treatment rate</span><input type="number" step="0.05" value={input.treatmentRate || ''} onChange={(e) => set('treatmentRate', vf(e.target.value))} /></label>}
                {isSurv && <label className="bs-f"><span>Event rate</span><input type="number" step="0.05" value={input.eventRate || ''} onChange={(e) => set('eventRate', vf(e.target.value))} /></label>}
                {isAccuracy && <label className="bs-f"><span>Sensitivity</span><input type="number" step="0.01" value={input.sensitivity || ''} onChange={(e) => set('sensitivity', vf(e.target.value))} /></label>}
                {isAccuracy && <label className="bs-f"><span>Specificity</span><input type="number" step="0.01" value={input.specificity || ''} onChange={(e) => set('specificity', vf(e.target.value))} /></label>}
                {isAccuracy && <label className="bs-f"><span>Prevalence</span><input type="number" step="0.05" value={input.prevalence || ''} onChange={(e) => set('prevalence', vf(e.target.value))} /></label>}
                {isRoc && <label className="bs-f"><span>Expected AUC</span><input type="number" step="0.01" value={input.aucTarget || ''} onChange={(e) => set('aucTarget', vf(e.target.value))} /></label>}
                {isRoc && <label className="bs-f"><span>Null AUC</span><input type="number" step="0.05" value={input.aucNull || ''} onChange={(e) => set('aucNull', vf(e.target.value))} placeholder="0.5" /></label>}
                {isAgreement && <label className="bs-f"><span>Target kappa</span><input type="number" step="0.05" value={input.agreementTarget || ''} onChange={(e) => set('agreementTarget', vf(e.target.value))} /></label>}
                {isCont && <label className="bs-f"><span>Crossover periods</span><input type="number" step="1" min="0" value={input.crossoverPeriods || ''} onChange={(e) => set('crossoverPeriods', vf(e.target.value))} placeholder="parallel" /></label>}
                {isCont && input.crossoverPeriods ? <label className="bs-f"><span>Within-subject ρ</span><input type="number" step="0.05" value={input.withinSubjectCorrelation || ''} onChange={(e) => set('withinSubjectCorrelation', vf(e.target.value))} /></label> : null}
                <label className="bs-f"><span>Attrition</span><input type="number" step="0.05" value={input.attritionRate} onChange={(e) => set('attritionRate', vf(e.target.value) || 0)} /></label>
                <label className="bs-f"><span>Interims</span><input type="number" step="1" value={input.interimAnalyses || 0} onChange={(e) => set('interimAnalyses', parseInt(e.target.value) || 0)} /></label>
              </div>

              {/* The engine's answer for the design above — or an honest account
                  of why there is not one. A figure is never shown while the
                  engine is still running, and never when it refused. */}
              {engine.kind === 'computing' && (
                <div role="status" className="scaf-note" style={{ marginTop: 10 }}>Computing the design on the statistical engine…</div>
              )}
              {engine.kind === 'refused' && (
                <div style={{ marginTop: 10 }}>
                  <EmptyState
                    tone="error"
                    icon={I.alertTriangle}
                    title="The statistical engine did not size this design"
                    hint={engine.message}
                    retry={retryCompute}
                  />
                </div>
              )}
              {ready && (
                <>
                  <div className="bs-mini">
                    <span><b>{n}</b> subjects</span>
                    <span><b>{(ready.computation.power * 100).toFixed(0)}%</b> power</span>
                    {/* The engine's verdict token ("not_adequate") read as a
                        word; the figures beside it are the engine's own, which
                        is why the retired banner's copy of them is no loss. */}
                    <span className={'rd-chip tone-' + verdictTone(ready.judgment.overallVerdict)}>{verdictWord(ready.judgment.overallVerdict)}</span>
                  </div>
                  {/* The method and the sizing identity the engine used, in its
                      own words. The required event count for a time-to-event
                      design is part of this formula — it replaces the "N events"
                      chip that used to be read off the deleted browser copy. */}
                  <div className="bs-doc-prov" style={{ marginTop: 6, display: 'block' }}>{ready.computation.method} — {ready.computation.formula}</div>
                  {ready.warnings.length > 0 && (
                    <ul className="scaf-note" style={{ marginTop: 6, paddingLeft: 18 }}>
                      {ready.warnings.map((w) => <li key={w.field}>{w.message}</li>)}
                    </ul>
                  )}
                </>
              )}
            </>
          </section>
        </div>

        {/* Center: the DOCUMENT — the deliverable.
            The note and the artifact are ONE grid child: as two, the note took
            the second column and the artifact wrapped onto a row of its own
            under the study column, where a reader never saw it. */}
        <div className="bs-main">
        {/* A worked example is called one ABOVE the artifact as well as in its
            meta. The helper's rule is that an example is always named as one,
            and one place is one place to miss. */}
        {isExample && (
          <p className="bs-example-note" role="note">
            Worked example{edited ? ' (modified)' : ''} — {exampleName}, not your study. Choose your project’s study
            design on the left and the engine sizes your own.
          </p>
        )}
        <section className="bs-doc" aria-label={docDef?.label}>
          {/* The artifact's slim header (D0 §4.2.17): what it is and where it
              came from on the left, icon actions on the right. "Open in
              editor" has left it — the page's one primary in the header is the
              same call, and the bar held the second of this page's four orange
              fills. */}
          <div className="bs-doc-bar">
            <div className="bs-doc-bar-l">
              <span className="bs-doc-kind">{docDef?.label}</span>
              {/* Provenance describes where THIS document came from: generated
                  by the statistical engine from its own computation and
                  judgment, with the version and status it stamped on the
                  document — not a literal written here, and not `connected()`. */}
              <span className="bs-doc-meta">
                Deterministic engine{doc.kind === 'ready' && doc.engineVersion ? ', version ' + doc.engineVersion : ''}{doc.kind === 'ready' && doc.status ? ' · ' + statusWords(doc.status).toLowerCase() : ''}
                {isExample ? ' · worked example, not your study' : placement ? <> · <FilingPlacementNote placement={placement} /></> : null}
              </span>
            </div>
            <div className="bs-doc-bar-a">
              <button
                type="button"
                className="btn small"
                title="Refine with AnA"
                aria-label="Refine with AnA"
                onClick={() => ask('Refine the ' + (docDef?.label || 'document') + ': ' + (docDef?.blurb || ''))}
              >
                {I.sparkles}
              </button>
              <button
                type="button"
                className="btn small"
                title={isExample ? 'Save the example as a working document' : 'Save as a working document'}
                aria-label={isExample ? 'Save the example as a working document' : 'Save as a working document'}
                onClick={() => void saveWorking()}
                disabled={doc.kind !== 'ready' || attaching}
              >
                {I.fileDown}
              </button>
            </div>
          </div>
          <div className="bs-doc-page">
            {doc.kind === 'ready' ? (
              <div className="bs-doc-render" dangerouslySetInnerHTML={{ __html: html }} />
            ) : doc.kind === 'failed' ? (
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title={'The engine did not write the ' + (docDef?.label ?? 'document')}
                hint={doc.message}
                retry={retryCompute}
              />
            ) : engine.kind === 'refused' ? (
              /* The engine's own sentence is rendered once, beside the design
                 inputs it refused — repeating it here would put the same
                 refusal on screen twice. This panel says why there is no
                 document and points at it. */
              <EmptyState
                tone="error"
                icon={I.alertTriangle}
                title="No document — the design was not sized"
                hint="The document is generated from the engine’s own computation and judgment, so there is nothing to write until the design sizes. The engine’s reason is beside the design inputs."
                retry={retryCompute}
              />
            ) : (
              <EmptyState
                busy
                icon={I.fileText}
                title={engine.kind === 'computing' ? 'Waiting for the engine to size the design…' : 'Writing the ' + (docDef?.label ?? 'document') + ' on the statistical engine…'}
                hint="The document is generated from the engine’s own computation and judgment, so its prose and its figures cannot disagree."
              />
            )}
          </div>
        </section>
        </div>
      </div>

      {/* The design assessment and the statistical review are wide tables —
          assumptions, dimensions, a risk table with findings and actions. They
          were rendered inside the 300px left column, one word per line
          (2026-10-31 audit). They get the page's full width, under the document.
          The panel is its own `.pj-sec` now (D5 §B.4 step 6), so it needs no
          wrapper to place it: it is a section of this page like any other. */}
      {selectedStudyId && (
        <DesignBridgePanel
          state={bridge}
          onNav={onNav}
          fireToast={fireToast}
          onApplied={() => { bridge.reload(); setDesignReload((k) => k + 1); }}
          onTasksRaised={() => bridge.reload()}
        />
      )}

      {/* The list is org-scoped (every persisted statistical_summary artifact for
          the tenant) unless a project is open, so the heading says which — it
          must not misrepresent an organization-wide list as one project's. */}
      <section className="pj-sec" aria-label="Statistical documents">
        <div className="pj-sec-h">
          <h2>{program ? 'Statistical documents for this project' : 'Statistical documents for this organization'}</h2>
          {govDocs.rows.length > 0 && <span className="sec-sub">{govDocs.rows.length} persisted</span>}
        </div>
        {govDocs.loading ? (
          <div role="status" className="scaf-note">Loading governed documents…</div>
        ) : govDocs.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load governed statistical documents"
            hint="The document store didn't respond. These are the statistical documents AnA Biostats has generated and persisted for this organization — sign in and retry, or check that the AnA Biostats service is reachable."
          />
        ) : govDocs.empty ? (
          <EmptyState
            icon={I.fileText}
            title="No governed statistical documents yet"
            hint="Statistical documents persisted for this project appear here, with their real status."
          />
        ) : (
          <div className="sp-list">
            {govDocs.rows.map((p) => {
              const def = p.doc ? docById(p.doc) : undefined;
              return (
                /* `doc` is null whenever statisticalDocumentType was not
                   recorded on the artifact — a condition this type declares as
                   normal. The row was still a <button> in that case, so
                   clicking a perfectly ordinary persisted document did
                   nothing at all. It now says so: a row we cannot open is
                   rendered as a row, disabled, with the reason in its title,
                   rather than as a control that silently declines.

                   The artifact id used to lead the row in monospace. It is an
                   id on a screen that files to an agency (§WA.4.2 rule 10), and
                   it pushed the study's name — the one thing a reader scans
                   this list for — into the second column. It leads the row's
                   `title` instead, where it is still there to be quoted. */
                <button
                  key={p.id}
                  type="button"
                  className="sp-row"
                  disabled={!def}
                  title={`Document ${p.id} · ${def ? `open the ${def.label} generator` : 'no recorded statistical type, so there is no generator to open for it'}`}
                  onClick={() => { if (p.doc && def) setDocType(p.doc); }}
                >
                  <span className="sp-row-b"><span className="sp-row-t">{p.study}</span><span className="sp-row-s">{p.endpoint ? p.endpoint + ' — ' : ''}{def?.label || 'Statistical document'}</span></span>
                  {/* `draft | review | approved | locked` as the store records
                      them; said as words by the one document-status map. */}
                  <span className={'rd-chip tone-' + (p.status === 'approved' ? 'ok' : 'warn')}>{statusWords(p.status)}</span>
                  {!def && <span className="sp-row-note">no recorded type</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>
      {/* The two capabilities that RECORD. Everything above sizes, judges and
          writes: a figure is computed, a document is produced, nothing about
          the running study is kept. These two keep — an interim look and the
          Part 11-signed decision taken on it, and the method graph built from
          this sponsor's own reports.

          They are here because the registry puts them here: `biostatistics` is
          "SAP authoring, power analysis, TLF shells, adaptive trial plans,
          IDMC" (ui-surface-registry.ts:874), and this is the surface the rail
          opens (registryModel.ts:176, kept there by P-107). They were mounted
          on `biostat-workbench` on 2026-10-13, which left the one act that
          stops a trial on unblinded data reachable only by first noticing a
          ghost button labelled "Design calculators". */}
      <AdaptiveMonitoringPanel />
      <BiostatKnowledgePanel />

      <C2CToast msg={toast} />
    </div>
  );
}
