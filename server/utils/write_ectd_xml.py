"""
eCTD XML Writer

This module generates common eCTD XML files (index.xml) for regulatory submissions
that can be used across different regions.
"""

import os
import json
import argparse
import hashlib
import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime
from typing import List, Dict, Any, Optional

def _normalize_document(doc: Any) -> Dict[str, Any]:
    """Normalize dict/object inputs into a consistent eCTD document shape."""
    if isinstance(doc, dict):
        doc_id = doc.get("doc_id")
        module = doc.get("module")
        file_path = doc.get("file_path")
        title = doc.get("title") or f"Document {doc_id}"
        return {
            "doc_id": doc_id,
            "module": module,
            "file_path": file_path,
            "title": title,
        }

    doc_id = getattr(doc, "doc_id")
    module = getattr(doc, "module")
    file_path = getattr(doc, "file_path")
    title = getattr(getattr(doc, "document", None), "title", f"Document {doc_id}")
    return {
        "doc_id": doc_id,
        "module": module,
        "file_path": file_path,
        "title": title,
    }


def _normalize_documents(documents: List[Any]) -> List[Dict[str, Any]]:
    normalized = []
    for doc in documents:
        normalized_doc = _normalize_document(doc)
        if not normalized_doc.get("doc_id") or not normalized_doc.get("module") or not normalized_doc.get("file_path"):
            raise ValueError(f"Document entry missing required fields: {normalized_doc}")
        normalized.append(normalized_doc)
    return normalized


def _compute_md5_if_exists(file_path: str) -> str:
    """Return md5 checksum for existing files, otherwise placeholder checksum."""
    if not os.path.exists(file_path):
        return "0000000000000000"
    md5 = hashlib.md5()
    with open(file_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8192), b""):
            md5.update(chunk)
    return md5.hexdigest()


def write_ectd_xml(
    sequence_id: str,
    documents: List[Any],
    meta: Optional[Dict[str, Any]] = None,
    output_dir: Optional[str] = None,
    strict_files: bool = False,
) -> str:
    """
    Generate eCTD index.xml file for a submission sequence
    
    Args:
        sequence_id: Sequence identifier
        documents: List of document models with module and file path information
        meta: Additional metadata for the sequence
    
    Returns:
        str: Path to the generated XML file
    """
    # Default metadata if not provided
    meta = meta or {}
    normalized_documents = _normalize_documents(documents)
    
    # Create output directory if it doesn't exist
    output_dir = output_dir or f"./output/cer/{sequence_id}"
    os.makedirs(output_dir, exist_ok=True)
    
    # Create root element
    root = ET.Element("ectd:ectd")
    root.set("xmlns:ectd", "http://www.ich.org/ectd/v4.0")
    root.set("xmlns:xlink", "http://www.w3.org/1999/xlink")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    root.set("xsi:schemaLocation", "http://www.ich.org/ectd/v4.0 ectd-4-0.xsd")
    
    # Add header information
    header = ET.SubElement(root, "ectd:header")
    ET.SubElement(header, "ectd:id").text = meta.get("submission_id", f"cer-{sequence_id}")
    ET.SubElement(header, "ectd:title").text = meta.get("title", f"Clinical Evaluation Report {sequence_id}")
    ET.SubElement(header, "ectd:submission-type").text = meta.get("submission_type", "original")
    ET.SubElement(header, "ectd:submission-mode").text = meta.get("submission_mode", "ectd")
    ET.SubElement(header, "ectd:sequence-number").text = sequence_id
    ET.SubElement(header, "ectd:submission-date").text = meta.get(
        "submission_date",
        datetime.now().strftime("%Y-%m-%d"),
    )
    
    # Add document inventory
    body = ET.SubElement(root, "ectd:body")
    
    # Create folder structure for modules
    module_elements = {}
    
    # Add documents to appropriate modules
    for doc in normalized_documents:
        # Parse module path (e.g., "m3.2.1" -> ["m3", "2", "1"])
        module_parts = str(doc["module"]).split(".")
        
        # Ensure all parent modules exist
        current_element = body
        current_path = []
        
        for i, part in enumerate(module_parts):
            current_path.append(part)
            path_key = ".".join(current_path)
            
            if path_key not in module_elements:
                # Create new module element
                module = ET.SubElement(current_element, "ectd:module")
                ET.SubElement(module, "ectd:id").text = part
                ET.SubElement(module, "ectd:title").text = get_module_title(path_key)
                
                module_elements[path_key] = module
                current_element = module
            else:
                current_element = module_elements[path_key]
        
        # Add document to current module
        document = ET.SubElement(current_element, "ectd:document")
        ET.SubElement(document, "ectd:id").text = str(doc["doc_id"])
        ET.SubElement(document, "ectd:title").text = str(doc["title"])
        doc_file_path = str(doc["file_path"])
        if strict_files and not os.path.exists(doc_file_path):
            raise FileNotFoundError(f"Document file path does not exist: {doc_file_path}")
        ET.SubElement(document, "ectd:path").text = os.path.relpath(doc_file_path, output_dir)
        ET.SubElement(document, "ectd:checksum").text = _compute_md5_if_exists(doc_file_path)
        ET.SubElement(document, "ectd:checksum-type").text = "md5"
    
    # Format the XML with proper indentation
    xml_str = minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")
    
    # Write to file
    output_path = os.path.join(output_dir, "index.xml")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(xml_str)
    
    return output_path


def get_module_title(module_path: str) -> str:
    """
    Get a human-readable title for a module path
    
    Args:
        module_path: Module path (e.g., "m3.2.1")
    
    Returns:
        str: Human-readable title
    """
    # Define common module titles
    module_titles = {
        "m1": "Administrative and Prescribing Information",
        "m2": "Common Technical Document Summaries",
        "m3": "Quality",
        "m4": "Nonclinical Study Reports",
        "m5": "Clinical Study Reports",
        "m1.1": "Forms and Administrative Information",
        "m1.2": "Cover Letters",
        "m1.3": "Product Information",
        "m2.1": "Table of Contents",
        "m2.2": "Introduction",
        "m2.3": "Quality Overall Summary",
        "m3.1": "Table of Contents of Module 3",
        "m3.2": "Body of Data",
        "m3.2.1": "Drug Substance",
        "m3.2.2": "Drug Product",
        "m4.1": "Table of Contents of Module 4",
        "m4.2": "Study Reports",
        "m5.1": "Table of Contents of Module 5",
        "m5.2": "Clinical Study Reports",
        "m5.3": "Clinical Study Listings",
        "m5.4": "Literature References",
    }
    
    if module_path in module_titles:
        return module_titles[module_path]
    
    # Fall back to generic title if specific one not found
    return f"Module {module_path.replace('m', '')}"


def _load_json_file(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate eCTD index.xml from document metadata")
    parser.add_argument("--sequence-id", required=True, help="Sequence identifier")
    parser.add_argument("--documents-json", required=True, help="JSON file with document entries")
    parser.add_argument("--meta-json", help="Optional JSON file with metadata overrides")
    parser.add_argument("--output-dir", help="Optional output directory (defaults to ./output/cer/<sequence_id>)")
    parser.add_argument("--print-path-only", action="store_true", help="Print only generated file path")
    parser.add_argument("--strict-files", action="store_true", help="Fail when any document file does not exist")
    args = parser.parse_args()

    documents_payload = _load_json_file(args.documents_json)
    if not isinstance(documents_payload, list):
        raise ValueError("--documents-json must contain a JSON array")

    meta_payload = _load_json_file(args.meta_json) if args.meta_json else {}
    output_path = write_ectd_xml(
        sequence_id=args.sequence_id,
        documents=documents_payload,
        meta=meta_payload,
        output_dir=args.output_dir,
        strict_files=args.strict_files,
    )

    if args.print_path_only:
        print(output_path)
    else:
        print(f"Generated eCTD index XML: {output_path}")


if __name__ == "__main__":
    main()
