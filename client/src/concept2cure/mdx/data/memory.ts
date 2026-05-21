/**
 * AnA memory data — the curated AnA context for your organization.
 *
 * A memory atom is a single grounded fact AnA carries into every conversation
 * (subject to scope). Atoms are categorized, have an importance level, link
 * to source documents, and can supersede earlier atoms. Each atom is
 * verified or unverified.
 *
 * Wire shape contract: see HANDOFF.md > Phase 4 · AnA memory. Claude Code
 * mirrors c2c_memory_atoms / c2c_memory_links / c2c_memory_ingestion_jobs.
 */

export const MEM_CATEGORIES = [
  { id: 'persona',     label: 'Persona',     desc: 'How AnA should speak. Tone, voice, what to call things.',  count: 14, color: 'persona'     },
  { id: 'regulatory', label: 'Regulatory',   desc: 'Statutes, guidances, interpretations specific to your devices.', count: 87, color: 'regulatory' },
  { id: 'pipeline',    label: 'Pipeline',    desc: 'Your portfolio — devices, codes, classes, intended uses.',  count: 52, color: 'pipeline'    },
  { id: 'competitive', label: 'Competitive', desc: 'Predicates, peer devices, market context.',                count: 38, color: 'competitive' },
  { id: 'operational', label: 'Operational', desc: 'Who owns what, who signs what, internal timelines.',       count: 24, color: 'operational' },
  { id: 'preference',  label: 'Preference',  desc: 'House style, formatting, claim language we prefer.',        count: 19, color: 'preference'  },
  { id: 'history',     label: 'History',     desc: 'Past submissions, deficiencies, learnings.',               count: 41, color: 'history'     },
];

export const MEM_IMPORTANCE = [
  { id: 'critical', label: 'Critical', desc: 'AnA must apply on every relevant turn.' },
  { id: 'high',     label: 'High',     desc: 'AnA should apply unless explicitly overridden.' },
  { id: 'medium',   label: 'Medium',   desc: 'AnA references when relevant.' },
  { id: 'low',      label: 'Low',      desc: 'Background only.' },
];

/* Each atom is short, specific, and grounded. Atoms are NOT free-form
   notes — they're rules-of-record. Pinned atoms always travel; scoped
   atoms only activate in matching contexts. */
export const MEM_ATOMS = [
  { id: 'm-2914', cat: 'persona',     imp: 'critical', verified: true,  pinned: true,  scope: ['mdx'],          source: 'MDX style guide v3.2 — JC, 2026-02-14', supersedes: 'm-2701', useCount: 142, lastUsed: '8m ago',
    title: 'Sentence case everywhere. Never title case. Never all-caps except 10px metadata.',
    body: 'Every heading, button, menu item, status label. We are reviewer-grade, not marketing.' },
  { id: 'm-2891', cat: 'persona',     imp: 'critical', verified: true,  pinned: true,  scope: ['mdx'],          source: 'MDX style guide v3.2 — JC, 2026-02-14', supersedes: null, useCount: 138, lastUsed: '8m ago',
    title: 'No emoji. No exclamation marks. No cheerleading copy.',
    body: 'The product confirms; it never celebrates. Decline gracefully if asked.' },
  { id: 'm-2856', cat: 'regulatory', imp: 'critical', verified: true,  pinned: false, scope: ['mdx','k510'],   source: 'FDA 510(k) Submission Methods Guidance, Sep 2024', supersedes: null, useCount: 88, lastUsed: '2h ago',
    title: 'FDA Refuse-to-Accept clock starts at receipt date, not acknowledgment date.',
    body: 'Plan eSTAR validation for the 5 business days before transmittal, never after.' },
  { id: 'm-2849', cat: 'regulatory', imp: 'critical', verified: true,  pinned: false, scope: ['mdx','samd'],   source: 'FDA Cyber 2023 final guidance, JC summary', supersedes: 'm-2410', useCount: 67, lastUsed: '1h ago',
    title: 'SBOM is mandatory for all software-containing devices submitted after Oct 2023.',
    body: 'Use CycloneDX or SPDX. Include all OTS components, not just direct deps. Vulnerability assessment per component.' },
  { id: 'm-2810', cat: 'pipeline',    imp: 'high',     verified: true,  pinned: false, scope: ['mdx'],          source: 'Concept2Cure pipeline tracker — Q2 2026',  supersedes: null, useCount: 96, lastUsed: '34m ago',
    title: 'BX-204 CGM uses K221847 (Dexcom G7) as primary predicate.',
    body: 'Secondary K-numbers under evaluation: K252712, K243088. Subject device differs on adhesive (Rev D) and rapid-drop hysteresis.' },
  { id: 'm-2782', cat: 'competitive', imp: 'high',     verified: true,  pinned: false, scope: ['mdx','k510'],   source: 'Q2 2026 competitive scan — AM',          supersedes: null, useCount: 41, lastUsed: '6h ago',
    title: 'CGM segment leaders: Dexcom G7, Abbott FreeStyle Libre 3, Medtronic Guardian 4.',
    body: 'All three cleared via 510(k) substantial equivalence — none required clinical study for primary clearance.' },
  { id: 'm-2754', cat: 'operational', imp: 'high',     verified: true,  pinned: true,  scope: ['mdx'],          source: 'Internal — JC, 2026-01-08',              supersedes: null, useCount: 219, lastUsed: '12m ago',
    title: 'Submissions go out Tuesdays. Cover letter signed by Jordan Chen.',
    body: 'Never on Mondays (eSTAR validation lag) or Fridays (no FDA review pickup).' },
  { id: 'm-2733', cat: 'preference',  imp: 'medium',   verified: true,  pinned: false, scope: ['mdx'],          source: 'House style — Reg Affairs',             supersedes: null, useCount: 58, lastUsed: '3h ago',
    title: '"Substantial equivalence" — spell out on first mention per section, then "SE".',
    body: 'Same convention applies to RTA, PCCP, eSTAR. Define on first use.' },
  { id: 'm-2701', cat: 'persona',     imp: 'high',     verified: false, pinned: false, scope: ['mdx'],          source: 'Inferred — first 200 conversations',     supersedes: null, useCount: 0,  lastUsed: 'never',
    title: 'Use sentence case in titles, capitalized first word only.',
    body: 'Superseded by m-2914 with stricter scope — verify or retire.' },
  { id: 'm-2689', cat: 'history',     imp: 'high',     verified: true,  pinned: false, scope: ['mdx','k510'],   source: 'NM-512 RTA letter — FDA, 2025-09-12',   supersedes: null, useCount: 24, lastUsed: '1d ago',
    title: 'FDA rejected NM-512 eSTAR §10 — missing performance comparison table with predicate.',
    body: 'Lesson: always include side-by-side bench table even when SE matrix narrative covers it.' },
  { id: 'm-2643', cat: 'regulatory', imp: 'medium',   verified: true,  pinned: false, scope: ['cer'],          source: 'EU MDR Article 61, plain reading',       supersedes: null, useCount: 12, lastUsed: '2d ago',
    title: 'EU MDR Article 61 — CER must demonstrate clinical evidence is sufficient and current.',
    body: 'Annual update required for Class III; biennial for Class IIb implantable.' },
  { id: 'm-2604', cat: 'operational', imp: 'medium',   verified: true,  pinned: false, scope: ['mdx'],          source: 'Internal — ops calendar',                supersedes: null, useCount: 38, lastUsed: '4h ago',
    title: 'DSMB meetings are first Wednesday of the month, 4 weeks prep window.',
    body: 'Charter changes need CRO + sponsor + chair sign-off — minimum 14 days lead.' },
  { id: 'm-2587', cat: 'preference',  imp: 'low',      verified: false, pinned: false, scope: ['mdx'],          source: 'Inferred — 14 drafts last quarter',     supersedes: null, useCount: 0,  lastUsed: 'never',
    title: 'Sponsor name prefers "Concept2Cure, Inc." with comma; never "C2C".',
    body: 'Verify with legal — usage is mixed in older artifacts.' },
];

/* Ingestion jobs — drag a PDF, AnA extracts atoms, you verify. */
export const MEM_INGEST = [
  { id: 'job-2018', source: 'MDX Style Guide v3.2.pdf',           added: '2d ago', state: 'verified',    proposed: 14, accepted: 12, rejected: 2 },
  { id: 'job-2017', source: 'FDA Cyber 2023 Final Guidance.pdf', added: '5d ago', state: 'verified',    proposed: 41, accepted: 38, rejected: 3 },
  { id: 'job-2016', source: 'NM-512 RTA letter (2025-09-12).pdf',added: '14d ago',state: 'verified',    proposed: 9,  accepted: 8,  rejected: 1 },
  { id: 'job-2014', source: 'Competitive scan Q2 2026.docx',     added: '6h ago', state: 'pending',     proposed: 22, accepted: 0,  rejected: 0 },
  { id: 'job-2013', source: 'EU MDR Article 61 plain-reading.md',added: '3d ago', state: 'in-progress', proposed: 18, accepted: 11, rejected: 0 },
];

/* Effects — how memory is propagating through AnA. Drives the right rail. */
export const MEM_EFFECTS = [
  { atom: 'm-2914', kind: 'caught',    summary: '7 title-case suggestions overridden in eCTD-CoAuthor today', count: 7,   when: 'today' },
  { atom: 'm-2810', kind: 'grounded',  summary: 'Predicate questions auto-anchored to K221847 in BX-204 threads', count: 34, when: 'this week' },
  { atom: 'm-2754', kind: 'enforced',  summary: 'Friday submission proposal blocked → rescheduled to Tuesday', count: 2,   when: 'this week' },
  { atom: 'm-2689', kind: 'grounded',  summary: 'eSTAR §10 drafts now include side-by-side bench table by default', count: 11, when: 'this month' },
];


// Window globals (kit harness only — codebase uses ESM imports)
