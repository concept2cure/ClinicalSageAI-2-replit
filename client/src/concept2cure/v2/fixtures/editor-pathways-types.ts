// Types and helper utilities for regulatory pathway editor fixtures.
// Ported from design kit: editor-pathways.jsx

export type SectionStatus = 'draft' | 'complete' | 'review';

export interface Section {
  id: string;
  num: string;
  label: string;
  status: SectionStatus;
  conf: number;
  words: number;
  blocker?: boolean;
}

export interface Volume {
  vol: string;
  items: Section[];
}

export interface Pathway {
  id: string;
  kind: string;
  program: string;
  code: string;
  ta: string;
  owner: string;
  dueline: string;
  readiness: number;
  active: string;
  tree: Volume[];
}

export type PathwayMap = Record<string, Pathway>;

export type FilingToPathwayMap = Record<string, string>;

/**
 * Build a section object.
 * Mirrors the _s() helper from the design kit for compact data entry.
 */
export function makeSection(
  id: string,
  num: string,
  label: string,
  status: SectionStatus = 'draft',
  conf: number = 0.5,
  words: number = 0,
  extra?: { blocker?: boolean },
): Section {
  return { id, num, label, status, conf, words, ...extra };
}
