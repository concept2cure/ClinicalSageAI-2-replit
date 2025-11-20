from fpdf import FPDF
import time
import json
import os
import sys

def hard_clean(text):
    """Deeply sanitize all unicode characters before writing to PDF"""
    if not isinstance(text, str):
        return str(text)
        
    return (
        text.replace("–", "-")
            .replace("'", "'")
            .replace(""", '"')
            .replace(""", '"')
            .replace("≥", ">=")
            .replace("•", "-")
            .replace("→", "->")
            .replace("'", "'")
            .replace("'", "'")
            .replace("≤", "<=")
            .replace("°", "deg")
            .replace("×", "x")
            .replace("…", "...")
    )

class ProtocolIntelligencePDF(FPDF):
    def __init__(self, protocol_id, title="Protocol Intelligence Report"):
        super().__init__()
        self.protocol_id = protocol_id
        self.title = title
        self.set_margins(15, 15, 15)
        self.add_page()
        
    def header(self):
        # Logo area (would add if needed)
        # self.image('logo.png', 10, 8, 33)
        
        # Title
        self.set_font('Arial', 'B', 18)
        self.cell(0, 10, hard_clean(self.title), ln=True, align='C')
        
        self.set_font('Arial', 'B', 14)
        self.cell(0, 10, hard_clean(f"Protocol {self.protocol_id}"), ln=True, align='C')
        
        self.set_font('Arial', 'I', 10)
        current_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
        self.cell(0, 5, hard_clean(f"Generated on {current_time}"), ln=True, align='C')
        
        # Line break
        self.ln(5)
    
    def footer(self):
        # Position at 1.5 cm from bottom
        self.set_y(-15)
        # Arial italic 8
        self.set_font('Arial', 'I', 8)
        # Page number
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')
        
    def section(self, title, content):
        """Add a section with title and content"""
        self.set_font('Arial', 'B', 14)
        self.set_fill_color(230, 230, 230)
        self.cell(0, 10, hard_clean(title), ln=True, fill=True)
        self.ln(2)
        self.set_font('Arial', '', 11)
        self.multi_cell(0, 6, hard_clean(content))
        self.ln(3)
        
    def subsection(self, title):
        """Add a subsection title"""
        self.set_font('Arial', 'B', 12)
        self.cell(0, 8, hard_clean(title), ln=True)
        self.ln(2)
        
    def info_item(self, label, value):
        """Add an information item with label and value"""
        self.set_font('Arial', 'B', 11)
        self.cell(60, 8, hard_clean(label), 0, 0)
        self.set_font('Arial', '', 11)
        self.multi_cell(0, 8, hard_clean(str(value)))
        
    def create_table(self, headers, data, col_widths=None):
        """Create a table with headers and data rows"""
        if col_widths is None:
            # Distribute widths equally
            page_width = self.w - 30  # Margins 15 on each side
            col_widths = [page_width / len(headers)] * len(headers)
            
        # Headers
        self.set_font('Arial', 'B', 11)
        self.set_fill_color(230, 230, 230)
        for i, header in enumerate(headers):
            self.cell(col_widths[i], 8, hard_clean(header), 1, 0, 'C', True)
        self.ln()
        
        # Data rows
        self.set_font('Arial', '', 10)
        for row in data:
            for i, cell in enumerate(row):
                self.cell(col_widths[i], 7, hard_clean(str(cell)), 1, 0, 'L')
            self.ln()
        self.ln(3)
        
    def add_recommendation_table(self, recommendations):
        """Add a table of recommendations"""
        headers = ["Area", "Change", "Rationale"]
        col_widths = [40, 80, 65]  # Adjusted widths based on content
        self.create_table(headers, recommendations, col_widths)
        
    def add_comparison_table(self, current, optimized):
        """Add a comparison table between current and optimized values"""
        headers = ["Metric", "Current Design", "Optimized Design", "Impact"]
        
        data = []
        for key in current:
            if key in optimized and current[key] != optimized[key]:
                # Format numbers or percent values
                current_val = current[key]
                optimized_val = optimized[key]
                
                if isinstance(current_val, (int, float)) and isinstance(optimized_val, (int, float)):
                    if key == 'dropout_rate':
                        # Format as percentage
                        current_str = f"{current_val * 100:.1f}%"
                        optimized_str = f"{optimized_val * 100:.1f}%"
                        
                        # Determine impact (lower is better for dropout)
                        impact = "Better" if optimized_val < current_val else "Worse"
                    else:
                        # Format as regular number
                        current_str = str(current_val)
                        optimized_str = str(optimized_val)
                        
                        # Different impact determination based on the metric
                        if key in ['sample_size', 'duration_weeks']:
                            impact = "Optimized"
                        else:
                            impact = "Change Detected"
                else:
                    # For non-numeric values
                    current_str = str(current_val)
                    optimized_str = str(optimized_val)
                    impact = "Updated"
                
                data.append([
                    key.replace('_', ' ').title(),
                    current_str,
                    optimized_str,
                    impact
                ])
        
        col_widths = [50, 45, 45, 45]
        self.create_table(headers, data, col_widths)

def generate_protocol_intelligence_report(data_path, output_dir=None):
    """
    Generate a comprehensive PDF report for protocol intelligence
    
    Args:
        data_path: Path to the JSON file containing report data
        output_dir: Directory to save the PDF report (default: current directory)
        
    Returns:
        Path to the generated PDF file
    """
    # Load data
    with open(data_path, 'r') as f:
        data = json.load(f)
    
    protocol_id = data.get('protocol_id', 'Unknown')
    parsed = data.get('parsed', {})
    prediction = data.get('prediction', 0)
    optimized_prediction = data.get('optimized_prediction', 0)
    recommendations = data.get('recommendations', [])
    benchmarks = data.get('benchmarks', {})
    sap_snippet = data.get('sap_snippet', '')
    optimized_protocol = data.get('optimized_protocol', {})
    
    # Create PDF
    pdf = ProtocolIntelligencePDF(protocol_id)
    
    # Protocol Summary Section
    summary_text = f"""
Indication: {parsed.get('indication', 'Not specified')}
Phase: {parsed.get('phase', 'Not specified')}
Sample Size: {parsed.get('sample_size', 'Not specified')}
Duration: {parsed.get('duration_weeks', 'Not specified')} weeks
Dropout Rate: {parsed.get('dropout_rate', 0) * 100:.1f}%
Primary Endpoint: {parsed.get('endpoint_primary', 'Not specified')}
"""
    
    if parsed.get('randomization'):
        summary_text += f"Randomization: {parsed.get('randomization')}\n"
        
    if parsed.get('blinding'):
        summary_text += f"Blinding: {parsed.get('blinding')}\n"
    
    pdf.section("Protocol Summary", summary_text)
    
    # Success Prediction Section
    if prediction or optimized_prediction:
        prediction_gain = round((optimized_prediction - prediction) * 100, 1)
        prediction_text = f"""
Original Design: {prediction * 100:.1f}%
Optimized Design: {optimized_prediction * 100:.1f}%
Expected Gain: {prediction_gain}%

This prediction is based on machine learning analysis of {benchmarks.get('similarTrialsCount', '200+')} similar trials 
with known outcomes from our clinical study report database.
"""
        pdf.section("AI-Predicted Success", prediction_text)
    
    # Benchmark Comparison Section
    if benchmarks:
        benchmark_text = f"""
Our analysis compared your protocol design against similar trials in the TrialSage database.
For {parsed.get('indication', 'this indication')} {parsed.get('phase', 'trials')}, we found:

- Average Sample Size: {benchmarks.get('avgSampleSize', 'N/A')}
- Average Duration: {benchmarks.get('avgDuration', 'N/A')} weeks
- Average Dropout Rate: {benchmarks.get('avgDropoutRate', 0) * 100:.1f}%
- Historical Success Rate: {benchmarks.get('successRate', 0) * 100:.1f}%
"""
        
        if benchmarks.get('endpointPrecedent') is not None:
            endpoint_status = "found" if benchmarks.get('endpointPrecedent') else "not found"
            benchmark_text += f"- Primary Endpoint: {endpoint_status} in similar successful trials\n"
            
        pdf.section("Benchmark Comparison", benchmark_text)
    
    # Recommended Optimizations Section
    if recommendations:
        pdf.section("Recommended Optimizations", "The following changes are recommended based on our analysis:")
        
        # Convert recommendations to proper format for the table
        recommendation_data = []
        for rec in recommendations:
            if isinstance(rec, (list, tuple)) and len(rec) >= 3:
                recommendation_data.append(rec)
            elif isinstance(rec, dict):
                recommendation_data.append([
                    rec.get('area', ''),
                    rec.get('change', ''),
                    rec.get('rationale', '')
                ])
        
        pdf.add_recommendation_table(recommendation_data)
    
    # Before-After Comparison
    if optimized_protocol and parsed:
        pdf.section("Design Comparison", "Comparison between your protocol and the optimized version:")
        pdf.add_comparison_table(parsed, optimized_protocol)
    
    # Statistical Analysis Plan Section
    if sap_snippet:
        pdf.section("Statistical Analysis Plan", "Recommended statistical approach based on successful precedents:")
        pdf.multi_cell(0, 6, hard_clean(sap_snippet))
    
    # Similar Trials Section
    if benchmarks and benchmarks.get('similarTrials'):
        pdf.add_page()
        pdf.section("Similar Precedent Trials", "These trials have similar characteristics to your protocol:")
        
        similar_trials = benchmarks.get('similarTrials', [])
        headers = ["Trial ID", "Title", "Sponsor", "Outcome"]
        
        trial_data = []
        for trial in similar_trials:
            trial_data.append([
                trial.get('id', ''),
                trial.get('title', ''),
                trial.get('sponsor', ''),
                trial.get('outcome', '')
            ])
        
        col_widths = [25, 90, 40, 30]
        pdf.create_table(headers, trial_data, col_widths)
    
    # Set output path
    if not output_dir:
        output_dir = os.getcwd()
    
    timestamp = int(time.time())
    filename = f"Protocol_Intelligence_Report_{protocol_id}_{timestamp}.pdf"
    output_path = os.path.join(output_dir, filename)
    
    # Save PDF
    pdf.output(output_path)
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python generate_protocol_intelligence_report.py <path_to_json_data> [output_directory]")
        sys.exit(1)
    
    data_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None
    
    pdf_path = generate_protocol_intelligence_report(data_path, output_dir)
    print(pdf_path)  # Return path to be captured by caller