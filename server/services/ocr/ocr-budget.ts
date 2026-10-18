/**
 * What automatic OCR of a scanned PDF may spend in Data Room processing.
 * Measured at about 5.3 s per page here, 100 pages fit inside ten minutes,
 * inside the 15-minute processing lease. Pages beyond it are reported in
 * `coverage`, never silently dropped. Opt-in: a caller that cannot yet report
 * coverage keeps reading every page.
 *
 * Its own dependency-free module so the Data Room processor can name it
 * without loading the OCR engines it imports lazily.
 */
export const AUTOMATIC_PDF_OCR_BUDGET = { maxPages: 100, maxDurationMs: 600_000 } as const;
