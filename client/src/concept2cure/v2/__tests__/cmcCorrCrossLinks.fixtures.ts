/** One open agency question citing the given section. */
export const question = (sectionRef: string) => ({
  id: 1,
  question: 'Please justify the proposed change and provide comparability data for the affected material.',
  sectionRef,
  priority: 'high',
  severity: 'major',
  status: 'open',
  region: 'FDA',
  dueDate: '2026-09-01',
  overdue: true,
  assignedTo: null,
});

/**
 * A live board with one submission, the given IR count, and the given questions.
 * `irOverdue: null` is the server saying the question store could not be read —
 * not that nothing is overdue.
 */
export const board = (irOverdue: number | null, correspondence: unknown[] = []) => ({
  portfolio: [{ sub: 'BLA 761234', product: 'Compound A', region: 'FDA', type: 'BLA', rpi: 82, ir: irOverdue, source: 'rpi' }],
  sections: null,
  kpis: { submissions: 1, rpiAverage: 82, irOverdue, sectionsApproved: null, sectionsTotal: null, readyPercent: null },
  correspondence,
  meta: { projectId: null, portfolioProvisioned: true, sectionsProvisioned: null, correspondenceUnreadable: irOverdue == null, generatedAt: '2026-08-24T00:00:00.000Z' },
});

