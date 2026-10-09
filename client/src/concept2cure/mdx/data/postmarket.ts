/**
 * Post-market vigilance data — MDR/FSCA reports, CAPA workflow, signals
 * trending, MAUDE/FAERS feeds.
 *
 * Regulatory frame:
 *   • US 21 CFR 803 — Medical Device Reporting (death/serious-injury within
 *     30 days; malfunction within 5; user-facility imposes 10).
 *   • EU MDR Art. 87 — Serious incident report (15 calendar days; death/
 *     unanticipated public-health threat: 2 days).
 *   • FSCA = Field Safety Corrective Action; FSN = Field Safety Notice.
 */

/* The wire shapes GET /api/mdx/postmarket returns (hooks/usePostmarket).
   These were inferred from the example rows below them — so the contract was
   defined by a fixture. They are declared now, and the rows are gone. */
export interface PvMetricRow { label: string; metric: string; unit?: string; meta: string; tone?: string }
export interface PvSignalRow {
  id: string; device: string; source: string; opened: string;
  severity: string; kind: string; count: number; vs: string;
  summary: string; owner: string; state: string;
}
export interface PvCapaRow {
  id: string; title: string; device: string; stage: string; owner: string;
  opened: string; sla: string; critical: boolean; linked: string[];
}
export interface PvPmsRow { device: string; last: string; next: string; psur: string; source: string; signals: number; state: string }
export interface PvTrendRow { device: string; weeks: number[]; severityMix: { critical: number; review: number; watching: number } }

/* CAPA — Corrective and Preventive Action workflow. Standard 6 phases. */
export const PV_CAPA_STAGES = [
  { id: 'open',         label: 'Open',         desc: 'Triaged from signal' },
  { id: 'investigate',  label: 'Investigate',  desc: 'Root-cause analysis' },
  { id: 'action',       label: 'Action',       desc: 'Containment + corrective' },
  { id: 'verify',       label: 'Verify',       desc: 'Effectiveness check' },
  { id: 'close',        label: 'Close',        desc: 'Approved + filed' },
];
/*
 * PV_METRICS, PV_SIGNALS, PV_MDRS, PV_CAPAS, PV_PMS_PLAN and PV_TRENDS —
 * removed. They were a vigilance record for devices this tenant does not
 * have: serious-injury and malfunction signals with MAUDE/FAERS sources and
 * trend percentages, five MDRs with statutory clocks (one a death reported to
 * PMDA), six CAPAs with owners and SLAs, a PMS plan, eight weeks of complaint
 * counts. On a vigilance surface an example feed is indistinguishable from a
 * real one; the surface reads the tenant's vigilance_events and capa_records
 * or states that it could not. PV_CAPA_STAGES stays — it is the CAPA
 * workflow's structure, not a record of anyone's CAPA.
 */

// Window globals (kit harness only — codebase uses ESM imports)
