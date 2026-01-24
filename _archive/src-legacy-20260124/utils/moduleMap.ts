export const REGION_MAP: Record<string, { id: string; label: string }[]> = {
  FDA: [
    { id: 'm1', label: 'Module 1  – US Regional' },
    { id: 'm2', label: 'Module 2  – Common CTD' },
    { id: 'm3', label: 'Module 3  – Quality' },
    { id: 'm4', label: 'Module 4  – Non‑clinical' },
    { id: 'm5', label: 'Module 5  – Clinical' },
  ],
  EMA: [
    { id: 'm1', label: 'Module 1 – EU Regional (1.0–1.7)' },
    { id: '1.2', label: '‑‑ CTA Application form' },
    { id: '1.3', label: '‑‑ Product‑information' },
    { id: 'm2', label: 'Module 2 – Overview/summaries' },
    { id: 'm3', label: 'Module 3 – Quality' },
    { id: 'm4', label: 'Module 4 – Non‑clinical' },
    { id: 'm5', label: 'Module 5 – Clinical' },
  ],
  PMDA: [
    { id: 'm1', label: 'Module 1 – JP Regional (1.1–1.7)' },
    { id: 'jp-annex', label: '‑‑ Japanese Annex' },
    { id: 'm2', label: 'Module 2 – Overviews' },
    { id: 'm3', label: 'Module 3 – CMC' },
    { id: 'm4', label: 'Module 4 – Non‑clinical' },
    { id: 'm5', label: 'Module 5 – Clinical' },
  ],
};
