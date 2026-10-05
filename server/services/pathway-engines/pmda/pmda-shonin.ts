/**
 * PMDA Shōnin pathway engine (Japan — medical-device marketing approval 承認)
 *
 * Projects the canonical submission content onto the documents a Japanese
 * device marketing-approval application (Shōnin) carries, and reports
 * completeness so a sponsor sees PMDA readiness before filing via the PMDA
 * gateway.
 *
 * THE SLOTS ARE STED CONTENTS. The STED (Summary Technical Documentation;
 * 薬食機発第0216003号, 2005-02-16, "医療機器の製造販売承認申請書添付資料概要作成
 * の手引きについて") is the summary structure these documents sit in, not one
 * more document, so there is no 'sted' slot. The eight-item STED tree and its
 * IMDRF / MDR Annex II crosswalk belong to the canonical device dossier tree,
 * not here.
 *
 * 2026-10-05 (g-shonin-and-techdoc-fail-closed). What was wrong, and is now
 * removed:
 *   - 'clinical-bridging' required "ICH E5 bridging" of every device. ICH E5 is
 *     a medicines guideline (recall). Clinical trial results are needed only
 *     when nonclinical data or literature cannot establish clinical safety and
 *     efficacy (薬食機発第0804001号, 2008-08-04, "医療機器に関する臨床試験データ
 *     の必要な範囲等について" — title and content from non-regulator search
 *     results, recall-grade; not re-read on MHLW/PMDA). The slot is now
 *     'clinical-data' — clinical TRIAL results only, required only when the
 *     input says so, and undetermined — a gap — when nobody has said. A
 *     clinical evaluation report (臨床評価) is the literature route used when a
 *     trial is not needed (same basis), so it does not fill this slot; nor
 *     does a nonclinical title, Japanese (非臨床試験) or English, nor a trial
 *     plan or protocol (CIP, 臨床試験計画書) that does not say it is results.
 *   - codeStarts('4') filled 'performance' and codeStarts('5') filled the
 *     clinical slot, so a drug dossier's 4.2.3.2 toxicity study and 5.3.5.1
 *     CSR read as device evidence, and the Shōnin project template's '5
 *     Performance Testing' bench leaf satisfied the clinical slot. A CTD module
 *     prefix is not a device signal: slots match by document type and title.
 *   - No slot for the Essential Principles conformity checklist, which PMDA
 *     reviews with every application (recall). Added as a required document-presence
 *     slot. It is NOT the EU GSPR matrix (assessEssentialPrinciples in
 *     medical-device-knowledge.ts is EU MDR/IVDR Annex I), and this engine
 *     only checks that the document is present.
 * Bases: docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-shonin-and-techdoc-fail-closed-facts.md.
 *
 * Closes the Japan device quadrant of the Client×Region matrix (spec §3). Like
 * the other pathway engines this is a pure projection of the one canonical core
 * — it maps and gap-checks, it does not file.
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no LLM.
 *
 * @module server/services/pathway-engines/pmda/pmda-shonin
 */

export interface PmdaInputLeaf {
  sectionCode: string;
  title: string;
  documentType?: string;
}

/**
 * How a slot's necessity is decided.
 *   always          required for every Shōnin application.
 *   optional        never blocks readiness.
 *   clinical-data   required exactly when the device needs clinical trial
 *                   results (AssessPmdaInput.clinicalDataRequired). Unanswered →
 *                   undetermined, which blocks readiness (the eSTAR pattern,
 *                   estar-mapper.ts).
 */
export type PmdaNecessity = 'always' | 'optional' | 'clinical-data';

/** Whether the slot is needed for THIS device. */
export type PmdaApplicability = 'required' | 'optional' | 'not-applicable' | 'undetermined';

export interface PmdaSlot {
  id: string;
  label: string;
  /** Derived: true when the slot is required for THIS device. */
  required: boolean;
  necessity: PmdaNecessity;
  /** What the slot answers to, and whether that is regulator text or recall. */
  basis: string;
}

export interface PmdaSlotStatus extends PmdaSlot {
  present: boolean;
  sources: string[];
  applicability: PmdaApplicability;
}

export interface PmdaResult {
  sections: PmdaSlotStatus[];
  summary: {
    missingRequired: string[];
    /**
     * Absent slots whose necessity was not decided (clinical trial results
     * when clinicalDataRequired was not supplied). They block `ready`: not
     * knowing whether a document is needed is not the same as not needing it.
     */
    undetermined: string[];
    /** True when every required Shōnin section has a source leaf and nothing is undetermined. */
    ready: boolean;
  };
}

type Matcher = (l: PmdaInputLeaf) => boolean;
const docType = (...t: string[]): Matcher => (l) => !!l.documentType && t.includes(l.documentType);
const titleHas = (...n: string[]): Matcher => (l) => n.some((x) => l.title.toLowerCase().includes(x));
const any = (...m: Matcher[]): Matcher => (l) => m.some((f) => f(l));
const all = (...m: Matcher[]): Matcher => (l) => m.every((f) => f(l));
const not = (m: Matcher): Matcher => (l) => !m(l);
/** Whole-word title match (ASCII), so 'plan' is not found inside 'implant'. */
// nosemgrep: detect-non-literal-regexp -- each word is a literal at the call sites (titleWord('plans?', ...)), never input
const titleWord = (...w: string[]): Matcher => (l) => w.some((x) => new RegExp(`\\b${x}\\b`, 'i').test(l.title));
/**
 * A trial plan or protocol (CIP, 臨床試験計画書) is not the trial's results,
 * unless the title also says it is the report or the results (成績, 報告).
 */
const A_PLAN_NOT_ITS_RESULTS: Matcher = all(
  any(titleWord('plans?', 'protocols?'), titleHas('計画')),
  not(any(titleWord('reports?', 'results?'), titleHas('成績', '報告'))),
);

type SlotDef = Omit<PmdaSlot, 'required'> & { match: Matcher };

const RECALL = 'recall — not re-read against MHLW/PMDA text';

const SHONIN_SECTIONS: SlotDef[] = [
  { id: 'device-description', label: 'Device description & intended use (概要)', necessity: 'always', basis: `STED device description (${RECALL})`,
    match: any(docType('device_description'), titleHas('device description', 'intended use', '概要')) },
  /* 基本要件基準: 平成17年厚生労働省告示第122号 under PMD Act Art. 41(3); checklist
     notification 薬生機審発0818第1号 (2021-08-18), "医療機器に係る基本要件適合性
     チェックリストについて". 0818 title search-verified on mhlw.go.jp 2026-10-05;
     告示 number from search summary; contents recall. */
  { id: 'essential-principles-conformity', label: 'Essential Principles conformity checklist (基本要件適合性チェックリスト)', necessity: 'always',
    basis: '基本要件基準 (平成17年厚生労働省告示第122号, PMD Act Art. 41(3)); checklist per 薬生機審発0818第1号 (2021-08-18) — 0818 title search-verified on mhlw.go.jp, 基本要件基準 on a PMDA page; 告示 number from search summary; contents recall',
    match: any(docType('essential_principles_checklist', 'ep_checklist'), titleHas('基本要件', 'essential principles', 'essential requirements checklist')) },
  { id: 'specifications', label: 'Specifications — shape/structure/principle (規格)', necessity: 'always', basis: `STED design and specification (${RECALL})`,
    match: any(docType('specification', 'specifications'), titleHas('specification', '規格')) },
  /* The QMS適合性調査 is a procedure of its own, alongside the application
     (recall). The leaf here is the conformity certificate or the reference to
     the inspection application, not the QMS itself. */
  { id: 'qms-conformity', label: 'QMS conformity — certificate or QMS適合性調査 application reference (the inspection is a separate procedure)', necessity: 'always',
    basis: `QMS適合性調査, a separate procedure (${RECALL})`,
    match: any(docType('qms', 'qms_conformity'), titleHas('qms', 'iso 13485', 'quality management')) },
  { id: 'stability', label: 'Stability (安定性)', necessity: 'optional', basis: `STED stability and durability (${RECALL})`,
    match: any(docType('stability'), titleHas('stability', '安定性')) },
  { id: 'performance', label: 'Performance — bench / nonclinical (性能)', necessity: 'always', basis: `STED performance (${RECALL})`,
    match: any(docType('performance', 'nonclinical'), titleHas('performance', 'bench testing', '性能')) },
  /* Required only when nonclinical data or literature cannot establish
     clinical safety and efficacy: 薬食機発第0804001号 (2008-08-04) — title and
     content from non-regulator search results (recall-grade), not re-read on
     MHLW/PMDA. Trial results only: a clinical evaluation report (CER, 臨床評価)
     is the literature substitute and a generic 'clinical' type is ambiguous, so
     neither fills it. '臨床試験' is a substring of '非臨床試験' (nonclinical
     studies), hence the Japanese exclusion. A trial plan or protocol (CIP,
     臨床試験計画書) is not results either (fix round 2); the docType is
     'clinical_investigation_report', because 'clinical_investigation' is an
     evidence-type and section id elsewhere (cerGenerationService.ts,
     ivdr-routes.ts), not a results type. */
  { id: 'clinical-data', label: 'Clinical trial results (臨床試験の試験成績), when required', necessity: 'clinical-data',
    basis: '薬食機発第0804001号 (2008-08-04), scope of clinical trial data for devices — title and content from non-regulator search results (recall-grade), not re-read on MHLW/PMDA',
    match: any(
      docType('clinical_trial_results', 'clinical_investigation_report'),
      all(not(titleHas('preclinical', 'pre-clinical', 'nonclinical', 'non-clinical', '非臨床')),
        not(A_PLAN_NOT_ITS_RESULTS),
        titleHas('clinical trial', 'clinical investigation', '臨床試験')),
    ) },
  { id: 'risk-management', label: 'Risk management (ISO 14971)', necessity: 'always', basis: `STED risk management (${RECALL})`,
    match: any(docType('risk_management'), titleHas('risk management', 'iso 14971')) },
  { id: 'japanese-labelling', label: 'Japanese package insert (添付文書)', necessity: 'always', basis: `添付文書 (${RECALL})`,
    match: any(docType('japanese_labelling', 'package_insert'), titleHas('package insert', '添付文書', 'japanese labelling')) },
  { id: 'foreign-approval-status', label: 'Foreign approval / use status (外国における使用状況)', necessity: 'optional', basis: `STED foreign use status (${RECALL})`,
    match: any(docType('foreign_approval_status'), titleHas('foreign approval', '外国における使用状況')) },
];

function applicabilityOf(n: PmdaNecessity, clinicalDataRequired: boolean | undefined): PmdaApplicability {
  if (n === 'always') return 'required';
  if (n === 'optional') return 'optional';
  if (clinicalDataRequired === true) return 'required';
  if (clinicalDataRequired === false) return 'not-applicable';
  return 'undetermined';
}

function evalSlot(slot: SlotDef, leaves: PmdaInputLeaf[], clinicalDataRequired: boolean | undefined): PmdaSlotStatus {
  const sources = leaves.filter((l) => slot.match(l)).map((l) => l.sectionCode || l.title);
  const { match, ...rest } = slot;
  const applicability = applicabilityOf(slot.necessity, clinicalDataRequired);
  return { ...rest, required: applicability === 'required', present: sources.length > 0, sources, applicability };
}

export interface AssessPmdaInput {
  leaves: PmdaInputLeaf[];
  /**
   * Whether this device needs clinical trial results (臨床試験の試験成績).
   * true → required; false → not applicable; undefined → undetermined, and an
   * absent clinical slot then blocks readiness.
   */
  clinicalDataRequired?: boolean;
}

/** Assess Japan Shōnin (device marketing approval) readiness from canonical leaves. */
export function assessPmdaShonin(input: AssessPmdaInput): PmdaResult {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const sections = SHONIN_SECTIONS.map((s) => evalSlot(s, leaves, input.clinicalDataRequired));
  const missingRequired = sections.filter((s) => s.required && !s.present).map((s) => s.id);
  const undetermined = sections.filter((s) => s.applicability === 'undetermined' && !s.present).map((s) => s.id);
  return { sections, summary: { missingRequired, undetermined, ready: missingRequired.length === 0 && undetermined.length === 0 } };
}

export default { assessPmdaShonin };
