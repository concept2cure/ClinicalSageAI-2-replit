/** Client presentation of already-admitted native Quality snapshots.
 * The sealed run retains complete receipts; this projection shows recorded business facts. */
import type { ReportSection } from './types';
import { looksLikeHtml } from '../../../../shared/authoring/plain-text-html';
import { inlineMarksToText } from '../../../export/inline-marks-to-text';
import { blocksToPlainText, sectionContentToBlocks } from '../../../export/authoring-section-content';
import { humanize } from './source-words';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export function isNativeQualityReport(summary: Record<string, unknown>): boolean {
  return Object.hasOwn(asRecord(summary.domain) ?? {}, 'qualityEvidence');
}

const QUALITY_INTERNAL = new Set(['id','metadata','native','kind','key','evidence_kind','source_scope','program_id','organization_id',
  'client_workspace_id','created_at','updated_at','created_by','updated_by','proposed_by','assessed_by','approved_by','verified_by',
  'detected_by','completed_by','removed_by','added_by','assigned_by','auditor_team','attendees','order_index','structural_release_candidate']);
const QUALITY_BUSINESS_IDS = new Set(['requirement_id','protocol_id','study_id']);
const QUALITY_LABELS: Record<string,string> = { capa_code:'CAPA number',capa_linked:'CAPA linked',nc_number:'Nonconformance number',
  doc_number:'Document number',doc_type:'Document type',n:'Action number',next_due:'Next review due',source_refs:'Source references',
  in_force:'Recorded release in force',content_verified:'Signed content verified' };
const QUALITY_PRIORITY = ['description','summary','problem_statement','root_cause','root_cause_analysis','target_close_date','due_date',
  'target_implementation_date','planned_date','next_review_date','corrective_action_plan','effectiveness_check_result','outputs','inputs'];
const qualityKey = (key:string) => key.replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase();
function qualityBusinessField(key:string):boolean {
  const normalized=qualityKey(key);
  return QUALITY_BUSINESS_IDS.has(normalized) || (!QUALITY_INTERNAL.has(normalized) && !/(?:^|_)(?:ids?|digest|hash|uuid|sha256|checksum)$/.test(normalized));
}
function qualityPlain(text:string):string {
  // Keep the original HTML decision when semantic marks were its only tags.
  const content=looksLikeHtml(text) ? `<div>${inlineMarksToText(text)}</div>` : text;
  return blocksToPlainText(sectionContentToBlocks(content))
    .replace(/\s+/g,' ').replace(/\s+([.,;:!?])/g,'$1').trim();
}
function qualityScalar(value:unknown):string|null {
  if (value == null) return 'Not recorded';
  if (typeof value==='boolean') return value ? 'Yes' : 'No';
  if (typeof value==='number') return String(value);
  if (typeof value==='string') return /^[a-z]+(?:_[a-z0-9]+)+$/.test(value) ? humanize(value) : qualityPlain(value);
  return null;
}
function qualityFactLines(label:string,value:unknown,depth=0):string[] {
  const scalar=qualityScalar(value);
  if (scalar!==null) return scalar ? [`${label}: ${scalar}`] : [];
  if (depth>4) return [`${label}: Additional detail recorded`];
  if (Array.isArray(value)) return qualityArrayLines(label,value,depth);
  return Object.entries(asRecord(value) ?? {}).filter(([key])=>qualityBusinessField(key)).flatMap(([key,item])=>
    qualityFactLines(`${label} — ${QUALITY_LABELS[qualityKey(key)] ?? humanize(key)}`,item,depth+1));
}
function qualityArrayLines(label:string,values:unknown[],depth:number):string[] {
  if (!values.length) return [`${label}: None recorded`];
  const lines=values.slice(0,8).flatMap(item=>qualityFactLines(label,item,depth+1));
  if (values.length>8) lines.push(`${label}: Additional recorded details are retained in the report data`);
  return lines;
}
function qualitySnapshotData(text:string):Record<string,unknown>|null {
  try {return asRecord(asRecord(JSON.parse(text))?.data);}
  catch {return null;}
}
function qualityRecordFacts(record:Record<string,unknown>):string[] {
  const priority=(key:string)=>{const index=QUALITY_PRIORITY.indexOf(qualityKey(key));return index<0 ? QUALITY_PRIORITY.length : index;};
  return Object.entries(record).filter(([key,value])=>qualityBusinessField(key) && !['title','version','status','state','disposition','approval_status'].includes(key)
    && (value!==null || QUALITY_PRIORITY.includes(qualityKey(key))))
    .sort(([a],[b])=>priority(a)-priority(b)).flatMap(([key,value])=>qualityFactLines(QUALITY_LABELS[qualityKey(key)] ?? humanize(key),value));
}
function qualityDataFacts(data:Record<string,unknown>):string[] {
  const qualification=([key]:[string,unknown])=>['contentBasis','approval','inForce','pendingEffective','underRevision'].includes(key) || key.endsWith('Qualification');
  const extras=Object.entries(data).filter(([key])=>!['record','sections','structuralReleaseCandidate'].includes(key));
  const render=([key,value]:[string,unknown])=>qualityFactLines(key==='approval' ? 'Recorded release approval' : humanize(key),value);
  const facts=[...extras.filter(qualification).flatMap(render),...qualityRecordFacts(asRecord(data.record) ?? {})];
  const sections=Array.isArray(data.sections) ? data.sections.map(asRecord).filter(section=>section!==null) : [];
  for (const section of sections) facts.push(...qualityFactLines(String(section!.title ?? section!.code ?? 'Document text'),section!.content));
  facts.push(...extras.filter(entry=>!qualification(entry)).flatMap(render));
  return facts;
}
function qualityFacts(text:string):string {
  const data=qualitySnapshotData(text);
  if (!data) return 'Recorded details are unavailable.';
  const facts=qualityDataFacts(data);
  const lines=facts.slice(0,12).map(line=>line.length>240 ? `${line.slice(0,237)}…` : line);
  const details=lines.join('; ');
  const abbreviated=facts.length>12 || facts.some(line=>line.length>240) || details.length>1800;
  return `${details.slice(0,1800) || 'No further business details were recorded.'}${abbreviated ? ' … Additional recorded details are retained in the report data.' : ''}`;
}
function qualityRecordTitle(row:Record<string,unknown>):string {
  const record=asRecord(qualitySnapshotData(String(row.text))?.record) ?? {};
  const number=['doc_number','capa_code','nc_number','change_number','deviation_number','audit_number','supplier_code','requirement_id']
    .map(key=>record[key]).find(value=>typeof value==='string' && value.trim());
  const rawTitle=qualityPlain(String(row.title));
  const nativeId=String(asRecord(row.native)?.id ?? '');
  const label=rawTitle.endsWith(`: ${nativeId}`) ? rawTitle.slice(0,-nativeId.length-2) : rawTitle;
  const title=label!==rawTitle && typeof record.n==='number' ? `${label} ${record.n}` : label;
  return typeof number==='string' && !title.includes(number) ? `${number} — ${title}` : title;
}

/** Quality projections are factual records, with project ownership distinct from organization context. */
export function qualityEvidenceSections(value: unknown, computedScope: string): ReportSection[] | null {
  const evidence = asRecord(value);
  if (!evidence) return null;
  const rows = Array.isArray(evidence.records) ? evidence.records.map(asRecord) : null;
  if (evidence.schemaVersion !== 1 || !rows || rows.some(row => !row || typeof row.key !== 'string' || typeof row.title !== 'string'
    || typeof row.text !== 'string' || typeof row.lifecycle !== 'string' || (row.version !== null && typeof row.version !== 'string')
    || !['project', 'organization'].includes(String(row.sourceScope)) || typeof asRecord(row.native)?.kind !== 'string'
    || typeof asRecord(row.native)?.id !== 'string') || !Array.isArray(evidence.limits) || !evidence.limits.every(limit => typeof limit === 'string')) {
    return [{ id: 'quality-evidence-unavailable', title: 'Quality evidence unavailable',
      blocks: [{ kind: 'summary', text: 'The saved Quality evidence could not be verified. No Quality records are shown.' }] }];
  }
  const section = (scope: 'project' | 'organization', title: string, statement: string): ReportSection => {
    const selected = rows.filter(row => row!.sourceScope === scope);
    return { id: scope === 'project' ? 'quality-project-evidence' : 'quality-organization-context', title,
      blocks: [{ kind: 'summary', text: statement }, selected.length ? {
        kind: 'table', columns: ['Record', 'Version', 'Recorded lifecycle', 'Recorded facts'],
        rows: selected.map(row => [qualityRecordTitle(row!), row!.version as string | null, humanize(row!.lifecycle as string), qualityFacts(row!.text as string)]),
      } : { kind: 'summary', text: 'No admitted records were returned for this scope. This does not establish completeness.' }] };
  };
  return [section('project', 'Project Quality evidence', computedScope === 'project'
    ? 'These evidence snapshots describe this project. Working copies, releases in force and retained versions are separate snapshots.'
    : 'These evidence snapshots describe projects the current actor can access. Working copies, releases in force and retained versions are separate snapshots.'),
  section('organization', 'Organization Quality-system context', computedScope === 'project'
    ? 'Organization context is not assigned to this project.' : 'These organization-owned records have no project ownership.'),
  { id: 'quality-assessment-limits', title: 'Assessment limits', blocks: evidence.limits.map(text => ({ kind: 'summary', text })) }];
}

