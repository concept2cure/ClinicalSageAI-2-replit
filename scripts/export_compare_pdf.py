#!/usr/bin/env python3
"""
Protocol Version Comparison PDF Generator

Generates side-by-side PDF comparisons of protocol versions with 
success probability, parameter changes, and key metrics
"""

from fpdf import FPDF
import os
import json
import sys
import time
from datetime import datetime

# Create necessary directories if they don't exist
os.makedirs("data/exports", exist_ok=True)

def clean_text(text):
    """Clean text for PDF compatibility"""
    if not isinstance(text, str):
        text = str(text)
    return text.replace("–", "-").replace("'", "'").replace("≥", ">=").replace("•", "-")

class ComparePDF(FPDF):
    """PDF class for protocol comparison reports"""
    
    def header(self):
        """Add report header"""
        self.set_font("Arial", "B", 14)
        self.cell(0, 10, f"Protocol Version Comparison – {self.protocol_id}", ln=True, align="C")
        self.ln(5)
    
    def row(self, label, val1, val2):
        """Add a comparison row to the PDF"""
        self.set_font("Arial", "", 11)
        self.cell(60, 8, label, border=1)
        self.cell(65, 8, str(val1), border=1)
        self.cell(65, 8, str(val2), border=1)
        self.ln()

def generate_comparison_pdf(input_data):
    """Generate PDF from input data"""
    
    # Parse input data
    protocol_id = input_data.get("protocol_id", "Unknown Protocol")
    v1 = input_data.get("v1", {})
    v2 = input_data.get("v2", {})
    
    # Create PDF
    pdf = ComparePDF()
    pdf.protocol_id = protocol_id
    pdf.add_page()
    
    # Add version headers
    pdf.set_font("Arial", "B", 12)
    pdf.cell(60, 8, "Parameter", border=1)
    pdf.cell(65, 8, v1.get("version", "Version 1"), border=1)
    pdf.cell(65, 8, v2.get("version", "Version 2"), border=1)
    pdf.ln()
    
    # Get parsed data
    v1_data = v1.get("data", {}).get("parsed", {})
    v2_data = v2.get("data", {}).get("parsed", {})
    
    # Add protocol parameters comparison
    fields = ["sample_size", "duration_weeks", "dropout_rate", "endpoint_primary"]
    field_labels = {
        "sample_size": "Sample Size",
        "duration_weeks": "Duration (weeks)",
        "dropout_rate": "Dropout Rate",
        "endpoint_primary": "Primary Endpoint",
    }
    
    for field in fields:
        label = field_labels.get(field, field.replace("_", " ").title())
        val1 = v1_data.get(field, "N/A")
        val2 = v2_data.get(field, "N/A")
        
        # Format dropout rate as percentage
        if field == "dropout_rate" and isinstance(val1, (int, float)):
            val1 = f"{val1 * 100:.1f}%"
        if field == "dropout_rate" and isinstance(val2, (int, float)):
            val2 = f"{val2 * 100:.1f}%"
            
        pdf.row(label, val1, val2)
    
    # Add success probability
    v1_prediction = v1.get("data", {}).get("prediction", 0)
    v2_prediction = v2.get("data", {}).get("prediction", 0)
    
    if isinstance(v1_prediction, (int, float)) and isinstance(v2_prediction, (int, float)):
        pdf.row("Success Probability (%)", 
                f"{v1_prediction * 100:.1f}%", 
                f"{v2_prediction * 100:.1f}%")
        
        # Calculate and show delta
        delta = v2_prediction - v1_prediction
        delta_text = f"{delta * 100:+.1f}%" if delta != 0 else "No change"
        
        pdf.set_font("Arial", "B", 11)
        pdf.cell(60, 8, "Success Probability Δ:", border=1)
        
        # Color code the change (green for positive, red for negative)
        if delta > 0.05:
            pdf.set_text_color(0, 128, 0)  # Dark green
        elif delta < -0.05:
            pdf.set_text_color(192, 0, 0)  # Dark red
        else:
            pdf.set_text_color(0, 0, 0)    # Black
            
        pdf.cell(130, 8, delta_text, border=1)
        pdf.set_text_color(0, 0, 0)  # Reset text color
        pdf.ln()
    
    # Add benchmarks if available
    v1_benchmarks = v1.get("data", {}).get("benchmarks", {})
    v2_benchmarks = v2.get("data", {}).get("benchmarks", {})
    
    if v1_benchmarks or v2_benchmarks:
        pdf.ln(5)
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 10, "Benchmark Comparison", ln=True)
        
        # Use v2 benchmarks as primary reference
        benchmark_data = v2_benchmarks if v2_benchmarks else v1_benchmarks
        
        if benchmark_data:
            pdf.set_font("Arial", "", 10)
            pdf.multi_cell(0, 6, f"Based on {benchmark_data.get('total_trials', 'N/A')} similar trials in the indication/phase")
            
            # Add benchmark metrics
            pdf.ln(2)
            pdf.set_font("Arial", "B", 11)
            pdf.cell(60, 8, "Benchmark Metric", border=1)
            pdf.cell(65, 8, v1.get("version", "Version 1"), border=1)
            pdf.cell(65, 8, v2.get("version", "Version 2"), border=1)
            pdf.ln()
            
            # Sample size vs benchmark
            v1_sample = v1_data.get("sample_size", 0)
            v2_sample = v2_data.get("sample_size", 0)
            median_sample = benchmark_data.get("median_sample_size", 0)
            
            pdf.set_font("Arial", "", 10)
            pdf.cell(60, 8, "Sample Size vs Benchmark", border=1)
            
            # Calculate and format comparison to benchmark
            if median_sample > 0:
                v1_pct = (v1_sample / median_sample) * 100 if v1_sample else 0
                v2_pct = (v2_sample / median_sample) * 100 if v2_sample else 0
                
                pdf.cell(65, 8, f"{v1_pct:.1f}% of median", border=1)
                pdf.cell(65, 8, f"{v2_pct:.1f}% of median", border=1)
            else:
                pdf.cell(65, 8, "N/A", border=1)
                pdf.cell(65, 8, "N/A", border=1)
            pdf.ln()
    
    # Add recommendations section
    pdf.ln(5)
    pdf.set_font("Arial", "B", 12)
    pdf.cell(0, 10, "Strategic Assessment", ln=True)
    
    # Analyze changes based on success probability and parameter changes
    changes = []
    
    # Sample size change
    v1_sample = v1_data.get("sample_size", 0)
    v2_sample = v2_data.get("sample_size", 0)
    if v1_sample != v2_sample and v1_sample and v2_sample:
        pct_change = ((v2_sample - v1_sample) / v1_sample) * 100
        if pct_change > 0:
            changes.append(f"Sample size increased by {pct_change:.1f}%")
        else:
            changes.append(f"Sample size decreased by {abs(pct_change):.1f}%")
    
    # Duration change
    v1_duration = v1_data.get("duration_weeks", 0)
    v2_duration = v2_data.get("duration_weeks", 0)
    if v1_duration != v2_duration and v1_duration and v2_duration:
        pct_change = ((v2_duration - v1_duration) / v1_duration) * 100
        if pct_change > 0:
            changes.append(f"Duration increased by {pct_change:.1f}%")
        else:
            changes.append(f"Duration decreased by {abs(pct_change):.1f}%")
    
    # Success probability change
    if isinstance(v1_prediction, (int, float)) and isinstance(v2_prediction, (int, float)) and v1_prediction != v2_prediction:
        delta = v2_prediction - v1_prediction
        if delta > 0.1:
            changes.append(f"Significantly improved success probability (+{delta * 100:.1f}%)")
        elif delta > 0:
            changes.append(f"Slightly improved success probability (+{delta * 100:.1f}%)")
        elif delta < -0.1:
            changes.append(f"Significantly reduced success probability ({delta * 100:.1f}%)")
        else:
            changes.append(f"Slightly reduced success probability ({delta * 100:.1f}%)")
    
    # Endpoint change
    v1_endpoint = v1_data.get("endpoint_primary", "")
    v2_endpoint = v2_data.get("endpoint_primary", "")
    if v1_endpoint != v2_endpoint and v1_endpoint and v2_endpoint:
        changes.append("Primary endpoint was modified")
    
    # Output changes
    if changes:
        pdf.set_font("Arial", "", 10)
        for i, change in enumerate(changes, 1):
            pdf.cell(0, 8, f"{i}. {clean_text(change)}", ln=True)
    else:
        pdf.cell(0, 8, "No significant changes detected between versions", ln=True)
    
    # Add recommendation based on success probability change
    pdf.ln(5)
    pdf.set_font("Arial", "B", 11)
    pdf.cell(0, 8, "Strategic Recommendation:", ln=True)
    pdf.set_font("Arial", "", 10)
    
    if isinstance(v1_prediction, (int, float)) and isinstance(v2_prediction, (int, float)):
        delta = v2_prediction - v1_prediction
        
        if delta >= 0.05:
            recommendation = "The protocol modifications appear to have POSITIVE impact on trial success probability. Consider proceeding with the latest version."
        elif delta <= -0.05:
            recommendation = "The protocol modifications appear to have NEGATIVE impact on trial success probability. Consider reviewing the changes carefully."
        else:
            recommendation = "The protocol modifications have minimal impact on trial success probability. Consider additional optimization opportunities."
    else:
        recommendation = "Unable to determine impact on success probability due to missing data."
    
    pdf.multi_cell(0, 8, clean_text(recommendation))
    
    # Footer
    pdf.set_y(-30)
    pdf.set_font('Arial', 'I', 8)
    pdf.cell(0, 10, 'This report was generated by TrialSage Protocol Comparison Engine', 0, 0, 'C')
    pdf.cell(0, 10, f'Generated: {datetime.now().strftime("%Y-%m-%d %H:%M")}', 0, 0, 'R')
    
    # Generate filename and path
    filename = f"Protocol_Comparison_{protocol_id.replace(' ', '_')}_{int(time.time())}.pdf"
    filepath = os.path.join('data', 'exports', filename)
    pdf.output(filepath)
    
    return filepath

def main():
    """Main function to run from command line"""
    if len(sys.argv) < 2:
        print("Error: Input file not specified", file=sys.stderr)
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    try:
        # Read input data
        with open(input_file, 'r') as f:
            input_data = json.load(f)
        
        # Generate PDF
        output_file = generate_comparison_pdf(input_data)
        print(output_file)
        
    except Exception as e:
        print(f"Error generating comparison PDF: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()