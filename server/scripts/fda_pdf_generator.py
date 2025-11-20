#!/usr/bin/env python3
"""
FDA-Compliant PDF Generator

This script generates PDFs that comply with FDA formatting requirements for regulatory
submissions, particularly for 510(k) documents. It implements precise formatting according
to FDA guidance documents and eCopy specifications.

FDA SUBMISSION REQUIREMENTS:
- Letter size paper (8.5" x 11")
- 1" margins on all sides
- Font size minimum of 12 points
- FDA-acceptable fonts: Times New Roman, Arial, Verdana
- Headers and footers must be within the margins
- All pages numbered sequentially
- Bookmarks for major sections
- Table of contents for submissions > 5 pages
- No security settings that prevent copying text or adding annotations

Reference: FDA eCopy Program Guidance
"""

import os
import sys
import json
import logging
import tempfile
import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Union

# ReportLab imports
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
    PageBreak, Image, ListFlowable, ListItem, Flowable, 
    KeepTogether, TableOfContents
)
from reportlab.platypus.frames import Frame
from reportlab.platypus.doctemplate import PageTemplate

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('FDA-PDF-Generator')

# Define constants
FDA_MARGIN = inch  # 1 inch margins
FDA_FONT_SIZE = 12
FDA_HEADING_FONT_SIZE = 14
FDA_SUBHEADING_FONT_SIZE = 12
FDA_NORMAL_FONT_SIZE = 12
FDA_SMALL_FONT_SIZE = 10
FDA_FOOTER_FONT_SIZE = 10

# FDA-compliant fonts
FDA_FONTS = {
    'times': {
        'normal': 'Times-Roman',
        'bold': 'Times-Bold',
        'italic': 'Times-Italic', 
        'bolditalic': 'Times-BoldItalic'
    },
    'arial': {
        'normal': 'Helvetica',  # ReportLab's built-in substitute for Arial
        'bold': 'Helvetica-Bold',
        'italic': 'Helvetica-Oblique',
        'bolditalic': 'Helvetica-BoldOblique'
    },
    'verdana': {
        'normal': 'Helvetica',  # Substituting as Verdana isn't built-in
        'bold': 'Helvetica-Bold',
        'italic': 'Helvetica-Oblique',
        'bolditalic': 'Helvetica-BoldOblique'
    }
}

# Default font family to use
DEFAULT_FONT_FAMILY = 'times'


class FDAHeader(Flowable):
    """Header Flowable for FDA documents with proper formatting"""
    
    def __init__(self, text='', doc_title='', section='', page_num=None):
        Flowable.__init__(self)
        self.text = text
        self.doc_title = doc_title
        self.section = section
        self.page_num = page_num
        self.width = letter[0] - (2 * FDA_MARGIN)
        self.height = 0.5 * inch
    
    def draw(self):
        # Draw header text
        self.canv.saveState()
        
        # Left section - Document title
        self.canv.setFont(FDA_FONTS[DEFAULT_FONT_FAMILY]['italic'], FDA_SMALL_FONT_SIZE)
        self.canv.drawString(0, 0.2 * inch, self.doc_title[:60])
        
        # Center section - Current section name
        if self.section:
            self.canv.setFont(FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'], FDA_SMALL_FONT_SIZE)
            self.canv.drawCentredString(self.width/2, 0.2 * inch, self.section[:40])
        
        # Right section - Page number
        if self.page_num is not None:
            self.canv.setFont(FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'], FDA_SMALL_FONT_SIZE)
            self.canv.drawRightString(self.width, 0.2 * inch, f"Page {self.page_num}")
        
        # Draw bottom line
        self.canv.setLineWidth(0.5)
        self.canv.line(0, 0, self.width, 0)
        
        self.canv.restoreState()


class FDAFooter(Flowable):
    """Footer Flowable for FDA documents with proper formatting"""
    
    def __init__(self, text='', doc_id='', submission_date=''):
        Flowable.__init__(self)
        self.text = text
        self.doc_id = doc_id
        self.submission_date = submission_date
        self.width = letter[0] - (2 * FDA_MARGIN)
        self.height = 0.5 * inch
    
    def draw(self):
        # Draw footer text
        self.canv.saveState()
        
        # Draw top line
        self.canv.setLineWidth(0.5)
        self.canv.line(0, self.height - 0.1 * inch, self.width, self.height - 0.1 * inch)
        
        # Left section - Document ID
        self.canv.setFont(FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'], FDA_FOOTER_FONT_SIZE)
        self.canv.drawString(0, self.height - 0.3 * inch, self.doc_id)
        
        # Center - Confidentiality statement
        self.canv.setFont(FDA_FONTS[DEFAULT_FONT_FAMILY]['italic'], FDA_FOOTER_FONT_SIZE)
        self.canv.drawCentredString(
            self.width/2, 
            self.height - 0.3 * inch, 
            "Confidential - For FDA Review"
        )
        
        # Right section - Submission date
        self.canv.setFont(FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'], FDA_FOOTER_FONT_SIZE)
        self.canv.drawRightString(
            self.width, 
            self.height - 0.3 * inch, 
            f"Submission Date: {self.submission_date}"
        )
        
        self.canv.restoreState()


class FDADocTemplate(SimpleDocTemplate):
    """Custom document template with FDA-compliant headers and footers"""
    
    def __init__(self, filename, doc_title='', doc_id='', submission_date='', **kwargs):
        self.doc_title = doc_title
        self.doc_id = doc_id
        self.submission_date = submission_date
        self.current_section = ''
        
        # Use FDA-compliant margins
        kwargs.setdefault('leftMargin', FDA_MARGIN)
        kwargs.setdefault('rightMargin', FDA_MARGIN)
        kwargs.setdefault('topMargin', FDA_MARGIN)
        kwargs.setdefault('bottomMargin', FDA_MARGIN)
        
        SimpleDocTemplate.__init__(self, filename, pagesize=letter, **kwargs)
        
        # Set up page templates
        self.createFDATemplates()
    
    def createFDATemplates(self):
        """Create FDA-compliant page templates"""
        # Create frames for content
        content_width = self.width
        content_height = self.height - inch  # Allow space for header and footer
        
        # Frame for the content
        content_frame = Frame(
            self.leftMargin, 
            self.bottomMargin + 0.5 * inch,  # Add space for footer
            content_width, 
            content_height,
            id='content'
        )
        
        # Create page templates
        self.addPageTemplates([
            PageTemplate(
                id='FDA_Template',
                frames=[content_frame],
                onPage=self.add_header_footer
            )
        ])
    
    def add_header_footer(self, canvas, doc):
        """Add FDA-compliant header and footer to each page"""
        canvas.saveState()
        
        # Add header
        header = FDAHeader(
            doc_title=self.doc_title,
            section=self.current_section,
            page_num=doc.page
        )
        header.canv = canvas
        header.draw()
        
        # Add footer
        footer = FDAFooter(
            doc_id=self.doc_id,
            submission_date=self.submission_date
        )
        footer.canv = canvas
        y_position = self.bottomMargin / 2
        canvas.translate(self.leftMargin, y_position)
        footer.canv = canvas
        footer.draw()
        
        canvas.restoreState()
    
    def set_section(self, section_name):
        """Set the current section name for the header"""
        self.current_section = section_name


def create_fda_styles():
    """Create paragraph styles that comply with FDA requirements"""
    styles = getSampleStyleSheet()
    
    # Title style - 14pt, centered, bold, Times New Roman
    styles.add(ParagraphStyle(
        name='FDA_Title',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['bold'],
        fontSize=FDA_HEADING_FONT_SIZE,
        alignment=TA_CENTER,
        spaceAfter=0.2 * inch,
        spaceBefore=0.1 * inch,
        leading=FDA_HEADING_FONT_SIZE * 1.2
    ))
    
    # Subtitle style - 12pt, centered, bold, Times New Roman
    styles.add(ParagraphStyle(
        name='FDA_Subtitle',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['bold'],
        fontSize=FDA_SUBHEADING_FONT_SIZE,
        alignment=TA_CENTER,
        spaceAfter=0.15 * inch,
        spaceBefore=0.1 * inch,
        leading=FDA_SUBHEADING_FONT_SIZE * 1.2
    ))
    
    # Section heading style - 12pt, left, bold, Times New Roman
    styles.add(ParagraphStyle(
        name='FDA_Section',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['bold'],
        fontSize=FDA_SUBHEADING_FONT_SIZE,
        alignment=TA_LEFT,
        spaceAfter=0.1 * inch,
        spaceBefore=0.2 * inch,
        leading=FDA_SUBHEADING_FONT_SIZE * 1.2,
        keepWithNext=1
    ))
    
    # Subheading style - 12pt, left, bold, Times New Roman
    styles.add(ParagraphStyle(
        name='FDA_Subheading',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['bold'],
        fontSize=FDA_NORMAL_FONT_SIZE,
        alignment=TA_LEFT,
        spaceAfter=0.1 * inch,
        spaceBefore=0.1 * inch,
        leading=FDA_NORMAL_FONT_SIZE * 1.2,
        keepWithNext=1
    ))
    
    # Normal text style - 12pt, justified, Times New Roman
    styles.add(ParagraphStyle(
        name='FDA_Normal',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'],
        fontSize=FDA_NORMAL_FONT_SIZE,
        alignment=TA_JUSTIFY,
        spaceAfter=0.1 * inch,
        leading=FDA_NORMAL_FONT_SIZE * 1.2
    ))
    
    # Indented text style - 12pt, justified, Times New Roman, indented
    styles.add(ParagraphStyle(
        name='FDA_Indented',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'],
        fontSize=FDA_NORMAL_FONT_SIZE,
        alignment=TA_JUSTIFY,
        spaceAfter=0.1 * inch,
        leading=FDA_NORMAL_FONT_SIZE * 1.2,
        leftIndent=0.25 * inch
    ))
    
    # Table header style - 12pt, centered, bold, Times New Roman
    styles.add(ParagraphStyle(
        name='FDA_TableHeader',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['bold'],
        fontSize=FDA_NORMAL_FONT_SIZE,
        alignment=TA_CENTER,
        leading=FDA_NORMAL_FONT_SIZE * 1.2
    ))
    
    # Table cell style - 12pt, left, Times New Roman
    styles.add(ParagraphStyle(
        name='FDA_TableCell',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'],
        fontSize=FDA_NORMAL_FONT_SIZE,
        alignment=TA_LEFT,
        leading=FDA_NORMAL_FONT_SIZE * 1.2
    ))
    
    # List item style - 12pt, justified, Times New Roman
    styles.add(ParagraphStyle(
        name='FDA_ListItem',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'],
        fontSize=FDA_NORMAL_FONT_SIZE,
        alignment=TA_JUSTIFY,
        leading=FDA_NORMAL_FONT_SIZE * 1.2,
        leftIndent=0.25 * inch
    ))
    
    # Footer style - 10pt, centered, Times New Roman
    styles.add(ParagraphStyle(
        name='FDA_Footer',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['italic'],
        fontSize=FDA_FOOTER_FONT_SIZE,
        alignment=TA_CENTER,
        textColor=colors.darkgrey
    ))
    
    # Date style - 12pt, right-aligned, Times New Roman
    styles.add(ParagraphStyle(
        name='FDA_Date',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'],
        fontSize=FDA_NORMAL_FONT_SIZE,
        alignment=TA_RIGHT,
        spaceAfter=0.2 * inch
    ))
    
    # Cover letter styles
    styles.add(ParagraphStyle(
        name='FDA_CoverLetter_Recipient',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'],
        fontSize=FDA_NORMAL_FONT_SIZE,
        alignment=TA_LEFT,
        spaceAfter=0.3 * inch
    ))
    
    styles.add(ParagraphStyle(
        name='FDA_CoverLetter_Closing',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'],
        fontSize=FDA_NORMAL_FONT_SIZE,
        alignment=TA_LEFT,
        spaceBefore=0.2 * inch,
        spaceAfter=0.1 * inch
    ))
    
    styles.add(ParagraphStyle(
        name='FDA_CoverLetter_Signature',
        fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['bold'],
        fontSize=FDA_NORMAL_FONT_SIZE,
        alignment=TA_LEFT,
        spaceBefore=0.4 * inch
    ))
    
    return styles


def process_text(text: str) -> str:
    """
    Process text to handle line breaks and XML special characters for ReportLab
    """
    if not text:
        return ""
    
    # Replace newlines with <br/> tags
    text = text.replace('\n', '<br/>')
    
    # Escape XML special characters (except for tags we just added)
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;').replace('>', '&gt;')
    
    # Convert back <br/> tags
    text = text.replace('&lt;br/&gt;', '<br/>')
    
    return text


def create_fda_table(
    table_data: List[List[str]], 
    headers: List[str],
    colWidths: Optional[List[Union[float, str]]] = None,
    style: Optional[List] = None
) -> Table:
    """
    Create a table with FDA-compliant styling
    
    Args:
        table_data: The data for the table rows
        headers: The headers for the table
        colWidths: Optional column widths (in inches or as percentages)
        style: Optional additional style commands
    
    Returns:
        A ReportLab Table flowable
    """
    styles = create_fda_styles()
    
    # Process headers for the table
    if headers:
        header_row = [Paragraph(process_text(header), styles['FDA_TableHeader']) 
                     for header in headers]
        processed_data = [header_row]
    else:
        processed_data = []
    
    # Process data for the table
    for row in table_data:
        processed_row = [
            Paragraph(process_text(str(cell)), styles['FDA_TableCell']) 
            if cell is not None else '' 
            for cell in row
        ]
        processed_data.append(processed_row)
    
    # Set default column widths if not provided
    if colWidths is None:
        # Distribute space equally among columns
        page_width = letter[0] - (2 * FDA_MARGIN)
        colWidths = [page_width / len(headers)] * len(headers)
    
    # Create table with appropriate styling
    table = Table(processed_data, colWidths=colWidths)
    
    # Base style for FDA-compliant tables
    base_style = TableStyle([
        ('FONT', (0, 0), (-1, 0), FDA_FONTS[DEFAULT_FONT_FAMILY]['bold']),
        ('FONT', (0, 1), (-1, -1), FDA_FONTS[DEFAULT_FONT_FAMILY]['normal']),
        ('FONTSIZE', (0, 0), (-1, -1), FDA_NORMAL_FONT_SIZE),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.black),
        ('BOX', (0, 0), (-1, -1), 0.25, colors.black),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ])
    
    # Add additional styles if provided
    if style:
        for style_command in style:
            base_style.add(*style_command)
    
    table.setStyle(base_style)
    return table


def create_list_flowable(items: List[str], ordered: bool = False) -> ListFlowable:
    """
    Create a list with FDA-compliant formatting
    
    Args:
        items: List of items to include
        ordered: Whether the list should be ordered (numbered) or unordered (bulleted)
    
    Returns:
        A ReportLab ListFlowable
    """
    styles = create_fda_styles()
    list_items = []
    
    for item in items:
        para = Paragraph(process_text(item), styles['FDA_ListItem'])
        list_items.append(ListItem(para))
    
    bullet_type = 'bullet' if not ordered else 'I'
    return ListFlowable(
        list_items,
        bulletType=bullet_type,
        bulletFontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'],
        bulletFontSize=FDA_NORMAL_FONT_SIZE,
        leftIndent=0.25 * inch
    )


def create_510k_cover_letter(
    device_name: str,
    manufacturer: str,
    contact_info: Dict[str, str],
    predicate_device: Dict[str, str],
    submission_date: str
) -> List[Flowable]:
    """
    Create a 510(k) cover letter with FDA-compliant formatting
    
    Args:
        device_name: The name of the device
        manufacturer: The manufacturer name
        contact_info: Dict with contact information
        predicate_device: Dict with predicate device information
        submission_date: The submission date
    
    Returns:
        A list of ReportLab flowables for the cover letter
    """
    styles = create_fda_styles()
    flowables = []
    
    # Date
    flowables.append(Paragraph(submission_date, styles['FDA_Date']))
    flowables.append(Spacer(1, 0.1 * inch))
    
    # Recipient (FDA)
    recipient_address = (
        "Food and Drug Administration<br/>"
        "Center for Devices and Radiological Health<br/>"
        "Document Control Center - WO66-G609<br/>"
        "10903 New Hampshire Avenue<br/>"
        "Silver Spring, MD 20993-0002"
    )
    flowables.append(Paragraph(recipient_address, styles['FDA_CoverLetter_Recipient']))
    
    # Subject line
    subject = f"Re: 510(k) Premarket Notification for {device_name}"
    flowables.append(Paragraph(f"<b>{subject}</b>", styles['FDA_Normal']))
    flowables.append(Spacer(1, 0.2 * inch))
    
    # Salutation
    flowables.append(Paragraph("Dear Sir or Madam:", styles['FDA_Normal']))
    flowables.append(Spacer(1, 0.1 * inch))
    
    # Body
    body_text = (
        f"We are hereby submitting this 510(k) Premarket Notification for the {device_name}, "
        f"manufactured by {manufacturer}."
    )
    flowables.append(Paragraph(body_text, styles['FDA_Normal']))
    
    predicate_text = (
        f"We believe that our device is substantially equivalent to "
        f"{predicate_device.get('name', '[PREDICATE DEVICE NAME]')} "
        f"({predicate_device.get('k_number', '[K NUMBER]')})."
    )
    flowables.append(Paragraph(predicate_text, styles['FDA_Normal']))
    
    # Additional paragraphs as needed
    additional_text = (
        "This submission includes all required elements as outlined in 21 CFR 807.87 and follows "
        "FDA guidance for 510(k) submissions. We believe the information provided demonstrates "
        "that the subject device is substantially equivalent to the predicate device and does not "
        "raise different questions of safety and effectiveness."
    )
    flowables.append(Paragraph(additional_text, styles['FDA_Normal']))
    
    # Closing
    flowables.append(Paragraph("Sincerely,", styles['FDA_CoverLetter_Closing']))
    
    # Signature line
    name = contact_info.get('name', '[CONTACT NAME]')
    title = contact_info.get('title', '[TITLE]')
    signature = f"{name}<br/>{title}<br/>{manufacturer}"
    flowables.append(Paragraph(signature, styles['FDA_CoverLetter_Signature']))
    
    return flowables


def create_510k_summary(content: Dict[str, Any]) -> List[Flowable]:
    """
    Create a 510(k) Summary section with FDA-compliant formatting
    
    Args:
        content: Dictionary with content for the 510(k) Summary
        
    Returns:
        A list of ReportLab flowables for the 510(k) Summary
    """
    styles = create_fda_styles()
    flowables = []
    
    # Section title
    flowables.append(Paragraph("510(k) SUMMARY", styles['FDA_Title']))
    
    # Date
    submission_date = content.get('submissionDate', datetime.datetime.now().strftime("%B %d, %Y"))
    flowables.append(Paragraph(f"Date: {submission_date}", styles['FDA_Date']))
    
    # Submitter Information
    flowables.append(Paragraph("1. SUBMITTER", styles['FDA_Section']))
    
    submitter_info = content.get('submitterInfo', {})
    submitter_text = (
        f"Manufacturer: {submitter_info.get('manufacturer', '[MANUFACTURER]')}<br/>"
        f"Address: {submitter_info.get('address', '[ADDRESS]')}<br/>"
        f"Contact Person: {submitter_info.get('contactPerson', '[CONTACT PERSON]')}<br/>"
        f"Phone: {submitter_info.get('phone', '[PHONE]')}<br/>"
        f"Email: {submitter_info.get('email', '[EMAIL]')}"
    )
    flowables.append(Paragraph(submitter_text, styles['FDA_Normal']))
    
    # Device Information
    flowables.append(Paragraph("2. DEVICE", styles['FDA_Section']))
    
    device_info = content.get('deviceInfo', {})
    device_text = (
        f"Trade Name: {device_info.get('tradeName', '[TRADE NAME]')}<br/>"
        f"Common Name: {device_info.get('commonName', '[COMMON NAME]')}<br/>"
        f"Classification Name: {device_info.get('classificationName', '[CLASSIFICATION NAME]')}<br/>"
        f"Regulatory Class: {device_info.get('regulatoryClass', '[CLASS]')}<br/>"
        f"Product Code: {device_info.get('productCode', '[PRODUCT CODE]')}<br/>"
        f"Regulation Number: {device_info.get('regulationNumber', '[REGULATION NUMBER]')}"
    )
    flowables.append(Paragraph(device_text, styles['FDA_Normal']))
    
    # Predicate Device
    flowables.append(Paragraph("3. PREDICATE DEVICE", styles['FDA_Section']))
    
    predicate_info = content.get('predicateInfo', {})
    predicate_text = (
        f"Primary Predicate: {predicate_info.get('name', '[PREDICATE NAME]')} "
        f"(510(k) Number: {predicate_info.get('k_number', '[K NUMBER]')})"
    )
    flowables.append(Paragraph(predicate_text, styles['FDA_Normal']))
    
    # Additional predicates if applicable
    if predicate_info.get('additionalPredicates'):
        add_pred_text = "Additional Predicates:<br/>"
        for pred in predicate_info.get('additionalPredicates', []):
            add_pred_text += f"• {pred.get('name', '[NAME]')} (510(k) Number: {pred.get('k_number', '[K NUMBER]')})<br/>"
        flowables.append(Paragraph(add_pred_text, styles['FDA_Normal']))
    
    # Device Description
    flowables.append(Paragraph("4. DEVICE DESCRIPTION", styles['FDA_Section']))
    description = device_info.get('description', '[DEVICE DESCRIPTION]')
    flowables.append(Paragraph(process_text(description), styles['FDA_Normal']))
    
    # Indications for Use
    flowables.append(Paragraph("5. INDICATIONS FOR USE", styles['FDA_Section']))
    indications = device_info.get('indicationsForUse', '[INDICATIONS FOR USE]')
    flowables.append(Paragraph(process_text(indications), styles['FDA_Normal']))
    
    # Technological Characteristics
    flowables.append(Paragraph("6. TECHNOLOGICAL CHARACTERISTICS", styles['FDA_Section']))
    tech_chars = content.get('technologicalCharacteristics', '[TECHNOLOGICAL CHARACTERISTICS]')
    flowables.append(Paragraph(process_text(tech_chars), styles['FDA_Normal']))
    
    # Substantial Equivalence
    flowables.append(Paragraph("7. SUBSTANTIAL EQUIVALENCE", styles['FDA_Section']))
    
    # Create comparison table
    if 'comparisonTable' in content:
        table_data = content['comparisonTable'].get('rows', [])
        headers = content['comparisonTable'].get('headers', [])
        
        if table_data and headers:
            flowables.append(Paragraph(
                "The following table provides a comparison between the subject device and predicate device:",
                styles['FDA_Normal']
            ))
            table = create_fda_table(table_data, headers)
            flowables.append(table)
    
    # Summary of substantial equivalence
    se_summary = content.get('substantialEquivalenceSummary', 
                            '[SUBSTANTIAL EQUIVALENCE SUMMARY]')
    flowables.append(Paragraph(process_text(se_summary), styles['FDA_Normal']))
    
    # Performance Data
    flowables.append(Paragraph("8. PERFORMANCE DATA", styles['FDA_Section']))
    
    # Non-clinical tests
    flowables.append(Paragraph("Non-Clinical Tests:", styles['FDA_Subheading']))
    if 'nonClinicalTests' in content:
        tests = content['nonClinicalTests']
        if isinstance(tests, list):
            test_items = []
            for test in tests:
                test_items.append(process_text(test))
            flowables.append(create_list_flowable(test_items))
        else:
            flowables.append(Paragraph(process_text(tests), styles['FDA_Normal']))
    else:
        flowables.append(Paragraph("[NON-CLINICAL TEST SUMMARY]", styles['FDA_Normal']))
    
    # Clinical tests if applicable
    flowables.append(Paragraph("Clinical Tests:", styles['FDA_Subheading']))
    clinical_tests = content.get('clinicalTests', 'Clinical testing was not required to demonstrate substantial equivalence.')
    flowables.append(Paragraph(process_text(clinical_tests), styles['FDA_Normal']))
    
    # Conclusion
    flowables.append(Paragraph("9. CONCLUSION", styles['FDA_Section']))
    conclusion = content.get('conclusion', 
                           f"Based on the information provided in this premarket notification, "
                           f"{device_info.get('tradeName', 'the subject device')} is substantially "
                           f"equivalent to the predicate device.")
    flowables.append(Paragraph(process_text(conclusion), styles['FDA_Normal']))
    
    return flowables


def create_510k_indications_for_use(content: Dict[str, Any]) -> List[Flowable]:
    """
    Create an Indications for Use form with FDA-compliant formatting
    
    Args:
        content: Dictionary with content for the Indications for Use
        
    Returns:
        A list of ReportLab flowables for the Indications for Use
    """
    styles = create_fda_styles()
    flowables = []
    
    # Form title
    flowables.append(Paragraph("INDICATIONS FOR USE STATEMENT", styles['FDA_Title']))
    flowables.append(Spacer(1, 0.2 * inch))
    
    # Form header
    flowables.append(Paragraph("510(k) Number: ________________", styles['FDA_Normal']))
    flowables.append(Spacer(1, 0.1 * inch))
    
    # Device name
    device_info = content.get('deviceInfo', {})
    device_name = device_info.get('tradeName', '[DEVICE NAME]')
    flowables.append(Paragraph(f"Device Name: {device_name}", styles['FDA_Normal']))
    flowables.append(Spacer(1, 0.1 * inch))
    
    # Indications for Use
    flowables.append(Paragraph("Indications for Use:", styles['FDA_Subheading']))
    indications = device_info.get('indicationsForUse', '[INDICATIONS FOR USE]')
    flowables.append(Paragraph(process_text(indications), styles['FDA_Normal']))
    flowables.append(Spacer(1, 0.3 * inch))
    
    # Prescription/OTC table
    prescription_data = [
        ["Prescription Use", "X", "AND/OR", "Over-The-Counter Use", " "],
        ["(Part 21 CFR 801 Subpart D)", "", "", "(Part 21 CFR 801 Subpart C)", ""]
    ]
    
    prescription_table = Table(
        prescription_data,
        colWidths=[2.2*inch, 0.4*inch, 0.8*inch, 2.2*inch, 0.4*inch]
    )
    
    prescription_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), FDA_FONTS[DEFAULT_FONT_FAMILY]['normal']),
        ('FONTSIZE', (0, 0), (-1, -1), FDA_NORMAL_FONT_SIZE),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),  # X for Prescription
        ('ALIGN', (4, 0), (4, 0), 'CENTER'),  # X for OTC (if applicable)
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (1, 1), 0.25, colors.black),
        ('GRID', (3, 0), (4, 1), 0.25, colors.black),
        ('SPAN', (0, 0), (0, 1)),
        ('SPAN', (3, 0), (3, 1)),
    ]))
    
    flowables.append(prescription_table)
    flowables.append(Spacer(1, 0.5 * inch))
    
    # CDRH section
    flowables.append(Paragraph("PLEASE DO NOT WRITE BELOW THIS LINE – CONTINUE ON A SEPARATE PAGE IF NEEDED.", styles['FDA_Normal']))
    flowables.append(Paragraph("FOR FDA USE ONLY", styles['FDA_Subheading']))
    flowables.append(Spacer(1, 0.5 * inch))
    
    # Concurrence signature line
    flowables.append(Paragraph("Concurrence of Center for Devices and Radiological Health (CDRH)", styles['FDA_Normal']))
    flowables.append(Spacer(1, 0.5 * inch))
    
    # Signature line
    signature_table = Table([
        ["", ""],
        ["_______________________________________", "__________________"],
        ["Signature", "Date"]
    ], colWidths=[4*inch, 2*inch])
    
    signature_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), FDA_FONTS[DEFAULT_FONT_FAMILY]['normal']),
        ('FONTSIZE', (0, 0), (-1, -1), FDA_NORMAL_FONT_SIZE),
        ('ALIGN', (0, 1), (-1, 2), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    
    flowables.append(signature_table)
    
    return flowables


def generate_510k_pdf(content: Dict[str, Any], output_path: str) -> bool:
    """
    Generate a 510(k) submission PDF with FDA-compliant formatting
    
    Args:
        content: Dictionary with content for the 510(k) submission
        output_path: Path where the PDF will be saved
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Get document metadata
        device_info = content.get('deviceInfo', {})
        doc_title = f"510(k) for {device_info.get('tradeName', 'Medical Device')}"
        doc_id = f"K{datetime.datetime.now().strftime('%y%m%d')}"
        submission_date = content.get('submissionDate', datetime.datetime.now().strftime("%B %d, %Y"))
        
        # Create the document template
        doc = FDADocTemplate(
            output_path,
            doc_title=doc_title,
            doc_id=doc_id,
            submission_date=submission_date
        )
        
        # Create styles
        styles = create_fda_styles()
        
        # Build story (document content)
        story = []
        
        # Title page
        story.append(Paragraph("510(k) PREMARKET NOTIFICATION", styles['FDA_Title']))
        story.append(Spacer(1, 0.2 * inch))
        
        device_name = device_info.get('tradeName', '[DEVICE NAME]')
        story.append(Paragraph(f"For {device_name}", styles['FDA_Subtitle']))
        story.append(Spacer(1, 0.2 * inch))
        
        manufacturer = content.get('submitterInfo', {}).get('manufacturer', '[MANUFACTURER]')
        story.append(Paragraph(f"Submitted by:<br/>{manufacturer}", styles['FDA_Normal']))
        story.append(Spacer(1, 0.3 * inch))
        
        story.append(Paragraph(f"Date: {submission_date}", styles['FDA_Date']))
        story.append(PageBreak())
        
        # Table of Contents
        toc = TableOfContents()
        toc.levelStyles = [
            ParagraphStyle(name='TOC1', 
                          fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['bold'],
                          fontSize=12,
                          leftIndent=0,
                          firstLineIndent=0),
            ParagraphStyle(name='TOC2', 
                          fontName=FDA_FONTS[DEFAULT_FONT_FAMILY]['normal'],
                          fontSize=12,
                          leftIndent=0.25*inch,
                          firstLineIndent=0)
        ]
        
        story.append(Paragraph("TABLE OF CONTENTS", styles['FDA_Title']))
        story.append(toc)
        story.append(PageBreak())
        
        # Cover Letter
        doc.set_section("Cover Letter")
        story.append(Paragraph("Cover Letter", styles['FDA_Title']))
        
        contact_info = content.get('submitterInfo', {})
        predicate_info = content.get('predicateInfo', {})
        
        cover_letter_content = create_510k_cover_letter(
            device_name=device_name,
            manufacturer=manufacturer,
            contact_info=contact_info,
            predicate_device=predicate_info,
            submission_date=submission_date
        )
        
        story.extend(cover_letter_content)
        story.append(PageBreak())
        
        # Indications for Use
        doc.set_section("Indications for Use")
        ifu_content = create_510k_indications_for_use(content)
        story.extend(ifu_content)
        story.append(PageBreak())
        
        # 510(k) Summary
        doc.set_section("510(k) Summary")
        summary_content = create_510k_summary(content)
        story.extend(summary_content)
        story.append(PageBreak())
        
        # Additional sections if present in content
        if 'additionalSections' in content:
            for section in content['additionalSections']:
                if 'title' in section and 'content' in section:
                    doc.set_section(section['title'])
                    story.append(Paragraph(section['title'], styles['FDA_Title']))
                    
                    if isinstance(section['content'], list):
                        for item in section['content']:
                            if isinstance(item, dict):
                                if 'heading' in item:
                                    story.append(Paragraph(item['heading'], styles['FDA_Subheading']))
                                
                                if 'text' in item:
                                    story.append(Paragraph(process_text(item['text']), styles['FDA_Normal']))
                                
                                if 'table' in item and isinstance(item['table'], dict):
                                    headers = item['table'].get('headers', [])
                                    rows = item['table'].get('rows', [])
                                    if headers and rows:
                                        table = create_fda_table(rows, headers)
                                        story.append(table)
                            elif isinstance(item, str):
                                story.append(Paragraph(process_text(item), styles['FDA_Normal']))
                    else:
                        story.append(Paragraph(process_text(section['content']), styles['FDA_Normal']))
                    
                    story.append(PageBreak())
        
        # Build the PDF
        doc.build(story)
        
        logger.info(f"Successfully generated FDA-compliant 510(k) PDF: {output_path}")
        return True
    except Exception as e:
        logger.error(f"Error generating 510(k) PDF: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False


def main():
    """
    Main entry point for the script.
    
    Usage:
        python fda_pdf_generator.py input.json output.pdf
    """
    if len(sys.argv) != 3:
        print("Usage: python fda_pdf_generator.py input.json output.pdf")
        return 1
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    if not os.path.exists(input_path):
        logger.error(f"Input file not found: {input_path}")
        return 1
    
    try:
        with open(input_path, 'r') as f:
            content = json.load(f)
        
        # Check if this is a 510(k) submission
        if 'title' in content and '510(k)' in content['title']:
            success = generate_510k_pdf(content, output_path)
        else:
            # Other document types can be handled here
            logger.error("Unsupported document type. Only 510(k) documents are currently supported.")
            return 1
        
        if success:
            return 0
        else:
            return 1
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return 1


if __name__ == "__main__":
    sys.exit(main())