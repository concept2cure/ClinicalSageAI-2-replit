#!/usr/bin/env python3
"""Shadow Interrogation MVP - CLI Runner for local testing.

Usage:
    # Start the service
    python run_shadow_mvp.py
    
    # Or with custom port
    PORT=8002 python run_shadow_mvp.py
    
    # Test endpoints:
    curl http://localhost:8001/health
    curl http://localhost:8001/heatmap
    curl -X POST http://localhost:8001/interrogate -H "Content-Type: application/json" \\
         -d '{"fragment_id": "..."}'
"""

import os
import sys
import uvicorn

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    """Run Shadow Interrogation MVP service."""
    port = int(os.environ.get("PORT", "8001"))
    host = os.environ.get("HOST", "0.0.0.0")
    reload = os.environ.get("RELOAD", "false").lower() == "true"
    
    print(f"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SHADOW INTERROGATION MVP SERVICE                          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Adversarial risk interrogation for regulatory prose fragments               ║
║                                                                              ║
║  Features:                                                                   ║
║    • Version-aware interrogation (tracks which version was assessed)         ║
║    • Drift computation (prose claims vs truth datapoints)                    ║
║    • Precedent matching (predicts regulatory questions)                      ║
║    • Heatmap rollups (section/jurisdiction risk views)                       ║
║    • Submission snapshots (freeze fragment states for filing)                ║
║    • 21 CFR Part 11 compliant audit logging                                  ║
║                                                                              ║
║  Endpoints:                                                                  ║
║    GET  /health              - Service health check                          ║
║    POST /interrogate         - Interrogate single fragment                   ║
║    POST /interrogate/section - Interrogate entire section                    ║
║    GET  /heatmap             - Get risk heatmap rollups                      ║
║    GET  /heatmap/sections    - Section-level risk rollup                     ║
║    GET  /heatmap/jurisdictions - Jurisdiction summary                        ║
║    GET  /snapshots           - List submission snapshots                     ║
║    POST /snapshots           - Create new snapshot                           ║
║    GET  /snapshots/{{id}}/gate - Check submission gate metrics                 ║
║    POST /gate/check          - Submission readiness check                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
    """)
    
    print(f"Starting server at http://{host}:{port}")
    print(f"API docs at http://{host}:{port}/docs")
    print("")
    
    # Check for DATABASE_URL
    db_url = os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_NEON_NEW_SECRET")
    if not db_url:
        print("⚠️  WARNING: No DATABASE_URL or DATABASE_NEON_NEW_SECRET found")
        print("   Set one of these environment variables for database access")
        print("")
    
    uvicorn.run(
        "shadow_service.main:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
