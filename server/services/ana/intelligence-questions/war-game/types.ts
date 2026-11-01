/**
 * AnA War Game — type definitions.
 *
 * The War Game system simulates FDA auditor scrutiny on documents,
 * asking adversarial questions and producing advisory reports.
 *
 * @module server/services/ana/intelligence-questions/war-game/types
 */

/*
 * The WIRE shape — what the engine returns and the AnA stream carries — is
 * defined once, in `shared/types/intelligence-questions.ts`, and re-exported
 * here so every caller importing from this module is unchanged. 2026-11-01
 * (F1): it was written out three times by hand, and the shared copy had already
 * lost the coverage fields the engine writes; see the note there.
 *
 * `AuditRule` and `WarGameAuditor` stay here and are not shared: a rule carries
 * a `check` function, which is the engine's, not the wire's.
 */
export type {
  AuditDimension,
  WarGameCategory,
  WarGameFinding,
  WarGameReport,
} from '../../../../../shared/types/intelligence-questions.js';

import type {
  AuditDimension,
  WarGameCategory,
  WarGameFinding,
} from '../../../../../shared/types/intelligence-questions.js';

export interface AuditRule {
  id: string;
  dimension: AuditDimension;
  title: string;
  question: string;
  check: (answers: Record<string, unknown>) => WarGameFinding | null;
}

export interface WarGameAuditor {
  category: WarGameCategory;
  name: string;
  description: string;
  rules: AuditRule[];
}
