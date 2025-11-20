from fpdf import FPDF
import time
import os
import sys
import json

def deep_clean(text):
    """Clean text of Unicode characters that might cause issues in the PDF"""
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

def generate_restore_report(protocol_id, version_id, restored_data):
    """
    Generate a PDF report documenting a protocol version restoration
    
    Args:
        protocol_id: The protocol identifier
        version_id: The version identifier of the restored protocol
        restored_data: The restored protocol data
        
    Returns:
        Path to the generated PDF file
    """
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
    
    class RestoredPDF(FPDF):
        def header(self):
            self.set_font("Arial", "B", 14)
            self.cell(0, 10, deep_clean(f"Protocol Restoration Report - {protocol_id}"), ln=True, align="C")
            self.set_font("Arial", "I", 10)
            self.cell(0, 5, deep_clean(f"Restored to version {version_id}"), ln=True, align="C")
            self.ln(5)

        def section(self, title, content):
            self.set_font("Arial", "B", 12)
            self.cell(0, 10, deep_clean(title), ln=True)
            self.ln(1)
            self.set_font("Arial", "", 11)
            self.multi_cell(0, 8, deep_clean(content))
            self.ln(2)

    pdf = RestoredPDF()
    pdf.add_page()

    # Metadata section
    pdf.section("Restoration Metadata", f"""
    - Protocol ID: {protocol_id}
    - Restored Version: {version_id}
    - Restoration Date: {timestamp}
    - Restoration Type: Manual version restoration
    """)

    # Protocol details section
    if isinstance(restored_data, dict):
        parsed_data = restored_data.get('parsed', {})
        if parsed_data:
            protocol_details = []
            
            # Add key protocol details
            if 'indication' in parsed_data:
                protocol_details.append(f"Indication: {parsed_data['indication']}")
            if 'phase' in parsed_data:
                protocol_details.append(f"Phase: {parsed_data['phase']}")
            if 'sample_size' in parsed_data:
                protocol_details.append(f"Sample Size: {parsed_data['sample_size']}")
            if 'duration_weeks' in parsed_data:
                protocol_details.append(f"Duration: {parsed_data['duration_weeks']} weeks")
            if 'endpoint_primary' in parsed_data:
                protocol_details.append(f"Primary Endpoint: {parsed_data['endpoint_primary']}")
            
            if protocol_details:
                pdf.section("Restored Protocol Details", "\n".join(protocol_details))
        
        # Add prediction if available
        if 'prediction' in restored_data:
            prediction_percent = restored_data['prediction'] * 100
            pdf.section("Success Prediction", f"The restored protocol version has a predicted success probability of {prediction_percent:.1f}%.")
        
        # Add SAP if available
        if 'sap' in restored_data:
            pdf.section("Restored Statistical Analysis Plan", restored_data['sap'])

    # Regulatory notes
    pdf.section("Regulatory Notes", """
    This document certifies that a previous version of the protocol has been restored.
    
    In accordance with ICH E6(R2) guidelines, this restoration has been documented with
    all relevant metadata and details for audit trail purposes. The restored version
    should be reviewed carefully before proceeding with any regulatory submissions.
    """)

    # Ensure the directory exists
    reports_dir = os.path.join('temp', 'reports')
    os.makedirs(reports_dir, exist_ok=True)
    
    timestamp = int(time.time())
    pdf_filename = f"Protocol_Restore_Report_{protocol_id}_{version_id}_{timestamp}.pdf"
    pdf_path = os.path.join(reports_dir, pdf_filename)
    
    pdf.output(pdf_path)
    return pdf_path

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python generate_restore_report.py <protocol_id> <version_id> <restored_data_json_file>")
        sys.exit(1)
        
    protocol_id = sys.argv[1]
    version_id = sys.argv[2]
    restored_data_file = sys.argv[3]
    
    with open(restored_data_file, 'r') as f:
        restored_data = json.load(f)
        
    pdf_path = generate_restore_report(protocol_id, version_id, restored_data)
    print(f"Restoration report generated: {pdf_path}")