// This is a stub file to prevent import errors from shared/utils/therapeutic-area-classifier

export function classifyTherapeuticArea(indicationText: string): string {
  console.warn(
    '[stub] classifyTherapeuticArea() called – replace shared/utils/therapeutic-area-classifier import'
  );

  // Basic fallback classification based on keywords
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

  return 'Other';
}
