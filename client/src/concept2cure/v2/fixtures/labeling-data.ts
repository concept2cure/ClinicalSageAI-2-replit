/* Labeling fixture data — ported from kit specialist-data.jsx (window globals).
   Types match the mdx-labeling.ts backend shape described in the kit comments. */

export interface LabelSection {
  s: string;
  status: string;
  blocker?: boolean;
}

export interface LabelCheck {
  k: string;
  v: string;
  tone: string;
}

export interface LabelSymbol {
  ref: string;
  name: string;
  status: string;
  blocker?: boolean;
}

export interface LabelUdi {
  di: string;
  issuing: string;
  carrier: string;
  pi: string[];
  placements: { loc: string; done: boolean }[];
}

export interface LabelWarning {
  w: string;
  hz: string;
  src: string;
  placed: boolean;
  blocker?: boolean;
}

export interface LabelDoc {
  device: string;
  kind: string;
  version: string;
  status: string;
  region: string;
  udiDi: string;
  effectiveDate: string;
}

export interface LabelEnums {
  kind: [string, string][];
  docStatus: [string, string][];
  method: [string, string][];
  transStatus: [string, string][];
}

export interface LabelTranslation {
  id: string;
  language: string;
  name: string;
  method: string;
  btv: boolean;
  status: string;
  _new?: boolean;
}



export const LABEL_ENUMS: LabelEnums = {
  kind: [
    ['ifu', 'Instructions for use'],
    ['package_insert', 'Package insert'],
    ['patient_label', 'Patient label'],
    ['operator_manual', 'Operator manual'],
    ['service_manual', 'Service manual'],
    ['quick_ref', 'Quick reference'],
    ['box_label', 'Box label'],
  ],
  docStatus: [
    ['draft', 'Draft'],
    ['review', 'In review'],
    ['approved', 'Approved'],
    ['effective', 'Effective'],
    ['superseded', 'Superseded'],
  ],
  method: [
    ['human', 'Human'],
    ['mt_postedited', 'MT + post-edit'],
    ['machine', 'Machine'],
  ],
  transStatus: [
    ['pending', 'Pending'],
    ['in_progress', 'In progress'],
    ['review', 'In review'],
    ['approved', 'Approved'],
    ['rejected', 'Rejected'],
  ],
};

/** Status string to chip tone (shared across specialist surfaces). */
export const STATUS_TONE: Record<string, string> = {
  approved: 'ok', review: 'warn', draft: 'idle', sealed: 'ok',
  pending: 'idle', complete: 'ok', running: 'ai', queued: 'idle', submitted: 'ok',
};
