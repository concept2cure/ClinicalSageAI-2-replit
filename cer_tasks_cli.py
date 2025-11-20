#!/usr/bin/env python
"""
CER PDF Generation CLI

This script is a command-line interface for generating PDF Clinical Evaluation Reports
based on FDA Adverse Event Reporting System (FAERS) data.
"""
import os
import sys
import json
import time
import argparse
import logging
from datetime import datetime
from uuid import uuid4
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("data/logs/cer_tasks_cli.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("cer_tasks_cli")

def setup_directories():
    """Ensure all required directories exist"""
    dirs = [
        'data/logs',
        'data/exports',
        'data/cer_reports'
    ]
    
    for directory in dirs:
        if not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
            logger.info(f"Created directory: {directory}")

def save_task_status(task_id, status, message="", filepath=None):
    """Save task status to a status file"""
    status_data = {
        'task_id': task_id,
        'status': status,
        'message': message,
        'update_time': datetime.now().isoformat(),
    }
    
    if filepath:
        status_data['filepath'] = filepath
    
    status_file = f"data/logs/cer_task_{task_id}_status.json"
    
    with open(status_file, 'w') as f:
        json.dump(status_data, f, indent=2)
    
    logger.info(f"Task {task_id} status updated to: {status}")

def generate_enhanced_pdf(ndc_code, task_id, user_id=None):
    """Generate an enhanced PDF report for the specified NDC code"""
    try:
        # Import required modules
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.platypus import (
                SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
                Image, PageBreak
            )
            from reportlab.lib import colors
        except ImportError as e:
            logger.error(f"Missing ReportLab dependencies: {e}")
            raise ImportError("PDF generation requires ReportLab to be installed")
        
        # Import our narrative generator
        sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from cer_narrative import generate_cer_narrative
        from server.faers_client import get_faers_data, get_drug_details
        
        # Update status to processing
        save_task_status(task_id, "processing", f"Generating CER PDF for NDC {ndc_code}")
        
        # Fetch FAERS data
        logger.info(f"Fetching FAERS data for NDC {ndc_code}")
        faers_data = get_faers_data(ndc_code, limit=100)
        
        # Fetch drug details
        drug_details = get_drug_details(ndc_code)
        
        if not faers_data.get('results'):
            error_msg = f"No FAERS data found for NDC {ndc_code}"
            save_task_status(task_id, "failed", error_msg)
            return None
        
        # Generate narrative text
        narrative = generate_cer_narrative(faers_data)
        
        # Format filename with date
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"CER_{ndc_code}_{timestamp}.pdf"
        pdf_path = os.path.join("data/exports", filename)
        
        # Extract product information
        product_name = "Unknown Pharmaceutical Product"
        manufacturer = "Unknown Manufacturer"
        
        if faers_data.get('results') and len(faers_data['results']) > 0:
            result = faers_data['results'][0]
            if 'openfda' in result:
                openfda = result['openfda']
                if 'brand_name' in openfda and len(openfda['brand_name']) > 0:
                    product_name = openfda['brand_name'][0]
                elif 'generic_name' in openfda and len(openfda['generic_name']) > 0:
                    product_name = openfda['generic_name'][0]
                    
                if 'manufacturer_name' in openfda and len(openfda['manufacturer_name']) > 0:
                    manufacturer = openfda['manufacturer_name'][0]
        
        # Create PDF document
        doc = SimpleDocTemplate(
            pdf_path,
            pagesize=letter,
            rightMargin=0.75*inch,
            leftMargin=0.75*inch,
            topMargin=0.75*inch,
            bottomMargin=0.75*inch
        )
        
        # Create styles
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(
            name='Title',
            parent=styles['Heading1'],
            fontSize=16,
            alignment=1,  # Center
            spaceAfter=12
        ))
        styles.add(ParagraphStyle(
            name='Subtitle',
            parent=styles['Heading2'],
            fontSize=14,
            alignment=1,  # Center
            spaceAfter=12
        ))
        styles.add(ParagraphStyle(
            name='Section',
            parent=styles['Heading2'],
            fontSize=12,
            spaceBefore=12,
            spaceAfter=6
        ))
        styles.add(ParagraphStyle(
            name='Normal',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=8
        ))
        
        # Build PDF content
        elements = []
        
        # Title and header information
        elements.append(Paragraph(f"Clinical Evaluation Report (CER)", styles['Title']))
        elements.append(Paragraph(f"For {product_name}", styles['Subtitle']))
        elements.append(Paragraph(f"NDC Code: {ndc_code}", styles['Normal']))
        elements.append(Paragraph(f"Manufacturer: {manufacturer}", styles['Normal']))
        elements.append(Paragraph(f"Date of Report: {datetime.now().strftime('%B %d, %Y')}", styles['Normal']))
        elements.append(Spacer(1, 0.25*inch))
        
        # Split the narrative into sections and add to document
        sections = narrative.split('\n\n')
        for section in sections:
            if section.strip():
                if any(header in section for header in ["SUMMARY OF SAFETY DATA ANALYSIS", "CONCLUSION"]):
                    # Main headers
                    elements.append(Paragraph(section, styles['Section']))
                elif section.strip().startswith(tuple("1234567890")):
                    # Section headers (numbered)
                    elements.append(Paragraph(section, styles['Section']))
                else:
                    elements.append(Paragraph(section, styles['Normal']))
        
        # Build the PDF document
        doc.build(elements)
        
        # Update task status to completed
        save_task_status(
            task_id, 
            "completed", 
            f"CER PDF generated successfully for NDC {ndc_code}", 
            filepath=filename
        )
        
        return pdf_path
        
    except Exception as e:
        error_msg = f"Error generating PDF: {str(e)}"
        log_file = f"data/logs/cer_task_{task_id}_error.log"
        
        with open(log_file, "w") as f:
            f.write(f"Error time: {datetime.now().isoformat()}\n")
            f.write(f"Error message: {str(e)}\n")
            f.write(f"Traceback:\n{traceback.format_exc()}")
        
        save_task_status(task_id, "failed", error_msg)
        logger.error(error_msg)
        logger.error(traceback.format_exc())
        return None

def main():
    """Command line entry point"""
    setup_directories()
    
    parser = argparse.ArgumentParser(description="Generate PDF Clinical Evaluation Reports")
    parser.add_argument("--ndc-code", required=True, help="National Drug Code (NDC)")
    parser.add_argument("--user-id", default=None, help="User ID for tracking (optional)")
    parser.add_argument("--task-id", default=None, help="Task ID for tracking (optional)")
    args = parser.parse_args()
    
    # Generate a task ID if not provided
    task_id = args.task_id or str(uuid4())
    
    # Generate the PDF
    pdf_path = generate_enhanced_pdf(args.ndc_code, task_id, args.user_id)
    
    if pdf_path:
        print(f"PDF generated successfully: {pdf_path}")
        return 0
    else:
        print("PDF generation failed. See logs for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())