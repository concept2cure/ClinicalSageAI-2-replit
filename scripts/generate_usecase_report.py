from fpdf import FPDF
import json
import sys
import os
import time
from datetime import datetime

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

class UseCaseReportPDF(FPDF):
    def __init__(self, title, role):
        super().__init__()
        self.title = title
        self.role = role
        self.set_margins(15, 15, 15)
        self.add_page()
        
    def header(self):
        # Logo - in a real implementation, this would be your company logo
        # self.image('path/to/logo.png', 10, 8, 33)
        
        # Title
        self.set_font('Arial', 'B', 18)
        self.cell(0, 10, deep_clean("TrialSage Strategic Intelligence Report"), ln=True, align='C')
        
        self.set_font('Arial', 'B', 14)
        self.cell(0, 10, deep_clean(f"{self.title}"), ln=True, align='C')
        
        self.set_font('Arial', 'I', 12)
        self.cell(0, 10, deep_clean(f"For: {self.role}"), ln=True, align='C')
        
        self.set_font('Arial', 'I', 10)
        self.cell(0, 5, deep_clean(f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}"), ln=True, align='C')
        
        # Line break
        self.ln(5)
    
    def footer(self):
        # Position at 1.5 cm from bottom
        self.set_y(-15)
        # Arial italic 8
        self.set_font('Arial', 'I', 8)
        # Page number
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')
        
    def chapter_title(self, title):
        """Add a chapter title"""
        self.set_font('Arial', 'B', 14)
        self.set_fill_color(230, 230, 230)
        self.cell(0, 10, deep_clean(title), ln=True, fill=True)
        self.ln(4)
        
    def section_title(self, title):
        """Add a section title"""
        self.set_font('Arial', 'B', 12)
        self.cell(0, 8, deep_clean(title), ln=True)
        self.ln(2)
        
    def body_text(self, text):
        """Add body text"""
        self.set_font('Arial', '', 11)
        self.multi_cell(0, 6, deep_clean(text))
        self.ln(3)
        
    def info_item(self, label, value):
        """Add an information item with label and value"""
        self.set_font('Arial', 'B', 11)
        self.cell(60, 8, deep_clean(label), 0, 0)
        self.set_font('Arial', '', 11)
        self.multi_cell(0, 8, deep_clean(str(value)))
        
    def feature_box(self, feature, enabled):
        """Add a feature box showing enabled/disabled state"""
        self.set_font('Arial', '', 10)
        box_text = f"[{'✓' if enabled else ' '}] {feature}"
        self.cell(60, 6, deep_clean(box_text), 0, 0)
        
    def metric_box(self, label, value, unit=""):
        """Add a metric box with label and value"""
        self.set_font('Arial', 'B', 10)
        self.cell(80, 8, deep_clean(label), 1, 0, 'L', False)
        self.set_font('Arial', '', 10)
        
        if isinstance(value, (int, float)):
            if unit == "%":
                value_text = f"{value}{unit}"
            else:
                value_text = f"{value} {unit}"
        else:
            value_text = str(value)
            
        self.cell(80, 8, deep_clean(value_text), 1, 1, 'C', False)
        
    def add_table(self, header, data):
        """Add a table with header and data"""
        # Table header
        self.set_font('Arial', 'B', 10)
        self.set_fill_color(220, 220, 220)
        
        # Calculate column width based on number of columns
        col_width = (self.w - 30) / len(header)
        
        for item in header:
            self.cell(col_width, 8, deep_clean(item), 1, 0, 'C', True)
        self.ln()
        
        # Table data
        self.set_font('Arial', '', 10)
        for row in data:
            for item in row:
                self.cell(col_width, 8, deep_clean(str(item)), 1, 0, 'C')
            self.ln()

def generate_usecase_report(report_data_path, output_dir):
    """Generate a comprehensive report for a use case"""
    
    # Load report data
    with open(report_data_path, 'r') as f:
        report_data = json.load(f)
    
    usecase = report_data['useCase']
    prediction = report_data['predictionResults']
    sap_content = report_data.get('sapContent', '')
    benchmark_data = report_data.get('benchmarkData', {})
    
    # Create PDF
    pdf = UseCaseReportPDF(usecase['title'], usecase['role'])
    
    # Strategic Challenge
    pdf.chapter_title("Strategic Challenge")
    pdf.body_text(usecase['challenge'])
    
    # Profile & Scenario Details
    pdf.chapter_title("Protocol Profile")
    
    # Basic protocol information
    for key, value in usecase['prefillData'].items():
        if key not in ['endpoint_primary', 'sample_size', 'duration_weeks', 'dropout_rate']:
            if isinstance(value, (list, tuple)):
                value = ", ".join(value)
            pdf.info_item(key.replace('_', ' ').title() + ":", value)
    
    # Core metrics
    pdf.ln(5)
    pdf.section_title("Core Protocol Metrics")
    
    pdf.metric_box("Sample Size", usecase['prefillData']['sample_size'], "patients")
    pdf.metric_box("Duration", usecase['prefillData']['duration_weeks'], "weeks")
    pdf.metric_box("Primary Endpoint", usecase['prefillData']['endpoint_primary'], "")
    pdf.metric_box("Dropout Rate", usecase['prefillData']['dropout_rate'] * 100, "%")
    
    # TrialSage Intelligence Solution
    pdf.add_page()
    pdf.chapter_title("TrialSage Intelligence Solution")
    
    # Features used
    pdf.section_title("Features Activated")
    
    features = [
        ("CSR Search", usecase['features']['csrSearch']),
        ("Risk Model", usecase['features']['riskModel']),
        ("SAP Generator", usecase['features']['sapGenerator']),
        ("Dossier Export", usecase['features']['dossierExport']),
        ("Protocol Optimizer", usecase['features']['protocolOptimizer'])
    ]
    
    # Display features in 2 columns
    col_width = 95
    for i, (feature, enabled) in enumerate(features):
        if i % 2 == 0 and i > 0:
            pdf.ln(6)
        pdf.feature_box(feature, enabled)
    
    pdf.ln(10)
    
    # Success Prediction
    if prediction:
        pdf.section_title("Trial Success Prediction")
        
        probability = prediction.get('probability', 0.65) * 100
        
        # Format probability with color coding
        pdf.set_font('Arial', 'B', 12)
        
        if probability >= 75:
            pdf.set_text_color(0, 128, 0)  # Green
            risk_level = "Low Risk"
        elif probability >= 50:
            pdf.set_text_color(255, 128, 0)  # Orange
            risk_level = "Moderate Risk"
        else:
            pdf.set_text_color(255, 0, 0)  # Red
            risk_level = "High Risk"
            
        pdf.cell(0, 10, f"Success Probability: {probability:.1f}% ({risk_level})", ln=True)
        
        # Reset text color
        pdf.set_text_color(0, 0, 0)
        
        # Risk factors
        pdf.ln(5)
        pdf.section_title("Risk Factors")
        
        risk_factors = prediction.get('riskFactors', [])
        if risk_factors:
            for factor in risk_factors:
                factor_name = factor.get('factor', '')
                impact = factor.get('impact', '')
                pdf.set_font('Arial', 'B', 10)
                pdf.cell(60, 8, deep_clean(factor_name), 0, 0)
                pdf.set_font('Arial', '', 10)
                pdf.cell(0, 8, deep_clean(f"Impact: {impact}"), 0, 1)
    
    # Benchmark Comparison
    if benchmark_data:
        pdf.add_page()
        pdf.chapter_title("Benchmark Comparison")
        
        # Benchmark metrics
        pdf.section_title("Key Metrics vs. Historical Precedent")
        
        if 'avgSampleSize' in benchmark_data:
            user_sample = usecase['prefillData']['sample_size']
            avg_sample = benchmark_data['avgSampleSize']
            diff = user_sample - avg_sample
            diff_pct = (diff / avg_sample) * 100 if avg_sample else 0
            
            comparison = f"{user_sample} vs. avg {avg_sample:.0f} ({diff_pct:+.1f}%)"
            pdf.metric_box("Sample Size", comparison, "")
        
        if 'avgDuration' in benchmark_data:
            user_duration = usecase['prefillData']['duration_weeks']
            avg_duration = benchmark_data['avgDuration']
            diff = user_duration - avg_duration
            diff_pct = (diff / avg_duration) * 100 if avg_duration else 0
            
            comparison = f"{user_duration} vs. avg {avg_duration:.0f} ({diff_pct:+.1f}%)"
            pdf.metric_box("Duration (weeks)", comparison, "")
        
        if 'avgDropoutRate' in benchmark_data:
            user_rate = usecase['prefillData']['dropout_rate'] * 100
            avg_rate = benchmark_data['avgDropoutRate'] * 100
            diff = user_rate - avg_rate
            
            comparison = f"{user_rate:.1f}% vs. avg {avg_rate:.1f}% ({diff:+.1f}%)"
            pdf.metric_box("Dropout Rate", comparison, "")
        
        if 'successRate' in benchmark_data:
            pdf.metric_box("Historical Success Rate", benchmark_data['successRate'] * 100, "%")
            
        if 'endpointPrecedent' in benchmark_data:
            pdf.metric_box("Endpoint Has Precedent", "Yes" if benchmark_data['endpointPrecedent'] else "No", "")
        
        # Similar trials
        if 'similarTrials' in benchmark_data and benchmark_data['similarTrials']:
            pdf.ln(10)
            pdf.section_title("Similar Historical Trials")
            
            similar_trials = benchmark_data['similarTrials']
            header = ["Trial ID", "Phase", "Indication", "Outcome"]
            data = [[trial.get('id', ''), 
                     trial.get('phase', ''), 
                     trial.get('indication', ''), 
                     trial.get('outcome', '')] 
                    for trial in similar_trials]
                    
            pdf.add_table(header, data)
    
    # Statistical Analysis Plan
    if sap_content:
        pdf.add_page()
        pdf.chapter_title("Statistical Analysis Plan")
        pdf.body_text(sap_content)
    
    # ROI Scoreboard
    pdf.add_page()
    pdf.chapter_title("ROI Scoreboard")
    
    pdf.section_title("Value Delivered")
    
    # ROI metrics
    roi_metrics = [
        ("Avoided design misstep", f"-{usecase['roi']['failureRiskReduction']}% trial failure risk"),
        ("Time saved", f"{usecase['roi']['timeSaved']} hrs vs. CRO review"),
        ("Regulatory match verified", f"{usecase['roi']['precedentMatchScore']}% endpoint precedent alignment"),
        ("SAP generation time", f"{usecase['roi']['generationTime']} min")
    ]
    
    for metric, value in roi_metrics:
        pdf.metric_box(metric, value, "")
    
    # Final recommendations
    pdf.ln(10)
    pdf.section_title("Next Steps")
    
    recommendations = [
        "Review the complete protocol design against benchmark comparisons",
        "Evaluate risk factors and consider mitigation strategies",
        "Use the provided SAP as a foundation for your statistical approach",
        "Export the full regulatory-ready report package for stakeholder review"
    ]
    
    for i, rec in enumerate(recommendations, 1):
        pdf.body_text(f"{i}. {rec}")
    
    # Output path
    timestamp = int(time.time())
    output_path = os.path.join(output_dir, f"Strategic_Intelligence_Report_{timestamp}.pdf")
    
    # Save PDF
    pdf.output(output_path)
    
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_usecase_report.py <report_data_path> <output_dir>")
        sys.exit(1)
    
    report_data_path = sys.argv[1]
    output_dir = sys.argv[2]
    
    pdf_path = generate_usecase_report(report_data_path, output_dir)
    print(pdf_path)  # Print the path to be captured by the caller