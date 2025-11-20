import re

# ==============================================================================
# REGULATORY DOCUMENT CONSTANTS
# This file centralizes all constants and patterns related to regulatory
# document processing. This ensures maintainability and consistency across
# the application.
# ==============================================================================

# This is the primary regex for identifying specific, granular eCTD section headings
# within the body of a document. It is designed to capture the hierarchical numbering
# (e.g., 2.5, 3.2.S.1, 4.2.3.1) and the heading title.
# This pattern is derived from the official ICH M4 and FDA eCTD v4.0 guidance. [1]
ECTD_HEADING_REGEX = re.compile(
    # Matches the start of the line, allowing for optional whitespace
    r'^\s*'
    # Captures the numeric eCTD section (e.g., "3.2.S.1.1")
    # It looks for a digit, followed by one or more groups of a period and more digits/letters.
    r'(\d(\.[\w\d]+)+)'
    # Matches the whitespace between the number and the heading text
    r'\s+'
    # Captures the heading text itself (e.g., "Nomenclature")
    r'([A-Za-z].*)'
)

# This dictionary maps user-friendly input document types to standardized,
# database-friendly enum values. This ensures data consistency in the doc_type field.
DOCUMENT_TYPE_MAP = {
    "clinical_study_report": "CSR",
    "ich_guideline": "ICH_Guideline",
    "cmc_batch_record": "CMC_Batch_Record",
    "investigator_brochure": "IB",
    "protocol": "Protocol",
    "fda_guidance": "FDA_Guidance",
    "ema_guideline": "EMA_Guideline"
}

# This dictionary defines regex patterns to perform a high-level classification
# of a document's content, which can be used as a fallback if specific
# eCTD headings are not found.
DOCUMENT_CONTENT_CLASSIFIERS = {
    "module_1": re.compile(r'administrative|form 1571|cover letter', re.IGNORECASE),
    "module_2": re.compile(r'summary|overview', re.IGNORECASE),
    "module_3": re.compile(r'quality|cmc|chemistry|manufacturing|controls|drug substance|drug product', re.IGNORECASE),
    "module_4": re.compile(r'nonclinical|non-clinical|toxicology|pharmacology', re.IGNORECASE),
    "module_5": re.compile(r'clinical|study report|csr|patient', re.IGNORECASE),
}