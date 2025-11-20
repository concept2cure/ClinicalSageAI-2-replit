"""
Health Canada Regional XML Builder for eCTD Submissions

This module generates Canada-specific Module 1 XML for Health Canada submissions
following the Health Canada eCTD specification. The module builds ca-regional.xml.

References:
- Health Canada eCTD Guidance:
  https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/ectd/notice-electronic-only-submissions.html

Usage:
  result = write_ca_regional_xml(sequence_id, output_path)
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

def write_ca_regional_xml(sequence_id, output_path=None):
    """
    Main function to generate Canada-specific regional Module 1 XML files.
    
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
            
        # Verify this is a Canada submission
        if not sequence.profile or sequence.profile.code != "hc":
            raise ValueError("Sequence does not have a Health Canada submission profile")
            
        # Get or create output path
        if not output_path:
            output_path = sequence.base_path
            
        if not os.path.exists(output_path):
            os.makedirs(output_path)
            
        # Get sequence documents
        seq_docs = db.query(INDSequenceDoc).filter(
            INDSequenceDoc.sequence == sequence.sequence
        ).all()
        
        # Create CA regional XML
        nsmap = {
            None: "ca:ca-regional",
            "xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "urn": "urn:hl7-org:v3"
        }
        
        root = etree.Element("ca-regional", nsmap=nsmap)
        root.set("{http://www.w3.org/2001/XMLSchema-instance}schemaLocation", 
                "ca:ca-regional ca-regional.xsd")
        
        # Add header information
        header = etree.SubElement(root, "ca-backbone")
        etree.SubElement(header, "dtd-version").text = sequence.profile.dtd_version
        
        # Add Module 1 regional documents
        m1_ca = etree.SubElement(root, "m1-ca")
        
        # Add administrative section
        admin = etree.SubElement(m1_ca, "administrative")
        
        # Get profile settings
        settings = sequence.profile.settings or {}
        
        # Add product details
        product_info = etree.SubElement(admin, "product-info")
        etree.SubElement(product_info, "product-name").text = settings.get("product_name", "")
        etree.SubElement(product_info, "dossier-id").text = settings.get("dossier_id", "")
        etree.SubElement(product_info, "submission-type").text = settings.get("submission_type", "CTA")
        
        # Sort documents by their module path
        module1_docs = [d for d in seq_docs if d.module.startswith("m1")]
        
        # Map documents to their proper CA Module 1 sections
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
                
            # Create leaf element for the document
            file_path = seq_doc.file_path
            rel_path = os.path.relpath(file_path, sequence.base_path).replace("\\", "/")
            
            # Calculate checksum
            md5_value = md5_checksum(file_path) if os.path.exists(file_path) else ""
            
            # Create leaf element
            leaf = etree.SubElement(m1_ca, "leaf")
            leaf.set("ID", f"m1-{uuid.uuid4()}")
            leaf.set("operation", seq_doc.op)
            leaf.set("xlink:href", rel_path)
            
            # Add checksum and modified date
            etree.SubElement(leaf, "checksum").text = md5_value
            etree.SubElement(leaf, "modified-file").text = datetime.datetime.now().strftime("%Y-%m-%d")
            
            # Add title
            etree.SubElement(leaf, "title").text = doc.title
            
        # Write ca-regional.xml file
        tree = etree.ElementTree(root)
        regional_path = os.path.join(output_path, "ca-regional.xml")
        tree.write(regional_path, pretty_print=True, xml_declaration=True, encoding="UTF-8")
        
        return {
            "ca_regional_xml": regional_path
        }
        
    except Exception as e:
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        sequence_id = sys.argv[1]
        result = write_ca_regional_xml(sequence_id)
        print("Generated Health Canada Regional XML files:")
        for key, path in result.items():
            print(f"- {key}: {path}")
    else:
        print("Usage: python write_ca_regional_xml.py <sequence_id>")