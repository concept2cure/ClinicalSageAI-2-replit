"""
EU Regional XML Writer

This module generates EU-specific regional XML files for CER sequences
based on EUDAMED requirements.
"""

import os
import json
import argparse
import xml.etree.ElementTree as ET
from xml.dom import minidom
from typing import List, Dict, Any, Optional

def _normalize_eu_document(doc: Any) -> Dict[str, str]:
    if isinstance(doc, dict):
        return {
            "doc_id": str(doc.get("doc_id")),
            "module": str(doc.get("module")),
            "title": str(doc.get("title") or f"Document {doc.get('doc_id')}"),
            "file_path": str(doc.get("file_path")),
        }
    doc_id = str(getattr(doc, "doc_id"))
    return {
        "doc_id": doc_id,
        "module": str(getattr(doc, "module")),
        "title": str(getattr(getattr(doc, "document", None), "title", f"Document {doc_id}")),
        "file_path": str(getattr(doc, "file_path")),
    }


def write_eu_regional_xml(
    sequence_id: str,
    documents: List[Any],
    meta: Optional[Dict[str, str]] = None,
    output_dir: Optional[str] = None,
) -> str:
    """
    Generate EU regional XML for a CER sequence
    
    Args:
        sequence_id: Sequence identifier
        documents: List of document models with module and file path information
        meta: Additional metadata for the sequence
    
    Returns:
        str: Path to the generated XML file
    """
    # Default metadata if not provided
    meta = meta or {
        "applicant": "Default Applicant",
        "procedure_type": "Standard"
    }
    
    # Create output directory if it doesn't exist
    output_dir = output_dir or f"./output/cer/{sequence_id}"
    os.makedirs(output_dir, exist_ok=True)
    
    # Create root element
    root = ET.Element("eu-regional")
    root.set("xmlns", "http://eudamed.europa.eu/schema/cer/v1")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    root.set("xsi:schemaLocation", "http://eudamed.europa.eu/schema/cer/v1 eu-regional-cer.xsd")
    
    # Add header information
    header = ET.SubElement(root, "header")
    
    # Add submission information
    submission = ET.SubElement(header, "submission-information")
    ET.SubElement(submission, "sequence-number").text = sequence_id
    ET.SubElement(submission, "submission-description").text = f"Clinical Evaluation Report {sequence_id}"
    
    # Add applicant information
    applicant = ET.SubElement(header, "applicant-information")
    ET.SubElement(applicant, "applicant-name").text = meta.get("applicant", "Default Applicant")
    
    # Add procedure information
    procedure = ET.SubElement(header, "procedure-information")
    ET.SubElement(procedure, "procedure-type").text = meta.get("procedure_type", "Standard")
    
    # Add document inventory
    inventory = ET.SubElement(root, "document-inventory")
    
    # Add documents
    for raw_doc in documents:
        doc = _normalize_eu_document(raw_doc)
        document = ET.SubElement(inventory, "document")
        ET.SubElement(document, "doc-id").text = doc["doc_id"]
        ET.SubElement(document, "doc-module").text = doc["module"]
        ET.SubElement(document, "doc-title").text = doc["title"]
        ET.SubElement(document, "doc-path").text = doc["file_path"]
    
    # Format the XML with proper indentation
    xml_str = minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")
    
    # Write to file
    output_path = os.path.join(output_dir, "eu-regional.xml")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(xml_str)
    
    return output_path


def _load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate EU regional XML from document metadata")
    parser.add_argument("--sequence-id", required=True, help="Sequence identifier")
    parser.add_argument("--documents-json", required=True, help="JSON array of documents")
    parser.add_argument("--meta-json", help="Optional metadata JSON")
    parser.add_argument("--output-dir", help="Optional output directory")
    args = parser.parse_args()

    documents = _load_json(args.documents_json)
    if not isinstance(documents, list):
        raise ValueError("--documents-json must be a JSON array")

    meta = _load_json(args.meta_json) if args.meta_json else None
    output_path = write_eu_regional_xml(
        sequence_id=args.sequence_id,
        documents=documents,
        meta=meta,
        output_dir=args.output_dir,
    )
    print(output_path)


if __name__ == "__main__":
    main()
