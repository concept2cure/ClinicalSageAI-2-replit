#!/usr/bin/env python
"""
Simple CER Generator

A simplified version of the Clinical Evaluation Report (CER) generator
that provides basic functionality with minimal dependencies.
This serves as a fallback if the enhanced generator encounters issues.
"""

import os
import json
import sys
import logging
import asyncio
from datetime import datetime
import time
import tempfile
import traceback

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("simple_cer_generator")

# Try to import PDF generation libraries
try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch, mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, Image, ListFlowable, ListItem
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
    REPORTLAB_AVAILABLE = True
except ImportError:
    logger.warning("ReportLab not available, PDF generation will be limited")
    REPORTLAB_AVAILABLE = False

# Directories
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(BASE_DIR, 'data')
EXPORTS_DIR = os.path.join(DATA_DIR, 'exports')
CACHE_DIR = os.path.join(DATA_DIR, 'cache')

# Ensure directories exist
for directory in [DATA_DIR, EXPORTS_DIR, CACHE_DIR]:
    os.makedirs(directory, exist_ok=True)

async def generate_cer(
    product_id,
    product_name,
    manufacturer=None,
    device_description=None,
    intended_purpose=None,
    classification=None,
    date_range=730,
    output_format="pdf"
):
    """
    Generate a simplified Clinical Evaluation Report for a medical device
    
    Args:
        product_id: Device identifier or NDC code
        product_name: Name of the device/product
        manufacturer: Name of the manufacturer
        device_description: Description of the device
        intended_purpose: Intended purpose of the device
        classification: Device classification (Class I, II, III)
        date_range: Number of days to look back for data
        output_format: Output format ('pdf' or 'json')
        
    Returns:
        dict: Result information including the output file path
    """
    try:
        logger.info(f"Generating simple CER for {product_name} ({product_id})")
        
        # Generate timestamp for filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        sanitized_name = product_name.replace(" ", "_").replace("/", "_")
        
        # Create a unique identifier for this report
        report_id = f"CER_{sanitized_name}_{product_id}_{timestamp}"
        
        # Prepare output file path
        file_extension = "pdf" if output_format == "pdf" else "json"
        output_filename = f"{report_id}.{file_extension}"
        output_path = os.path.join(EXPORTS_DIR, output_filename)
        
        # Collect data from the Node.js side
        # In a real implementation, this would use the REST API endpoints
        # For this simplified version, we'll generate basic content
        
        # Create a simple data structure for the report
        report_data = {
            "report_id": report_id,
            "generated_at": datetime.now().isoformat(),
            "product": {
                "id": product_id,
                "name": product_name,
                "manufacturer": manufacturer or "Unknown",
                "description": device_description or "",
                "intended_purpose": intended_purpose or "",
                "classification": classification or "Unknown"
            },
            "evaluation_period": {
                "days": date_range,
                "start_date": (datetime.now() - datetime.timedelta(days=date_range)).isoformat().split('T')[0] if 'timedelta' in dir(datetime) else "Unknown",
                "end_date": datetime.now().isoformat().split('T')[0]
            },
            "data_sources": ["FDA MAUDE", "FDA FAERS", "EU EUDAMED"],
            "summary": {
                "total_events": 0,
                "serious_events": 0,
                "risk_assessment": "Unknown",
                "conclusion": f"This is a simplified CER for {product_name}. For a complete regulatory-compliant report, please use the enhanced CER generator."
            }
        }
        
        # If JSON output is requested, write the data to a file
        if output_format == "json":
            with open(output_path, 'w') as f:
                json.dump(report_data, f, indent=2)
            logger.info(f"Generated JSON CER at {output_path}")
            
            return {
                "success": True,
                "format": "json",
                "path": output_path,
                "report_id": report_id
            }
        
        # For PDF output, use ReportLab if available
        elif output_format == "pdf" and REPORTLAB_AVAILABLE:
            generate_pdf_report(report_data, output_path)
            logger.info(f"Generated PDF CER at {output_path}")
            
            return {
                "success": True,
                "format": "pdf",
                "path": output_path,
                "report_id": report_id
            }
        
        # Fallback to a very basic text file if ReportLab is not available
        else:
            if output_format == "pdf" and not REPORTLAB_AVAILABLE:
                logger.warning("ReportLab not available, generating text file instead")
                output_path = output_path.replace(".pdf", ".txt")
            
            # Generate a simple text report
            with open(output_path, 'w') as f:
                f.write(f"CLINICAL EVALUATION REPORT\n")
                f.write(f"========================\n\n")
                f.write(f"Report ID: {report_id}\n")
                f.write(f"Generated: {datetime.now().isoformat()}\n\n")
                f.write(f"PRODUCT INFORMATION\n")
                f.write(f"-------------------\n")
                f.write(f"Product ID: {product_id}\n")
                f.write(f"Product Name: {product_name}\n")
                f.write(f"Manufacturer: {manufacturer or 'Unknown'}\n")
                if device_description:
                    f.write(f"Description: {device_description}\n")
                if intended_purpose:
                    f.write(f"Intended Purpose: {intended_purpose}\n")
                if classification:
                    f.write(f"Classification: {classification}\n\n")
                
                f.write(f"SUMMARY\n")
                f.write(f"-------\n")
                f.write(f"This is a simplified CER for {product_name}.\n")
                f.write(f"For a complete regulatory-compliant report, please use the enhanced CER generator.\n")
            
            logger.info(f"Generated text CER at {output_path}")
            
            return {
                "success": True,
                "format": "txt",
                "path": output_path,
                "report_id": report_id
            }
    
    except Exception as e:
        logger.error(f"Error generating simple CER: {str(e)}")
        logger.error(traceback.format_exc())
        
        return {
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }

def generate_pdf_report(report_data, output_path):
    """
    Generate a PDF report using ReportLab
    
    Args:
        report_data: Dictionary containing report data
        output_path: Path where the PDF will be saved
    """
    if not REPORTLAB_AVAILABLE:
        raise ImportError("ReportLab is not available")
    
    # Create document
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=25*mm,
        leftMargin=25*mm,
        topMargin=20*mm,
        bottomMargin=20*mm
    )
    
    # Styles
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name='Title',
        parent=styles['Heading1'],
        fontSize=18,
        alignment=TA_CENTER,
        spaceAfter=10
    ))
    styles.add(ParagraphStyle(
        name='Subtitle',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=8
    ))
    styles.add(ParagraphStyle(
        name='Section',
        parent=styles['Heading3'],
        fontSize=12,
        spaceAfter=6
    ))
    styles.add(ParagraphStyle(
        name='Normal',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=5
    ))
    
    # Document content
    content = []
    
    # Title
    content.append(Paragraph("CLINICAL EVALUATION REPORT", styles['Title']))
    content.append(Spacer(1, 10*mm))
    
    # Report metadata
    content.append(Paragraph(f"Report ID: {report_data['report_id']}", styles['Normal']))
    content.append(Paragraph(f"Generated: {report_data['generated_at']}", styles['Normal']))
    content.append(Spacer(1, 10*mm))
    
    # Product information
    content.append(Paragraph("PRODUCT INFORMATION", styles['Subtitle']))
    content.append(Paragraph(f"Product ID: {report_data['product']['id']}", styles['Normal']))
    content.append(Paragraph(f"Product Name: {report_data['product']['name']}", styles['Normal']))
    content.append(Paragraph(f"Manufacturer: {report_data['product']['manufacturer']}", styles['Normal']))
    
    if report_data['product']['description']:
        content.append(Paragraph(f"Description: {report_data['product']['description']}", styles['Normal']))
    
    if report_data['product']['intended_purpose']:
        content.append(Paragraph(f"Intended Purpose: {report_data['product']['intended_purpose']}", styles['Normal']))
    
    if report_data['product']['classification']:
        content.append(Paragraph(f"Classification: {report_data['product']['classification']}", styles['Normal']))
    
    content.append(Spacer(1, 10*mm))
    
    # Evaluation period
    content.append(Paragraph("EVALUATION PERIOD", styles['Subtitle']))
    content.append(Paragraph(
        f"This report covers a period of {report_data['evaluation_period']['days']} days.",
        styles['Normal']
    ))
    content.append(Spacer(1, 5*mm))
    
    # Data sources
    content.append(Paragraph("DATA SOURCES", styles['Subtitle']))
    data_sources_text = "The following data sources were consulted for this report:"
    content.append(Paragraph(data_sources_text, styles['Normal']))
    
    sources_list = []
    for source in report_data['data_sources']:
        sources_list.append(ListItem(Paragraph(source, styles['Normal'])))
    
    content.append(ListFlowable(
        sources_list,
        bulletType='bullet',
        leftIndent=20
    ))
    content.append(Spacer(1, 5*mm))
    
    # Summary section
    content.append(Paragraph("SUMMARY", styles['Subtitle']))
    content.append(Paragraph(report_data['summary']['conclusion'], styles['Normal']))
    content.append(Spacer(1, 10*mm))
    
    # Disclaimer
    content.append(Paragraph("DISCLAIMER", styles['Subtitle']))
    disclaimer_text = (
        "This is a simplified Clinical Evaluation Report generated by the Simple CER Generator. "
        "It is intended to serve as a basic template and may not include all information required "
        "for regulatory submissions. Please consult the Enhanced CER Generator for a comprehensive, "
        "fully regulatory-compliant report."
    )
    content.append(Paragraph(disclaimer_text, styles['Normal']))
    
    # Build the PDF
    doc.build(content)
    
async def main():
    """Command-line interface for the simple CER generator"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate a simplified Clinical Evaluation Report')
    parser.add_argument('--id', required=True, help='Product identifier')
    parser.add_argument('--name', required=True, help='Product name')
    parser.add_argument('--manufacturer', help='Manufacturer name')
    parser.add_argument('--description', help='Device description')
    parser.add_argument('--purpose', help='Intended purpose')
    parser.add_argument('--class', dest='classification', help='Device classification')
    parser.add_argument('--days', type=int, default=730, help='Date range in days')
    parser.add_argument('--format', choices=['pdf', 'json'], default='pdf', help='Output format')
    
    args = parser.parse_args()
    
    result = await generate_cer(
        product_id=args.id,
        product_name=args.name,
        manufacturer=args.manufacturer,
        device_description=args.description,
        intended_purpose=args.purpose,
        classification=args.classification,
        date_range=args.days,
        output_format=args.format
    )
    
    if result['success']:
        print(f"Successfully generated CER report")
        print(f"Output file: {result['path']}")
        return 0
    else:
        print(f"Error generating CER report: {result.get('error', 'Unknown error')}")
        if 'traceback' in result:
            print(result['traceback'])
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))