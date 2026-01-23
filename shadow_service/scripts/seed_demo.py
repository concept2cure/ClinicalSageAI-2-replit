#!/usr/bin/env python3
"""Seed demo data for Shadow Interrogation Service.

This script seeds a minimal dataset so you can test the full
interrogation loop immediately:
- Truth datapoints (clinical metrics)
- Prose fragments with embeddings
- Truth links with extracted claim values
- Regulatory precedents (historical questions)

Usage:
    python scripts/seed_demo.py

Requires: DATABASE_URL or DATABASE_NEON_NEW_SECRET environment variable
"""

import asyncio
import json
import os
import sys

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_NEON_NEW_SECRET")
if not DATABASE_URL:
    print("❌ ERROR: Set DATABASE_URL or DATABASE_NEON_NEW_SECRET environment variable")
    sys.exit(1)


async def main():
    import asyncpg
    from shadow_service.embeddings.provider import get_embedding_provider
    
    print("═" * 70)
    print("SHADOW INTERROGATION SERVICE - SEED DEMO DATA")
    print("═" * 70)
    
    conn = await asyncpg.connect(DATABASE_URL)
    embedder = get_embedding_provider()
    
    try:
        # =====================================================================
        # 1. Insert Truth Datapoints
        # =====================================================================
        print("\n1. Inserting truth datapoints...")
        
        truth_data = [
            {
                "nct_id": "NCT00000001",
                "substance_id": "UNII-DEMO-001",
                "metric_name": "p_value_primary",
                "metric_value_float": 0.012,
                "is_primary_endpoint": True,
                "source_document_ref": "CSR Table 14-2",
            },
            {
                "nct_id": "NCT00000001",
                "substance_id": "UNII-DEMO-001",
                "metric_name": "median_os_months",
                "metric_value_float": 18.5,
                "is_primary_endpoint": True,
                "source_document_ref": "CSR Figure 11-1",
            },
            {
                "nct_id": "NCT00000001",
                "substance_id": "UNII-DEMO-001",
                "metric_name": "hazard_ratio",
                "metric_value_float": 0.65,
                "is_primary_endpoint": True,
                "source_document_ref": "CSR Table 14-3",
            },
            {
                "nct_id": "NCT00000001",
                "substance_id": "UNII-DEMO-001",
                "metric_name": "orr_percent",
                "metric_value_float": 0.42,
                "is_primary_endpoint": False,
                "source_document_ref": "CSR Table 14-5",
            },
        ]
        
        truth_ids = []
        for td in truth_data:
            truth_id = await conn.fetchval(
                """
                INSERT INTO truth.clinical_truth_store
                    (nct_id, substance_id, metric_name, metric_value_float, 
                     is_primary_endpoint, source_document_ref)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
                RETURNING id;
                """,
                td["nct_id"],
                td["substance_id"],
                td["metric_name"],
                td["metric_value_float"],
                td["is_primary_endpoint"],
                td["source_document_ref"],
            )
            if truth_id:
                truth_ids.append((td["metric_name"], truth_id))
                print(f"   ✓ Truth: {td['metric_name']} = {td['metric_value_float']}")
        
        # =====================================================================
        # 2. Insert Prose Fragments
        # =====================================================================
        print("\n2. Inserting prose fragments...")
        
        fragments_data = [
            {
                "ectd_section_path": "m2.7.3-efficacy-primary",
                "jurisdiction": "FDA",
                "content_prose": (
                    "Treatment demonstrated statistically significant improvement "
                    "in overall survival versus placebo (p=0.012). The primary endpoint "
                    "was met with a median OS of 18.5 months compared to 12.3 months "
                    "for placebo (HR 0.65, 95% CI: 0.52-0.81)."
                ),
                "confidence_rating": "Conclusive",
            },
            {
                "ectd_section_path": "m2.7.3-efficacy-secondary",
                "jurisdiction": "FDA",
                "content_prose": (
                    "Secondary efficacy endpoints supported the primary analysis. "
                    "Objective response rate was 42% in the treatment arm versus "
                    "18% in placebo (p<0.001). Responses were durable with median "
                    "duration of response of 9.2 months."
                ),
                "confidence_rating": "Interpretive",
            },
            {
                "ectd_section_path": "m2.7.4-safety-summary",
                "jurisdiction": "FDA",
                "content_prose": (
                    "The safety profile was consistent with the known mechanism of action. "
                    "Grade 3-4 adverse events occurred in 34% of treatment patients "
                    "versus 21% of placebo patients. No new safety signals were identified."
                ),
                "confidence_rating": "Interpretive",
            },
        ]
        
        fragment_ids = []
        for fd in fragments_data:
            emb = await embedder.embed(fd["content_prose"])
            emb_literal = emb.pgvector_literal if emb else None
            
            frag = await conn.fetchrow(
                """
                INSERT INTO prose.smart_fragments 
                    (ectd_section_path, jurisdiction, content_prose, embedding, 
                     confidence_rating, version_id)
                VALUES ($1, $2, $3, $4::vector, $5, 1)
                RETURNING id, version_id;
                """,
                fd["ectd_section_path"],
                fd["jurisdiction"],
                fd["content_prose"],
                emb_literal,
                fd["confidence_rating"],
            )
            if frag:
                fragment_ids.append((fd["ectd_section_path"], frag["id"]))
                print(f"   ✓ Fragment: {fd['ectd_section_path']} (v{frag['version_id']})")
        
        # =====================================================================
        # 3. Link Truth to Fragments
        # =====================================================================
        print("\n3. Linking truth datapoints to fragments...")
        
        # Map truth metrics to fragments with extracted values
        if truth_ids and fragment_ids:
            primary_frag_id = fragment_ids[0][1]  # m2.7.3-efficacy-primary
            
            links = [
                ("p_value_primary", {"value_float": 0.012}),
                ("median_os_months", {"value_float": 18.5}),
                ("hazard_ratio", {"value_float": 0.65}),
            ]
            
            for metric_name, extracted in links:
                truth_id = next(
                    (tid for mname, tid in truth_ids if mname == metric_name), 
                    None
                )
                if truth_id:
                    await conn.execute(
                        """
                        INSERT INTO prose.fragment_truth_links 
                            (fragment_id, truth_id, claim_kind, extracted_claim_value)
                        VALUES ($1, $2, 'supports', $3::jsonb)
                        ON CONFLICT DO NOTHING;
                        """,
                        primary_frag_id,
                        truth_id,
                        json.dumps(extracted),
                    )
                    print(f"   ✓ Linked: {metric_name} → primary efficacy fragment")
        
        # =====================================================================
        # 4. Insert Regulatory Precedents
        # =====================================================================
        print("\n4. Inserting regulatory precedents...")
        
        precedents = [
            {
                "agency_code": "FDA",
                "failure_mode": "Statistical Plan Gap",
                "historical_question": (
                    "Please justify the multiplicity adjustment and control of Type I "
                    "error for the primary endpoint analysis. Provide the pre-specified "
                    "alpha spending approach."
                ),
                "source_ref": "NDA-DEMO-IR-001",
            },
            {
                "agency_code": "FDA",
                "failure_mode": "Efficacy Interpretation",
                "historical_question": (
                    "The clinical meaningfulness of the observed hazard ratio requires "
                    "further justification. Please discuss the magnitude of benefit in "
                    "context of the treatment's safety profile."
                ),
                "source_ref": "NDA-DEMO-IR-002",
            },
            {
                "agency_code": "FDA",
                "failure_mode": "Data Integrity",
                "historical_question": (
                    "Clarify the discrepancy between the p-value reported in the CSR "
                    "and the value cited in Module 2.7.3. Provide source documentation."
                ),
                "source_ref": "NDA-DEMO-IR-003",
            },
            {
                "agency_code": "EMA",
                "failure_mode": "Comparator Choice",
                "historical_question": (
                    "Justify the choice of placebo as comparator given the availability "
                    "of established standard of care treatments for this indication."
                ),
                "source_ref": "MAA-DEMO-RSI-001",
            },
            {
                "agency_code": "FDA",
                "failure_mode": "Safety Assessment",
                "historical_question": (
                    "The safety database appears limited for detecting rare adverse events. "
                    "Discuss plans for post-marketing safety surveillance."
                ),
                "source_ref": "NDA-DEMO-IR-004",
            },
        ]
        
        for prec in precedents:
            emb = await embedder.embed(prec["historical_question"])
            emb_literal = emb.pgvector_literal if emb else None
            
            await conn.execute(
                """
                INSERT INTO adversarial.regulatory_adversarial_precedents
                    (agency_code, failure_mode, historical_question, 
                     precedent_vector, source_ref)
                VALUES ($1, $2, $3, $4::vector, $5)
                ON CONFLICT DO NOTHING;
                """,
                prec["agency_code"],
                prec["failure_mode"],
                prec["historical_question"],
                emb_literal,
                prec["source_ref"],
            )
            print(f"   ✓ Precedent: {prec['agency_code']} - {prec['failure_mode'][:30]}...")
        
        # =====================================================================
        # Summary
        # =====================================================================
        print("\n" + "═" * 70)
        print("SEED COMPLETE")
        print("═" * 70)
        
        # Count records
        truth_count = await conn.fetchval("SELECT COUNT(*) FROM truth.clinical_truth_store")
        frag_count = await conn.fetchval("SELECT COUNT(*) FROM prose.smart_fragments")
        link_count = await conn.fetchval("SELECT COUNT(*) FROM prose.fragment_truth_links")
        prec_count = await conn.fetchval(
            "SELECT COUNT(*) FROM adversarial.regulatory_adversarial_precedents"
        )
        
        print(f"""
Database now contains:
  • {truth_count} truth datapoints
  • {frag_count} prose fragments
  • {link_count} truth links
  • {prec_count} regulatory precedents

Next steps:
  1. Start the service: python run_shadow_mvp.py
  2. Test interrogation: 
     curl -X POST http://localhost:8001/shadow/interrogate/{fragment_ids[0][1] if fragment_ids else '<fragment_id>'}
  3. View heatmap: curl http://localhost:8001/heatmap
""")
        
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
