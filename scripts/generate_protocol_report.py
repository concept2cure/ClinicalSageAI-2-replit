#!/usr/bin/env python3
"""
Protocol Report Generator Script
This script generates a PDF report from protocol analysis results
"""

import sys
import os
import json
import argparse
from datetime import datetime
from fpdf import FPDF

# Clean utility for PDF text
def clean_unicode_for_pdf(text):
    """Clean text of problematic Unicode characters for PDF generation"""
    if not text:
        return ""
    
    # Replace problematic characters
    replacements = {
        "–": "-",  # en dash
        "—": "-",  # em dash
        "'": "'",  # curly quote
        "'": "'",  # curly quote
        """: '"',  # curly quote
        """: '"',  # curly quote
        "≥": ">=",
        "≤": "<=",
        "±": "+/-",
        "°": " degrees ",
        "…": "...",
        "→": "->",
        "⁄": "/",
        "≠": "!=",
        "≈": "~=",
        "×": "x",
        "÷": "/",
        "•": "*",
        "·": "*",
        "α": "alpha",
        "β": "beta",
        "μ": "mu",
        "σ": "sigma",
        "Δ": "Delta",
        "©": "(c)",
        "®": "(R)",
        "™": "(TM)",
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    # Remove any remaining non-ASCII characters
    text = ''.join(c if ord(c) < 128 else ' ' for c in text)
    
    return text

# PDF class with header and utility functions
class ProtocolReportPDF(FPDF):
    def __init__(self, protocol_id, title=None):
        super().__init__()
        self.protocol_id = clean_unicode_for_pdf(str(protocol_id))
        self.title = clean_unicode_for_pdf(title) if title else f"Protocol Analysis Report {protocol_id}"
        self.set_auto_page_break(auto=True, margin=15)
    
    def header(self):
        # Logo (if exists)
        logo_path = os.path.join(os.getcwd(), 'assets', 'logo.png')
        if os.path.exists(logo_path):
            self.image(logo_path, 10, 8, 30)
            self.cell(40)
        
        # Title
        self.set_font('Arial', 'B', 14)
        self.cell(0, 10, self.title, 0, 1, 'C')
        
        # Subtitle with date
        self.set_font('Arial', 'I', 10)
        date_str = datetime.now().strftime('%Y-%m-%d')
        self.cell(0, 5, f"Generated on {date_str}", 0, 1, 'C')
        
        # Line break
        self.ln(10)
    
    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')
    
    def add_section_title(self, title):
        self.set_font('Arial', 'B', 12)
        self.set_fill_color(230, 230, 230)
        self.cell(0, 8, clean_unicode_for_pdf(title), 0, 1, 'L', True)
        self.ln(4)
    
    def add_subsection_title(self, title):
        self.set_font('Arial', 'B', 11)
        self.cell(0, 6, clean_unicode_for_pdf(title), 0, 1, 'L')
        self.ln(2)
    
    def add_paragraph(self, text):
        self.set_font('Arial', '', 10)
        self.multi_cell(0, 5, clean_unicode_for_pdf(text))
        self.ln(3)
    
    def add_bullet_list(self, items):
        self.set_font('Arial', '', 10)
        for item in items:
            clean_item = clean_unicode_for_pdf(item)
            self.cell(5, 5, '•', 0, 0)
            self.multi_cell(0, 5, clean_item)
        self.ln(3)
    
    def add_key_value_table(self, data):
        self.set_font('Arial', '', 10)
        col_width = 85
        line_height = 6
        
        for key, value in data.items():
            clean_key = clean_unicode_for_pdf(key)
            clean_value = clean_unicode_for_pdf(str(value))
            
            self.set_font('Arial', 'B', 10)
            self.cell(col_width, line_height, clean_key, 0, 0)
            
            self.set_font('Arial', '', 10)
            self.multi_cell(0, line_height, clean_value)
        
        self.ln(3)
    
    def add_risk_indicator(self, title, risk_value, color_map, description=None):
        clean_title = clean_unicode_for_pdf(title)
        self.set_font('Arial', 'B', 10)
        self.cell(80, 6, clean_title, 0, 0)
        
        # Draw risk bar
        self.set_draw_color(200, 200, 200)
        self.set_fill_color(240, 240, 240)
        self.rect(80, self.get_y(), 80, 6, 'DF')  # Draw gray background
        
        # Calculate color based on risk_value
        if isinstance(color_map, list):
            # Linear interpolation between colors
            if risk_value <= 0:
                fill_color = color_map[0]
            elif risk_value >= 1:
                fill_color = color_map[-1]
            else:
                idx = risk_value * (len(color_map) - 1)
                base_idx = int(idx)
                frac = idx - base_idx
                
                if base_idx + 1 < len(color_map):
                    r = int(color_map[base_idx][0] + frac * (color_map[base_idx + 1][0] - color_map[base_idx][0]))
                    g = int(color_map[base_idx][1] + frac * (color_map[base_idx + 1][1] - color_map[base_idx][1]))
                    b = int(color_map[base_idx][2] + frac * (color_map[base_idx + 1][2] - color_map[base_idx][2]))
                    fill_color = (r, g, b)
                else:
                    fill_color = color_map[base_idx]
        else:
            # Use predefined colors based on thresholds
            if risk_value < 0.25:
                fill_color = color_map.get("low", (0, 150, 0))  # Green
            elif risk_value < 0.5:
                fill_color = color_map.get("medium_low", (150, 150, 0))  # Yellow
            elif risk_value < 0.75:
                fill_color = color_map.get("medium_high", (200, 100, 0))  # Orange
            else:
                fill_color = color_map.get("high", (200, 0, 0))  # Red
        
        self.set_fill_color(*fill_color)
        self.rect(80, self.get_y(), 80 * risk_value, 6, 'F')  # Draw colored fill
        
        # Add percentage text
        self.set_font('Arial', '', 8)
        percent_text = f"{int(risk_value * 100)}%"
        self.set_xy(80 + 40 - len(percent_text), self.get_y() + 1)  # Center the percentage
        self.cell(len(percent_text) * 2, 4, percent_text, 0, 0, 'C')
        
        self.ln(8)
        
        # Add description if provided
        if description:
            self.set_font('Arial', 'I', 8)
            self.set_x(80)
            self.multi_cell(80, 4, clean_unicode_for_pdf(description))
            self.ln(2)
        
        self.ln(2)
    
    def add_comparison_table(self, headers, rows, widths=None):
        self.set_font('Arial', 'B', 10)
        
        # Calculate widths if not provided
        if not widths:
            total_width = self.w - 2 * self.l_margin
            widths = [total_width / len(headers)] * len(headers)
        
        # Headers
        for i, header in enumerate(headers):
            self.cell(widths[i], 7, clean_unicode_for_pdf(header), 1, 0, 'C', True)
        self.ln()
        
        # Data rows
        self.set_font('Arial', '', 10)
        for row in rows:
            for i, cell in enumerate(row):
                cell_text = clean_unicode_for_pdf(str(cell))
                self.cell(widths[i], 6, cell_text, 1, 0, 'L')
            self.ln()
        
        self.ln(5)

def generate_protocol_report(analysis_data, output_path):
    """Generate a PDF report from protocol analysis data"""
    # Extract necessary data
    protocol_id = analysis_data["protocol_id"]
    protocol_data = analysis_data["extracted_data"]
    risk_flags = analysis_data["risk_flags"]
    csr_matches = analysis_data["csr_matches"]
    risk_scores = analysis_data["risk_scores"]
    strategic_insights = analysis_data["strategic_insights"]
    recommendation_summary = analysis_data["recommendation_summary"]
    
    # Create PDF
    title = f"Protocol Analysis Report: {protocol_data['title']}"
    pdf = ProtocolReportPDF(protocol_id, title)
    pdf.add_page()
    
    # Protocol Summary
    pdf.add_section_title("Protocol Summary")
    
    summary_data = {
        "Title": protocol_data.get("title", "Untitled Protocol"),
        "Indication": protocol_data.get("indication", "N/A"),
        "Phase": protocol_data.get("phase", "N/A"),
        "Sample Size": protocol_data.get("sample_size", "N/A"),
        "Duration": f"{protocol_data.get('duration_weeks', 'N/A')} weeks",
        "Dropout Rate": f"{protocol_data.get('dropout_rate', 0) * 100:.1f}%",
        "Study Design": protocol_data.get("study_design", "N/A"),
        "Blinding": protocol_data.get("blinding", "N/A")
    }
    
    pdf.add_key_value_table(summary_data)
    
    # Add study arms if available
    if protocol_data.get("arms"):
        pdf.add_subsection_title("Study Arms")
        pdf.add_bullet_list(protocol_data["arms"])
    
    # Add primary endpoints if available
    if protocol_data.get("primary_endpoints"):
        pdf.add_subsection_title("Primary Endpoints")
        pdf.add_bullet_list(protocol_data["primary_endpoints"])
    
    # Add secondary endpoints if available
    if protocol_data.get("secondary_endpoints"):
        pdf.add_subsection_title("Secondary Endpoints")
        pdf.add_bullet_list(protocol_data["secondary_endpoints"])
    
    # Success Prediction
    pdf.add_section_title("Success Prediction")
    
    # Success probability
    success_prob = risk_scores["success_probability"]
    success_color_map = [(200, 0, 0), (200, 150, 0), (0, 150, 0)]  # Red to Green
    pdf.add_risk_indicator(
        "Success Probability", 
        success_prob, 
        success_color_map,
        f"Based on ML analysis of sample size, duration, and dropout rate"
    )
    
    # Risk Scores
    pdf.add_subsection_title("Risk Profile")
    
    # Dropout risk
    dropout_risk = risk_scores["dropout_risk"]
    dropout_color_map = [(0, 150, 0), (200, 150, 0), (200, 0, 0)]  # Green to Red (inverted)
    pdf.add_risk_indicator(
        "Dropout Risk", 
        dropout_risk, 
        dropout_color_map,
        f"Risk of exceeding planned dropout rate"
    )
    
    # Regulatory alignment
    reg_alignment = risk_scores["regulatory_alignment"]
    reg_color_map = [(200, 0, 0), (200, 150, 0), (0, 150, 0)]  # Red to Green
    pdf.add_risk_indicator(
        "Regulatory Alignment", 
        reg_alignment,
        reg_color_map,
        f"Alignment with regulatory precedent for this indication and phase"
    )
    
    # Innovation index
    innovation = risk_scores["innovation_index"]
    innov_color_map = [(100, 100, 100), (0, 100, 200)]  # Gray to Blue
    pdf.add_risk_indicator(
        "Innovation Index", 
        innovation,
        innov_color_map,
        f"Degree of innovation in trial design compared to precedent"
    )
    
    # Competitive edge
    comp_edge = risk_scores["competitive_edge"]
    comp_color_map = [(100, 100, 100), (0, 150, 0)]  # Gray to Green
    pdf.add_risk_indicator(
        "Competitive Edge", 
        comp_edge,
        comp_color_map,
        f"Potential advantage over similar trials"
    )
    
    # Risk Flags
    pdf.add_subsection_title("Risk Flags")
    
    # Convert risk flags to human-readable text
    flag_descriptions = []
    if risk_flags["underpowered"]:
        flag_descriptions.append("⚠️ Sample size may be underpowered based on CSR precedent")
    if risk_flags["endpoint_risk"]:
        flag_descriptions.append("⚠️ Selected endpoints differ from regulatory precedent")
    if risk_flags["duration_mismatch"]:
        flag_descriptions.append("⚠️ Trial duration significantly differs from CSR precedent")
    if risk_flags["high_dropout"]:
        flag_descriptions.append("⚠️ Dropout rate may be underestimated based on similar trials")
    if risk_flags["design_issues"]:
        flag_descriptions.append("⚠️ Potential issues with study design identified")
    if risk_flags["innovative_approach"]:
        flag_descriptions.append("💡 Innovative approach detected - monitor regulatory acceptance")
    
    if flag_descriptions:
        pdf.add_bullet_list(flag_descriptions)
    else:
        pdf.add_paragraph("No significant risk flags detected in this protocol design.")
    
    # CSR Benchmark Comparison
    pdf.add_section_title("CSR Benchmark Comparison")
    
    # Display similar trials in a table
    if csr_matches:
        pdf.add_subsection_title("Similar Trials")
        
        # Define table structure
        headers = ["Sponsor", "Indication", "Phase", "Outcome", "Similarity"]
        rows = []
        
        # Add data rows (limit to 5 trials)
        for trial in csr_matches[:5]:
            # Format similarity as percentage
            similarity = f"{int(trial['similarity_score'] * 100)}%"
            
            # Add outcome with color indicator
            outcome = trial["outcome"]
            
            rows.append([
                trial["sponsor"],
                trial["indication"],
                trial["phase"],
                outcome,
                similarity
            ])
        
        # Set column widths (adjust as needed)
        widths = [40, 50, 25, 30, 25]
        
        pdf.add_comparison_table(headers, rows, widths)
    
    # Strategic Insights
    pdf.add_section_title("Strategic Insights")
    
    if strategic_insights:
        pdf.add_bullet_list(strategic_insights)
    else:
        pdf.add_paragraph("No specific strategic insights available for this protocol.")
    
    # Recommendations
    pdf.add_section_title("Recommendations")
    
    pdf.add_paragraph(recommendation_summary)
    
    # Save the PDF
    pdf.output(output_path)
    
    return output_path

def main():
    parser = argparse.ArgumentParser(description="Generate a PDF report from protocol analysis data")
    parser.add_argument("input_file", help="Path to protocol analysis JSON file")
    parser.add_argument("output_file", help="Path to output PDF file")
    
    args = parser.parse_args()
    
    # Load analysis data
    with open(args.input_file, 'r', encoding='utf-8') as f:
        analysis_data = json.load(f)
    
    # Generate report
    output_path = generate_protocol_report(analysis_data, args.output_file)
    
    print(f"Protocol report generated successfully. Saved to {output_path}")

if __name__ == "__main__":
    main()