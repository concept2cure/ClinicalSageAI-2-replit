import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { connected, useLiveRows, EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';
import { useAuthoringHandoff, openSavedAuthoring } from '../authoringHandoff';
import { AuthoringHandoffNotice } from '../AuthoringHandoffNotice';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { consumeNavParams } from '../navParams';
import { readShellProject } from '../shellProject';
import {
  DesignBridgePanel,
  FilingPlacementNote,
  StudyDesignCard,
  placementForDoc,
  resolveDesign,
  useBridgeDesigns,
  useDesignAssessment,
} from './biostatBridge';

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
  provenance?: { generatedAt?: string; engineVersion?: string };
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
  | { kind: 'ready'; markdown: string; title: string; version?: number; status?: string; engineVersion?: string }
  | { kind: 'failed'; message: string };

/* ════ Biostatistics surface ════ */

export function Biostatistics({ onAsk, onNav }: SurfaceViewProps) {
  const handoff = useAuthoringHandoff();
  const saveToAuthoring = handoff.save;
  const ask = onAsk;
  const live = connected();
  const [preset, setPreset] = useState('survival');
  const [input, setInput] = useState<EngineInput>(BS_PRESETS.survival.input);
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
  useEffect(() => {
    const seed = loadedDesign?.adapter.input;
    if (!seed) return;
    // The adapter emits the engine's StatisticalInput, which is exactly what
    // this surface's controls hold and what it posts back to the engine.
    setInput(seed as unknown as EngineInput);
    setPreset('design');
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
  const set = (k: string, v: unknown) => setInput((s) => ({ ...s, [k]: v }));
  const applyPreset = (k: string) => { setPreset(k); setInput(BS_PRESETS[k].input); };

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
  }, [input, retryTick]);

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
        computation: ready.computation,
        judgment: ready.judgment,
        domainAdaptation: ready.domain,
        regulatoryCustomization: ready.regulatory,
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
      });
    })();
    return () => { cancelled = true; };
  }, [ready, docDef]);

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

  const openEditor = async () => {
    if (handoff.blocked) return;
    const title = docDef?.label || 'Statistical document';
    if (!md.trim()) { fireToast('Nothing to open yet — the engine has not returned the document.', 'error'); return; }
    // Statistical documentation files under Module 5; the server would
    // default to M3.
    const r = await saveToAuthoring({
      title, module: filingModule, code: docDef?.id || 'statistical_document',
      content: md, subject: 'the document',
    });
    // Navigate only on a clean write. On a half-failure the document exists
    // but is empty, so going there would show the user an editor without
    // their work — stay put and say so.
    if (!r.isCurrent()) return;
    if (!r.ok) { fireToast(r.message, 'error'); return; }
    if (onNav) openSavedAuthoring(r, onNav);
    else fireToast(r.message);
  };
  /** Save a working document without leaving this surface. The server reports
   * governed filing binding separately; an unbound working copy stays unbound
   * and its reason remains visible in the shared confirmation. */
  const attach = async () => {
    if (handoff.blocked) return;
    const label = docDef?.label || 'Document';
    if (!md.trim()) {
      fireToast('Nothing to file yet — the engine has not returned the document.', 'error');
      return;
    }
    const r = await saveToAuthoring({
      title: label, module: filingModule, code: docDef?.id || 'statistical_document',
      content: md, subject: 'the document',
    });
    if (!r.isCurrent()) return;
    if (!r.ok) { fireToast(r.message, 'error'); return; }
    fireToast(r.message + (placement?.required === 'not_applicable'
      ? ' This is an internal design document, not a submission document for this filing.' : ''));
  };
  const groups = DOC_REGISTRY.reduce<Record<string, DocDef[]>>((m, d) => { (m[d.group] = m[d.group] || []).push(d); return m; }, {});
  /* 'insufficient_information' is the engine's third state — a dimension it had
     nothing to judge against. It is a caution, never a pass and never a fail. */
  const vTone = (v: string) => v === 'adequate' ? 'ok' : (v === 'marginal' || v === 'insufficient_information') ? 'warn' : 'err';

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
        'Biostatistics — a ' + (docDef?.label ?? 'statistical document') + ' drafted for a ' + engine.input.studyType.replace(/_/g, ' ')
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
        'Opening in the editor and attaching to the dossier both file a real governed document (genesis revision + Part 11 audit row) — AnA proposes them in conversation, never through screen controls.',
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

  return (
    <div className="bs">
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist — clinical {live ? '-- live' : ''}</div>
          <h1 className="sp-title">Biostatistics</h1>
          <p className="sp-state">Describe the study once — the statistical engine sizes and judges the design deterministically (ICH E9(R1)) and writes the governed statistical document you actually need to file. Nothing is computed in the browser.</p>
        </div>
      </div>

      {ready && docDef && (
        <AnswerLead
          tone={ready.judgment.overallVerdict === 'inadequate' ? 'urgent' : ready.judgment.overallVerdict === 'adequate' ? 'good' : 'calm'}
          eyebrow={'Your ' + docDef.label.toLowerCase() + ' is ready to review'}
          headline={<>I've drafted the <b>{docDef.label}</b> for your {ready.input.studyType.replace(/_/g, ' ')} design — <b>{n} subjects</b>, {(ready.computation.power * 100).toFixed(0)}% power, and the design reads as <b>{ready.judgment.overallVerdict}</b>.</>}
          body={<>Everything below is written, not just calculated — the method, assumptions, and {ready.judgment.fragility.category.replace(/_/g, ' ')} fragility are already in the prose, with a provenance footer for the reviewer. Change any design input and the engine re-sizes it and rewrites the document.</>}
          reassure={ready.judgment.overallVerdict === 'inadequate' ? "I flagged the underpowering honestly in the risk section — better the reviewer sees you addressed it than found it." : "It's drafted to " + (ready.regulatory?.body || input.regulatoryBody || 'FDA') + " expectations. Read it, adjust, and send it straight to the editor."}
          action={{ label: opening ? 'Saving to the editor…' : 'Open in document editor', onClick: () => void openEditor(), alt: { label: attaching ? 'Filing to the dossier…' : 'File it to the dossier', onClick: () => void attach() } }}
          secondary="Or pick a different document and adjust the design on the left."
        />
      )}

      <AuthoringHandoffNotice handoff={handoff} onNav={onNav} />
      <div className="bs-doc-layout">
        {/* Left: the study, what to produce, design inputs, the assessment */}
        <div className="bs-side">
          <StudyDesignCard designs={designs} selectedId={selectedStudyId} onSelect={setSelectedStudyId} />
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Document</span><span className="s">what to produce</span></div>
            <div className="pj-card-b" style={{ padding: 10 }}>
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
            </div>
          </div>
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Study design</span><span className="s">the engine re-sizes it live</span></div>
            <div className="pj-card-b" style={{ padding: 12 }}>
              <div className="bs-presets">
                {loadedDesign && <button className={'bs-preset' + (preset === 'design' ? ' on' : '')} onClick={() => { const seed = loadedDesign.adapter.input; if (seed) { setInput(seed as unknown as EngineInput); setPreset('design'); } }} disabled={!loadedDesign.adapter.input} title={loadedDesign.adapter.input ? 'The loaded study design' : 'The loaded design cannot be sized until its blocking gaps are resolved'}>{I.sigma} {loadedDesign.title}</button>}
                {Object.entries(BS_PRESETS).map(([k, p]) => <button key={k} className={'bs-preset' + (preset === k ? ' on' : '')} onClick={() => applyPreset(k)}>{p.label}</button>)}
              </div>
              <div className="bs-fields">
                <label className="bs-f"><span>Track</span><select value={input.clientTrack} onChange={(e) => set('clientTrack', e.target.value)}>{['biotech_pharma', 'medical_device', 'diagnostics_ivd'].map((x) => <option key={x} value={x}>{x.replace(/_/g, ' / ')}</option>)}</select></label>
                <label className="bs-f"><span>Agency</span><select value={input.regulatoryBody} onChange={(e) => set('regulatoryBody', e.target.value)}>{['FDA', 'EMA', 'MHRA', 'PMDA', 'NMPA', 'TGA', 'Health_Canada'].map((x) => <option key={x}>{x}</option>)}</select></label>
                <label className="bs-f"><span>Study type</span><select value={input.studyType} onChange={(e) => set('studyType', e.target.value)}>{['superiority', 'non_inferiority', 'equivalence', 'single_arm', 'performance', 'diagnostic_accuracy'].map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</select></label>
                <label className="bs-f"><span>Endpoint</span><select value={input.endpointType} onChange={(e) => set('endpointType', e.target.value)}>{['continuous', 'binary', 'time_to_event', 'ordinal', 'count', 'composite', 'sensitivity_specificity', 'auc_roc', 'agreement'].map((x) => <option key={x} value={x}>{x === 'auc_roc' ? 'AUC / ROC' : x.replace(/_/g, ' ')}</option>)}</select></label>
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
                    <span className={'rd-chip tone-' + vTone(ready.judgment.overallVerdict)}>{ready.judgment.overallVerdict}</span>
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
            </div>
          </div>
          {selectedStudyId && (
            <DesignBridgePanel
              state={bridge}
              onNav={onNav}
              fireToast={fireToast}
              onApplied={() => { bridge.reload(); setDesignReload((k) => k + 1); }}
              onTasksRaised={() => bridge.reload()}
            />
          )}
        </div>

        {/* Center: the DOCUMENT — the deliverable */}
        <div className="bs-doc">
          <div className="bs-doc-bar">
            <div className="bs-doc-bar-l"><span className="bs-doc-kind">{docDef?.label}</span><span className="bs-doc-prov">{/* Provenance describes where THIS document came from. It is
                  generated by the statistical engine from the engine's own
                  computation and judgment, and the version and status below are
                  the ones it stamped on the document — not a literal written
                  here, and not `connected()`, which is a global API-reachability
                  flag with no bearing on how the document was produced. */}
                Deterministic engine{doc.kind === 'ready' && doc.engineVersion ? ' — v' + doc.engineVersion : ''}{doc.kind === 'ready' && doc.status ? ' — ' + doc.status : ''}</span>{placement && <span className="bs-doc-prov" style={{ marginLeft: 8 }}><FilingPlacementNote placement={placement} /></span>}</div>
            <div className="bs-doc-bar-a">
              <button className="bs-da" onClick={() => ask('Refine the ' + (docDef?.label || 'document') + ': ' + (docDef?.blurb || ''))}>{I.sparkles} Refine with AnA</button>
              <button className="bs-da primary" onClick={() => void openEditor()} disabled={handoff.blocked || doc.kind !== 'ready'}>{I.penLine} {opening ? 'Saving to the editor…' : 'Open in editor'}</button>
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
        </div>
      </div>

      <div className="pj-card" style={{ marginTop: 14 }}>
        {/* The list is org-scoped (every persisted statistical_summary artifact for the
            tenant), so the sub-label reads "org-scoped" — not "this project", which would
            misrepresent an organization/portfolio-wide list as a single project's. */}
        <div className="pj-card-h"><span className="t">Governed statistical documents</span><span className="s">{(govDocs.rows.length > 0 ? govDocs.rows.length + ' persisted · ' : '') + (program ? 'this project' : 'org-scoped')}</span></div>
        <div className="pj-card-b" style={{ padding: 8 }}>
          {govDocs.loading ? (
            <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading governed documents…</div>
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
              hint="Generate a document above and run it through the AnA Biostats workflow. Once persisted, every SAP, sample-size rationale, or DSMB charter your team files appears here — org-scoped, with its real status."
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
                     rather than as a control that silently declines. */
                  <button
                    key={p.id}
                    className="sp-row"
                    style={{ width: '100%', textAlign: 'left' }}
                    disabled={!def}
                    title={def ? `Open the ${def.label} generator` : 'This document has no recorded statistical type, so there is no generator to open for it.'}
                    onClick={() => { if (p.doc && def) setDocType(p.doc); }}
                  >
                    <span className="sp-tag" style={{ fontFamily: 'var(--font-mono)' }}>{p.id}</span>
                    <span className="sp-row-b"><span className="sp-row-t">{p.study}</span><span className="sp-row-s">{p.endpoint ? p.endpoint + ' — ' : ''}{def?.label || 'Statistical document'}</span></span>
                    <span className={'rd-chip tone-' + (p.status === 'approved' ? 'ok' : 'warn')}>{p.status}</span>
                    {!def && <span className="sp-row-note">no recorded type</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <C2CToast msg={toast} />
    </div>
  );
}
