#!/usr/bin/env python3
"""
Trial Intelligence Report Generator
Generates comprehensive PDF reports with trial prediction, benchmarks, and recommendations
"""

from fpdf import FPDF
import time
import os
import json
import sys
import argparse

# Constants
DATA_DIR = os.path.join(os.getcwd(), "data")
EXPORTS_DIR = os.path.join(DATA_DIR, "exports")

# Ensure directories exist
os.makedirs(EXPORTS_DIR, exist_ok=True)

def clean_text(text):
    """Clean text for PDF compatibility"""
    if not isinstance(text, str):
        text = str(text)
    return text.replace("–", "-").replace("'", "'").replace("≥", ">=").replace("•", "-")

class TrialIntelligenceReport(FPDF):
    """Custom PDF report for trial intelligence"""
    
    def header(self):
        """Add report header"""
        self.set_font("Arial", "B", 14)
        self.cell(0, 10, f"Trial Intelligence Report", ln=True, align="C")
        self.ln(5)
    
    def footer(self):
        """Add report footer"""
        self.set_y(-15)
        self.set_font("Arial", "I", 8)
        self.cell(0, 10, f"TrialSage AI - Generated on {time.strftime('%Y-%m-%d')}", 0, 0, "L")
        self.cell(0, 10, f"Page {self.page_no()}", 0, 0, "R")
    
    def section(self, title, content):
        """Add a section with title and content"""
        self.set_font("Arial", "B", 12)
        self.cell(0, 10, clean_text(title), ln=True)
        self.ln(1)
        self.set_font("Arial", "", 11)
        self.multi_cell(0, 8, clean_text(content))
        self.ln(2)
    
    def add_metadata(self, data):
        """Add protocol metadata"""
        self.set_font("Arial", "B", 12)
        self.cell(0, 10, f"Protocol ID: {data['protocol_id']}", ln=True)
        self.set_font("Arial", "", 10)
        self.cell(0, 6, f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}", ln=True)
        self.ln(5)

def generate_report(input_data):
    """Generate PDF report from input data"""
    
    # Extract data
    protocol_id = input_data.get("protocol_id", f"TS-{int(time.time())}")
    timestamp = input_data.get("timestamp", int(time.time()))
    
    # Extract protocol data
    inputs = input_data.get("inputs", {})
    
    # Extract success rate
    success_rate = input_data.get("success_rate", 0.5)
    
    # Extract benchmarks
    benchmarks = input_data.get("benchmarks", {})
    
    # Extract flags
    risk_flags = input_data.get("risk_flags", {})
    
    # Extract strategic insights
    strategic_insights = input_data.get("strategic_insights", [])
    
    # Create PDF
    pdf = TrialIntelligenceReport()
    pdf.add_page()
    
    # Add metadata
    pdf.add_metadata({"protocol_id": protocol_id})
    
    # Protocol Summary Section
    protocol_summary = f"""
- Indication: {inputs.get('indication', 'N/A')}
- Phase: {inputs.get('phase', 'N/A')}
- Sample Size: {inputs.get('sample_size', 'N/A')}
- Duration: {inputs.get('duration_weeks', 'N/A')} weeks
- Dropout Rate: {inputs.get('dropout_rate', 0) * 100:.1f}%
- Primary Endpoint: {inputs.get('primary_endpoint', 'N/A')}
"""
    pdf.section("Protocol Summary", protocol_summary)
    
    # Success Prediction Section
    pdf.section("Predicted Trial Success", f"{round(success_rate * 100, 1)}%")
    
    # Benchmark Comparison Section
    csr_benchmarks = f"""
Benchmarked against {benchmarks.get('total_trials', 'N/A')} prior trials:
- Median Sample Size: {benchmarks.get('median_sample_size', 'N/A')}
- Median Duration: {benchmarks.get('median_duration', 'N/A')}
- Median Dropout Rate: {benchmarks.get('average_dropout_rate', 0) * 100:.1f}%
- Historical Success Rate: {benchmarks.get('success_rate', 0) * 100:.1f}%
"""
    pdf.section("CSR Benchmark Comparison", csr_benchmarks)
    
    # Risk Flags Section
    risk_flag_text = ""
    
    if risk_flags.get("underpowered", False):
        risk_flag_text += "⚠️ Sample size may be underpowered based on historical data.\n"
    
    if risk_flags.get("endpoint_risk", False):
        risk_flag_text += "⚠️ Endpoint definition may pose regulatory challenges.\n"
    
    if risk_flags.get("duration_mismatch", False):
        risk_flag_text += "⚠️ Trial duration differs significantly from successful precedents.\n"
    
    if risk_flags.get("high_dropout", False):
        risk_flag_text += "⚠️ Dropout rate estimate may be optimistic.\n"
    
    if risk_flags.get("design_issues", False):
        risk_flag_text += "⚠️ Study design has elements that differ from successful precedents.\n"
    
    if not risk_flag_text:
        risk_flag_text = "✅ No major risk flags identified."
    
    pdf.section("Risk Flags", risk_flag_text)
    
    # Strategic Suggestions Section
    if strategic_insights:
        strategic_text = "\n".join([f"- {insight}" for insight in strategic_insights])
    else:
        strategic_text = """
- Consider adjusting parameters to align with benchmark values.
- Review endpoint definitions against regulatory precedents.
- Evaluate recruitment and retention strategies to minimize dropout.
"""
    
    pdf.section("Strategic Suggestions", strategic_text)
    
    # Generate filename and save PDF
    filename = f"Trial_Intelligence_Report_{protocol_id}_{timestamp}.pdf"
    filepath = os.path.join(EXPORTS_DIR, filename)
    pdf.output(filepath)
    
    return filepath

def main():
    """Main function to run from command line"""
    parser = argparse.ArgumentParser(description="Generate Trial Intelligence Report")
    parser.add_argument("input_file", help="Path to JSON input file with report data")
    args = parser.parse_args()
    
    try:
        with open(args.input_file, 'r') as f:
            input_data = json.load(f)
        
        filepath = generate_report(input_data)
        print(f"Report generated successfully: {filepath}")
        return filepath
    except Exception as e:
        print(f"Error generating report: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()