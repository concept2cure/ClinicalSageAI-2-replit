/**
 * View-model types + presentation config for the Project3 surfaces (CsrWorkflow,
 * RegulatoryWorkspace).
 *
 * This module ships NO fabricated data. Those surfaces render real, org-scoped
 * data from their routes (GET /api/csr-workflow/board, GET /api/regulatory-
 * workspace) or an honest empty/error state — they never fall back to a sample.
 * What remains here is deterministic: the render-contract types (mirroring the
 * server shapes) and a status→tone lookup. The former Biopharma-overview fixtures
 * (BIO_*) were removed with the retired `biopharma` surface (2026-08); the CSR_* /
 * RW_* fixtures were removed when CsrWorkflow / RegulatoryWorkspace were migrated
 * to real reads. Nothing fabricated survives.
 */

/* ---- Render-contract types (mirror the server shapes) ---- */

export interface CsrProgram {
  title: string;
  code: string;
  readiness: number;
}

export interface CsrSection {
  num: string;
  label: string;
  status: string;
  blocker?: boolean;
}

export interface RwTreeItem {
  id: string;
  num: string;
  label: string;
  status: string;
  active?: boolean;
}

export interface RwIntelItem {
  k: string;
  v: string;
}

/* ---- Status → tone map (presentation config, not data) ---- */

export const STATUS_TONE: Record<string, string> = {
  complete: 'ok',
  review: 'warn',
  draft: 'idle',
  active: 'ai',
  idle: 'idle',
};
