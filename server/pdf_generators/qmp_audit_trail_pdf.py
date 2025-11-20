#!/usr/bin/env python3
"""
QMP Audit Trail PDF Generator

This script generates a professional PDF report for Quality Management Plan audit trail data,
suitable for regulatory documentation and compliance evidence.
"""

import sys
import json
import os
import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, ListFlowable, ListItem
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.platypus.frames import Frame
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.pdfencrypt import StandardEncryption
from io import BytesIO

def format_timestamp(timestamp_str):
    """Format ISO timestamp to a more readable format."""
    try:
        dt = datetime.datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        return dt.strftime('%b %d, %Y %H:%M:%S UTC')
    except Exception:
        return timestamp_str

class AuditTrailDocTemplate(BaseDocTemplate):
    """Extended document template with headers, footers and page numbers"""
    
    def __init__(self, filename, **kwargs):
        self.allowSplitting = 0
        BaseDocTemplate.__init__(self, filename, **kwargs)
        template = PageTemplate('normal', [Frame(
            self.leftMargin, self.bottomMargin, self.width, self.height, id='normal'
        )])
        self.addPageTemplates([template])
        
    def afterPage(self):
        """Add page numbers and other elements after each page is created"""
        page_num = self.page
        canvas = self.canv
        canvas.saveState()
        
        # Add page number at bottom
        footer_text = f"Page {page_num} | TrialSage™ QMP Audit Trail Report"
        canvas.setFont('Helvetica', 8)
        canvas.drawCentredString(letter[0]/2.0, 0.25*inch, footer_text)
        
        # Add header with thin border
        if page_num > 1:  # Not on cover page
            canvas.setFont('Helvetica-Bold', 8)
            canvas.drawString(0.5*inch, letter[1] - 0.4*inch, "QUALITY MANAGEMENT PLAN AUDIT TRAIL")
            canvas.setFont('Helvetica', 8)
            canvas.drawString(
                letter[0] - 2.5*inch, 
                letter[1] - 0.4*inch, 
                datetime.datetime.now().strftime("%Y-%m-%d")
            )
            # Draw a thin line under the header
            canvas.setStrokeColor(colors.lightgrey)
            canvas.setLineWidth(0.5)
            canvas.line(0.48*inch, letter[1] - 0.45*inch, letter[0] - 0.48*inch, letter[1] - 0.45*inch)
        
        canvas.restoreState()

def generate_pdf(data, output_path):
    """
    Generate a PDF report from QMP audit trail data.
    
    Args:
        data (dict): Dictionary containing the audit trail data
        output_path (str): Path where the PDF will be saved
    """
    # Extract the records and metadata
    records = data.get('auditRecords', [])
    metadata = data.get('metadata', {})
    
    # Sort records by timestamp (newest first)
    records.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    
    # Create a PDF document with custom template
    doc = AuditTrailDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=0.5*inch,
        leftMargin=0.5*inch,
        topMargin=0.6*inch,
        bottomMargin=0.6*inch,
        title="Quality Management Plan Audit Trail",
        author="TrialSage™",
        subject="ICH E6(R3) Compliance Documentation",
    )
    
    # Styles
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name='Title',
        parent=styles['Heading1'],
        fontSize=20,
        alignment=TA_CENTER,
        spaceAfter=20,
        textColor=colors.darkblue,
    ))
    styles.add(ParagraphStyle(
        name='Subtitle',
        parent=styles['Heading2'],
        fontSize=14,
        alignment=TA_CENTER,
        spaceAfter=16,
        textColor=colors.darkblue,
    ))
    styles.add(ParagraphStyle(
        name='SectionHeading',
        parent=styles['Heading3'],
        fontSize=14,
        spaceBefore=16,
        spaceAfter=10,
        textColor=colors.darkblue,
    ))
    styles.add(ParagraphStyle(
        name='SubsectionHeading',
        parent=styles['Heading4'],
        fontSize=12,
        spaceBefore=10,
        spaceAfter=8,
        textColor=colors.darkblue,
    ))
    styles.add(ParagraphStyle(
        name='SmallText',
        parent=styles['Normal'],
        fontSize=8
    ))
    styles.add(ParagraphStyle(
        name='NormalCentered',
        parent=styles['Normal'],
        alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        name='Footer',
        parent=styles['Normal'],
        fontSize=8,
        alignment=TA_CENTER
    ))
    styles.add(ParagraphStyle(
        name='TableHeader',
        parent=styles['Normal'],
        fontSize=10,
        alignment=TA_CENTER,
        textColor=colors.white
    ))
    styles.add(ParagraphStyle(
        name='TOCHeading',
        parent=styles['Heading1'],
        fontSize=16,
        spaceBefore=16,
        spaceAfter=16,
        textColor=colors.darkblue,
    ))
    
    # Content elements
    elements = []
    
    # COVER PAGE
    elements.append(Spacer(1, 1*inch))
    elements.append(Paragraph("Quality Management Plan", styles['Title']))
    elements.append(Paragraph("Audit Trail Report", styles['Title']))
    elements.append(Spacer(1, 0.5*inch))
    
    # Generation metadata
    current_date = datetime.datetime.now().strftime("%B %d, %Y")
    current_time = datetime.datetime.now().strftime("%H:%M:%S")
    elements.append(Paragraph(f"Generated: {current_date}", styles['Subtitle']))
    elements.append(Paragraph(f"Time: {current_time}", styles['NormalCentered']))
    elements.append(Spacer(1, 0.5*inch))
    
    # Compliance information
    elements.append(Paragraph("ICH E6(R3) & 21 CFR Part 11 Compliance Documentation", styles['Subtitle']))
    elements.append(Spacer(1, 1*inch))
    
    # Add metadata table
    metadata_data = [
        ["Retention Policy:", metadata.get('retentionPolicy', "10 years")],
        ["Compliance Standard:", metadata.get('complianceStandard', "21 CFR Part 11")],
        ["Record Count:", str(len(records))],
        ["Last Updated:", format_timestamp(metadata.get('lastUpdated', current_date))]
    ]
    
    metadata_table = Table(metadata_data, colWidths=[2*inch, 4*inch])
    metadata_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6)
    ]))
    elements.append(metadata_table)
    
    # Add confidentiality statement
    elements.append(Spacer(1, 1*inch))
    elements.append(Paragraph(
        "<b>CONFIDENTIAL</b>",
        styles['NormalCentered']
    ))
    elements.append(Paragraph(
        "This document contains confidential information. Do not distribute without proper authorization.",
        styles['NormalCentered']
    ))
    
    # Insert page break after cover
    elements.append(PageBreak())
    
    # TABLE OF CONTENTS
    elements.append(Paragraph("Table of Contents", styles['TOCHeading']))
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name='TOC1', fontSize=12, leftIndent=20, firstLineIndent=-20, spaceBefore=5, spaceAfter=5),
        ParagraphStyle(name='TOC2', fontSize=10, leftIndent=40, firstLineIndent=-20, spaceBefore=3, spaceAfter=3),
    ]
    elements.append(toc)
    elements.append(PageBreak())
    
    # INTRODUCTION SECTION
    elements.append(Paragraph("1. Introduction", styles['SectionHeading']))
    elements.append(Paragraph(
        "This document provides a comprehensive audit trail of all changes made to the Quality Management Plan (QMP) "
        "in accordance with regulatory compliance requirements. The audit trail ensures complete traceability of "
        "modifications to quality objectives, critical-to-quality (CtQ) factors, and associated procedural changes.",
        styles['Normal']
    ))
    elements.append(Spacer(1, 0.1*inch))
    elements.append(Paragraph(
        "The QMP is a central component of the Clinical Evaluation Report (CER) process, ensuring that appropriate "
        "quality controls are implemented throughout document generation and submission. This audit trail serves as "
        "evidence of compliance with ICH E6(R3) and 21 CFR Part 11 requirements for maintaining records of all "
        "changes to quality management documentation.",
        styles['Normal']
    ))
    elements.append(Spacer(1, 0.2*inch))
    
    # PURPOSE SUBSECTION
    elements.append(Paragraph("1.1 Purpose of This Report", styles['SubsectionHeading']))
    elements.append(Paragraph(
        "This audit trail report serves multiple regulatory and compliance purposes:",
        styles['Normal']
    ))
    
    purpose_items = [
        "To provide documentary evidence of changes made to the Quality Management Plan",
        "To establish accountability by tracking which users made specific modifications",
        "To create a chronological history of all quality management activities",
        "To support regulatory inspections and audits with comprehensive change documentation",
        "To verify compliance with procedural controls for document modifications"
    ]
    
    purpose_list = []
    for item in purpose_items:
        purpose_list.append(ListItem(Paragraph(item, styles['Normal']), leftIndent=35, value='•'))
    
    elements.append(ListFlowable(purpose_list, bulletType='bullet', start='•'))
    elements.append(Spacer(1, 0.2*inch))
    
    # USAGE GUIDANCE
    elements.append(Paragraph("1.2 How to Use This Report", styles['SubsectionHeading']))
    elements.append(Paragraph(
        "This report is organized in a chronological format with the most recent changes appearing first. "
        "Users should note the following guidance for effectively utilizing this document:",
        styles['Normal']
    ))
    
    usage_items = [
        "Review the Table of Contents to navigate directly to specific audit periods",
        "Each entry contains the modification type, user information, timestamp, and detailed description",
        "Changes are categorized by type (objective added/updated, CtQ factor added/updated/completed, status changed)",
        "Critical changes to quality objectives and high-risk CtQ factors are highlighted for emphasis",
        "Technical details of each change are provided in structured tables for clarity"
    ]
    
    usage_list = []
    for item in usage_items:
        usage_list.append(ListItem(Paragraph(item, styles['Normal']), leftIndent=35, value='•'))
    
    elements.append(ListFlowable(usage_list, bulletType='bullet', start='•'))
    elements.append(Spacer(1, 0.2*inch))
    
    # COMPLIANCE SECTION
    elements.append(Paragraph("1.3 Regulatory Compliance Context", styles['SubsectionHeading']))
    elements.append(Paragraph(
        "This audit trail documentation complies with the following regulatory requirements:",
        styles['Normal']
    ))
    
    compliance_data = [
        ["Regulation", "Requirement", "Compliance Measure"],
        ["21 CFR Part 11", "Electronic Records Integrity", "Secure audit trail with user authentication"],
        ["21 CFR Part 11", "Record Retention", "Minimum 10-year retention policy"],
        ["ICH E6(R3)", "Quality Management", "Documented objectives and critical-to-quality factors"],
        ["ICH E6(R3)", "Traceability", "Complete history of QMP changes with timestamps"],
        ["EU MDR", "Technical Documentation", "Auditable quality management processes"]
    ]
    
    compliance_table = Table(compliance_data, colWidths=[1.5*inch, 2*inch, 2.5*inch])
    compliance_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ]))
    elements.append(compliance_table)
    elements.append(PageBreak())
    
    # AUDIT RECORDS SECTION
    elements.append(Paragraph("2. Audit Records", styles['SectionHeading']))
    elements.append(Paragraph(
        "This section contains the chronological audit trail of all Quality Management Plan changes. "
        "Records are sorted with the most recent changes appearing first and categorized by date.",
        styles['Normal']
    ))
    elements.append(Spacer(1, 0.2*inch))
    
    # Categorize records by date
    date_categorized = {}
    for record in records:
        timestamp = record.get('timestamp', '')
        if timestamp:
            date_part = timestamp.split('T')[0]
            if date_part not in date_categorized:
                date_categorized[date_part] = []
            date_categorized[date_part].append(record)
    
    # Add a summary table of change types
    change_types = {}
    for record in records:
        change_type = record.get('changeType', 'unknown')
        if change_type not in change_types:
            change_types[change_type] = 0
        change_types[change_type] += 1
    
    elements.append(Paragraph("2.1 Summary of Changes", styles['SubsectionHeading']))
    
    # Prepare summary table
    summary_data = [["Change Type", "Count"]]
    for change_type, count in sorted(change_types.items(), key=lambda x: x[1], reverse=True):
        # Convert camelCase to Title Case with spaces
        formatted_type = ' '.join(word.title() for word in ''.join(
            ' ' + c.lower() if c.isupper() else c for c in change_type
        ).split('-'))
        summary_data.append([formatted_type, str(count)])
    
    # Add total row
    summary_data.append(["Total Changes", str(len(records))])
    
    summary_table = Table(summary_data, colWidths=[4*inch, 1.5*inch])
    summary_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BACKGROUND', (0, -1), (-1, -1), colors.lightgrey),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Process each date category
    date_count = 0
    for date_str in sorted(date_categorized.keys(), reverse=True):
        date_count += 1
        # Format date header
        try:
            date_obj = datetime.datetime.fromisoformat(date_str)
            date_header = date_obj.strftime("%B %d, %Y")
        except:
            date_header = date_str
            
        elements.append(Paragraph(f"2.{date_count+1} Changes on {date_header}", styles['SubsectionHeading']))
        
        # Process each record for this date
        for record in date_categorized[date_str]:
            # Record header info
            time_str = format_timestamp(record.get('timestamp', '')).split(' ')[3] if 'timestamp' in record else ''
            
            # Define icon/indicator based on change type
            change_type = record.get('changeType', '')
            if 'objective-added' in change_type:
                icon = "➕ "
                color_style = "color:green"
            elif 'objective-updated' in change_type:
                icon = "✏️ "
                color_style = "color:blue"
            elif 'ctq-added' in change_type:
                icon = "➕ "
                color_style = "color:purple"
            elif 'ctq-updated' in change_type:
                icon = "✏️ "
                color_style = "color:blue"
            elif 'ctq-completed' in change_type:
                icon = "✓ "
                color_style = "color:green"
            elif 'status-changed' in change_type:
                icon = "⟳ "
                color_style = "color:orange"
            elif 'plan-approved' in change_type:
                icon = "✓✓ " 
                color_style = "color:darkgreen"
            else:
                icon = "• "
                color_style = "color:black"
            
            header_text = f"{icon}<b><span style='{color_style}'>{record.get('title', 'Untitled Event')}</span></b>"
            if time_str:
                header_text += f" • <i>{time_str}</i>"
            
            elements.append(Paragraph(header_text, styles['Normal']))
            
            # User info
            user_text = f"<b>Modified by:</b> {record.get('user', 'Unknown User')} ({record.get('userRole', 'Unknown Role')})"
            elements.append(Paragraph(user_text, styles['Normal']))
            
            # Description
            if 'description' in record:
                elements.append(Paragraph(record.get('description', ''), styles['Normal']))
            
            # Details
            if 'details' in record and record['details']:
                details = record['details']
                if isinstance(details, dict):
                    details_table_data = []
                    for key, value in details.items():
                        # Convert camelCase to Title Case with spaces
                        formatted_key = ' '.join(word.title() for word in ''.join(
                            ' ' + c.lower() if c.isupper() else c for c in key
                        ).split())
                        
                        details_table_data.append([formatted_key + ":", str(value)])
                    
                    if details_table_data:
                        details_table = Table(details_table_data, colWidths=[1.75*inch, 4.25*inch])
                        details_table.setStyle(TableStyle([
                            ('GRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
                            ('BACKGROUND', (0, 0), (0, -1), colors.lightgrey),
                            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                            ('PADDING', (0, 0), (-1, -1), 4)
                        ]))
                        elements.append(Spacer(1, 0.1*inch))
                        elements.append(details_table)
                else:
                    elements.append(Paragraph(str(details), styles['Normal']))
            
            elements.append(Spacer(1, 0.2*inch))
            
    # APPENDIX
    elements.append(PageBreak())
    elements.append(Paragraph("3. Appendix", styles['SectionHeading']))
    
    # Add usage guidance
    elements.append(Paragraph("3.1 Report Usage Guidelines", styles['SubsectionHeading']))
    elements.append(Paragraph(
        "This audit trail report should be retained as part of the Quality Management documentation for the "
        "Clinical Evaluation Report (CER). The following guidelines apply to the usage of this document:",
        styles['Normal']
    ))
    
    appendix_items = [
        "This document serves as evidence for regulatory inspections and audits",
        "The report should be archived along with the corresponding Quality Management Plan",
        "For questions regarding specific changes, contact the user identified in the respective entry",
        "Changes to quality objectives and critical-to-quality factors should be reviewed in the context of the overall Quality Management Plan",
        "This document may be provided to regulatory authorities upon request as evidence of compliance with quality management requirements"
    ]
    
    appendix_list = []
    for item in appendix_items:
        appendix_list.append(ListItem(Paragraph(item, styles['Normal']), leftIndent=35, value='•'))
    
    elements.append(ListFlowable(appendix_list, bulletType='bullet', start='•'))
    elements.append(Spacer(1, 0.2*inch))
    
    # Glossary
    elements.append(Paragraph("3.2 Glossary of Terms", styles['SubsectionHeading']))
    
    glossary_data = [
        ["Term", "Definition"],
        ["QMP", "Quality Management Plan - Document outlining quality objectives and control measures"],
        ["CER", "Clinical Evaluation Report - Documentation of clinical evidence for medical devices"],
        ["CtQ", "Critical-to-Quality - Factors essential for ensuring document quality"],
        ["ICH E6(R3)", "International Council for Harmonisation guideline for good clinical practice"],
        ["21 CFR Part 11", "FDA regulations on electronic records and electronic signatures"],
        ["EU MDR", "European Union Medical Device Regulation"],
        ["Audit Trail", "Chronological record of activities and changes to documentation"]
    ]
    
    glossary_table = Table(glossary_data, colWidths=[1.5*inch, 4.5*inch])
    glossary_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ]))
    elements.append(glossary_table)
    
    # Footer with certification
    elements.append(Spacer(1, 1*inch))
    elements.append(Paragraph(
        "<b>Certification</b>",
        styles['NormalCentered']
    ))
    elements.append(Paragraph(
        "This report has been generated automatically as part of the Quality Management System audit trail. "
        "The information presented in this document is maintained in compliance with 21 CFR Part 11 and ICH E6(R3) requirements.",
        styles['Footer']
    ))
    
    # Build the PDF with table of contents
    doc.multiBuild(elements)
    
    return output_path

def main():
    """Main function to handle command line usage."""
    if len(sys.argv) < 3:
        print("Usage: python qmp_audit_trail_pdf.py <input_json_file> <output_pdf_file>")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    try:
        with open(input_path, 'r') as f:
            data = json.load(f)
        
        generate_pdf(data, output_path)
        print(f"PDF successfully generated at {output_path}")
        sys.exit(0)
    except Exception as e:
        print(f"Error generating PDF: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()