"""DTD validation helpers and CLI for eCTD XML assets."""

import argparse
import json
import os
from pathlib import Path
from typing import Dict, List

from lxml import etree

class ValidationError(Exception):
    pass


def validate_xml(xml_path: str, dtd_file: str) -> List[str]:
    """
    Validate an XML file against a DTD. Returns a list of error strings.
    """
    if not os.path.isfile(xml_path):
        raise FileNotFoundError(f"XML file not found: {xml_path}")
    if not os.path.isfile(dtd_file):
        raise FileNotFoundError(f"DTD file not found: {dtd_file}")

    parser = etree.XMLParser(dtd_validation=False, load_dtd=True, recover=False)
    tree = etree.parse(xml_path, parser)
    dtd = etree.DTD(dtd_file)
    valid = dtd.validate(tree)
    if valid:
        return []
    # collect error log messages
    return [str(error) for error in dtd.error_log]


def validate_sequence_xml(sequence_id: str, base_dir: str = "/mnt/data/ectd") -> Dict[str, List[str]]:
    """
    Validate both index.xml and us-regional.xml for a given sequence.
    Returns dict with 'index' and 'regional' keys listing errors.
    """
    base = os.path.join(base_dir, sequence_id)
    index_path = os.path.join(base, 'index.xml')
    regional_path = os.path.join(base, 'us-regional.xml')
    dtd_dir = os.path.join(base_dir, "util", "dtd")
    index_dtd = os.path.join(dtd_dir, 'index.dtd')
    regional_dtd = os.path.join(dtd_dir, 'us-regional.dtd')

    errors = {
        "index": validate_xml(index_path, index_dtd),
        "regional": validate_xml(regional_path, regional_dtd),
    }
    return errors


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate XML files against DTD definitions")
    parser.add_argument("--xml", help="Path to XML file to validate")
    parser.add_argument("--dtd", help="Path to DTD file used for validation")
    parser.add_argument("--sequence-id", help="eCTD sequence id for index/regional validation")
    parser.add_argument(
        "--base-dir",
        default="/mnt/data/ectd",
        help="Root directory containing sequence folders and util/dtd",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format",
    )
    return parser


def _print_result(payload: Dict[str, List[str]], output_format: str) -> None:
    if output_format == "json":
        print(json.dumps(payload, indent=2))
        return

    for scope, errors in payload.items():
        status = "PASS" if not errors else "FAIL"
        print(f"{scope}: {status}")
        for err in errors:
            print(f"  - {err}")


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    if args.sequence_id:
        result = validate_sequence_xml(args.sequence_id, base_dir=args.base_dir)
    elif args.xml and args.dtd:
        xml_path = str(Path(args.xml))
        dtd_path = str(Path(args.dtd))
        result = {"xml": validate_xml(xml_path, dtd_path)}
    else:
        parser.error("Provide either --sequence-id or both --xml and --dtd")

    _print_result(result, args.format)
    has_errors = any(result.values())
    return 1 if has_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
