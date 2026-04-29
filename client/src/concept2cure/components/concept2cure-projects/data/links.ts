/**
 * Phase 3 Projects — linked-projects seed (PLNK_LINKS / PLNK_KIND_META).
 *
 * Verbatim from design-system/ui_kits/home/ProjectsExtras.jsx
 * (lines 169–193).
 */
import type { ProjectLink, LinkKind } from '../types';

export const PLNK_LINKS: Record<string, ProjectLink[]> = {
  'mdx-510k': [
    { id: 'lk-1', kind: 'predicate', dir: 'out', otherName: 'K221847 — TitanFix cortical screw',     otherType: '510(k)',   status: 'submitted', via: 'Substantial equivalence', date: '2022-09-14' },
    { id: 'lk-2', kind: 'sister',    dir: 'out', otherName: 'OR-802 Pediatric — 510(k)',             otherType: '510(k)',   status: 'draft',     via: 'Same product family',     date: '2026-03-01' },
    { id: 'lk-3', kind: 'reference', dir: 'out', otherName: 'OR-801 IFU and labeling',                otherType: 'Artifact', status: 'active',    via: 'Cited in §6 labeling',    date: '2026-04-12' },
  ],
  'biopharma-nda': [
    { id: 'lk-4', kind: 'parent_ind', dir: 'in',  otherName: 'IND 152841 — BX-204 oral',                  otherType: 'IND',      status: 'submitted', via: 'Parent IND',           date: '2024-02-08' },
    { id: 'lk-5', kind: 'sister',     dir: 'out', otherName: 'NDA 212346 — BX-204 modified release',      otherType: 'NDA',      status: 'draft',     via: 'Companion submission', date: '2026-04-04' },
    { id: 'lk-6', kind: 'reference',  dir: 'out', otherName: 'BX-204 Phase 3 study report',               otherType: 'Artifact', status: 'active',    via: 'Cited in §2.7.3',      date: '2026-03-22' },
  ],
  'eu-mdr-iv415': [
    { id: 'lk-7', kind: 'parent_510k', dir: 'in',  otherName: 'K198440 — companion Dx US predicate',      otherType: '510(k)',   status: 'submitted', via: 'US predicate',  date: '2020-11-30' },
    { id: 'lk-8', kind: 'reference',   dir: 'out', otherName: 'IV-415 PMS plan',                          otherType: 'Artifact', status: 'active',    via: 'Cited in §9 PMS', date: '2026-04-22' },
  ],
  'c2c-ana': [],
};

export const PLNK_KIND_META: Record<LinkKind, { label: string; hint: string }> = {
  predicate:   { label: 'Predicate device',     hint: 'Cleared device this submission claims substantial equivalence to' },
  parent_ind:  { label: 'Parent IND',           hint: 'IND under which this NDA was developed' },
  parent_510k: { label: 'Parent 510(k)',        hint: '510(k) cleared device this CER references' },
  sister:      { label: 'Sister submission',    hint: 'Related submission in the same family' },
  reference:   { label: 'Referenced artifact',  hint: 'Document or study cited from this project' },
};
