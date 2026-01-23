#!/usr/bin/env python3
"""Demo script: Shadow Interrogation MVP Workflow.

This script demonstrates the complete interrogation flow:
1. Create a fragment with prose claims
2. Link it to truth datapoints
3. Interrogate (computes drift + finds precedents)
4. View heatmap rollups
5. Create a submission snapshot
6. Check gate metrics

Run: python scripts/demo_interrogation.py
"""

import asyncio
import json
import os
import sys
from uuid import UUID

# Add parent to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Check for database URL
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_NEON_NEW_SECRET")
if not DATABASE_URL:
    print("❌ ERROR: Set DATABASE_URL or DATABASE_NEON_NEW_SECRET environment variable")
    sys.exit(1)


async def main():
    """Run demo workflow."""
    import asyncpg
    
    print("═" * 70)
    print("SHADOW INTERROGATION MVP - DEMO WORKFLOW")
    print("═" * 70)
    
    # Connect to database
    print("\n1. Connecting to database...")
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        # Step 1: Check existing data
        print("\n2. Checking existing fragments...")
        fragment_count = await conn.fetchval(
            "SELECT COUNT(*) FROM prose.smart_fragments"
        )
        print(f"   Found {fragment_count} existing fragments")
        
        # Step 2: Get a sample fragment (or create one)
        fragment = await conn.fetchrow("""
            SELECT id, ectd_section_path, jurisdiction, version_id
            FROM prose.smart_fragments
            LIMIT 1
        """)
        
        if fragment:
            print(f"\n3. Using fragment: {fragment['id']}")
            print(f"   Section: {fragment['ectd_section_path']}")
            print(f"   Jurisdiction: {fragment['jurisdiction']}")
            print(f"   Version: {fragment['version_id']}")
        else:
            print("\n3. Creating sample fragment...")
            fragment = await conn.fetchrow("""
                INSERT INTO prose.smart_fragments 
                    (ectd_section_path, jurisdiction, content_prose, version_id)
                VALUES ('m2.7.3-demo-efficacy', 'FDA', 
                        'The primary endpoint demonstrated a median OS of 18.5 months, '
                        'with a hazard ratio of 0.65 (95% CI: 0.52-0.81), p<0.001.',
                        1)
                RETURNING id, ectd_section_path, jurisdiction, version_id
            """)
            print(f"   Created fragment: {fragment['id']}")
        
        # Step 3: Check heatmap views
        print("\n4. Querying heatmap views...")
        
        # Check if views exist
        view_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.views 
                WHERE table_schema='prose' AND table_name='v_section_risk_rollup'
            )
        """)
        
        if view_exists:
            section_rollup = await conn.fetch("""
                SELECT ectd_section_root, jurisdiction, 
                       fragments_total, red_fragments, amber_fragments, green_fragments,
                       ROUND(avg_risk_score::numeric, 2) as avg_risk_score
                FROM prose.v_section_risk_rollup
                ORDER BY avg_risk_score DESC
                LIMIT 5
            """)
            
            print("\n   Section Risk Rollup (Top 5):")
            print("   " + "-" * 65)
            print(f"   {'Section':<15} {'Juris':<8} {'Total':<6} {'Red':<4} {'Amber':<6} {'Green':<6} {'Risk':<6}")
            print("   " + "-" * 65)
            for row in section_rollup:
                print(f"   {row['ectd_section_root']:<15} {row['jurisdiction']:<8} "
                      f"{row['fragments_total']:<6} {row['red_fragments']:<4} "
                      f"{row['amber_fragments']:<6} {row['green_fragments']:<6} "
                      f"{row['avg_risk_score'] or 0:.2f}")
        else:
            print("   ⚠️ Heatmap views not found. Run migrations 007-008 first.")
        
        # Step 4: Check audit logs
        print("\n5. Checking recent audit logs...")
        audit_logs = await conn.fetch("""
            SELECT id, fragment_id, risk_status, drift_magnitude, 
                   interrogated_version_id, created_at
            FROM audit.concomitant_audit_logs
            ORDER BY created_at DESC
            LIMIT 5
        """)
        
        if audit_logs:
            print("\n   Recent Interrogations:")
            print("   " + "-" * 70)
            for log in audit_logs:
                drift = f"{log['drift_magnitude']:.3f}" if log['drift_magnitude'] else "N/A"
                ver = log['interrogated_version_id'] or "?"
                print(f"   {log['risk_status']:<12} drift={drift:<7} v{ver:<3} "
                      f"fragment={str(log['fragment_id'])[:8]}...")
        else:
            print("   No audit logs found yet.")
        
        # Step 5: Check snapshot status
        print("\n6. Checking submission snapshots...")
        
        snapshot_table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema='prose' AND table_name='submission_snapshots'
            )
        """)
        
        if snapshot_table_exists:
            snapshots = await conn.fetch("""
                SELECT id, snapshot_name, jurisdiction, status, 
                       created_at
                FROM prose.submission_snapshots
                ORDER BY created_at DESC
                LIMIT 5
            """)
            
            if snapshots:
                print("\n   Recent Snapshots:")
                print("   " + "-" * 65)
                for snap in snapshots:
                    print(f"   {snap['status']:<10} {snap['snapshot_name']:<30} "
                          f"({snap['jurisdiction']})")
            else:
                print("   No snapshots found yet.")
        else:
            print("   ⚠️ Snapshot table not found. Run migration 008 first.")
        
        print("\n" + "═" * 70)
        print("DEMO COMPLETE")
        print("═" * 70)
        print("""
Next steps:
  1. Run the Shadow Service: python run_shadow_mvp.py
  2. POST to /interrogate with a fragment_id
  3. View heatmap at GET /heatmap
  4. Create snapshots via POST /snapshots
  5. Check gate metrics at GET /snapshots/{id}/gate
""")
        
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
