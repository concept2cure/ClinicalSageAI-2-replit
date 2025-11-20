#!/usr/bin/env python3
"""
Trial Success PDF Report Generator
Generates PDF reports from trial success prediction data
"""

from fpdf import FPDF
import os
import json
import sys
import time

# Create necessary directories if they don't exist
os.makedirs("data/exports", exist_ok=True)

def clean_unicode_for_pdf(text):
    """Clean text of problematic Unicode characters for PDF compatibility"""
    if not isinstance(text, str):
        text = str(text)
    return text.replace("–", "-").replace("'", "'").replace("≥", ">=").replace("•", "-")

def generate_success_pdf(input_file):
    """Generate PDF from input JSON file"""
    
    # Read input data
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    # Extract data
    success_rate = data.get("success_rate", 0.5)
    inputs = data.get("inputs", {})
    protocol_id = data.get("protocol_id", "TS-" + str(int(time.time())))
    timestamp = data.get("timestamp", int(time.time()))
    
    # Create PDF
    pdf = FPDF()
    pdf.add_page()
    
    # Title
    pdf.set_font('Arial', 'B', 16)
    pdf.cell(0, 10, f'Trial Intelligence Report - {protocol_id}', 0, 1, 'C')
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)
    
    # Protocol Summary Section
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, 'Protocol Summary', 0, 1, 'L')
    
    pdf.set_font('Arial', '', 10)
    pdf.cell(60, 6, 'Indication:', 0, 0, 'L')
    pdf.cell(0, 6, clean_unicode_for_pdf(inputs.get("indication", "Not specified")), 0, 1, 'L')
    
    pdf.cell(60, 6, 'Phase:', 0, 0, 'L')
    pdf.cell(0, 6, clean_unicode_for_pdf(inputs.get("phase", "Not specified")), 0, 1, 'L')
    
    pdf.cell(60, 6, 'Sample Size:', 0, 0, 'L')
    pdf.cell(0, 6, str(inputs.get("sample_size", "Not specified")), 0, 1, 'L')
    
    pdf.cell(60, 6, 'Duration (weeks):', 0, 0, 'L')
    pdf.cell(0, 6, str(inputs.get("duration_weeks", "Not specified")), 0, 1, 'L')
    
    pdf.cell(60, 6, 'Dropout Rate:', 0, 0, 'L')
    pdf.cell(0, 6, f"{inputs.get('dropout_rate', 0) * 100:.1f}%", 0, 1, 'L')
    
    pdf.cell(60, 6, 'Primary Endpoint:', 0, 0, 'L')
    pdf.cell(0, 6, clean_unicode_for_pdf(inputs.get("primary_endpoint", "Not specified")), 0, 1, 'L')
    
    pdf.ln(5)
    
    # Success Prediction Section
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, 'Success Prediction', 0, 1, 'L')
    
    pdf.set_font('Arial', 'B', 14)
    success_percentage = round(success_rate * 100, 1)
    pdf.cell(0, 10, f"{success_percentage}%", 0, 1, 'L')
    
    # Add success assessment
    pdf.set_font('Arial', '', 10)
    if success_percentage >= 75:
        pdf.cell(0, 6, "Assessment: High probability of success", 0, 1, 'L')
    elif success_percentage >= 50:
        pdf.cell(0, 6, "Assessment: Moderate probability of success", 0, 1, 'L')
    else:
        pdf.cell(0, 6, "Assessment: Significant risk of failure", 0, 1, 'L')
    
    pdf.ln(5)
    
    # Benchmark Comparison Section if available
    if "benchmarks" in data:
        benchmarks = data["benchmarks"]
        pdf.set_font('Arial', 'B', 12)
        pdf.cell(0, 10, 'CSR Benchmark Analysis', 0, 1, 'L')
        
        pdf.set_font('Arial', '', 10)
        pdf.cell(0, 6, f"Comparison based on {benchmarks.get('total_trials', 'N/A')} similar trials:", 0, 1, 'L')
        
        # Create a comparison table
        pdf.ln(2)
        
        # Table headers
        pdf.set_fill_color(240, 240, 240)
        pdf.cell(50, 8, 'Parameter', 1, 0, 'L', 1)
        pdf.cell(40, 8, 'Your Protocol', 1, 0, 'C', 1)
        pdf.cell(40, 8, 'Benchmark', 1, 0, 'C', 1)
        pdf.cell(50, 8, 'Assessment', 1, 1, 'C', 1)
        
        # Sample Size Row
        pdf.cell(50, 8, 'Sample Size', 1, 0, 'L')
        pdf.cell(40, 8, str(inputs.get("sample_size", "N/A")), 1, 0, 'C')
        pdf.cell(40, 8, str(benchmarks.get("median_sample_size", "N/A")), 1, 0, 'C')
        
        if inputs.get("sample_size", 0) < benchmarks.get("median_sample_size", 0) * 0.8:
            pdf.cell(50, 8, 'Potentially Underpowered', 1, 1, 'C')
        elif inputs.get("sample_size", 0) > benchmarks.get("median_sample_size", 0) * 1.2:
            pdf.cell(50, 8, 'Above Benchmark', 1, 1, 'C')
        else:
            pdf.cell(50, 8, 'Within Range', 1, 1, 'C')
        
        # Duration Row
        pdf.cell(50, 8, 'Duration (weeks)', 1, 0, 'L')
        pdf.cell(40, 8, str(inputs.get("duration_weeks", "N/A")), 1, 0, 'C')
        
        # Parse the median duration from string (e.g., "26 weeks" to number 26)
        median_duration = None
        if isinstance(benchmarks.get("median_duration", ""), str):
            try:
                median_duration = int(benchmarks.get("median_duration", "0").split()[0])
            except (ValueError, IndexError):
                median_duration = None
        else:
            median_duration = benchmarks.get("median_duration", benchmarks.get("avg_duration_weeks", 0))
        
        pdf.cell(40, 8, str(median_duration if median_duration else "N/A"), 1, 0, 'C')
        
        if inputs.get("duration_weeks", 0) > (median_duration or 0) * 1.5:
            pdf.cell(50, 8, 'Longer Than Typical', 1, 1, 'C')
        elif inputs.get("duration_weeks", 0) < (median_duration or 0) * 0.5:
            pdf.cell(50, 8, 'Shorter Than Typical', 1, 1, 'C')
        else:
            pdf.cell(50, 8, 'Within Range', 1, 1, 'C')
        
        # Dropout Rate Row
        pdf.cell(50, 8, 'Dropout Rate', 1, 0, 'L')
        pdf.cell(40, 8, f"{inputs.get('dropout_rate', 0) * 100:.1f}%", 1, 0, 'C')
        pdf.cell(40, 8, f"{benchmarks.get('average_dropout_rate', 0) * 100:.1f}%", 1, 0, 'C')
        
        if inputs.get("dropout_rate", 0) < benchmarks.get("average_dropout_rate", 0) * 0.7:
            pdf.cell(50, 8, 'Optimistic Estimate', 1, 1, 'C')
        elif inputs.get("dropout_rate", 0) > benchmarks.get("average_dropout_rate", 0) * 1.3:
            pdf.cell(50, 8, 'Higher Than Average', 1, 1, 'C')
        else:
            pdf.cell(50, 8, 'Within Range', 1, 1, 'C')
    
    # Risk Flags Section
    if "risk_flags" in data:
        risk_flags = data["risk_flags"]
        pdf.ln(5)
        pdf.set_font('Arial', 'B', 12)
        pdf.cell(0, 10, 'Risk Assessment', 0, 1, 'L')
        
        pdf.set_font('Arial', '', 10)
        
        if risk_flags.get("underpowered", False):
            pdf.cell(0, 6, '⚠️ Sample size may be underpowered based on historical data.', 0, 1, 'L')
        else:
            pdf.cell(0, 6, '✅ Sample size appears adequate.', 0, 1, 'L')
        
        if risk_flags.get("endpoint_risk", False):
            pdf.cell(0, 6, '⚠️ Endpoint definition may pose regulatory challenges.', 0, 1, 'L')
        else:
            pdf.cell(0, 6, '✅ Endpoint definition appears appropriate.', 0, 1, 'L')
        
        if risk_flags.get("duration_mismatch", False):
            pdf.cell(0, 6, '⚠️ Trial duration differs significantly from successful precedents.', 0, 1, 'L')
        else:
            pdf.cell(0, 6, '✅ Trial duration aligns with successful precedents.', 0, 1, 'L')
        
        if risk_flags.get("high_dropout", False):
            pdf.cell(0, 6, '⚠️ Dropout rate estimate may be optimistic.', 0, 1, 'L')
        else:
            pdf.cell(0, 6, '✅ Dropout rate estimate is realistic.', 0, 1, 'L')
    
    # Strategic Recommendations Section
    pdf.ln(5)
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, 'Strategic Recommendations', 0, 1, 'L')
    
    pdf.set_font('Arial', '', 10)
    
    # Use strategic insights if available, otherwise generate based on success rate
    if "strategic_insights" in data and data["strategic_insights"]:
        for i, insight in enumerate(data["strategic_insights"], 1):
            pdf.cell(0, 8, f"{i}. {clean_unicode_for_pdf(insight)}", 0, 1, 'L')
    else:
        # Generate recommendations based on success rate
        if success_percentage > 75:
            recommendations = [
                "Trial parameters are optimal. Proceed with the planned design.",
                "Consider documenting design decisions for future trials.",
                "Monitor dropout closely to maintain high success probability."
            ]
        elif success_percentage > 50:
            recommendations = [
                "Consider increasing sample size if feasible.",
                "Implement robust retention strategies to reduce dropout.",
                "Review endpoint selection and measurement timing."
            ]
        else:
            recommendations = [
                "Reassess sample size - current value may be insufficient.",
                "Consider extending trial duration for more robust outcomes.",
                "Implement enhanced participant retention strategies.",
                "Review eligibility criteria to ensure appropriate population targeting."
            ]
        
        for i, rec in enumerate(recommendations, 1):
            # Clean any Unicode characters in recommendations
            clean_rec = clean_unicode_for_pdf(rec)
            pdf.cell(0, 8, f"{i}. {clean_rec}", 0, 1, 'L')
    
    pdf.ln(5)
    
    # Footer
    pdf.set_y(-30)
    pdf.set_font('Arial', 'I', 8)
    pdf.cell(0, 10, 'This report was generated by TrialSage AI Clinical Trial Intelligence Platform', 0, 0, 'C')
    pdf.cell(0, 10, f'Page {pdf.page_no()}', 0, 0, 'R')
    
    # Generate filename and path
    filename = f"Trial_Success_Prediction_{protocol_id.replace(' ', '_')}_{int(timestamp)}.pdf"
    filepath = os.path.join('data', 'exports', filename)
    pdf.output(filepath)
    
    return filepath

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Error: Input file not specified", file=sys.stderr)
        sys.exit(1)
    
    input_file = sys.argv[1]
    
    try:
        output_file = generate_success_pdf(input_file)
        print(output_file)
    except Exception as e:
        print(f"Error generating PDF: {str(e)}", file=sys.stderr)
        sys.exit(1)