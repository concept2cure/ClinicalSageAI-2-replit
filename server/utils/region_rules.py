# region_rules.py – Mandatory document checks per regulatory region
# Match rules by case‑insensitive substring against document title

# Region rules with required modules and display names
REGION_RULES = {
    'FDA': {
        'display': 'FDA (United States)',
        'required_modules': ['m1.1', 'm1.3', 'm1.15'],
        'description': 'Food and Drug Administration submissions'
    },
    'EMA': {
        'display': 'EMA (European Union)',
        'required_modules': ['m1.0', 'm1.2', 'm1.3', 'm1.4'],
        'description': 'European Medicines Agency submissions'
    },
    'PMDA': {
        'display': 'PMDA (Japan)',
        'required_modules': ['m1.2', 'jp-annex', 'm1.3'],
        'description': 'Pharmaceuticals and Medical Devices Agency submissions'
    }
}

# Required documents per region
REQUIRED_DOCS = {
    'FDA': [
        'Form 1571',
        'Form 1572',
        'Form 3674',
        'Cover Letter'
    ],
    'EMA': [
        'Application Form',
        'Cover Letter',
        'Risk Management Plan'
    ],
    'PMDA': [
        'Cover Letter',
        'GMP Certificate',
        'Investigator Brochure',
        'Pharmaceutical Affairs Act Annex'
    ]
}


def get_required_modules(region: str):
    """
    Get required modules for a specific region
    
    Args:
        region: Region code (FDA, EMA, PMDA)
        
    Returns:
        List of required module identifiers
    """
    return REGION_RULES.get(region, {}).get('required_modules', [])


def check_required(docs, region: str):
    """
    Return list of missing required document phrases for region.
    
    Args:
        docs: List of document objects with title attribute
        region: Region code (FDA, EMA, PMDA)
        
    Returns:
        List of missing required document phrases
    """
    titles = [d.title.lower() for d in docs]
    missing = []
    for phrase in REQUIRED_DOCS.get(region, []):
        if not any(phrase.lower() in t for t in titles):
            missing.append(phrase)
    return missing