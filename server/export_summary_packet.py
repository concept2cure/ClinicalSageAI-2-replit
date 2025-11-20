#!/usr/bin/env python3
"""
Summary Packet Export API
This script provides an API endpoint for exporting summary intelligence packets as PDFs
with multiple data sources including reasoning trace logs
"""

import os
import json
import sys
import smtplib
import zipfile
from datetime import datetime
from typing import Dict, List, Optional, Any
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from fastapi import FastAPI, Body, HTTPException
from fpdf import FPDF

# Import branded cover sheet module
from branded_cover_sheet import generate_cover_sheet, load_session_metadata
# Import export utilities for generating trial strategy deck
from export_utils import auto_generate_trial_strategy_deck, update_export_log

app = FastAPI(title="Summary Packet Export Service")

@app.post("/api/export/summary-packet")
def export_summary_packet(data: Dict = Body(...)):
    """
    Generate a comprehensive summary packet PDF with multiple intelligence components:
    - Dropout risk forecast
    - Success prediction
    - IND Module 2.5 summary
    - AI reasoning trace (wisdom log)
    
    Args:
        data: Dictionary containing export parameters including session_id
        
    Returns:
        Dictionary with status and path to generated PDF
    """
    session_id = data.get("session_id", "default_session")
    persona = data.get("persona", "Regulatory")
    
    # Determine archive directory based on environment
    if os.path.exists("/mnt/data"):
        # Production environment
        archive_dir = f"/mnt/data/lumen_reports_backend/sessions/{session_id}"
    else:
        # Development environment
        archive_dir = f"data/sessions/{session_id}"
    
    os.makedirs(archive_dir, exist_ok=True)

    # Initialize PDF
    pdf_path = os.path.join(archive_dir, "summary_packet.pdf")
    pdf = FPDF()
    
    # Add branded cover sheet
    sections = [
        "Dropout Risk Forecast",
        "Success Prediction Model",
        "IND Module 2.5 Summary",
        "CSR Alignment Overview",
        "Assistant Reasoning Trace"
    ]
    
    # Load metadata from session files
    protocol_metadata = load_session_metadata(session_id)
    
    # Generate the branded cover sheet
    generate_cover_sheet(
        pdf=pdf, 
        title="Clinical Trial Intelligence Summary",
        session_id=session_id,
        persona=persona,
        sections=sections,
        protocol_metadata=protocol_metadata,
        report_type="Summary Intelligence Packet"
    )
    
    # Add Executive Design Brief section (key strategic summary)
    pdf.set_font("Arial", "B", 14)
    pdf.cell(0, 12, txt="🧠 Executive Design Brief", 0, 1, 'L')
    pdf.set_font("Arial", size=10)
    
    # Read alignment score
    alignment_score = "N/A"
    suggestion_count = 0
    csr_source = "N/A"
    
    # Get alignment score data
    alignment_path = os.path.join(archive_dir, "alignment_score_report.json")
    if os.path.exists(alignment_path):
        try:
            with open(alignment_path, "r") as f:
                alignment_data = json.load(f)
                alignment_score = f"{round(alignment_data.get('alignment_score', 0) * 100)}%"
                
                # Extract CSR source info if available
                csr_id = alignment_data.get("csr_id")
                csr_source = f"CSR #{csr_id}" if csr_id else "Multiple CSRs"
        except Exception as e:
            print(f"Error reading alignment data: {str(e)}")
    
    # Get protocol improvement suggestions count
    suggestions_path = os.path.join(archive_dir, "suggested_corrections.json")
    if os.path.exists(suggestions_path):
        try:
            with open(suggestions_path, "r") as f:
                suggestions_data = json.load(f)
                suggestions = suggestions_data.get("suggestions", [])
                suggestion_count = len(suggestions)
        except Exception as e:
            print(f"Error reading suggestions data: {str(e)}")
    
    # Determine AI confidence rating based on available data
    confidence_rating = "High"
    if alignment_score != "N/A" and alignment_score[:-1].isdigit():
        score_val = int(alignment_score[:-1])
        if score_val < 50:
            confidence_rating = "Medium"
        elif score_val < 30:
            confidence_rating = "Low"
    
    # Create executive summary block with key metrics
    pdf.ln(2)
    pdf.set_font("Arial", "B", size=10)
    pdf.cell(55, 8, "Study ID:", 0, 0)
    pdf.set_font("Arial", size=10)
    pdf.cell(0, 8, session_id, 0, 1)
    
    pdf.set_font("Arial", "B", size=10)
    pdf.cell(55, 8, "CSR Source:", 0, 0)
    pdf.set_font("Arial", size=10)
    pdf.cell(0, 8, csr_source, 0, 1)
    
    pdf.set_font("Arial", "B", size=10)
    pdf.cell(55, 8, "CSR Alignment Score:", 0, 0)
    pdf.set_font("Arial", size=10)
    pdf.cell(0, 8, alignment_score, 0, 1)
    
    pdf.set_font("Arial", "B", size=10)
    pdf.cell(55, 8, "Improvement Suggestions:", 0, 0)
    pdf.set_font("Arial", size=10)
    pdf.cell(0, 8, str(suggestion_count), 0, 1)
    
    pdf.set_font("Arial", "B", size=10)
    pdf.cell(55, 8, "AI Confidence Rating:", 0, 0)
    pdf.set_font("Arial", size=10)
    pdf.cell(0, 8, confidence_rating, 0, 1)
    
    pdf.set_font("Arial", "B", size=10)
    pdf.cell(55, 8, "Analysis Timestamp:", 0, 0)
    pdf.set_font("Arial", size=10)
    pdf.cell(0, 8, f"{datetime.now().strftime('%Y-%m-%d %H:%M')}", 0, 1)
    
    pdf.set_font("Arial", "B", size=10)
    pdf.cell(55, 8, "Persona:", 0, 0)
    pdf.set_font("Arial", size=10)
    pdf.cell(0, 8, persona.title(), 0, 1)
    
    pdf.ln(3)
    pdf.set_font("Arial", "I", size=9)
    pdf.multi_cell(0, 5, "All insights generated using CSR-backed evidence, semantic alignment, and protocol validation tools built into LumenTrialGuide.AI.")
    
    # Add a separator line
    pdf.ln(5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(8)
    
    # Session ID and generation timestamp moved to bottom
    # pdf.set_font("Arial", "I", size=11)
    # pdf.cell(0, 10, txt=f"Session ID: {session_id}", 0, 1, 'C')
    # pdf.cell(0, 5, txt=f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}", 0, 1, 'C')
    # pdf.ln(5)

    # Add dropout forecast section
    dropout_path = os.path.join(archive_dir, "dropout_forecast.json")
    if os.path.exists(dropout_path):
        try:
            with open(dropout_path, "r") as f:
                dropout_data = json.load(f)
                summary = dropout_data.get("summary", "")
                pdf.ln(5)
                pdf.set_font("Arial", "B", size=12)
                pdf.cell(0, 10, txt="📉 Dropout Risk Forecast", 0, 1, 'L')
                pdf.set_font("Arial", size=10)
                pdf.multi_cell(0, 5, summary)
                
                # Add risk level if available
                risk_level = dropout_data.get("risk_level", "")
                if risk_level:
                    pdf.ln(3)
                    pdf.set_font("Arial", "B", size=10)
                    pdf.cell(30, 5, "Risk Level:", 0, 0)
                    pdf.set_font("Arial", size=10)
                    pdf.cell(0, 5, risk_level.upper(), 0, 1)
                    
                # Add completion rate if available
                completion_rate = dropout_data.get("expected_completion_rate", 0)
                if completion_rate:
                    pdf.set_font("Arial", "B", size=10)
                    pdf.cell(30, 5, "Completion Rate:", 0, 0)
                    pdf.set_font("Arial", size=10)
                    pdf.cell(0, 5, f"{completion_rate}%", 0, 1)
        except Exception as e:
            pdf.multi_cell(0, 5, f"Error loading dropout forecast: {str(e)}")

    # Add success prediction section
    success_path = os.path.join(archive_dir, "success_prediction.json")
    if os.path.exists(success_path):
        try:
            with open(success_path, "r") as f:
                pred_data = json.load(f)
                pdf.ln(10)
                pdf.set_font("Arial", "B", size=12)
                pdf.cell(0, 10, txt="📈 Predicted Trial Outcome", 0, 1, 'L')
                
                # Extract key values with defaults
                probability = pred_data.get("probability", pred_data.get("success_probability", 0))
                method = pred_data.get("method", pred_data.get("model_name", "Statistical Model"))
                confidence = pred_data.get("confidence", 0.5)
                factors = pred_data.get("factors", [])
                
                # Format probability as percentage
                prob_pct = round(probability * 100)
                
                # Determine color based on probability
                if prob_pct >= 70:
                    color_text = "green"
                elif prob_pct >= 50:
                    color_text = "amber"
                else:
                    color_text = "red"
                
                # Add formatted prediction text
                pdf.set_font("Arial", "B", size=11)
                pdf.cell(0, 8, f"{prob_pct}% Success Probability ({color_text})", 0, 1)
                
                # Add model and confidence info
                confidence_text = "Low" if confidence < 0.4 else "Medium" if confidence < 0.7 else "High"
                pdf.set_font("Arial", "I", size=10)
                pdf.cell(0, 5, f"Model: {method} | Confidence: {confidence_text}", 0, 1)
                pdf.ln(5)
                
                # Add prediction summary if available
                summary = pred_data.get("summary", "")
                if summary:
                    pdf.set_font("Arial", size=10)
                    pdf.multi_cell(0, 5, summary)
                    pdf.ln(5)
                
                # Add contributing factors if available
                if factors:
                    pdf.set_font("Arial", "B", size=10)
                    pdf.cell(0, 5, "Key Contributing Factors:", 0, 1)
                    pdf.ln(2)
                    
                    pdf.set_font("Arial", size=9)
                    for factor in factors:
                        # Handle both string factors and dictionary factors
                        if isinstance(factor, dict):
                            factor_text = f"{factor.get('factor', '')}: {factor.get('impact', '')}"
                        else:
                            factor_text = factor
                            
                        pdf.cell(5, 5, "•", 0, 0)
                        pdf.multi_cell(0, 5, factor_text)
        except Exception as e:
            pdf.multi_cell(0, 5, f"Error loading success prediction: {str(e)}")
    
    # Add IND Module 2.5 summary
    ind_path = os.path.join(archive_dir, "ind_summary.txt")
    if os.path.exists(ind_path):
        try:
            with open(ind_path, "r") as f:
                ind_text = f.read()
                pdf.ln(10)
                pdf.set_font("Arial", "B", size=12)
                pdf.cell(0, 10, txt="📄 IND Module 2.5 Summary", 0, 1, 'L')
                pdf.set_font("Arial", size=10)
                pdf.multi_cell(0, 5, ind_text.strip())
        except Exception as e:
            pdf.multi_cell(0, 5, f"Error loading IND summary: {str(e)}")
    
    # Add CSR Alignment Overview section
    alignment_path = os.path.join(archive_dir, "alignment_score_report.json")
    if os.path.exists(alignment_path):
        try:
            with open(alignment_path, "r") as f:
                alignment_data = json.load(f)
                
                # Add a new page for the alignment section
                pdf.add_page()
                pdf.set_font("Arial", "B", size=12)
                pdf.cell(0, 10, txt="📎 CSR Alignment Overview", 0, 1, 'L')
                
                # Display overall alignment score
                overall_score = alignment_data.get("alignment_score", 0)
                score_percentage = round(overall_score * 100)
                pdf.set_font("Arial", "B", size=11)
                pdf.cell(0, 10, f"Overall Alignment Score: {score_percentage}%", 0, 1, 'L')
                
                # Add AI summary explanation
                matched_fields = alignment_data.get("matched_fields", [])
                match_count = sum(1 for field in matched_fields if field.get("similarity", 0) >= 0.7)
                total_fields = len(matched_fields)
                
                # Generate explanation text based on match count and fields
                pdf.set_font("Arial", "I", size=10)
                pdf.multi_cell(0, 5, f"Design aligns {match_count}/{total_fields} key fields with historical precedent. {generate_alignment_summary(matched_fields)}")
                pdf.ln(5)
                
                # Create a table header for field comparisons
                pdf.set_font("Arial", "B", size=10)
                pdf.cell(50, 7, "Field", 1, 0, 'C')
                pdf.cell(70, 7, "Protocol Value", 1, 0, 'C')
                pdf.cell(70, 7, "CSR Value", 1, 0, 'C')
                pdf.cell(30, 7, "Status", 1, 1, 'C')
                
                # Add each matched field to the table
                pdf.set_font("Arial", "", size=9)
                for field in matched_fields:
                    field_name = field.get("field", "")
                    protocol_value = str(field.get("protocol", ""))
                    csr_value = str(field.get("csr", ""))
                    similarity = field.get("similarity", 0)
                    
                    # Determine match status
                    if similarity >= 0.7:
                        status = "✅ Match"
                    else:
                        status = "⚠️ Divergence"
                    
                    # Format long values to fit in cells
                    if len(protocol_value) > 50:
                        protocol_value = protocol_value[:47] + "..."
                    if len(csr_value) > 50:
                        csr_value = csr_value[:47] + "..."
                    
                    # Add row to table
                    pdf.cell(50, 7, field_name.replace("_", " ").title(), 1, 0)
                    pdf.cell(70, 7, protocol_value, 1, 0)
                    pdf.cell(70, 7, csr_value, 1, 0)
                    pdf.cell(30, 7, status, 1, 1, 'C')
                
                # Add risk flags if any
                risk_flags = alignment_data.get("risk_flags", [])
                if risk_flags:
                    pdf.ln(5)
                    pdf.set_font("Arial", "B", size=10)
                    pdf.cell(0, 7, "Risk Flags:", 0, 1)
                    
                    pdf.set_font("Arial", "", size=9)
                    for flag in risk_flags:
                        pdf.cell(5, 5, "•", 0, 0)
                        pdf.multi_cell(0, 5, flag)
                
                # Add recommended adjustments if any
                recommendations = alignment_data.get("recommended_adjustments", [])
                if recommendations:
                    pdf.ln(5)
                    pdf.set_font("Arial", "B", size=10)
                    pdf.cell(0, 7, "Recommended Adjustments:", 0, 1)
                    
                    pdf.set_font("Arial", "", size=9)
                    for rec in recommendations:
                        pdf.cell(5, 5, "•", 0, 0)
                        pdf.multi_cell(0, 5, rec)
                        
        except Exception as e:
            pdf.multi_cell(0, 5, f"Error loading alignment data: {str(e)}")
    
    # Add reasoning trace (wisdom log)
    wisdom_path = os.path.join(archive_dir, "reasoning_trace.txt")
    if os.path.exists(wisdom_path):
        try:
            with open(wisdom_path, "r") as f:
                wisdom_text = f.read()
                pdf.add_page()
                pdf.set_font("Arial", "B", size=12)
                pdf.cell(0, 10, txt="🧠 AI Reasoning Trace", 0, 1, 'L')
                pdf.set_font("Arial", "I", size=9)
                pdf.cell(0, 5, txt="How the AI assistant reached these conclusions:", 0, 1)
                pdf.ln(5)
                
                # Add collapsible explanation of reasoning trace
                pdf.set_font("Arial", size=10)
                pdf.multi_cell(0, 5, "This section documents the step-by-step reasoning process the AI used to generate recommendations. It's intended for transparency, auditability, and regulatory documentation.")
                pdf.ln(5)
                
                # Format and add wisdom text, breaking into sections if needed
                pdf.set_font("Arial", size=9)
                
                # Process reasoning trace by paragraphs for better formatting
                paragraphs = wisdom_text.split('\n\n')
                for i, para in enumerate(paragraphs):
                    if para.strip():  # Skip empty paragraphs
                        # Add section headers if detected
                        if para.strip().startswith('# ') or para.strip().startswith('## '):
                            pdf.set_font("Arial", "B", size=10)
                            pdf.multi_cell(0, 5, para.strip().replace('#', '').strip())
                            pdf.set_font("Arial", size=9)
                        else:
                            pdf.multi_cell(0, 5, para.strip())
                        
                        # Add a small gap between paragraphs
                        if i < len(paragraphs) - 1:
                            pdf.ln(2)
        except Exception as e:
            pdf.multi_cell(0, 5, f"Error loading reasoning trace: {str(e)}")
    
    # Finalize and save PDF
    pdf.output(pdf_path)
    
    # Auto-generate Trial Strategy Deck alongside PDF
    try:
        # Generate the deck using the utility function (persona based on PDF export)
        strategy_deck_result = auto_generate_trial_strategy_deck(session_id, persona.lower())
        print(f"Auto-generated Trial Strategy Deck for session {session_id}: {strategy_deck_result['status']}")
    except Exception as e:
        print(f"Error generating Trial Strategy Deck: {str(e)}")
    
    # Log export for audit trail
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Look up email recipient for this session if available
    recipient_email = None
    email_store_path = os.path.join("/mnt/data/lumen_reports_backend/static/session_emails.json")
    if os.path.exists(email_store_path):
        try:
            with open(email_store_path, "r") as f:
                email_store = json.load(f)
                recipient_email = email_store.get(session_id)
        except Exception as e:
            print(f"Error loading email store: {str(e)}")
    
    # Create export log entry
    export_log = {
        "last_exported": timestamp,
        "filename": f"summary_packet_{session_id}_{timestamp}.pdf",
        "recipient": recipient_email or "N/A"
    }
    
    # Save export log
    export_log_path = os.path.join(archive_dir, "export_log.json")
    
    # Check if existing log exists and update it
    if os.path.exists(export_log_path):
        try:
            with open(export_log_path, "r") as f:
                existing_log = json.load(f)
                
                # Handle both formats (single object or array of objects)
                if isinstance(existing_log, list):
                    existing_log.append(export_log)
                else:
                    # Convert to array format
                    existing_log = [existing_log, export_log]
                    
            with open(export_log_path, "w") as f:
                json.dump(existing_log, f, indent=2)
        except Exception as e:
            print(f"Error updating export log: {str(e)}")
            # Fallback to creating new log
            with open(export_log_path, "w") as f:
                json.dump(export_log, f, indent=2)
    else:
        # Create new log file
        with open(export_log_path, "w") as f:
            json.dump(export_log, f, indent=2)
    
    # Send email notification if recipient email is available
    if recipient_email:
        try:
            send_export_notification_email(
                recipient_email, 
                session_id, 
                export_log["filename"], 
                f"/api/download/summary-packet/{session_id}"
            )
        except Exception as e:
            print(f"Error sending email notification: {str(e)}")
    
    # Return the path to the generated PDF
    return {
        "status": "ok", 
        "path": f"/static/{session_id}/summary_packet.pdf",
        "sections_included": {
            "dropout_forecast": os.path.exists(dropout_path),
            "success_prediction": os.path.exists(success_path),
            "ind_summary": os.path.exists(ind_path),
            "reasoning_trace": os.path.exists(wisdom_path)
        },
        "export_log": export_log
    }


def generate_alignment_summary(matched_fields: list) -> str:
    """
    Generate a descriptive summary based on matched fields
    
    Args:
        matched_fields: List of field match data
        
    Returns:
        A descriptive string summary of protocol alignment with CSR data
    """
    high_matches = [field for field in matched_fields if field.get("similarity", 0) >= 0.8]
    medium_matches = [field for field in matched_fields if 0.6 <= field.get("similarity", 0) < 0.8]
    low_matches = [field for field in matched_fields if field.get("similarity", 0) < 0.6]
    
    if not matched_fields:
        return "No field comparisons available."
    
    # Generate summary based on match counts
    if len(high_matches) >= len(matched_fields) * 0.7:
        return "Protocol shows strong alignment with historical CSR evidence, suggesting good design foundation."
    elif len(high_matches) + len(medium_matches) >= len(matched_fields) * 0.6:
        return "Protocol shows moderate alignment with CSR evidence, with some adjustments recommended."
    else:
        major_concerns = []
        if any(field["field"] == "primary_endpoint" for field in low_matches):
            major_concerns.append("primary endpoint")
        if any(field["field"] == "sample_size" for field in low_matches):
            major_concerns.append("sample size")
        if any(field["field"] == "duration_weeks" for field in low_matches):
            major_concerns.append("duration")
        
        if major_concerns:
            return f"Significant divergences from CSR evidence in {', '.join(major_concerns)}. Review strongly recommended."
        else:
            return "Protocol shows limited alignment with historical CSR precedent. Consider revisions."


def send_export_notification_email(recipient_email: str, session_id: str, filename: str, download_url: str) -> bool:
    """
    Send a notification email when a summary packet is exported
    
    Args:
        recipient_email: Email address to send notification to
        session_id: ID of the session that was exported
        filename: Name of the exported PDF file
        download_url: URL to download the exported summary packet
        
    Returns:
        True if email sent successfully, False otherwise
    """
    try:
        # Check if we have SMTP credentials configured
        smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "")
        smtp_password = os.getenv("SMTP_PASSWORD", "")
        
        # If we don't have SMTP credentials, log and return False
        if not smtp_user or not smtp_password:
            print("SMTP credentials not configured, skipping email notification")
            return False
            
        # Configure email content
        msg = MIMEMultipart()
        msg['From'] = smtp_user
        msg['To'] = recipient_email
        msg['Subject'] = f"Your Summary Intelligence Packet is Ready - Session {session_id}"
        
        # Build email body
        body = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background-color: #4a6fdc; color: white; padding: 15px; text-align: center; border-radius: 5px 5px 0 0; }}
                .content {{ background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }}
                .button {{ background-color: #4a6fdc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0; }}
                .footer {{ font-size: 12px; color: #777; margin-top: 20px; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>Your Summary Intelligence Packet is Ready</h2>
                </div>
                <div class="content">
                    <p>Hello,</p>
                    <p>Your summary intelligence packet for session <strong>{session_id}</strong> has been successfully exported and is now ready for download.</p>
                    
                    <h3>Export Details:</h3>
                    <ul>
                        <li><strong>Session ID:</strong> {session_id}</li>
                        <li><strong>File:</strong> {filename}</li>
                        <li><strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</li>
                    </ul>
                    
                    <p>You can download your intelligence packet by clicking the button below or accessing it from your session summary panel.</p>
                    
                    <a href="{download_url}" class="button">Download Summary Packet</a>
                    
                    <p>If you have any questions about this export or need assistance with regulatory submissions, please contact our support team.</p>
                    
                    <p>Thank you for using LumenTrialGuide.AI</p>
                </div>
                <div class="footer">
                    <p>This is an automated message. Please do not reply to this email.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Attach HTML content
        msg.attach(MIMEText(body, 'html'))
        
        # Connect to SMTP server and send email
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
            
        print(f"Email notification sent to {recipient_email} for session {session_id}")
        return True
        
    except Exception as e:
        print(f"Failed to send email notification: {str(e)}")
        return False


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)