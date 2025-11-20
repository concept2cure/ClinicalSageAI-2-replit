from fpdf import FPDF
import time
import json
import os
import re

class StrategicReportPDF(FPDF):
    """
    PDF generator for TrialSage Strategic Intelligence Reports
    Handles Unicode characters and properly formats complex data
    """
    
    def __init__(self, report_data, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.report_data = report_data
        self.title = f"TrialSage Strategic Report – {report_data.get('metadata', {}).get('protocolId', 'N/A')}"
        
    def header(self):
        """Add report header to each page"""
        self.set_font("Arial", "B", 12)
        self.cell(0, 10, self.clean_text(self.title), ln=True, align="C")
        self.set_font("Arial", "I", 8)
        self.cell(0, 5, f"Generated: {self.report_data.get('metadata', {}).get('generatedDate', 'N/A')}", ln=True, align="C")
        self.line(10, 25, 200, 25)
        self.ln(15)
        
    def footer(self):
        """Add page numbers to the footer"""
        self.set_y(-15)
        self.set_font("Arial", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()}", 0, 0, "C")
        
    def clean_text(self, text):
        """Clean text to avoid encoding issues"""
        if not isinstance(text, str):
            text = str(text)
            
        return (text.replace("–", "-")
                   .replace("'", "'")
                   .replace(""", '"')
                   .replace(""", '"')
                   .replace("≥", ">=")
                   .replace("≤", "<=")
                   .replace("µ", "u")
                   .replace("×", "x"))
    
    def add_title(self, title, level=1):
        """Add section titles with different formatting based on level"""
        self.ln(5)
        if level == 1:
            self.set_font("Arial", "B", 14)
            self.set_fill_color(220, 220, 220)
            self.cell(0, 10, self.clean_text(title), 0, 1, "L", True)
        elif level == 2:
            self.set_font("Arial", "B", 12)
            self.cell(0, 10, self.clean_text(title), 0, 1, "L")
        else:
            self.set_font("Arial", "B", 11)
            self.cell(0, 8, self.clean_text(title), 0, 1, "L")
        self.ln(2)
    
    def add_paragraph(self, text):
        """Add a text paragraph"""
        self.set_font("Arial", "", 10)
        self.multi_cell(0, 5, self.clean_text(text))
        self.ln(3)
    
    def add_bullet_list(self, items):
        """Add a bulleted list of items"""
        self.set_font("Arial", "", 10)
        left_margin = self.l_margin
        self.set_left_margin(left_margin + 10)
        
        for item in items:
            # Use • as bullet point
            self.cell(5, 5, "•", 0, 0, "L")
            self.multi_cell(0, 5, self.clean_text(item))
            self.ln(2)
            
        self.set_left_margin(left_margin)
        self.ln(3)
    
    def add_table(self, headers, rows, column_widths=None):
        """Add a table with headers and rows"""
        self.set_font("Arial", "B", 10)
        
        # Set default column widths if not provided
        if column_widths is None:
            num_columns = len(headers)
            available_width = self.w - 2 * self.l_margin
            column_widths = [available_width / num_columns] * num_columns
        
        # Table headers with gray background
        self.set_fill_color(200, 200, 200)
        for i, header in enumerate(headers):
            self.cell(column_widths[i], 7, self.clean_text(header), 1, 0, "C", True)
        self.ln()
        
        # Table rows with alternating background
        self.set_font("Arial", "", 10)
        fill = False
        for row in rows:
            height = 7
            # Calculate height required for this row based on max text length
            for i, cell_text in enumerate(row):
                cell_text = self.clean_text(str(cell_text))
                if self.get_string_width(cell_text) > column_widths[i]:
                    # Rough estimation - adjust if needed
                    lines = int(self.get_string_width(cell_text) / column_widths[i]) + 1
                    height = max(height, lines * 5)
            
            # Print the row
            self.set_fill_color(240, 240, 240)
            for i, cell_text in enumerate(row):
                self.cell(column_widths[i], height, self.clean_text(str(cell_text)), 1, 0, "L", fill)
            self.ln()
            fill = not fill
        
        self.ln(5)
        
    def create_executive_summary(self):
        """Generate the executive summary section"""
        exec_summary = self.report_data.get("executiveSummary", {})
        
        self.add_title("Executive Summary")
        
        if "overview" in exec_summary:
            self.add_paragraph(exec_summary["overview"])
        
        if "keyFindings" in exec_summary:
            self.add_title("Key Findings", 2)
            self.add_bullet_list(exec_summary["keyFindings"])
        
        if "strategicRecommendations" in exec_summary:
            self.add_title("Strategic Recommendations", 2)
            self.add_bullet_list(exec_summary["strategicRecommendations"])
        
        decision_matrix = exec_summary.get("decisionMatrix", {})
        if decision_matrix:
            self.add_title("Decision Matrix", 2)
            headers = ["Assessment Area", "Evaluation"]
            rows = []
            
            if "riskAssessment" in decision_matrix:
                rows.append(["Risk Assessment", decision_matrix["riskAssessment"]])
            if "timeToMarket" in decision_matrix:
                rows.append(["Time to Market", decision_matrix["timeToMarket"]])
            if "competitivePosition" in decision_matrix:
                rows.append(["Competitive Position", decision_matrix["competitivePosition"]])
            if "regulatoryOutlook" in decision_matrix:
                rows.append(["Regulatory Outlook", decision_matrix["regulatoryOutlook"]])
                
            if rows:
                self.add_table(headers, rows, [60, 120])
                
    def create_historical_benchmarking(self):
        """Generate the historical benchmarking section"""
        benchmarking = self.report_data.get("historicalBenchmarking", {})
        
        self.add_title("Historical Benchmarking")
        
        # Matching criteria
        criteria = benchmarking.get("matchingCriteria", {})
        if criteria:
            self.add_title("Matching Criteria", 2)
            criteria_text = f"Indication: {criteria.get('indication', 'N/A')}, Phase: {criteria.get('phase', 'N/A')}"
            
            add_filters = criteria.get("additionalFilters", [])
            if add_filters:
                criteria_text += f"\nAdditional filters: {', '.join(add_filters)}"
                
            self.add_paragraph(criteria_text)
            
        # Relevant precedents
        precedents = benchmarking.get("relevantPrecedents", [])
        if precedents:
            self.add_title("Relevant Trial Precedents", 2)
            
            headers = ["CSR ID", "Sponsor", "Phase", "Sample Size", "Outcome"]
            rows = []
            
            for p in precedents:
                rows.append([
                    p.get("csrId", "N/A"),
                    p.get("sponsor", "N/A"),
                    p.get("phase", "N/A"),
                    p.get("sampleSize", "N/A"),
                    p.get("outcome", "N/A")
                ])
                
            self.add_table(headers, rows, [30, 50, 25, 30, 50])
                
        # Benchmark metrics
        metrics = benchmarking.get("benchmarkMetrics", {})
        if metrics:
            self.add_title("Benchmark Metrics", 2)
            
            metrics_text = []
            if "medianSampleSize" in metrics:
                metrics_text.append(f"Median Sample Size: {metrics['medianSampleSize']} (Range: {metrics.get('sampleSizeRange', 'N/A')})")
            if "medianDuration" in metrics:
                metrics_text.append(f"Median Study Duration: {metrics['medianDuration']} (Range: {metrics.get('durationRange', 'N/A')})")
            if "successRate" in metrics:
                metrics_text.append(f"Historical Success Rate: {metrics['successRate']}%")
            if "averageDropoutRate" in metrics:
                metrics_text.append(f"Average Dropout Rate: {metrics['averageDropoutRate']}%")
                
            self.add_bullet_list(metrics_text)
            
            if "commonRegulatoryChallenges" in metrics:
                self.add_title("Common Regulatory Challenges", 3)
                self.add_bullet_list(metrics["commonRegulatoryChallenges"])
                
    def create_endpoint_benchmarking(self):
        """Generate the endpoint benchmarking section"""
        endpoints = self.report_data.get("endpointBenchmarking", {})
        
        self.add_title("Endpoint Benchmarking")
        
        # Primary endpoints
        primary = endpoints.get("primaryEndpoints", [])
        if primary:
            self.add_title("Primary Endpoints Analysis", 2)
            
            for endpoint in primary:
                self.set_font("Arial", "B", 11)
                self.cell(0, 7, self.clean_text(endpoint.get("name", "Unnamed Endpoint")), 0, 1, "L")
                
                endpoint_metrics = []
                if "frequencyScore" in endpoint:
                    endpoint_metrics.append(f"Usage Frequency: {endpoint['frequencyScore']}/100")
                if "successRate" in endpoint:
                    endpoint_metrics.append(f"Success Rate: {endpoint['successRate']}%")
                if "timeToResult" in endpoint:
                    endpoint_metrics.append(f"Time to Result: {endpoint['timeToResult']}")
                if "regulatoryAcceptance" in endpoint:
                    endpoint_metrics.append(f"Regulatory Acceptance: {endpoint['regulatoryAcceptance']}")
                    
                self.add_bullet_list(endpoint_metrics)
                
                # Show predecessor use if available
                pred_use = endpoint.get("predecessorUse", [])
                if pred_use:
                    self.set_font("Arial", "I", 10)
                    self.cell(0, 5, "Examples of usage in prior studies:", 0, 1, "L")
                    
                    pred_examples = []
                    for pred in pred_use:
                        pred_examples.append(f"{pred.get('csrId', 'N/A')}: {pred.get('specificDefinition', 'N/A')} - Outcome: {pred.get('outcome', 'N/A')}")
                    
                    self.add_bullet_list(pred_examples)
        
        # Secondary endpoints (similar format to primary)
        secondary = endpoints.get("secondaryEndpoints", [])
        if secondary:
            self.add_title("Secondary Endpoints Analysis", 2)
            
            for endpoint in secondary:
                self.set_font("Arial", "B", 11)
                self.cell(0, 7, self.clean_text(endpoint.get("name", "Unnamed Endpoint")), 0, 1, "L")
                
                endpoint_metrics = []
                if "frequencyScore" in endpoint:
                    endpoint_metrics.append(f"Usage Frequency: {endpoint['frequencyScore']}/100")
                if "successRate" in endpoint:
                    endpoint_metrics.append(f"Success Rate: {endpoint['successRate']}%")
                if "correlationWithPrimary" in endpoint:
                    endpoint_metrics.append(f"Correlation with Primary: {endpoint['correlationWithPrimary']}")
                if "regulatoryValue" in endpoint:
                    endpoint_metrics.append(f"Regulatory Value: {endpoint['regulatoryValue']}")
                    
                self.add_bullet_list(endpoint_metrics)
                
        # Endpoint recommendations
        recommendations = endpoints.get("endpointRecommendations", [])
        if recommendations:
            self.add_title("Endpoint Recommendations", 2)
            
            for i, rec in enumerate(recommendations):
                self.set_font("Arial", "B", 10)
                self.cell(0, 7, f"{i+1}. {self.clean_text(rec.get('recommendation', 'N/A'))}", 0, 1, "L")
                
                self.set_font("Arial", "", 10)
                if "confidence" in rec:
                    self.cell(0, 5, f"Confidence: {rec['confidence']}", 0, 1, "L")
                if "rationale" in rec:
                    self.cell(0, 5, f"Rationale: {rec['rationale']}", 0, 1, "L")
                if "supportingEvidence" in rec:
                    self.cell(0, 5, f"Evidence: {rec['supportingEvidence']}", 0, 1, "L")
                
                self.ln(3)
                    
    def create_design_risk_prediction(self):
        """Generate the design risk prediction section"""
        risk = self.report_data.get("designRiskPrediction", {})
        
        self.add_title("Design Risk Prediction")
        
        if "overallRiskScore" in risk:
            self.add_paragraph(f"Overall Risk Score: {risk['overallRiskScore']}/100")
            
        # Risk categories
        categories = risk.get("riskCategories", [])
        if categories:
            self.add_title("Risk Categories", 2)
            
            headers = ["Category", "Risk Score", "Key Factors"]
            rows = []
            
            for cat in categories:
                factors = ", ".join(cat.get("keyFactors", ["N/A"]))
                rows.append([
                    cat.get("category", "N/A"),
                    f"{cat.get('score', 'N/A')}/100",
                    factors[:50] + ("..." if len(factors) > 50 else "")
                ])
                
            self.add_table(headers, rows, [50, 30, 100])
            
        # Sample size sensitivity
        sensitivity = risk.get("sensitivityAnalysis", {}).get("sampleSizeSensitivity", {})
        if sensitivity:
            self.add_title("Sample Size Sensitivity Analysis", 2)
            
            self.add_paragraph(f"Recommended Sample Size: {sensitivity.get('recommendedSampleSize', 'N/A')}")
            
            # Power analysis details
            power = sensitivity.get("powerAnalysisDetails", {})
            if power:
                power_details = []
                if "effect" in power:
                    power_details.append(f"Expected Effect Size: {power['effect']}")
                if "power" in power:
                    power_details.append(f"Statistical Power: {power['power']}")
                if "alpha" in power:
                    power_details.append(f"Alpha Level: {power['alpha']}")
                
                if power_details:
                    self.add_bullet_list(power_details)
            
        # Dropout risk analysis
        dropout = risk.get("sensitivityAnalysis", {}).get("dropoutRiskAnalysis", {})
        if dropout:
            self.add_title("Dropout Risk Analysis", 2)
            
            self.add_paragraph(f"Predicted Dropout Rate: {dropout.get('predictedDropoutRate', 'N/A')}%")
            
            if "factors" in dropout:
                self.add_title("Dropout Risk Factors", 3)
                self.add_bullet_list(dropout["factors"])
                
            if "recommendations" in dropout:
                self.add_title("Recommendations to Address Dropout", 3)
                self.add_bullet_list(dropout["recommendations"])
                
    def create_competitive_landscape(self):
        """Generate the competitive landscape section"""
        landscape = self.report_data.get("competitiveLandscape", {})
        
        self.add_title("Competitive Landscape")
        
        if "marketOverview" in landscape:
            self.add_paragraph(landscape["marketOverview"])
            
        # Key competitors
        competitors = landscape.get("keyCompetitors", [])
        if competitors:
            self.add_title("Key Competitors", 2)
            
            headers = ["Competitor", "Phase", "Time to Market", "Threat Level"]
            rows = []
            
            for comp in competitors:
                rows.append([
                    comp.get("name", "N/A"),
                    comp.get("phase", "N/A"),
                    comp.get("timeToMarket", "N/A"),
                    comp.get("threatLevel", "N/A")
                ])
                
            self.add_table(headers, rows, [50, 30, 50, 40])
            
        # Strategic positioning
        positioning = landscape.get("strategicPositioning", {})
        if positioning:
            self.add_title("Strategic Positioning", 2)
            
            if "recommendedPositioning" in positioning:
                self.add_paragraph(positioning["recommendedPositioning"])
                
            if "keyDifferentiators" in positioning:
                self.add_title("Key Differentiators", 3)
                self.add_bullet_list(positioning["keyDifferentiators"])
                
    def create_ai_recommendations(self):
        """Generate the AI-powered recommendations section"""
        ai_recs = self.report_data.get("aiRecommendations", {})
        
        self.add_title("AI-Powered Strategic Recommendations")
        
        # Design recommendations
        design_recs = ai_recs.get("designRecommendations", [])
        if design_recs:
            self.add_title("Design Recommendations", 2)
            
            for i, rec in enumerate(design_recs):
                self.set_font("Arial", "B", 10)
                self.cell(0, 7, f"{i+1}. {rec.get('area', 'General')}: {self.clean_text(rec.get('recommendation', 'N/A'))}", 0, 1, "L")
                
                self.set_font("Arial", "", 10)
                rec_details = []
                if "confidence" in rec:
                    rec_details.append(f"Confidence: {rec['confidence']}")
                if "impact" in rec:
                    rec_details.append(f"Expected Impact: {rec['impact']}")
                if "evidence" in rec:
                    rec_details.append(f"Supporting Evidence: {rec['evidence']}")
                
                self.add_bullet_list(rec_details)
                
                if "implementationNotes" in rec:
                    self.set_font("Arial", "I", 10)
                    self.multi_cell(0, 5, f"Implementation Notes: {self.clean_text(rec['implementationNotes'])}")
                    self.ln(3)
                    
        # Risk mitigation strategy
        risk_mitigation = ai_recs.get("riskMitigationStrategy", {})
        if risk_mitigation:
            self.add_title("Risk Mitigation Strategy", 2)
            
            if "keyRisks" in risk_mitigation:
                self.add_title("Key Identified Risks", 3)
                self.add_bullet_list(risk_mitigation["keyRisks"])
                
            # Mitigation plan
            mitigation_plan = risk_mitigation.get("mitigationPlan", [])
            if mitigation_plan:
                self.add_title("Mitigation Plan", 3)
                
                headers = ["Risk", "Mitigation Strategy", "Contingency Plan"]
                rows = []
                
                for plan in mitigation_plan:
                    rows.append([
                        plan.get("risk", "N/A"),
                        plan.get("mitigationStrategy", "N/A"),
                        plan.get("contingencyPlan", "N/A")
                    ])
                    
                self.add_table(headers, rows, [40, 70, 70])
                
    def create_protocol_design_summary(self):
        """Generate the protocol design summary section"""
        design = self.report_data.get("protocolDesignSummary", {})
        
        self.add_title("Protocol Design Summary")
        
        # Design structure
        structure = design.get("designStructure", {})
        if structure:
            self.add_title("Design Structure", 2)
            
            if "title" in structure:
                self.add_paragraph(f"Study Title: {structure['title']}")
                
            if "population" in structure:
                self.add_paragraph(f"Population: {structure['population']}")
                
            objectives = structure.get("objectives", {})
            if objectives:
                self.add_title("Study Objectives", 3)
                
                if "primary" in objectives:
                    self.add_paragraph(f"Primary Objective: {objectives['primary']}")
                    
                if "secondary" in objectives:
                    self.add_paragraph("Secondary Objectives:")
                    self.add_bullet_list(objectives["secondary"])
                    
            endpoints = structure.get("endpoints", {})
            if endpoints:
                self.add_title("Study Endpoints", 3)
                
                if "primary" in endpoints:
                    self.add_paragraph(f"Primary Endpoint: {endpoints['primary']}")
                    
                if "secondary" in endpoints:
                    self.add_paragraph("Secondary Endpoints:")
                    self.add_bullet_list(endpoints["secondary"])
                    
            if "studyDesign" in structure:
                self.add_paragraph(f"Study Design: {structure['studyDesign']}")
                
            arms = structure.get("arms", [])
            if arms:
                self.add_title("Study Arms", 3)
                
                headers = ["Arm", "Description", "Size"]
                rows = []
                
                for arm in arms:
                    rows.append([
                        arm.get("name", "N/A"),
                        arm.get("description", "N/A"),
                        arm.get("size", "N/A")
                    ])
                    
                self.add_table(headers, rows, [40, 110, 30])
                
        # Statistical approach
        stats = design.get("statisticalApproach", {})
        if stats:
            self.add_title("Statistical Approach", 2)
            
            stats_details = []
            if "primaryAnalysis" in stats:
                stats_details.append(f"Primary Analysis: {stats['primaryAnalysis']}")
            if "powerCalculations" in stats:
                stats_details.append(f"Power Calculations: {stats['powerCalculations']}")
            if "interimAnalyses" in stats:
                stats_details.append(f"Interim Analyses: {stats['interimAnalyses']}")
            if "multiplicityConcerns" in stats:
                stats_details.append(f"Multiplicity Concerns: {stats['multiplicityConcerns']}")
            
            if stats_details:
                self.add_bullet_list(stats_details)
                
    def generate_pdf(self, output_path=None):
        """Generate the complete PDF report"""
        if output_path is None:
            output_path = f"strategic_report_{int(time.time())}.pdf"
            
        # Add first page with metadata
        self.add_page()
        
        metadata = self.report_data.get("metadata", {})
        
        # Report title page
        self.set_font("Arial", "B", 16)
        self.cell(0, 20, self.clean_text(metadata.get("title", "Strategic Intelligence Report")), ln=True, align="C")
        
        self.set_font("Arial", "B", 14)
        self.cell(0, 15, f"Protocol ID: {metadata.get('protocolId', 'N/A')}", ln=True, align="C")
        
        self.set_font("Arial", "", 12)
        self.cell(0, 10, f"Indication: {metadata.get('indication', 'N/A')} | Phase: {metadata.get('phase', 'N/A')}", ln=True, align="C")
        self.cell(0, 10, f"Sponsor: {metadata.get('sponsor', 'N/A')}", ln=True, align="C")
        
        self.set_font("Arial", "I", 10)
        self.ln(15)
        self.cell(0, 10, f"Report ID: {metadata.get('reportId', 'N/A')}", ln=True, align="C")
        self.cell(0, 10, f"Generated: {metadata.get('generatedDate', 'N/A')}", ln=True, align="C")
        self.cell(0, 10, f"Version: {metadata.get('version', '1.0')}", ln=True, align="C")
        
        # Confidentiality statement
        self.ln(15)
        self.set_font("Arial", "B", 10)
        self.cell(0, 10, f"Confidentiality Level: {metadata.get('confidentialityLevel', 'Confidential')}", ln=True, align="C")
        self.set_font("Arial", "I", 9)
        self.multi_cell(0, 5, "This document contains proprietary and confidential information. Any unauthorized review, use, disclosure, or distribution is prohibited.")
        
        # Table of contents page
        self.add_page()
        self.set_font("Arial", "B", 14)
        self.cell(0, 15, "Table of Contents", ln=True, align="L")
        
        self.set_font("Arial", "", 12)
        self.cell(0, 10, "1. Executive Summary", ln=True)
        self.cell(0, 10, "2. Historical Benchmarking", ln=True)
        self.cell(0, 10, "3. Endpoint Benchmarking", ln=True)
        self.cell(0, 10, "4. Design Risk Prediction", ln=True)
        self.cell(0, 10, "5. Competitive Landscape", ln=True)
        self.cell(0, 10, "6. AI-Powered Strategic Recommendations", ln=True)
        self.cell(0, 10, "7. Protocol Design Summary", ln=True)
        
        # Generate report sections
        self.add_page()
        self.create_executive_summary()
        
        self.add_page()
        self.create_historical_benchmarking()
        
        self.add_page()
        self.create_endpoint_benchmarking()
        
        self.add_page()
        self.create_design_risk_prediction()
        
        self.add_page()
        self.create_competitive_landscape()
        
        self.add_page()
        self.create_ai_recommendations()
        
        self.add_page()
        self.create_protocol_design_summary()
        
        # Export PDF
        self.output(output_path)
        return output_path

def generate_strategic_report_pdf(report_data, output_path=None):
    """
    Generate a strategic report PDF from report data
    
    Args:
        report_data (dict): Strategic report data in JSON format
        output_path (str, optional): Path to save the PDF file. If None, a timestamped name is used.
        
    Returns:
        str: Path to the generated PDF file
    """
    if isinstance(report_data, str):
        try:
            report_data = json.loads(report_data)
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON string provided")
    
    pdf = StrategicReportPDF(report_data)
    output_path = pdf.generate_pdf(output_path)
    
    return output_path

# Example usage
if __name__ == "__main__":
    # Load sample report data
    sample_path = "server/templates/sample-strategic-report.json"
    
    if os.path.exists(sample_path):
        with open(sample_path, "r") as f:
            sample_data = json.load(f)
    else:
        # Use minimal sample data if file doesn't exist
        sample_data = {
            "metadata": {
                "reportId": "SR12345",
                "title": "Sample Strategic Report",
                "generatedDate": "2025-04-11",
                "protocolId": "PROTO-2025-001",
                "indication": "Diabetes",
                "phase": "Phase 2",
                "sponsor": "Sample Pharma"
            },
            "executiveSummary": {
                "overview": "This is a sample strategic report.",
                "keyFindings": ["Finding 1", "Finding 2"],
                "strategicRecommendations": ["Recommendation 1", "Recommendation 2"]
            }
        }
    
    output_path = generate_strategic_report_pdf(sample_data)
    print(f"Strategic report generated: {output_path}")