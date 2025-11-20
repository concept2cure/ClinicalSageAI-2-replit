import os
import json
import time
from datetime import datetime, timedelta
from fpdf import FPDF

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

def get_recent_protocol_changes(days=7):
    """
    Get all protocol changes from the past week from dossier files
    
    Args:
        days: Number of days to look back for changes
        
    Returns:
        List of change entries with metadata
    """
    dossiersDir = os.path.join(os.getcwd(), 'data/dossiers')
    if not os.path.exists(dossiersDir):
        return []
        
    cutoff_date = datetime.now() - timedelta(days=days)
    changes = []
    
    # Iterate through all dossier files
    for filename in os.listdir(dossiersDir):
        if not filename.endswith('.json'):
            continue
            
        dossier_path = os.path.join(dossiersDir, filename)
        
        try:
            with open(dossier_path, 'r') as f:
                dossier = json.load(f)
                
            protocol_id = dossier.get('protocol_id', 'unknown')
            user_id = dossier.get('user_id', 'unknown')
            
            # Look for recent reports
            for report in dossier.get('reports', []):
                created_at = report.get('created_at')
                if not created_at:
                    continue
                    
                # Parse the timestamp
                try:
                    report_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                except (ValueError, TypeError):
                    # If date parsing fails, use a fallback approach
                    try:
                        report_date = datetime.strptime(created_at[:19], "%Y-%m-%dT%H:%M:%S")
                    except (ValueError, TypeError):
                        continue
                
                # Check if report is within the time window
                if report_date >= cutoff_date:
                    # Extract relevant data
                    version = report.get('version', 'unknown')
                    changelog = report.get('changelog', [])
                    summary = report.get('summary', 'Protocol updated')
                    
                    # Check for SAP updates
                    has_sap = bool(report.get('original', {}).get('sap'))
                    
                    # Get prediction changes
                    prev_prediction = report.get('previous_prediction')
                    current_prediction = report.get('original', {}).get('prediction')
                    prediction_change = None
                    
                    if prev_prediction is not None and current_prediction is not None:
                        change = (current_prediction - prev_prediction) * 100
                        if abs(change) >= 1:  # Only report meaningful changes (≥1%)
                            prediction_change = f"{change:+.1f}% success probability"
                    
                    changes.append({
                        'protocol_id': protocol_id,
                        'user_id': user_id,
                        'version': version,
                        'date': report_date,
                        'changelog': changelog,
                        'summary': summary,
                        'has_sap': has_sap,
                        'prediction_change': prediction_change
                    })
        except Exception as e:
            print(f"Error processing dossier {filename}: {e}")
            continue
    
    # Sort changes by date (newest first)
    changes.sort(key=lambda x: x['date'], reverse=True)
    return changes

def generate_text_digest(changes):
    """
    Generate a plain text digest of recent protocol changes
    
    Args:
        changes: List of change entries with metadata
        
    Returns:
        A formatted text digest
    """
    if not changes:
        return "No protocol changes in the past week."
        
    digest = "🧠 TrialSage Weekly Digest\n\n"
    
    for i, change in enumerate(changes, 1):
        protocol_id = change['protocol_id']
        version = change['version']
        date_str = change['date'].strftime("%Y-%m-%d")
        
        digest += f"{i}. {version} of {protocol_id} saved on {date_str}\n"
        
        # Add changelog if available
        if change['changelog']:
            for log_entry in change['changelog']:
                digest += f"   🔁 {log_entry}\n"
        
        # Add SAP update if available
        if change['has_sap']:
            digest += f"   🧾 SAP updated\n"
        
        # Add prediction change if available
        if change['prediction_change']:
            digest += f"   📊 {change['prediction_change']}\n"
        
        # Add hypothetical download links
        digest += f"   📥 Reports: /reports/{protocol_id}_{version}.pdf\n"
        if change['has_sap']:
            digest += f"   🧾 SAP: /sap/{protocol_id}_{version}_sap.pdf\n"
        
        digest += "\n"
    
    return digest

def generate_pdf_digest(changes, output_path=None):
    """
    Generate a PDF digest of recent protocol changes
    
    Args:
        changes: List of change entries with metadata
        output_path: Optional path to save the PDF
        
    Returns:
        Path to the generated PDF
    """
    if not changes:
        return None
        
    class DigestPDF(FPDF):
        def header(self):
            self.set_font("Arial", "B", 16)
            self.cell(0, 10, "TrialSage Weekly Protocol Digest", ln=True, align="C")
            self.set_font("Arial", "I", 10)
            self.cell(0, 5, f"Generated on {datetime.now().strftime('%Y-%m-%d')}", ln=True, align="C")
            self.ln(5)
            
        def footer(self):
            self.set_y(-15)
            self.set_font("Arial", "I", 8)
            self.cell(0, 10, f"Page {self.page_no()}", 0, 0, "C")
    
    pdf = DigestPDF()
    pdf.add_page()
    
    # Add summary
    pdf.set_font("Arial", "B", 12)
    pdf.cell(0, 10, f"Protocol Changes Summary ({len(changes)} updates in the past week)", ln=True)
    pdf.ln(5)
    
    # Add each change
    for i, change in enumerate(changes, 1):
        protocol_id = change['protocol_id']
        version = change['version']
        date_str = change['date'].strftime("%Y-%m-%d")
        
        # Protocol header
        pdf.set_font("Arial", "B", 11)
        pdf.cell(0, 8, f"{i}. Protocol {protocol_id} - {version} ({date_str})", ln=True)
        
        # Summary
        pdf.set_font("Arial", "", 10)
        pdf.multi_cell(0, 6, deep_clean(f"Summary: {change['summary']}"))
        
        # Changelog
        if change['changelog']:
            pdf.ln(2)
            pdf.set_font("Arial", "B", 10)
            pdf.cell(0, 6, "Changes:", ln=True)
            pdf.set_font("Arial", "", 10)
            
            for log_entry in change['changelog']:
                pdf.cell(10)  # Indent
                pdf.multi_cell(0, 6, deep_clean(f"• {log_entry}"))
        
        # SAP update
        if change['has_sap']:
            pdf.ln(2)
            pdf.set_font("Arial", "B", 10)
            pdf.cell(0, 6, "Statistical Analysis Plan:", ln=True)
            pdf.set_font("Arial", "", 10)
            pdf.cell(10)
            pdf.multi_cell(0, 6, "• SAP has been updated based on protocol changes")
        
        # Prediction change
        if change['prediction_change']:
            pdf.ln(2)
            pdf.set_font("Arial", "B", 10)
            pdf.cell(0, 6, "Success Prediction:", ln=True)
            pdf.set_font("Arial", "", 10)
            pdf.cell(10)
            pdf.multi_cell(0, 6, deep_clean(f"• {change['prediction_change']}"))
        
        pdf.ln(5)
    
    # Set default output path if none provided
    if not output_path:
        reports_dir = os.path.join('temp', 'reports')
        os.makedirs(reports_dir, exist_ok=True)
        output_path = os.path.join(reports_dir, f"TrialSage_Weekly_Digest_{int(time.time())}.pdf")
    
    pdf.output(output_path)
    return output_path

if __name__ == "__main__":
    # Set days to look back (default: 7 days)
    days_back = 7
    
    # Get recent changes
    changes = get_recent_protocol_changes(days=days_back)
    
    # Generate text digest
    text_digest = generate_text_digest(changes)
    print("\n==== TEXT DIGEST ====\n")
    print(text_digest)
    
    # Generate PDF digest
    if changes:
        pdf_path = generate_pdf_digest(changes)
        print(f"\nPDF digest generated: {pdf_path}")
    else:
        print("\nNo changes found, PDF digest not generated.")