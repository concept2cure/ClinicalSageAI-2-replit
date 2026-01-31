#!/usr/bin/env python3
"""
Validate eCTD 4.0 XMP metadata schema compliance.
Fails CI if XMP is malformed or missing required fields.
"""

import sys
import zipfile
from pathlib import Path
from lxml import etree


def validate_xmp_in_docx(docx_path: Path) -> bool:
    """Extract and validate XMP from DOCX."""
    try:
        with zipfile.ZipFile(docx_path) as z:
            xmp_path = 'docProps/core.xml.xmp'
            if xmp_path not in z.namelist():
                print(f"❌ {docx_path}: Missing XMP (eCTD 4.0 required)")
                return False

            xmp_content = z.read(xmp_path)
            root = etree.fromstring(xmp_content)

            # Check for ICH namespace
            ns = {'ich': 'http://www.ich.org/eCTD/4.0/'}
            doc_type = root.find('.//ich:documentType', ns)

            if doc_type is None:
                print(f"❌ {docx_path}: Missing ich:documentType")
                return False

            # Check for hash
            content_hash = root.find('.//ich:contentHash', ns)
            if content_hash is None:
                print(f"❌ {docx_path}: Missing content hash")
                return False

            print(f"✅ {docx_path}: Valid eCTD 4.0 XMP")
            return True

    except Exception as e:
        print(f"❌ {docx_path}: Validation error - {e}")
        return False


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--test-output', required=True)
    args = parser.parse_args()

    output_dir = Path(args.test_output)
    docx_files = list(output_dir.glob("*.docx"))

    if not docx_files:
        print("❌ No DOCX files found to validate")
        sys.exit(1)

    all_valid = True
    for f in docx_files:
        ok = validate_xmp_in_docx(f)
        all_valid = all_valid and ok

    sys.exit(0 if all_valid else 1)
