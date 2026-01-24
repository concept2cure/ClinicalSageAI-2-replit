#!/bin/bash

echo "Testing Lumen AI Text Processing Capabilities..."
echo "================================================"

# Create a test document with various regulatory content
curl -X POST http://localhost:5000/api/ask-lumen \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Extract and analyze all regulatory compliance information",
    "context": "regulatory-analysis",
    "documentContent": "PROTOCOL AMENDMENT #3\nProtocol: NCT05678901\nDate: 15-Mar-2024\n\nREGULATORY COMPLIANCE:\n- 21 CFR 312.32 IND Safety Reporting\n- ICH E6(R2) Good Clinical Practice\n- ISO 14155:2020 Medical Devices\n- EMA/CHMP/ICH/135/1995\n\nSTUDY MEDICATIONS:\n- Investigational: ABC-789 (sponsor: Pfizer Inc.)\n- Comparator: DEF-456 (marketed by Johnson & Johnson)\n- Rescue medication: Acetaminophen\n\nKEY DATES:\n- First patient enrolled: 01-Jan-2024\n- Database lock: 31-Dec-2024\n- Final report: 31-Mar-2025\n\nSAFETY MONITORING:\nAll serious adverse events (SAEs) must be reported within 24 hours.\nData Safety Monitoring Board (DSMB) meets quarterly.\n\nPrincipal Investigator: Dr. Emily Watson, MD, PhD\nSite: Memorial Sloan Kettering Cancer Center"
  }' | python3 -m json.tool

echo -e "\n\nNote: The response includes enhanced text processing with:"
echo "- Regulatory term extraction (FDA, ICH, ISO standards)"
echo "- Medical term recognition"
echo "- Organization and drug name extraction"
echo "- Date parsing and study identifier detection"
echo "- Text statistics and readability analysis"