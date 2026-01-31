#!/usr/bin/env python3
"""
Validate FHIR AuditEvent structure inside eCTD backbone JSON.
"""

import sys
import json
from pathlib import Path


def validate_backbone(backbone_path: Path) -> bool:
    try:
        with open(backbone_path) as f:
            data = json.load(f)

        docs = data.get('documents') or data.get('documents', [])
        if not docs:
            print(f"❌ {backbone_path}: No documents found in backbone")
            return False

        # Check first document for modificationHistory and FHIR AuditEvent
        doc = docs[0]
        mh = doc.get('modificationHistory')
        if not mh:
            print(f"❌ {backbone_path}: Missing modificationHistory in first document")
            return False

        first = mh[0]
        if first.get('resourceType') != 'AuditEvent':
            print(f"❌ {backbone_path}: First modificationHistory event not AuditEvent")
            return False

        print(f"✅ {backbone_path}: FHIR AuditEvent structure OK")
        return True

    except Exception as e:
        print(f"❌ Error validating backbone {backbone_path}: {e}")
        return False


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--backbone', required=True, help='Path to eCTD backbone JSON')
    args = parser.parse_args()

    ok = validate_backbone(Path(args.backbone))
    sys.exit(0 if ok else 1)
