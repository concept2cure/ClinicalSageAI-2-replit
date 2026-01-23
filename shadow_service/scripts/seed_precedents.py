"""
Seed script for regulatory adversarial precedents.

This script loads historical IR (Information Request) questions, CRL excerpts,
and common regulatory queries into the adversarial.regulatory_adversarial_precedents table.

Usage:
    DATABASE_URL="postgresql://..." python shadow_service/scripts/seed_precedents.py
    
Or with the shadow_service package installed:
    python -m shadow_service.scripts.seed_precedents
"""

import asyncio
import json
import logging
import os
from typing import Any
from uuid import uuid4

import asyncpg

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# =============================================================================
# PRECEDENT CORPUS
# =============================================================================
# This is a representative set of regulatory questions based on common IR patterns.
# In production, this would be loaded from a curated CSV/JSON file.
# These are generic examples - not proprietary regulatory correspondence.
# =============================================================================

PRECEDENT_CORPUS: list[dict[str, Any]] = [
    # FDA Efficacy Questions
    {
        "agency_code": "FDA",
        "failure_mode": "Clinical Gap",
        "historical_question": "Please provide the individual patient data and additional sensitivity analyses to support the primary efficacy endpoint results, including analyses addressing potential confounders.",
        "therapeutic_area": "Oncology",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Efficacy"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "Clinical Gap",
        "historical_question": "The submitted data do not adequately characterize the dose-response relationship. Please provide additional justification for the selected dose, including exposure-response analyses.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Dose Selection"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "Clinical Gap",
        "historical_question": "Please clarify the clinical relevance of the treatment effect observed. Provide data on patient-reported outcomes and functional assessments to support the clinical meaningfulness of the efficacy results.",
        "therapeutic_area": "CNS",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Clinical Relevance"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "Statistical Concern",
        "historical_question": "The multiplicity adjustment strategy appears inadequate for the number of endpoints tested. Please provide a revised statistical analysis plan addressing Type I error control.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Multiplicity"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "Statistical Concern",
        "historical_question": "Please justify the handling of missing data in the primary analysis. Provide sensitivity analyses using different imputation methods and discuss the impact on efficacy conclusions.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Missing Data"
    },
    
    # FDA Safety Questions
    {
        "agency_code": "FDA",
        "failure_mode": "Safety Signal",
        "historical_question": "The safety database appears limited for characterizing long-term safety. Please provide a detailed analysis of adverse events by duration of exposure and discuss plans for post-marketing safety monitoring.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Long-term Safety"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "Safety Signal",
        "historical_question": "An imbalance in hepatic events was observed between treatment arms. Please provide detailed hepatic safety analyses including Hy's Law evaluation and individual case narratives.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Hepatotoxicity"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "Safety Signal",
        "historical_question": "Please provide additional data on cardiovascular safety including ECG analysis, QT/QTc assessment, and MACE event adjudication methodology.",
        "therapeutic_area": "Cardiovascular",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - CV Safety"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "Safety Signal",
        "historical_question": "The incidence of serious infections appears elevated. Please characterize the infection risk by organism type, severity, and patient risk factors. Describe proposed mitigation strategies.",
        "therapeutic_area": "Immunology",
        "submission_type": "BLA",
        "source_ref": "Generic RTQ Pattern - Infection Risk"
    },
    
    # FDA CMC Questions
    {
        "agency_code": "FDA",
        "failure_mode": "CMC Inconsistency",
        "historical_question": "The proposed specifications do not appear adequate to ensure consistent product quality. Please provide justification for the acceptance criteria, including links to clinical and stability data.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Specifications"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "CMC Inconsistency",
        "historical_question": "Please provide a comprehensive comparability assessment demonstrating equivalence of drug substance manufactured at the new facility to material used in pivotal clinical trials.",
        "therapeutic_area": "General",
        "submission_type": "BLA",
        "source_ref": "Generic RTQ Pattern - Comparability"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "Manufacturing Deficiency",
        "historical_question": "The process validation data are insufficient. Please provide additional validation runs and demonstrate process capability across the proposed operating ranges.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Process Validation"
    },
    
    # FDA PK/PD Questions
    {
        "agency_code": "FDA",
        "failure_mode": "PK Characterization",
        "historical_question": "Please provide population PK analyses to characterize the impact of intrinsic factors (renal/hepatic impairment, age, weight) on drug exposure and support dosing recommendations.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - PopPK"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "Drug Interaction",
        "historical_question": "The drug-drug interaction assessment appears incomplete. Please provide clinical DDI studies or mechanistic justification for why certain interaction pathways were not studied.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - DDI"
    },
    
    # EMA Questions
    {
        "agency_code": "EMA",
        "failure_mode": "Clinical Gap",
        "historical_question": "The CHMP requires clarification on the generalizability of study results to the EU population. Please provide subgroup analyses by geographic region and discuss any differences in standard of care.",
        "therapeutic_area": "General",
        "submission_type": "MAA",
        "source_ref": "Generic LoQ Pattern - Generalizability"
    },
    {
        "agency_code": "EMA",
        "failure_mode": "Clinical Gap",
        "historical_question": "Please provide a detailed benefit-risk analysis using the EMA's structured format, including quantification of benefits and risks across the target population.",
        "therapeutic_area": "General",
        "submission_type": "MAA",
        "source_ref": "Generic LoQ Pattern - Benefit-Risk"
    },
    {
        "agency_code": "EMA",
        "failure_mode": "Safety Signal",
        "historical_question": "The Risk Management Plan requires enhancement. Please provide additional pharmacovigilance activities to address the identified safety concern and propose risk minimization measures.",
        "therapeutic_area": "General",
        "submission_type": "MAA",
        "source_ref": "Generic LoQ Pattern - RMP"
    },
    {
        "agency_code": "EMA",
        "failure_mode": "CMC Inconsistency",
        "historical_question": "Please provide the Quality Overall Summary following the current eCTD format and ensure consistency between Module 2.3 and Module 3 technical data.",
        "therapeutic_area": "General",
        "submission_type": "MAA",
        "source_ref": "Generic LoQ Pattern - QOS Consistency"
    },
    
    # PMDA Questions
    {
        "agency_code": "PMDA",
        "failure_mode": "Clinical Gap",
        "historical_question": "Please provide additional data on the Japanese patient population including PK bridging analyses and discussion of ethnic sensitivity factors.",
        "therapeutic_area": "General",
        "submission_type": "J-NDA",
        "source_ref": "Generic PMDA Pattern - Ethnic Factors"
    },
    {
        "agency_code": "PMDA",
        "failure_mode": "Clinical Gap",
        "historical_question": "The body weight-based dosing may not be appropriate for the Japanese population. Please provide exposure analyses across weight categories and justify the proposed dose.",
        "therapeutic_area": "General",
        "submission_type": "J-NDA",
        "source_ref": "Generic PMDA Pattern - Japanese Dosing"
    },
    
    # Health Canada Questions
    {
        "agency_code": "Health Canada",
        "failure_mode": "Clinical Gap",
        "historical_question": "Please provide a summary of Canadian site data from the pivotal trials and discuss applicability of the overall results to the Canadian population.",
        "therapeutic_area": "General",
        "submission_type": "NDS",
        "source_ref": "Generic HC Pattern - Canadian Data"
    },
    
    # General Labeling Questions
    {
        "agency_code": "FDA",
        "failure_mode": "Labeling Deficiency",
        "historical_question": "The proposed labeling does not adequately describe the limitations of the efficacy data. Please revise to include appropriate caveats regarding the study population and design limitations.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Labeling"
    },
    {
        "agency_code": "FDA",
        "failure_mode": "Labeling Deficiency",
        "historical_question": "Please revise the Warnings and Precautions section to include the identified safety signal with appropriate guidance for prescribers on monitoring and management.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Warnings"
    },
    
    # Bioequivalence Questions
    {
        "agency_code": "FDA",
        "failure_mode": "Bioequivalence Failure",
        "historical_question": "The 90% confidence intervals for Cmax and AUC do not fall within the 80-125% bioequivalence limits. Please provide additional studies or scientific justification for widened limits.",
        "therapeutic_area": "General",
        "submission_type": "ANDA",
        "source_ref": "Generic RTQ Pattern - BE Limits"
    },
    
    # Pediatric Questions
    {
        "agency_code": "FDA",
        "failure_mode": "Pediatric Data Gap",
        "historical_question": "The Pediatric Study Plan appears inadequate for the proposed indication. Please provide a revised timeline and justify the age stratification strategy for planned pediatric studies.",
        "therapeutic_area": "General",
        "submission_type": "NDA",
        "source_ref": "Generic RTQ Pattern - Pediatrics"
    },
]


async def seed_precedents(database_url: str, generate_embeddings: bool = False) -> None:
    """
    Seed the adversarial precedents table with the corpus.
    
    Args:
        database_url: PostgreSQL connection string
        generate_embeddings: If True, generate embeddings (requires OpenAI API key)
    """
    logger.info("Connecting to database...")
    conn = await asyncpg.connect(database_url)
    
    try:
        # Check current count
        current_count = await conn.fetchval(
            "SELECT COUNT(*) FROM adversarial.regulatory_adversarial_precedents"
        )
        logger.info(f"Current precedent count: {current_count}")
        
        inserted = 0
        skipped = 0
        
        for precedent in PRECEDENT_CORPUS:
            # Check if similar precedent exists (by question text)
            existing = await conn.fetchval(
                """
                SELECT id FROM adversarial.regulatory_adversarial_precedents
                WHERE historical_question = $1
                """,
                precedent["historical_question"]
            )
            
            if existing:
                logger.debug(f"Skipping existing precedent: {precedent['source_ref']}")
                skipped += 1
                continue
            
            # Generate embedding placeholder (1536 dims of small values)
            # In production, this would call an embedding API
            embedding = None
            if generate_embeddings:
                # Would call OpenAI or other embedding service here
                pass
            else:
                # Create a simple hash-based pseudo-embedding for testing
                # This is NOT for production use - just for schema testing
                import hashlib
                hash_input = precedent["historical_question"].encode()
                hash_bytes = hashlib.sha512(hash_input).digest()
                # Create 1536 floats from hash (repeating as needed)
                embedding_values = []
                for i in range(1536):
                    byte_val = hash_bytes[i % len(hash_bytes)]
                    # Normalize to -1 to 1 range
                    embedding_values.append((byte_val / 255.0) * 2 - 1)
                embedding = "[" + ",".join(str(v) for v in embedding_values) + "]"
            
            # Insert precedent
            await conn.execute(
                """
                INSERT INTO adversarial.regulatory_adversarial_precedents (
                    agency_code,
                    failure_mode,
                    historical_question,
                    precedent_vector,
                    source_ref,
                    therapeutic_area,
                    submission_type
                ) VALUES ($1, $2, $3, $4::vector, $5, $6, $7)
                """,
                precedent["agency_code"],
                precedent["failure_mode"],
                precedent["historical_question"],
                embedding,
                precedent.get("source_ref"),
                precedent.get("therapeutic_area"),
                precedent.get("submission_type"),
            )
            inserted += 1
            logger.info(f"Inserted: {precedent['agency_code']} - {precedent['failure_mode'][:30]}...")
        
        # Final count
        final_count = await conn.fetchval(
            "SELECT COUNT(*) FROM adversarial.regulatory_adversarial_precedents"
        )
        
        logger.info("=" * 60)
        logger.info(f"Seeding complete:")
        logger.info(f"  Inserted: {inserted}")
        logger.info(f"  Skipped (existing): {skipped}")
        logger.info(f"  Total precedents: {final_count}")
        logger.info("=" * 60)
        
        # Show distribution by agency
        distribution = await conn.fetch(
            """
            SELECT agency_code, COUNT(*) as count
            FROM adversarial.regulatory_adversarial_precedents
            GROUP BY agency_code
            ORDER BY count DESC
            """
        )
        logger.info("\nDistribution by agency:")
        for row in distribution:
            logger.info(f"  {row['agency_code']}: {row['count']}")
        
    finally:
        await conn.close()


async def test_similarity_search(database_url: str) -> None:
    """
    Test that similarity search works with the seeded precedents.
    """
    logger.info("\nTesting similarity search...")
    conn = await asyncpg.connect(database_url)
    
    try:
        # Get a sample precedent's vector
        sample = await conn.fetchrow(
            """
            SELECT id, historical_question, precedent_vector
            FROM adversarial.regulatory_adversarial_precedents
            WHERE precedent_vector IS NOT NULL
            LIMIT 1
            """
        )
        
        if not sample:
            logger.warning("No precedents with vectors found")
            return
        
        # Search for similar precedents
        results = await conn.fetch(
            """
            SELECT 
                id,
                agency_code,
                failure_mode,
                SUBSTRING(historical_question FROM 1 FOR 80) AS question_excerpt,
                1 - (precedent_vector <=> $1::vector) AS similarity
            FROM adversarial.regulatory_adversarial_precedents
            WHERE precedent_vector IS NOT NULL
            ORDER BY precedent_vector <=> $1::vector
            LIMIT 5
            """,
            sample["precedent_vector"]
        )
        
        logger.info(f"\nTop 5 similar to: '{sample['historical_question'][:60]}...'")
        for i, row in enumerate(results, 1):
            logger.info(f"  {i}. [{row['agency_code']}] {row['question_excerpt']}...")
            logger.info(f"     Similarity: {row['similarity']:.4f}, Failure: {row['failure_mode']}")
        
    finally:
        await conn.close()


def main():
    """Main entry point."""
    database_url = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_NEON_NEW_SECRET")
    
    if not database_url:
        logger.error("DATABASE_URL or DATABASE_NEON_NEW_SECRET environment variable required")
        return 1
    
    # Run seeding
    asyncio.run(seed_precedents(database_url, generate_embeddings=False))
    
    # Test similarity search
    asyncio.run(test_similarity_search(database_url))
    
    return 0


if __name__ == "__main__":
    exit(main())
