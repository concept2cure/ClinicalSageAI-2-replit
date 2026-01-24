"""
CER PDF Generator

This module handles the generation of enhanced PDF reports for Clinical Evaluation Reports.
"""

import os
import logging
import json
import time
from datetime import datetime
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.pdfgen import canvas

# Set up logging
logger = logging.getLogger("cer_pdf")

def generate_enhanced_pdf(ndc_code, faers_data=None, cer_data=None):
    """
    Generate an enhanced PDF report for a Clinical Evaluation Report
    
    Args:
        ndc_code: The NDC code for the product
        faers_data: Optional FAERS data for the product
        cer_data: Optional CER data from the database
        
    Returns:
        BytesIO object containing the PDF
    """
    logger.info(f"Starting enhanced PDF generation for NDC: {ndc_code}")
    
    # Create a BytesIO buffer to store the PDF
    buffer = BytesIO()
    
    # Create the PDF document
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72
    )
    
    # Get styles
    styles = getSampleStyleSheet()
    title_style = styles['Heading1']
    subtitle_style = styles['Heading2']
    normal_style = styles['Normal']
    
    # Create custom styles
    section_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=12,
        textColor=colors.darkblue
    )
    
    info_style = ParagraphStyle(
        'InfoStyle',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.darkslategray
    )
    
    # List to hold content elements
    elements = []
    
    # Title
    elements.append(Paragraph(f"Clinical Evaluation Report", title_style))
    elements.append(Paragraph(f"NDC: {ndc_code}", subtitle_style))
    elements.append(Spacer(1, 12))
    
    # Add generation info
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", info_style))
    elements.append(Paragraph(f"Data Source: FDA FAERS Database", info_style))
    elements.append(Spacer(1, 24))
    
    # If we have FAERS data, add it to the PDF
    if faers_data:
        # Extract drug info
        drug_info = faers_data.get("drug_info", {})
        results = faers_data.get("results", [])
        
        # Add drug information
        elements.append(Paragraph("1. Product Information", section_style))
        
        product_info = [
            ["Brand Name:", drug_info.get("brand_name", "Not available")],
            ["Generic Name:", drug_info.get("generic_name", "Not available")],
            ["Manufacturer:", drug_info.get("manufacturer", "Not available")],
            ["NDC Code:", ndc_code]
        ]
        
        # Create a table for product info
        product_table = Table(product_info, colWidths=[120, 300])
        product_table.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ('BACKGROUND', (0, 0), (0, -1), colors.lavender),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(product_table)
        elements.append(Spacer(1, 12))
        
        # Add adverse event summary
        elements.append(Paragraph("2. Adverse Event Summary", section_style))
        
        if results:
            elements.append(Paragraph(f"Total number of reports analyzed: {len(results)}", normal_style))
            
            # Count serious vs non-serious events
            serious_count = sum(1 for r in results if r.get("serious"))
            non_serious_count = len(results) - serious_count
            
            elements.append(Paragraph(f"Serious events: {serious_count} ({serious_count/len(results)*100:.1f}%)", normal_style))
            elements.append(Paragraph(f"Non-serious events: {non_serious_count} ({non_serious_count/len(results)*100:.1f}%)", normal_style))
            elements.append(Spacer(1, 12))
            
            # Extract and count reactions
            all_reactions = []
            for report in results:
                all_reactions.extend(report.get("reactions", []))
            
            reaction_counts = {}
            for reaction in all_reactions:
                reaction_counts[reaction] = reaction_counts.get(reaction, 0) + 1
            
            # Sort reactions by frequency
            sorted_reactions = sorted(
                [(k, v) for k, v in reaction_counts.items()],
                key=lambda x: x[1],
                reverse=True
            )
            
            # Add top reactions table
            if sorted_reactions:
                elements.append(Paragraph("Top Reported Adverse Events:", normal_style))
                
                reaction_data = [["Adverse Event", "Count", "Percentage"]]
                for reaction, count in sorted_reactions[:10]:  # Top 10
                    percentage = (count / len(results)) * 100
                    reaction_data.append([reaction, str(count), f"{percentage:.1f}%"])
                
                reaction_table = Table(reaction_data, colWidths=[200, 80, 120])
                reaction_table.setStyle(TableStyle([
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
                    ('BACKGROUND', (0, 0), (-1, 0), colors.lavender),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('PADDING', (0, 0), (-1, -1), 6),
                ]))
                elements.append(reaction_table)
            else:
                elements.append(Paragraph("No specific adverse events found in the reports.", normal_style))
        else:
            elements.append(Paragraph("No adverse event reports found for this NDC code.", normal_style))
        
        elements.append(Spacer(1, 24))
    else:
        elements.append(Paragraph("No FAERS data available for analysis.", normal_style))
        elements.append(Spacer(1, 24))
    
    # If we have CER data from the database, add it
    if cer_data:
        elements.append(Paragraph("3. Clinical Evaluation Report Content", section_style))
        
        # Add the CER content as paragraphs
        content_text = cer_data.get("content_text", "")
        if content_text:
            # Split into paragraphs and add each one
            paragraphs = content_text.split('\n\n')
            for para in paragraphs:
                if para.strip():
                    # Check if it's a header (starts with # or ##)
                    if para.startswith('# '):
                        elements.append(Paragraph(para[2:], title_style))
                    elif para.startswith('## '):
                        elements.append(Paragraph(para[3:], subtitle_style))
                    else:
                        elements.append(Paragraph(para, normal_style))
                    elements.append(Spacer(1, 6))
        else:
            elements.append(Paragraph("No CER content text available.", normal_style))
    
    # Add disclaimer
    elements.append(Spacer(1, 24))
    elements.append(Paragraph("Disclaimer:", section_style))
    disclaimer_text = """This report has been generated automatically based on data from the FDA Adverse Event Reporting System (FAERS). 
    The information provided is for informational purposes only and should not be considered as medical advice or an official regulatory evaluation. 
    Healthcare professionals should use their professional judgment when interpreting this information."""
    elements.append(Paragraph(disclaimer_text, info_style))
    
    # Build the PDF
    logger.info("Building PDF document...")
    doc.build(elements)
    
    # Get the value of the BytesIO buffer
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    logger.info(f"PDF generation complete. Size: {len(pdf_bytes)} bytes")
    return pdf_bytes

def save_pdf_to_file(pdf_bytes, ndc_code):
    """
    Save a generated PDF to a file
    
    Args:
        pdf_bytes: The PDF as bytes
        ndc_code: The NDC code for the filename
        
    Returns:
        The filename of the saved PDF
    """
    # Create exports directory if it doesn't exist
    exports_dir = os.path.join(os.getcwd(), 'data', 'exports')
    os.makedirs(exports_dir, exist_ok=True)
    
    # Create a timestamped filename
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"CER_Report_{ndc_code}_{timestamp}.pdf"
    filepath = os.path.join(exports_dir, filename)
    
    # Write the PDF to the file
    with open(filepath, 'wb') as f:
        f.write(pdf_bytes)
    
    logger.info(f"PDF saved to file: {filepath}")
    return filepath