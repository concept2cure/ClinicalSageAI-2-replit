/**
 * Keyword classification of an indication into a therapeutic area; null when
 * no keyword matches, because that is not a classification.
 *
 * Until 2026-10-15 it returned 'Other', which its one consumer
 * (server/protocol-analyzer-service.ts) took for a classification: an explicit
 * indication it could not classify — "relapsed multiple myeloma" — was
 * replaced by "Other", and two unrelated unclassified indications scored as
 * the same therapeutic area in protocol similarity. getTherapeuticArea, which
 * paired the answer with a constant 0.75 / 0.3 "confidence", had no callers
 * and is removed.
 */
export function classifyTherapeuticArea(indicationText: string): string | null {
  const indicationLower = indicationText.toLowerCase();

  if (/cancer|oncology|tumor|carcinoma|lymphoma|leukemia|melanoma|sarcoma/.test(indicationLower)) {
    return 'Oncology';
  } else if (/diabetes|insulin|glycemic|hyperglycemia/.test(indicationLower)) {
    return 'Endocrinology';
  } else if (
    /alzheimer|dementia|parkinsons|epilepsy|seizure|neurology|multiple sclerosis|neurological/.test(
      indicationLower
    )
  ) {
    return 'Neurology';
  } else if (
    /cardio|heart|vascular|arterial|hypertension|cholesterol|stroke/.test(indicationLower)
  ) {
    return 'Cardiovascular';
  } else if (
    /depression|anxiety|bipolar|schizophrenia|psychiatric|mental health/.test(indicationLower)
  ) {
    return 'Psychiatry';
  } else if (/respiratory|asthma|copd|lung|pulmonary/.test(indicationLower)) {
    return 'Respiratory';
  } else if (/inflammat|rheumatoid|arthritis|autoimmune|lupus|psoriasis/.test(indicationLower)) {
    return 'Immunology';
  } else if (/infect|hiv|viral|bacteria|hepatitis|covid|antibiotic/.test(indicationLower)) {
    return 'Infectious Disease';
  }

  return null;
}
