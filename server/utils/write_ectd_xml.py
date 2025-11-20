"""
eCTD XML Writer

This module generates common eCTD XML files (index.xml) for regulatory submissions
that can be used across different regions.
"""

import os
import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime
from typing import List, Dict, Any, Optional

def write_ectd_xml(sequence_id: str, documents: List[Any], meta: Optional[Dict[str, Any]] = None):
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
    
    # Create output directory if it doesn't exist
    output_dir = f"./output/cer/{sequence_id}"
    os.makedirs(output_dir, exist_ok=True)
    
    # Create root element
    root = ET.Element("ectd:ectd")
    root.set("xmlns:ectd", "http://www.ich.org/ectd/v4.0")
    root.set("xmlns:xlink", "http://www.w3.org/1999/xlink")
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    root.set("xsi:schemaLocation", "http://www.ich.org/ectd/v4.0 ectd-4-0.xsd")
    
    # Add header information
    header = ET.SubElement(root, "ectd:header")
    ET.SubElement(header, "ectd:id").text = f"cer-{sequence_id}"
    ET.SubElement(header, "ectd:title").text = f"Clinical Evaluation Report {sequence_id}"
    ET.SubElement(header, "ectd:submission-type").text = "original"
    ET.SubElement(header, "ectd:submission-mode").text = "ectd"
    ET.SubElement(header, "ectd:sequence-number").text = sequence_id
    ET.SubElement(header, "ectd:submission-date").text = datetime.now().strftime("%Y-%m-%d")
    
    # Add document inventory
    body = ET.SubElement(root, "ectd:body")
    
    # Create folder structure for modules
    module_elements = {}
    
    # Add documents to appropriate modules
    for doc in documents:
        # Parse module path (e.g., "m3.2.1" -> ["m3", "2", "1"])
        module_parts = doc.module.split(".")
        
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
        ET.SubElement(document, "ectd:id").text = str(doc.doc_id)
        ET.SubElement(document, "ectd:title").text = getattr(doc.document, "title", f"Document {doc.doc_id}")
        ET.SubElement(document, "ectd:path").text = os.path.relpath(doc.file_path, output_dir)
        ET.SubElement(document, "ectd:checksum").text = "0000000000000000"  # Placeholder
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