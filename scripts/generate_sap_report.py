from fpdf import FPDF
import time
import os
import sys
import json

def deep_clean(text):
    if not isinstance(text, str):
        return str(text)
        
    return (
        text.replace("–", "-")
            .replace("'", "'")
            .replace(""", '"')
            .replace(""", '"')
            .replace("≥", ">=")
            .replace("•", "-")
            .replace("–", "-")
    )

def generate_sap_report(protocol_id, version_id, sap_text, protocol_data=None):
    """
    Generate a PDF report of the Statistical Analysis Plan
    
    Args:
        protocol_id: The protocol identifier
        version_id: The version identifier
        sap_text: The generated SAP text
        protocol_data: Optional additional protocol data for context
    
    Returns:
        Path to the generated PDF file
    """
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
    
    class SapReportPDF(FPDF):
        def header(self):
            self.set_font("Arial", "B", 14)
            self.cell(0, 10, deep_clean(f"Statistical Analysis Plan - {protocol_id} ({version_id})"), ln=True, align="C")
            self.ln(5)

        def section(self, title, content):
            self.set_font("Arial", "B", 12)
            self.cell(0, 10, deep_clean(title), ln=True)
            self.ln(1)
            self.set_font("Arial", "", 11)
            self.multi_cell(0, 8, deep_clean(content))
            self.ln(2)

    pdf = SapReportPDF()
    pdf.add_page()

    pdf.section("SAP Metadata", f"""
    - Protocol ID: {protocol_id}
    - Version: {version_id}
    - Generated: {timestamp}
    """)

    # Add protocol context if available
    if protocol_data:
        indication = protocol_data.get('indication', 'N/A')
        phase = protocol_data.get('phase', 'N/A')
        sample_size = protocol_data.get('sample_size', 'N/A')
        duration_weeks = protocol_data.get('duration_weeks', 'N/A')
        
        pdf.section("Protocol Context", f"""
        - Indication: {indication}
        - Phase: {phase}
        - Sample Size: {sample_size}
        - Duration: {duration_weeks} weeks
        """)

    # Add the main SAP content
    pdf.section("Statistical Analysis Plan", sap_text)

    # Add regulatory notes
    pdf.section("Regulatory Notes", """
    This SAP is auto-generated and should be reviewed by a qualified statistician before finalization.
    
    In accordance with ICH E9 guidelines, this document outlines the statistical methods to be implemented
    for analysis of efficacy and safety data. Any deviations from this plan should be documented
    with appropriate justification in the final Clinical Study Report.
    """)

    # Ensure the directory exists
    reports_dir = os.path.join('temp', 'reports')
    os.makedirs(reports_dir, exist_ok=True)
    
    timestamp = int(time.time())
    pdf_filename = f"SAP_Report_{protocol_id}_{version_id}_{timestamp}.pdf"
    pdf_path = os.path.join(reports_dir, pdf_filename)
    
    pdf.output(pdf_path)
    return pdf_path

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python generate_sap_report.py <protocol_id> <version_id> <sap_text_file> [protocol_json_file]")
        sys.exit(1)
        
    protocol_id = sys.argv[1]
    version_id = sys.argv[2]
    sap_text_file = sys.argv[3]
    
    with open(sap_text_file, 'r') as f:
        sap_text = f.read()
    
    protocol_data = None
    if len(sys.argv) > 4:
        protocol_json_file = sys.argv[4]
        with open(protocol_json_file, 'r') as f:
            protocol_data = json.load(f)
        
    pdf_path = generate_sap_report(protocol_id, version_id, sap_text, protocol_data)
    print(f"Report generated: {pdf_path}")