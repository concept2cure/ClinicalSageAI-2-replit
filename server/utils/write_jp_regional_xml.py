"""
Japan PMDA Regional XML Builder for eCTD Submissions

This module generates Japan-specific Module 1 XML for PMDA submissions following
the PMDA eCTD specification. The module builds jp-regional.xml.

References:
- PMDA eCTD Specification:
  https://www.pmda.go.jp/files/000228722.pdf (Japanese language)

Usage:
  result = write_jp_regional_xml(sequence_id, output_path)
"""

import os
import uuid
import hashlib
import datetime
from pathlib import Path
from lxml import etree
from sqlalchemy.orm import Session

from server.db import SessionLocal
from server.models.sequence import INDSequence, INDSequenceDoc, Document
from server.models.submission_profile import SubmissionProfile, RegionalDocumentType

def md5_checksum(filepath):
    """Calculate MD5 hash of a file."""
    md5 = hashlib.md5()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b''):
            md5.update(chunk)
    return md5.hexdigest()

def write_jp_regional_xml(sequence_id, output_path=None):
    """
    Main function to generate Japan-specific regional Module 1 XML files.
    
    Args:
        sequence_id: ID or sequence number of the submission
        output_path: Optional output directory (defaults to sequence base_path)
        
    Returns:
        Dictionary with paths to generated XML files
    """
    db = SessionLocal()
    try:
        # Get sequence data
        if isinstance(sequence_id, str) and not sequence_id.isdigit():
            # If sequence_id is a sequence number (e.g. "0001")
            sequence = db.query(INDSequence).filter(INDSequence.sequence == sequence_id).first()
        else:
            # If sequence_id is a database ID
            sequence = db.query(INDSequence).filter(INDSequence.id == sequence_id).first()
            
        if not sequence:
            raise ValueError(f"Sequence {sequence_id} not found")
            
        # Verify this is a Japan submission
        if not sequence.profile or sequence.profile.code != "pmda":
            raise ValueError("Sequence does not have a PMDA submission profile")
            
        # Get or create output path
        if not output_path:
            output_path = sequence.base_path
            
        if not os.path.exists(output_path):
            os.makedirs(output_path)
            
        # Get sequence documents
        seq_docs = db.query(INDSequenceDoc).filter(
            INDSequenceDoc.sequence == sequence.sequence
        ).all()
        
        # Create JP regional XML
        nsmap = {
            None: "jp:jp-regional",
            "xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "urn": "urn:hl7-org:v3"
        }
        
        root = etree.Element("jp-regional", nsmap=nsmap)
        root.set("{http://www.w3.org/2001/XMLSchema-instance}schemaLocation", 
                "jp:jp-regional jp-regional.xsd")
        
        # Add header information
        header = etree.SubElement(root, "jp-backbone")
        etree.SubElement(header, "dtd-version").text = sequence.profile.dtd_version
        
        # Add Module 1 regional documents
        m1_jp = etree.SubElement(root, "m1-jp")
        
        # Create PMDA-specific structure sections
        m1_1_jp = etree.SubElement(m1_jp, "m1-1-jp")    # Administrative information
        m1_2_jp = etree.SubElement(m1_jp, "m1-2-jp")    # Application information
        m1_3_jp = etree.SubElement(m1_jp, "m1-3-jp")    # Product information
        m1_4_jp = etree.SubElement(m1_jp, "m1-4-jp")    # References
        m1_5_jp = etree.SubElement(m1_jp, "m1-5-jp")    # Compliance statements
        m1_12_jp = etree.SubElement(m1_jp, "m1-12-jp")  # Risk management plan
        m1_13_jp = etree.SubElement(m1_jp, "m1-13-jp")  # Post-marketing data
        
        # Sort documents by their module path
        module1_docs = [d for d in seq_docs if d.module.startswith("m1")]
        
        # Map documents to their proper JP Module 1 sections
        for seq_doc in module1_docs:
            # Get document and its metadata
            doc = db.query(Document).filter(Document.id == seq_doc.doc_id).first()
            if not doc:
                continue
                
            # Get regional document type mapping
            region_doc_type = db.query(RegionalDocumentType).filter(
                RegionalDocumentType.profile_id == sequence.profile_id,
                RegionalDocumentType.code.like(f"%{seq_doc.module.replace('.', '-')}%")
            ).first()
            
            if not region_doc_type:
                # Skip if no mapping found
                continue
            
            # Determine appropriate module section based on document path
            target_element = m1_jp  # Default to main m1-jp section
            module_path = seq_doc.module
            
            # Map to specific PMDA module sections
            if module_path.startswith("m1.1"):
                target_element = m1_1_jp
            elif module_path.startswith("m1.2"):
                target_element = m1_2_jp
            elif module_path.startswith("m1.3"):
                target_element = m1_3_jp
            elif module_path.startswith("m1.4"):
                target_element = m1_4_jp
            elif module_path.startswith("m1.5"):
                target_element = m1_5_jp
            elif module_path.startswith("m1.12"):
                target_element = m1_12_jp
            elif module_path.startswith("m1.13"):
                target_element = m1_13_jp
                
            # Create leaf element for the document
            file_path = seq_doc.file_path
            rel_path = os.path.relpath(file_path, sequence.base_path).replace("\\", "/")
            
            # Calculate checksum
            md5_value = md5_checksum(file_path) if os.path.exists(file_path) else ""
            
            # Create leaf element
            leaf = etree.SubElement(target_element, "leaf")
            leaf.set("ID", f"m1-{uuid.uuid4()}")
            leaf.set("operation", seq_doc.op)
            leaf.set("xlink:href", rel_path)
            
            # Add checksum and modified date
            etree.SubElement(leaf, "checksum").text = md5_value
            etree.SubElement(leaf, "modified-file").text = datetime.datetime.now().strftime("%Y-%m-%d")
            
            # Add title
            etree.SubElement(leaf, "title").text = doc.title
            
        # Write jp-regional.xml file
        tree = etree.ElementTree(root)
        regional_path = os.path.join(output_path, "jp-regional.xml")
        tree.write(regional_path, pretty_print=True, xml_declaration=True, encoding="UTF-8")
        
        return {
            "jp_regional_xml": regional_path
        }
        
    except Exception as e:
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        sequence_id = sys.argv[1]
        result = write_jp_regional_xml(sequence_id)
        print("Generated Japan Regional XML files:")
        for key, path in result.items():
            print(f"- {key}: {path}")
    else:
        print("Usage: python write_jp_regional_xml.py <sequence_id>")