"""
EU Regional XML Writer

This module generates EU-specific regional XML files for CER sequences
based on EUDAMED requirements.
"""

import os
import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime
from typing import List, Dict, Any

def write_eu_regional_xml(sequence_id: str, documents: List[Any], meta: Dict[str, str] = None):
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
    output_dir = f"./output/cer/{sequence_id}"
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
    for doc in documents:
        document = ET.SubElement(inventory, "document")
        ET.SubElement(document, "doc-id").text = str(doc.doc_id)
        ET.SubElement(document, "doc-module").text = doc.module
        ET.SubElement(document, "doc-title").text = getattr(doc.document, "title", f"Document {doc.doc_id}")
        ET.SubElement(document, "doc-path").text = doc.file_path
    
    # Format the XML with proper indentation
    xml_str = minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")
    
    # Write to file
    output_path = os.path.join(output_dir, "eu-regional.xml")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(xml_str)
    
    return output_path