/**
 * Phase 3 Projects — audit log seed (PACT_EVENTS / PACT_KIND_LABEL).
 *
 * Verbatim from design-system/ui_kits/home/ProjectsExtras.jsx
 * (lines 19–51).
 */
import type { ActivityEvent } from '../types';

export const PACT_EVENTS: Record<string, ActivityEvent[]> = {
  'mdx-510k': [
    { ts: '2026-04-28 09:42:18Z', actor: 'JM Smith', role: 'Owner',    action: 'export.pdf',          target: 'OR-801_predicate_workup.md',         kind: 'export',    ip: '10.42.18.7',  sig: 'sha256:9f4a…b71c', e: true },
    { ts: '2026-04-28 09:14:02Z', actor: 'A Park',   role: 'Editor',   action: 'file.update',         target: 'biocompat_summary_v2.pdf',           kind: 'file',      ip: '10.42.18.99', sig: 'sha256:2ed8…7c44' },
    { ts: '2026-04-28 08:51:33Z', actor: 'A Park',   role: 'Editor',   action: 'memory.write',        target: 'Predicate K221847 confirmed',        kind: 'memory',    ip: '10.42.18.99', sig: 'sha256:01ba…2cf9' },
    { ts: '2026-04-27 17:08:11Z', actor: 'JM Smith', role: 'Owner',    action: 'instructions.update', target: 'Project instructions v3',            kind: 'instr',     ip: '10.42.18.7',  sig: 'sha256:b3f1…8e22' },
    { ts: '2026-04-27 16:42:55Z', actor: 'D Reyes',  role: 'Reviewer', action: 'review.signoff',      target: 'SE Discussion §4',                   kind: 'esig',      ip: '10.99.4.18',  sig: 'sha256:7a09…41bd', e: true },
    { ts: '2026-04-27 16:18:00Z', actor: 'D Reyes',  role: 'Reviewer', action: 'comment.create',      target: 'Performance testing — torque ratio', kind: 'comment',   ip: '10.99.4.18',  sig: 'sha256:c4d0…9b71' },
    { ts: '2026-04-26 11:22:09Z', actor: 'A Park',   role: 'Editor',   action: 'phase.advance',       target: 'Performance testing → in progress',  kind: 'lifecycle', ip: '10.42.18.99', sig: 'sha256:88aa…3ef0' },
    { ts: '2026-04-25 14:09:42Z', actor: 'JM Smith', role: 'Owner',    action: 'member.invite',       target: 'd.reyes@bionova.com (Reviewer)',     kind: 'access',    ip: '10.42.18.7',  sig: 'sha256:5a2e…c103' },
    { ts: '2026-04-24 09:51:30Z', actor: 'JM Smith', role: 'Owner',    action: 'project.create',      target: 'OR-801 510(k) submission',           kind: 'lifecycle', ip: '10.42.18.7',  sig: 'sha256:0001…0001' },
  ],
  'c2c-ana': [
    { ts: '2026-04-28 10:11:08Z', actor: 'JM Smith', role: 'Owner', action: 'memory.write',        target: 'Region picker — 6 regions confirmed', kind: 'memory',    ip: '10.42.18.7', sig: 'sha256:f23c…71d8' },
    { ts: '2026-04-28 09:01:24Z', actor: 'JM Smith', role: 'Owner', action: 'instructions.update', target: 'Project instructions v2',             kind: 'instr',     ip: '10.42.18.7', sig: 'sha256:e4b1…07a9' },
    { ts: '2026-04-22 16:33:40Z', actor: 'JM Smith', role: 'Owner', action: 'project.create',      target: 'Concept2cure AnA 1.0 Skills',         kind: 'lifecycle', ip: '10.42.18.7', sig: 'sha256:0001…0001' },
  ],
  'biopharma-nda': [
    { ts: '2026-04-28 13:02:14Z', actor: 'L Tanaka', role: 'Editor', action: 'file.update',    target: 'BX-204_clinical_overview.md',     kind: 'file',      ip: '10.74.2.14', sig: 'sha256:aa01…5b72' },
    { ts: '2026-04-27 11:50:00Z', actor: 'L Tanaka', role: 'Editor', action: 'phase.advance',  target: 'Module 3 quality → in progress',  kind: 'lifecycle', ip: '10.74.2.14', sig: 'sha256:9100…7d2c' },
    { ts: '2026-04-20 09:00:00Z', actor: 'JM Smith', role: 'Owner',  action: 'project.create', target: 'NDA 212345 — BX-204 oral',        kind: 'lifecycle', ip: '10.42.18.7', sig: 'sha256:0001…0001' },
  ],
  'eu-mdr-iv415': [
    { ts: '2026-04-28 06:18:51Z', actor: 'F Müller', role: 'Editor', action: 'file.update',    target: 'IV-415_CER_outline.md',           kind: 'file',      ip: '10.55.1.4',  sig: 'sha256:dd80…34a1' },
    { ts: '2026-04-27 22:10:09Z', actor: 'F Müller', role: 'Editor', action: 'memory.write',   target: 'Article 61 confirmed; Class III', kind: 'memory',    ip: '10.55.1.4',  sig: 'sha256:7b29…ee0c' },
    { ts: '2026-04-15 09:00:00Z', actor: 'JM Smith', role: 'Owner',  action: 'project.create', target: 'IV-415 EU MDR — companion Dx',    kind: 'lifecycle', ip: '10.42.18.7', sig: 'sha256:0001…0001' },
  ],
};

export const PACT_KIND_LABEL: Record<string, string> = {
  export: 'Export',
  file: 'File',
  memory: 'Memory',
  instr: 'Instructions',
  esig: 'E-signature',
  comment: 'Comment',
  lifecycle: 'Lifecycle',
  access: 'Access',
};
