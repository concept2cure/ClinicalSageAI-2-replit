/**
 * PMDA Shōnin pathway engine (Japan — medical-device marketing approval 承認)
 *
 * Projects the canonical submission content onto the Japanese device marketing
 * application (Shōnin) structure — STED (Summary Technical Documentation) plus
 * the Japan-specific items: J-QMS conformity, Japanese-language package insert
 * (添付文書), and ICH E5 bridging where foreign clinical data is relied on. It
 * reports completeness so a sponsor sees PMDA readiness before filing via the
 * PMDA gateway.
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

export interface PmdaSlot {
  id: string;
  label: string;
  required: boolean;
}

export interface PmdaSlotStatus extends PmdaSlot {
  present: boolean;
  sources: string[];
}

export interface PmdaResult {
  sections: PmdaSlotStatus[];
  summary: {
    missingRequired: string[];
    /** True when every required Shōnin section has a source leaf. */
    ready: boolean;
  };
}

type Matcher = (l: PmdaInputLeaf) => boolean;
const docType = (...t: string[]): Matcher => (l) => !!l.documentType && t.includes(l.documentType);
const titleHas = (...n: string[]): Matcher => (l) => n.some((x) => l.title.toLowerCase().includes(x));
const codeStarts = (...p: string[]): Matcher => (l) => p.some((x) => l.sectionCode.startsWith(x));
const any = (...m: Matcher[]): Matcher => (l) => m.some((f) => f(l));

const SHONIN_SECTIONS: Array<PmdaSlot & { match: Matcher }> = [
  { id: 'device-description', label: 'Device description & intended use (概要)', required: true, match: any(docType('device_description'), titleHas('device description', 'intended use', '概要')) },
  { id: 'sted', label: 'Summary Technical Documentation (STED)', required: true, match: any(docType('sted', 'summary_technical_documentation'), titleHas('sted', 'summary technical documentation')) },
  { id: 'specifications', label: 'Specifications — shape/structure/principle (規格)', required: true, match: any(docType('specification', 'specifications'), titleHas('specification', '規格')) },
  { id: 'qms-conformity', label: 'QMS conformity (J-QMS / ISO 13485)', required: true, match: any(docType('qms', 'qms_conformity'), titleHas('qms', 'iso 13485', 'quality management')) },
  { id: 'stability', label: 'Stability (安定性)', required: false, match: any(docType('stability'), titleHas('stability', '安定性')) },
  { id: 'performance', label: 'Performance — bench / nonclinical (性能)', required: true, match: any(docType('performance', 'nonclinical'), codeStarts('4'), titleHas('performance', 'bench testing', '性能')) },
  { id: 'clinical-bridging', label: 'Clinical evaluation / ICH E5 bridging (臨床評価)', required: true, match: any(docType('clinical_evaluation', 'bridging', 'clinical'), codeStarts('5'), titleHas('clinical evaluation', 'bridging', 'ich e5', '臨床')) },
  { id: 'risk-management', label: 'Risk management (ISO 14971)', required: true, match: any(docType('risk_management'), titleHas('risk management', 'iso 14971')) },
  { id: 'japanese-labelling', label: 'Japanese package insert (添付文書)', required: true, match: any(docType('japanese_labelling', 'package_insert'), titleHas('package insert', '添付文書', 'japanese labelling')) },
  { id: 'foreign-approval-status', label: 'Foreign approval / use status (外国における使用状況)', required: false, match: any(docType('foreign_approval_status'), titleHas('foreign approval', '外国における使用状況')) },
];

function evalSlot(slot: PmdaSlot & { match: Matcher }, leaves: PmdaInputLeaf[]): PmdaSlotStatus {
  const sources = leaves.filter((l) => slot.match(l)).map((l) => l.sectionCode || l.title);
  const { match, ...rest } = slot;
  return { ...rest, present: sources.length > 0, sources };
}

export interface AssessPmdaInput {
  leaves: PmdaInputLeaf[];
}

/** Assess Japan Shōnin (device marketing approval) readiness from canonical leaves. */
export function assessPmdaShonin(input: AssessPmdaInput): PmdaResult {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const sections = SHONIN_SECTIONS.map((s) => evalSlot(s, leaves));
  const missingRequired = sections.filter((s) => s.required && !s.present).map((s) => s.id);
  return { sections, summary: { missingRequired, ready: missingRequired.length === 0 } };
}

export default { assessPmdaShonin };
