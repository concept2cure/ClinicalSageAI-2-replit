/** The existing report structure without drafting-service initialization. */
import type { NormalizedNSRStudy } from './nonclinical-study-report-builder';

export interface NSRSection {
  number: string;
  title: string;
  required: boolean;
  description: string;
  content?: string;
  status: 'empty' | 'drafting' | 'drafted' | 'reviewed' | 'approved';
  /** Fields read by the existing normalized-study gap engine. */
  requires: Array<keyof NormalizedNSRStudy>;
}

export const NONCLINICAL_STUDY_REPORT_STRUCTURE: NSRSection[] = [
  { number: '1', title: 'Title Page', required: true, status: 'empty', requires: ['studyTitle'], description: 'Study title, report number, study type, testing facility, GLP statement, dates' },
  { number: '2', title: 'Summary', required: true, status: 'empty', requires: ['keyFindings'], description: 'Concise summary of the study design, key results, and conclusion (NOAEL/LOAEL where applicable)' },
  { number: '3', title: 'Objective', required: true, status: 'empty', requires: ['studyType'], description: 'Purpose of the study and the question it was designed to answer' },
  { number: '4', title: 'Materials and Methods', required: true, status: 'empty', requires: ['species', 'routeOfAdministration', 'doseGroups'], description: 'Test article, species/strain, group design and dose levels, route, duration, endpoints, and analytical/statistical methods' },
  { number: '5', title: 'Results', required: true, status: 'empty', requires: ['keyFindings'], description: 'Observed findings: mortality, clinical signs, body weight, clinical pathology, organ weights, macroscopic/microscopic pathology, toxicokinetics' },
  { number: '6', title: 'Discussion and Conclusion', required: true, status: 'empty', requires: ['keyFindings', 'noael'], description: 'Interpretation of findings, dose-response, adversity, NOAEL/LOAEL determination, and overall conclusion' },
  { number: '7', title: 'Tabulated Data', required: true, status: 'empty', requires: ['targetOrganToxicity'], description: 'Summary tables of group means, target-organ findings, NOAEL/LOAEL, and safety margins' },
];
