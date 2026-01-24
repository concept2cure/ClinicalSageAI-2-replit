#!/usr/bin/env python3
"""
Protocol Intelligence Report Generator
This script generates PDF reports with protocol analysis results and benchmark comparisons
"""

import os
import json
import sys
from fpdf import FPDF
import time
import argparse
from datetime import datetime

# Ensure reports directory exists
os.makedirs("data/reports", exist_ok=True)

def hard_clean_text(text):
    """Deep sanitization of all unicode characters before writing to PDF
    This function ensures complete compatibility with PDF generation by removing or 
    replacing all potentially problematic characters. Critical for PDF export reliability.
    """
    if not text:
        return ""
    
    # First pass: Replace common problematic characters with ASCII equivalents
    replacements = {
        # Quotes and apostrophes
        "'": "'", "'": "'", "‚": ",", "‛": "'",
        """: '"', """: '"', "„": '"', "‟": '"',
        # Dashes and hyphens
        "–": "-", "—": "-", "―": "-", "‐": "-", "‑": "-", "‒": "-", "‾": "-",
        # Math symbols
        "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~", "≡": "=", "≜": "=", "≝": "=", "≞": "=", "≟": "=",
        "±": "+/-", "∓": "-/+", "÷": "/", "×": "x", "⋅": "*", "∙": "*", "⋯": "...", "…": "...",
        "√": "sqrt", "∛": "cbrt", "∜": "4rt",
        "∑": "sum", "∏": "prod", "∐": "coprod", "∫": "int", "∬": "iint", "∭": "iiint", "∮": "oint",
        "∞": "inf", "∝": "prop to", "∀": "for all", "∃": "exists", "∄": "not exists", "∴": "therefore", "∵": "because",
        "⊂": "subset", "⊃": "superset", "⊆": "subseteq", "⊇": "supseteq", "⊄": "not subset", "⊅": "not superset",
        "∈": "in", "∉": "not in", "∋": "ni", "∌": "not ni", "∩": "intersect", "∪": "union", "⊎": "uplus",
        # Arrows and direction
        "←": "<-", "→": "->", "↑": "^", "↓": "v", "↔": "<->", "↕": "^v", "⇐": "<=", "⇒": "=>", "⇑": "^", "⇓": "v", "⇔": "<=>",
        # Greek letters (common in scientific writing)
        "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta", "η": "eta",
        "θ": "theta", "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu", "ν": "nu", "ξ": "xi",
        "π": "pi", "ρ": "rho", "σ": "sigma", "τ": "tau", "υ": "upsilon", "φ": "phi", "χ": "chi",
        "ψ": "psi", "ω": "omega",
        "Α": "Alpha", "Β": "Beta", "Γ": "Gamma", "Δ": "Delta", "Ε": "Epsilon", "Ζ": "Zeta", "Η": "Eta",
        "Θ": "Theta", "Ι": "Iota", "Κ": "Kappa", "Λ": "Lambda", "Μ": "Mu", "Ν": "Nu", "Ξ": "Xi",
        "Π": "Pi", "Ρ": "Rho", "Σ": "Sigma", "Τ": "Tau", "Υ": "Upsilon", "Φ": "Phi", "Χ": "Chi",
        "Ψ": "Psi", "Ω": "Omega",
        # Common symbols
        "©": "(c)", "®": "(R)", "™": "(TM)", "℠": "(SM)", "℗": "(P)",
        "•": "*", "·": "*", "⋆": "*", "∗": "*",
        "°": " degrees ", "′": "'", "″": '"',
        "†": "+", "‡": "++", "§": "Section", "¶": "Paragraph", "‖": "||",
        # Currency symbols
        "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "₽": "RUB", "₩": "KRW", "₺": "TRY", "₴": "UAH",
        # Whitespace and special characters
        "\u00A0": " ", "\u2002": " ", "\u2003": " ", "\u2004": " ", "\u2005": " ",
        "\u2006": " ", "\u2007": " ", "\u2008": " ", "\u2009": " ", "\u200A": " ",
        "\u200B": "", "\u200C": "", "\u200D": "", "\u2060": "",
        # Fractions
        "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5",
        "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅐": "1/7", "⅛": "1/8", "⅜": "3/8",
        "⅝": "5/8", "⅞": "7/8", "⅑": "1/9", "⅒": "1/10",
        # Superscripts
        "⁰": "^0", "¹": "^1", "²": "^2", "³": "^3", "⁴": "^4", "⁵": "^5", "⁶": "^6", "⁷": "^7", "⁸": "^8", "⁹": "^9",
        "⁺": "^+", "⁻": "^-", "⁼": "^=", "⁽": "^(", "⁾": "^)",
        # Subscripts
        "₀": "_0", "₁": "_1", "₂": "_2", "₃": "_3", "₄": "_4", "₅": "_5", "₆": "_6", "₇": "_7", "₈": "_8", "₉": "_9",
        "₊": "_+", "₋": "_-", "₌": "_=", "₍": "_(", "₎": "_)",
        # Accented characters (common in European languages)
        "à": "a", "á": "a", "â": "a", "ä": "a", "ã": "a", "å": "a", "æ": "ae",
        "è": "e", "é": "e", "ê": "e", "ë": "e",
        "ì": "i", "í": "i", "î": "i", "ï": "i",
        "ò": "o", "ó": "o", "ô": "o", "ö": "o", "õ": "o", "ø": "o", "œ": "oe",
        "ù": "u", "ú": "u", "û": "u", "ü": "u",
        "ý": "y", "ÿ": "y",
        "ç": "c", "ñ": "n",
        "À": "A", "Á": "A", "Â": "A", "Ä": "A", "Ã": "A", "Å": "A", "Æ": "AE",
        "È": "E", "É": "E", "Ê": "E", "Ë": "E",
        "Ì": "I", "Í": "I", "Î": "I", "Ï": "I",
        "Ò": "O", "Ó": "O", "Ô": "O", "Ö": "O", "Õ": "O", "Ø": "O", "Œ": "OE",
        "Ù": "U", "Ú": "U", "Û": "U", "Ü": "U",
        "Ý": "Y", "Ÿ": "Y",
        "Ç": "C", "Ñ": "N",
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    # Second pass: Strip any remaining non-ASCII characters to ensure PDF compatibility
    text = ''.join(c if ord(c) < 128 else ' ' for c in text)
    
    # Third pass: Normalize whitespace (no double spaces, no leading/trailing whitespace)
    text = ' '.join(text.split())
    
    return text

# Alias for backward compatibility
deep_clean = hard_clean_text

class ProtocolReportPDF(FPDF):
    def __init__(self, protocol_id, title=None):
        super().__init__()
        self.protocol_id = deep_clean(str(protocol_id))
        self.title = deep_clean(title if title else f"Protocol Intelligence Report - {protocol_id}")
        self.set_auto_page_break(auto=True, margin=15)
    
    def header(self):
        # Title
        self.set_font('Arial', 'B', 14)
        self.cell(0, 10, self.title, 0, 1, 'C')
        
        # Subtitle with date
        self.set_font('Arial', 'I', 10)
        date_str = datetime.now().strftime('%Y-%m-%d')
        self.cell(0, 5, f"Generated on {date_str}", 0, 1, 'C')
        
        # Line break
        self.ln(5)
    
    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')
    
    def add_section(self, title, content):
        self.set_font('Arial', 'B', 12)
        self.cell(0, 10, deep_clean(title), 0, 1, 'L')
        self.ln(1)
        
        self.set_font('Arial', '', 11)
        self.multi_cell(0, 5, deep_clean(content))
        self.ln(3)
    
    def add_bullet_list(self, items):
        self.set_font('Arial', '', 11)
        for item in items:
            self.cell(10, 5, chr(8226), 0, 0, 'R')  # bullet character
            self.multi_cell(0, 5, item)
            self.ln(1)
            
    def add_success_prediction(self, prediction_data):
        """Add success prediction section to PDF with visualization"""
        if not prediction_data:
            return
            
        self.add_section("Trial Success Prediction", "AI-powered outcome probability forecast")
        
        # Extract prediction data
        success_probability = prediction_data.get('success_probability', 0)
        confidence = prediction_data.get('confidence', 0)
        model_name = prediction_data.get('model_name', 'Statistical Model')
        factors = prediction_data.get('factors', [])
        summary = prediction_data.get('summary', '')
        
        # Add formatted probability
        self.set_font('Arial', 'B', 14)
        
        # Determine color based on probability
        if success_probability >= 0.7:
            self.set_text_color(0, 128, 0)  # Green for high probability
        elif success_probability >= 0.4:
            self.set_text_color(255, 165, 0)  # Orange for medium probability
        else:
            self.set_text_color(255, 0, 0)  # Red for low probability
            
        # Display probability as percentage
        self.cell(0, 10, f"{success_probability * 100:.1f}% Probability of Success", 0, 1, 'C')
        self.set_text_color(0, 0, 0)  # Reset text color
        
        # Add confidence level
        self.set_font('Arial', 'I', 10)
        confidence_text = "Low Confidence" if confidence < 0.4 else \
                          "Medium Confidence" if confidence < 0.7 else \
                          "High Confidence"
        self.cell(0, 5, f"Model: {model_name} ({confidence_text})", 0, 1, 'C')
        self.ln(5)
        
        # Add summary if available
        if summary:
            self.set_font('Arial', '', 11)
            self.multi_cell(0, 5, deep_clean(summary))
            self.ln(5)
        
        # Visualize probability as progress bar
        bar_width = 150
        bar_height = 20
        x = (self.w - bar_width) / 2  # Center the bar
        y = self.get_y()
        
        # Draw background bar (gray)
        self.set_fill_color(240, 240, 240)
        self.rect(x, y, bar_width, bar_height, 'F')
        
        # Draw filled portion based on probability (use color based on value)
        if success_probability >= 0.7:
            self.set_fill_color(0, 128, 0)  # Green
        elif success_probability >= 0.4:
            self.set_fill_color(255, 165, 0)  # Orange
        else:
            self.set_fill_color(255, 0, 0)  # Red
            
        filled_width = bar_width * success_probability
        if filled_width > 0:  # Only draw if there's something to fill
            self.rect(x, y, filled_width, bar_height, 'F')
        
        # Add percentage label in the middle of the bar
        self.set_font('Arial', 'B', 11)
        self.set_text_color(255, 255, 255) if success_probability > 0.4 else self.set_text_color(0, 0, 0)
        self.set_xy(x, y + (bar_height/2) - 3)
        self.cell(bar_width, 6, f"{success_probability * 100:.1f}%", 0, 0, 'C')
        self.set_text_color(0, 0, 0)  # Reset text color
        
        # Move below the bar
        self.ln(bar_height + 10)
        
        # Add contributing factors if available
        if factors:
            self.set_font('Arial', 'B', 11)
            self.cell(0, 5, "Contributing Factors:", 0, 1)
            self.ln(2)
            
            self.set_font('Arial', '', 10)
            for factor in factors:
                factor_name = factor.get('factor', '')
                impact = factor.get('impact', '')
                weight = factor.get('weight', 0)
                
                if not factor_name:
                    continue
                    
                # Determine impact color
                if 'positive' in impact.lower() or 'increase' in impact.lower():
                    impact_color = (0, 128, 0)  # Green for positive
                elif 'negative' in impact.lower() or 'decrease' in impact.lower():
                    impact_color = (255, 0, 0)  # Red for negative
                else:
                    impact_color = (100, 100, 100)  # Gray for neutral
                
                # Draw factor with colored impact
                self.set_font('Arial', 'B', 10)
                self.cell(5, 5, "•", 0, 0)
                self.cell(60, 5, deep_clean(factor_name), 0, 0)
                
                self.set_font('Arial', '', 10)
                self.set_text_color(*impact_color)
                self.cell(0, 5, deep_clean(impact), 0, 1)
                self.set_text_color(0, 0, 0)  # Reset text color
                
            self.ln(5)
        
        # Add recommendations if available
        recommendations = prediction_data.get('recommendations', [])
        if recommendations:
            self.set_font('Arial', 'B', 11)
            self.cell(0, 5, "Recommendations to Improve Success:", 0, 1)
            self.ln(2)
            
            self.set_font('Arial', '', 10)
            for rec in recommendations:
                self.cell(5, 5, "✓", 0, 0)
                self.multi_cell(0, 5, deep_clean(rec))
                
        self.ln(5)
        # Add some space after the bullet list
        self.ln(3)
    
    def add_bar_chart(self, title, labels, values1, values2, labels1="Your Protocol", labels2="CSR Median"):
        self.set_font('Arial', 'B', 12)
        self.cell(0, 10, deep_clean(title), 0, 1, 'L')
        
        # Chart area
        chart_y = self.get_y()
        chart_height = 50  # height of chart
        bar_width = 20     # width of each bar
        max_value = max(max(values1), max(values2)) * 1.1  # max value with 10% padding
        scale_factor = chart_height / max_value if max_value > 0 else 1
        
        # Draw chart grid
        self.set_draw_color(200, 200, 200)
        
        # Draw value axis (vertical)
        self.line(30, chart_y, 30, chart_y + chart_height)
        
        # Draw labels axis (horizontal)
        self.line(30, chart_y + chart_height, 180, chart_y + chart_height)
        
        # Draw bars
        self.set_font('Arial', '', 8)
        x_pos = 40
        
        # Draw legend
        legend_y = chart_y + chart_height + 15
        
        # Legend for protocol
        self.set_fill_color(100, 149, 237)  # Cornflower blue
        self.rect(40, legend_y, 5, 5, 'F')
        self.set_xy(47, legend_y - 1)
        self.cell(30, 5, labels1, 0, 0)
        
        # Legend for CSR median
        self.set_fill_color(60, 179, 113)  # Medium sea green
        self.rect(90, legend_y, 5, 5, 'F')
        self.set_xy(97, legend_y - 1)
        self.cell(30, 5, labels2, 0, 0)
        
        # Draw bars and labels
        for i in range(len(labels)):
            # Draw category label
            self.set_xy(x_pos, chart_y + chart_height + 5)
            self.cell(bar_width * 2, 5, deep_clean(labels[i]), 0, 0, 'C')
            
            # Draw protocol bar
            protocol_height = values1[i] * scale_factor
            self.set_fill_color(100, 149, 237)  # Cornflower blue
            self.rect(x_pos, chart_y + chart_height - protocol_height, bar_width, protocol_height, 'F')
            
            # Draw value above bar
            self.set_xy(x_pos, chart_y + chart_height - protocol_height - 8)
            self.cell(bar_width, 5, str(values1[i]), 0, 0, 'C')
            
            # Draw CSR median bar
            median_height = values2[i] * scale_factor
            self.set_fill_color(60, 179, 113)  # Medium sea green
            self.rect(x_pos + bar_width, chart_y + chart_height - median_height, bar_width, median_height, 'F')
            
            # Draw value above bar
            self.set_xy(x_pos + bar_width, chart_y + chart_height - median_height - 8)
            self.cell(bar_width, 5, str(values2[i]), 0, 0, 'C')
            
            x_pos += bar_width * 3
        
        # Move to position after chart
        self.set_y(legend_y + 15)

def generate_intelligence_report(protocol_data, benchmarks, prediction, protocol_id, output_path=None, regulatory_data=None):
    """Generate a full protocol intelligence report PDF with global regulatory intelligence"""
    # Create PDF
    pdf = ProtocolReportPDF(protocol_id, f"Global Protocol Intelligence Report: {protocol_data.get('indication', 'Unknown')} Trial")
    pdf.add_page()
    
    # Protocol Summary Section
    summary_content = f"""
Indication: {protocol_data.get('indication', 'N/A')}
Phase: {protocol_data.get('phase', 'N/A')}
Sample Size: {protocol_data.get('sample_size', 'N/A')}
Duration: {protocol_data.get('duration_weeks', 'N/A')} weeks
Dropout Rate: {protocol_data.get('dropout_rate', 0) * 100:.1f}%
"""
    
    if 'primary_endpoints' in protocol_data and protocol_data['primary_endpoints']:
        if isinstance(protocol_data['primary_endpoints'], list):
            endpoint_text = protocol_data['primary_endpoints'][0]
        else:
            endpoint_text = protocol_data['primary_endpoints']
        summary_content += f"Primary Endpoint: {endpoint_text}\n"
    
    # Add global intelligence fields if available
    if protocol_data.get('geographic_regions'):
        if isinstance(protocol_data['geographic_regions'], list):
            regions_text = ", ".join(protocol_data['geographic_regions'])
        else:
            regions_text = protocol_data['geographic_regions']
        summary_content += f"Geographic Regions: {regions_text}\n"
    
    pdf.add_section("Protocol Summary", summary_content)
    
    # Success Prediction Section
    prediction_value = prediction if isinstance(prediction, (int, float)) else 0.5
    pdf.add_section("Trial Success Prediction", f"{prediction_value * 100:.1f}%")
    
    # Add visual chart comparison
    chart_labels = ["Sample Size", "Duration", "Dropout %"]
    protocol_values = [
        protocol_data.get('sample_size', 0),
        protocol_data.get('duration_weeks', 0),
        protocol_data.get('dropout_rate', 0) * 100
    ]
    
    benchmark_values = [
        benchmarks.get('avg_sample_size', 0),
        benchmarks.get('avg_duration', 0),
        benchmarks.get('avg_dropout', 0) * 100
    ]
    
    pdf.add_bar_chart("Visual Protocol Comparison", chart_labels, protocol_values, benchmark_values)
    
    # CSR Benchmark Comparison Section
    benchmark_content = f"""
Based on {benchmarks.get('total_trials', 0)} CSR-matched trials:

Avg Sample Size: {benchmarks.get('avg_sample_size', 'N/A')}
Avg Duration: {benchmarks.get('avg_duration', 'N/A')} weeks
Avg Dropout Rate: {benchmarks.get('avg_dropout', 0) * 100:.1f}%
"""
    
    if 'success_rate' in benchmarks and benchmarks['success_rate'] is not None:
        benchmark_content += f"Historical Success Rate: {benchmarks['success_rate'] * 100:.1f}%\n"
    
    pdf.add_section("CSR Benchmark Comparison", benchmark_content)
    
    # Global Regulatory Intelligence Section
    if regulatory_data or protocol_data.get('global_compliance') or protocol_data.get('regulatory_notes'):
        pdf.add_page()
        pdf.add_section("Global Regulatory Intelligence", "Cross-regional regulatory compliance analysis:")
        
        # Formatted regulatory notes
        if protocol_data.get('regulatory_notes'):
            pdf.add_section("Key Regulatory Insights", protocol_data.get('regulatory_notes', ''))
        
        # Global compliance table
        if protocol_data.get('global_compliance'):
            pdf.set_font('Arial', 'B', 11)
            pdf.cell(80, 8, "Regulatory Region", 1)
            pdf.cell(40, 8, "Compliance", 1)
            pdf.cell(70, 8, "Key Requirements", 1)
            pdf.ln()
            
            pdf.set_font('Arial', '', 10)
            
            # Get region information
            regions = {
                'FDA': 'US FDA', 
                'EMA': 'European EMA', 
                'PMDA': 'Japan PMDA', 
                'NMPA': 'China NMPA',
                'MHRA': 'UK MHRA',
                'TGA': 'Australia TGA',
                'ANVISA': 'Brazil ANVISA',
                'CDSCO': 'India CDSCO'
            }
            
            global_compliance = protocol_data.get('global_compliance', {})
            regional_requirements = protocol_data.get('regional_requirements', {})
            
            for region_id, region_name in regions.items():
                compliant = global_compliance.get(region_id, False)
                requirements = regional_requirements.get(region_id, [])
                
                if isinstance(requirements, list) and requirements:
                    req_text = requirements[0]
                else:
                    req_text = str(requirements) if requirements else "Standard requirements apply"
                
                status = "✓ Compliant" if compliant else "⚠ Review Needed"
                status_color = (0, 128, 0) if compliant else (220, 50, 50)  # Green or Red
                
                pdf.cell(80, 8, region_name, 1)
                
                # Save current settings
                current_text_color = pdf.text_color
                
                # Change text color for status
                pdf.set_text_color(*status_color)
                pdf.cell(40, 8, status, 1)
                
                # Restore text color
                pdf.set_text_color(*current_text_color)
                
                pdf.cell(70, 8, deep_clean(req_text)[:40] + "...", 1)
                pdf.ln()
            
            pdf.ln(5)
        
        # Ethnic considerations
        if protocol_data.get('ethnic_considerations'):
            ethnic_considerations = protocol_data.get('ethnic_considerations', [])
            if ethnic_considerations:
                pdf.add_section("Ethnic and Cultural Considerations", "")
                if isinstance(ethnic_considerations, list):
                    pdf.add_bullet_list(ethnic_considerations)
                else:
                    pdf.multi_cell(0, 5, deep_clean(str(ethnic_considerations)))
        
        # Site distribution
        if protocol_data.get('site_distribution'):
            site_dist = protocol_data.get('site_distribution', {})
            if site_dist:
                content = "Recommended site distribution:\n\n"
                for region, count in site_dist.items():
                    content += f"{region}: {count} sites\n"
                pdf.add_section("Global Site Distribution", content)
    
    # Recommendations Section
    pdf.add_page()
    recommendations = []
    
    # Sample size recommendation
    if protocol_data.get('sample_size', 0) < benchmarks.get('avg_sample_size', 0) * 0.9:
        recommendations.append(f"Consider increasing sample size to closer to CSR average ({benchmarks.get('avg_sample_size', 'N/A')})")
    elif protocol_data.get('sample_size', 0) > benchmarks.get('avg_sample_size', 0) * 1.3:
        recommendations.append(f"Your sample size is larger than average, which may increase costs but provide stronger statistical power")
    else:
        recommendations.append(f"Your sample size is well aligned with CSR precedent")
    
    # Duration recommendation
    if protocol_data.get('duration_weeks', 0) < benchmarks.get('avg_duration', 0) * 0.7:
        recommendations.append(f"Trial duration ({protocol_data.get('duration_weeks', 0)} weeks) is shorter than average ({benchmarks.get('avg_duration', 'N/A')} weeks) - consider if this is sufficient for endpoint measurement")
    elif protocol_data.get('duration_weeks', 0) > benchmarks.get('avg_duration', 0) * 1.3:
        recommendations.append(f"Trial duration is longer than average - consider patient retention strategies to maintain compliance")
    else:
        recommendations.append(f"Your trial duration is well aligned with CSR precedent")
    
    # Dropout recommendation
    benchmark_dropout = benchmarks.get('avg_dropout', 0)
    protocol_dropout = protocol_data.get('dropout_rate', 0)
    
    if protocol_dropout < benchmark_dropout * 0.7:
        recommendations.append(f"Your dropout assumption of {protocol_dropout * 100:.1f}% appears optimistic compared to historical average of {benchmark_dropout * 100:.1f}%")
    else:
        recommendations.append(f"Your dropout rate assumption appears realistic based on historical data")
    
    # Success prediction recommendation
    if prediction_value > 0.7:
        recommendations.append(f"Your protocol shows promising success indicators with {prediction_value * 100:.1f}% predicted probability")
    elif prediction_value < 0.5:
        recommendations.append(f"Your protocol has a lower predicted success probability ({prediction_value * 100:.1f}%) - consider addressing the factors above")
    else:
        recommendations.append(f"Your protocol has a moderate predicted success probability ({prediction_value * 100:.1f}%) - consider optimizations noted above")
    
    # Add global recommendations if available
    if protocol_data.get('global_compliance'):
        non_compliant_regions = []
        for region, compliant in protocol_data.get('global_compliance', {}).items():
            if not compliant:
                region_names = {
                    'FDA': 'US FDA', 
                    'EMA': 'European EMA', 
                    'PMDA': 'Japan PMDA', 
                    'NMPA': 'China NMPA',
                    'MHRA': 'UK MHRA',
                    'TGA': 'Australia TGA',
                    'ANVISA': 'Brazil ANVISA',
                    'CDSCO': 'India CDSCO'
                }
                non_compliant_regions.append(region_names.get(region, region))
        
        if non_compliant_regions:
            regions_text = ", ".join(non_compliant_regions)
            recommendations.append(f"Address regulatory compliance issues for: {regions_text}")
    
    # Add ethnic diversity considerations
    if not protocol_data.get('ethnic_considerations') and protocol_data.get('geographic_regions') and len(protocol_data.get('geographic_regions', [])) > 1:
        recommendations.append("Consider adding specific ethnic diversity considerations for your multi-region trial")
    
    # Add translation requirements if missing
    if protocol_data.get('geographic_regions') and len(protocol_data.get('geographic_regions', [])) > 1 and not protocol_data.get('translation_requirements'):
        recommendations.append("Document translation requirements for consent forms and patient materials across all regions")
    
    pdf.add_section("Strategic Recommendations", "Based on global CSR analysis, ML prediction, and regulatory intelligence:")
    pdf.add_bullet_list(recommendations)
    
    # Add timestamp and source note
    pdf.set_font('Arial', 'I', 9)
    pdf.cell(0, 5, f"Generated by TrialSage Intelligence Engine on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", 0, 1, 'C')
    
    # Determine output path if not provided
    if not output_path:
        timestamp = int(time.time())
        output_path = f"data/reports/{protocol_id}_intelligence_{timestamp}.pdf"
    
    # Save the PDF
    pdf.output(output_path)
    
    return output_path

def main():
    parser = argparse.ArgumentParser(description="Generate global protocol intelligence report PDF")
    parser.add_argument("--protocol", required=True, help="Protocol data JSON file")
    parser.add_argument("--benchmarks", required=True, help="Benchmark data JSON file")
    parser.add_argument("--prediction", type=float, default=0.5, help="Success prediction value (0-1)")
    parser.add_argument("--id", default="protocol", help="Protocol identifier")
    parser.add_argument("--regulatory", help="Regulatory data JSON file")
    parser.add_argument("--output", help="Output PDF path")
    
    args = parser.parse_args()
    
    # Load protocol data
    with open(args.protocol, 'r', encoding='utf-8') as f:
        protocol_data = json.load(f)
    
    # Load benchmark data
    with open(args.benchmarks, 'r', encoding='utf-8') as f:
        benchmarks = json.load(f)
    
    # Load regulatory data if provided
    regulatory_data = None
    if args.regulatory:
        try:
            with open(args.regulatory, 'r', encoding='utf-8') as f:
                regulatory_data = json.load(f)
        except Exception as e:
            print(f"Warning: Could not load regulatory data: {e}")
    
    # Generate report
    output_path = generate_intelligence_report(
        protocol_data, 
        benchmarks, 
        args.prediction, 
        args.id,
        output_path=args.output,
        regulatory_data=regulatory_data
    )
    
    print(f"Global protocol intelligence report generated successfully at {output_path}")
    return output_path

if __name__ == "__main__":
    main()