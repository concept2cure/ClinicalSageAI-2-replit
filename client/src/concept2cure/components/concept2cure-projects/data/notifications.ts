/**
 * Phase 3 Projects — notifications panel seed (PNOT_NOTIFS).
 *
 * Verbatim from design-system/ui_kits/home/ProjectsExtras.jsx
 * (lines 586–593).
 */
import type { Notification } from '../types';

export const PNOT_NOTIFS: Notification[] = [
  { id: 'n1', when: '2 hours ago', unread: true,  kind: 'agency',    icon: 'shieldCheck', title: 'FDA acknowledgement received',                  sub: 'OR-801 510(k) — accession K260473 assigned',          project: 'mdx-510k' },
  { id: 'n2', when: '5 hours ago', unread: true,  kind: 'predicate', icon: 'beaker',      title: 'Predicate K221847 updated by sponsor',          sub: 'New labeling supplement filed; review impact on SE',  project: 'mdx-510k' },
  { id: 'n3', when: 'today',       unread: true,  kind: 'supplier',  icon: 'check',       title: 'Biocompatibility supplier signature returned',  sub: 'ISO 10993-5 cytotoxicity report countersigned',       project: 'mdx-510k' },
  { id: 'n4', when: 'yesterday',   unread: false, kind: 'review',    icon: 'users',       title: 'D Reyes signed off SE Discussion §4',           sub: 'E-signature attached, audit trail updated',           project: 'mdx-510k' },
  { id: 'n5', when: '2 days ago',  unread: false, kind: 'agency',    icon: 'shieldCheck', title: 'FAERS Q3 signals adjudicated',                  sub: '47 signals reviewed, 3 require benefit-risk update',  project: 'eu-mdr-iv415' },
  { id: 'n6', when: '3 days ago',  unread: false, kind: 'lifecycle', icon: 'arrowRight',  title: 'Module 3 quality advanced',                     sub: 'BX-204 — drug substance section in active draft',     project: 'biopharma-nda' },
];
