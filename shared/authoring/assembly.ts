/** Assembly appends to the one saved authoring document; it never replaces text. */
export type AssemblySelection = { target: 'document' } | { target: 'section'; code: string };

export interface AssemblyPreviewInput {
  programId: string;
  templateId: string;
  selection: AssemblySelection;
}

export interface AssemblyCommitInput extends AssemblyPreviewInput {
  fingerprint: string;
  reason: string;
}

export interface AssemblyPlanRow {
  code: string;
  title: string;
  content: string;
  ordering: number;
  disposition: 'append' | 'preserve';
  existingSectionId?: string;
  aiDraftable: boolean;
  aiDraftableReason: string;
  draftingGuidance?: string;
  gaps: string[];
}

export interface AssemblyPlan {
  version: 1;
  docId: string;
  programId: string;
  templateId: string;
  selection: AssemblySelection;
  targetSnapshot: string;
  templateSnapshot: string;
  fingerprint: string;
  templateName: string;
  draftRegion: string | null;
  limitations: string[];
  rows: AssemblyPlanRow[];
  gaps: string[];
}

/** Exact saved rows used by the existing editor and retained AnA candidate flow. */
export interface AssemblySection {
  id: string;
  doc_id: string;
  code: string;
  title: string;
  content: string;
  order_index: number;
  updated_at: string | null;
}

export interface AssemblyCommitData {
  docId: string;
  programId: string;
  plan: AssemblyPlan;
  sections: AssemblySection[];
}

export interface AssemblyRefusal {
  success: false;
  error: string;
  message: string;
}
