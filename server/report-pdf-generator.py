from fpdf import FPDF
import json
import os
import sys
import time

# Function to clean text by removing or replacing problematic characters
def clean_text(text):
    if isinstance(text, str):
        return text.replace("–", "-").replace("'", "'").replace(""", '"').replace(""", '"').replace("≥", ">=")
    return text

def generate_pdf(report_json_path, output_pdf_path):
    """
    Generate a PDF report from a strategic intelligence report JSON file
    
    Args:
        report_json_path (str): Path to the JSON file containing the report data
        output_pdf_path (str): Path where the PDF should be saved
    
    Returns:
        str: Path to the generated PDF file
    """
    try:
        # Load report data from JSON
        with open(report_json_path, 'r') as f:
            report_data = json.load(f)
        
        protocol_id = report_data.get('protocol_id', 'Unknown Protocol')
        generated_on = report_data.get('generated_on', time.strftime('%Y-%m-%d'))
        sections = report_data.get('sections', [])
        
        # Create PDF
        pdf = FPDF()
        pdf.add_page()
        
        # Header
        pdf.set_font("Arial", "B", 16)
        pdf.cell(0, 10, clean_text(f"TrialSage Strategic Intelligence Report"), ln=True, align="C")
        
        # Protocol information
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 10, clean_text(f"Protocol ID: {protocol_id}"), ln=True)
        pdf.set_font("Arial", "", 10)
        pdf.cell(0, 6, clean_text(f"Generated on: {generated_on}"), ln=True)
        pdf.line(10, pdf.get_y() + 2, 200, pdf.get_y() + 2)
        pdf.ln(5)
        
        # Generate sections
        for section in sections:
            # Section title
            pdf.set_font("Arial", "B", 12)
            pdf.cell(0, 10, clean_text(section.get('title', 'Untitled Section')), ln=True)
            
            # Section content
            if 'content' in section:
                pdf.set_font("Arial", "", 11)
                pdf.multi_cell(0, 6, clean_text(section['content']))
                pdf.ln(2)
            
            # Table content
            if 'table' in section and section['table']:
                # Get all column names from the first row
                columns = list(section['table'][0].keys())
                
                # Header row
                pdf.set_font("Arial", "B", 10)
                col_width = 190 / len(columns)
                for col in columns:
                    pdf.cell(col_width, 8, clean_text(col.replace('_', ' ').title()), border=1)
                pdf.ln()
                
                # Data rows
                pdf.set_font("Arial", "", 10)
                for row in section['table']:
                    for col in columns:
                        value = str(row.get(col, ''))
                        pdf.cell(col_width, 8, clean_text(value), border=1)
                    pdf.ln()
                
                pdf.ln(4)
            
            # Bullet points
            if 'bullets' in section and section['bullets']:
                pdf.set_font("Arial", "", 11)
                for bullet in section['bullets']:
                    bullet_text = f"• {clean_text(bullet)}"
                    pdf.cell(10, 6, "")  # Indent
                    pdf.multi_cell(0, 6, bullet_text)
                pdf.ln(2)
            
            # Add spacing between sections
            pdf.ln(4)
        
        # Footer
        pdf.set_y(-15)
        pdf.set_font("Arial", "I", 8)
        pdf.cell(0, 10, f"TrialSage Strategic Intelligence Report - Generated via AI-powered analysis", 0, 0, "C")
        
        # Output PDF
        pdf.output(output_pdf_path)
        
        return output_pdf_path
        
    except Exception as e:
        print(f"Error generating PDF: {str(e)}")
        return None

# If run directly from command line
if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python report-pdf-generator.py <input_json_path> <output_pdf_path>")
        sys.exit(1)
    
    input_json_path = sys.argv[1]
    output_pdf_path = sys.argv[2]
    
    result = generate_pdf(input_json_path, output_pdf_path)
    
    if result:
        print(f"PDF successfully generated at: {result}")
    else:
        print("Failed to generate PDF")
        sys.exit(1)