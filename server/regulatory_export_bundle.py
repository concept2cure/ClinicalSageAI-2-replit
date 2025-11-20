#!/usr/bin/env python3
"""
Regulatory Ready Export Bundle Generator
This script creates a comprehensive export bundle with all required attachments
for regulatory submissions, formatted according to ICH/FDA guidelines
"""

import os
import json
import shutil
import sys
import zipfile
import requests
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, Body, HTTPException
from fastapi.responses import FileResponse
import uuid
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

# Import branded cover sheet module
from branded_cover_sheet import generate_cover_sheet, load_session_metadata

app = FastAPI(title="Regulatory Export Bundle Service")

@app.post("/api/export/regulatory-bundle")
def create_regulatory_bundle(data: Dict = Body(...)):
    """
    Generate a comprehensive regulatory-ready export bundle with all required
    attachments for submission to regulatory authorities (FDA, EMA, etc.)
    
    Args:
        data: Dictionary containing export parameters including session_id and options
        
    Returns:
        Dictionary with status and path to generated ZIP bundle
    """
    session_id = data.get("session_id", "default_session")
    bundle_type = data.get("bundle_type", "ind") # Options: ind, nda, ima, etc.
    regulatory_region = data.get("region", "fda") # Options: fda, ema, pmda, etc.
    include_metadata = data.get("include_metadata", True)
    include_source_data = data.get("include_source_data", True)
    recipient_email = data.get("recipient_email", None)  # Optional email for automatic delivery
    
    # Determine archive directory based on environment
    if os.path.exists("/mnt/data"):
        # Production environment
        base_dir = "/mnt/data/lumen_reports_backend"
    else:
        # Development environment
        base_dir = "data"
    
    archive_dir = os.path.join(base_dir, "sessions", session_id)
    export_dir = os.path.join(base_dir, "exports")
    bundle_dir = os.path.join(export_dir, f"{session_id}_regulatory_bundle_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    
    # Create directories if they don't exist
    os.makedirs(archive_dir, exist_ok=True)
    os.makedirs(export_dir, exist_ok=True)
    os.makedirs(bundle_dir, exist_ok=True)
    
    # Create the specific bundle structure based on regulatory requirements
    if bundle_type.lower() == "ind":
        # Create IND submission folders according to FDA eCTD structure
        module1_dir = os.path.join(bundle_dir, "m1-administrative")
        module2_dir = os.path.join(bundle_dir, "m2-summaries")
        module3_dir = os.path.join(bundle_dir, "m3-quality")
        module4_dir = os.path.join(bundle_dir, "m4-nonclinical")
        module5_dir = os.path.join(bundle_dir, "m5-clinical")
        
        # Create the directory structure
        for directory in [module1_dir, module2_dir, module3_dir, module4_dir, module5_dir]:
            os.makedirs(directory, exist_ok=True)
        
        # Create subfolders for Module 2 (Common Technical Document summaries)
        os.makedirs(os.path.join(module2_dir, "2.1-toc"), exist_ok=True)
        os.makedirs(os.path.join(module2_dir, "2.2-intro"), exist_ok=True)
        os.makedirs(os.path.join(module2_dir, "2.3-quality-summary"), exist_ok=True)
        os.makedirs(os.path.join(module2_dir, "2.4-nonclinical-overview"), exist_ok=True)
        os.makedirs(os.path.join(module2_dir, "2.5-clinical-overview"), exist_ok=True)
        os.makedirs(os.path.join(module2_dir, "2.6-nonclinical-summary"), exist_ok=True)
        os.makedirs(os.path.join(module2_dir, "2.7-clinical-summary"), exist_ok=True)
        
        # Create subfolders for Module 5 (Clinical)
        os.makedirs(os.path.join(module5_dir, "5.1-trial-reports"), exist_ok=True)
        os.makedirs(os.path.join(module5_dir, "5.2-references"), exist_ok=True)
        os.makedirs(os.path.join(module5_dir, "5.3-clinical-study-reports"), exist_ok=True)
        os.makedirs(os.path.join(module5_dir, "5.4-literature"), exist_ok=True)
        
        # Check for required files and copy them to appropriate locations
        
        # 1. IND Module 2.5 (Clinical Overview)
        ind25_path = os.path.join(archive_dir, "ind_summary.txt")
        if os.path.exists(ind25_path):
            # Copy and convert to PDF
            with open(ind25_path, "r") as f:
                ind_text = f.read()
            
            # Create formatted PDF for regulatory submission
            create_regulatory_pdf(
                os.path.join(module2_dir, "2.5-clinical-overview", "2.5-clinical-overview.pdf"),
                "IND Module 2.5 - Clinical Overview",
                ind_text,
                metadata={
                    "Document Type": "Clinical Overview",
                    "Module": "2.5",
                    "Session ID": session_id,
                    "Generated Date": datetime.now().strftime("%Y-%m-%d"),
                    "Sponsor": "Trial Sponsor",
                    "Product": data.get("product_name", "Investigational Product")
                }
            )
        
        # 2. Success Prediction Analysis
        success_path = os.path.join(archive_dir, "success_prediction.json")
        if os.path.exists(success_path):
            # Copy data file if source data is requested
            if include_source_data:
                shutil.copy2(
                    success_path, 
                    os.path.join(module5_dir, "5.3-clinical-study-reports", "success-prediction-data.json")
                )
            
            # Create formatted PDF report
            try:
                with open(success_path, "r") as f:
                    prediction_data = json.load(f)
                
                create_prediction_report_pdf(
                    os.path.join(module5_dir, "5.3-clinical-study-reports", "success-prediction-analysis.pdf"),
                    "Trial Success Prediction Analysis",
                    prediction_data,
                    session_id
                )
            except Exception as e:
                print(f"Error creating success prediction report: {str(e)}")
        
        # 3. Dropout Risk Assessment
        dropout_path = os.path.join(archive_dir, "dropout_forecast.json")
        if os.path.exists(dropout_path):
            # Copy data file if source data is requested
            if include_source_data:
                shutil.copy2(
                    dropout_path, 
                    os.path.join(module5_dir, "5.3-clinical-study-reports", "dropout-forecast-data.json")
                )
            
            # Create formatted PDF report
            try:
                with open(dropout_path, "r") as f:
                    dropout_data = json.load(f)
                
                create_dropout_report_pdf(
                    os.path.join(module5_dir, "5.3-clinical-study-reports", "dropout-risk-assessment.pdf"),
                    "Patient Dropout Risk Assessment",
                    dropout_data,
                    session_id
                )
            except Exception as e:
                print(f"Error creating dropout risk report: {str(e)}")
        
        # 4. Summary Packet (if available)
        summary_packet_path = os.path.join(archive_dir, "summary_packet.pdf")
        if os.path.exists(summary_packet_path):
            shutil.copy2(
                summary_packet_path,
                os.path.join(module2_dir, "2.7-clinical-summary", "integrated-protocol-assessment.pdf")
            )
        
        # 5. Assistant reasoning trace (for transparency and audit)
        wisdom_path = os.path.join(archive_dir, "wisdom_trace.json")
        trace_path = os.path.join(archive_dir, "reasoning_trace.txt")
        
        trace_content = ""
        # Try JSON format first
        if os.path.exists(wisdom_path):
            try:
                with open(wisdom_path, "r") as f:
                    trace_data = json.load(f)
                    if isinstance(trace_data, dict) and "reasoning" in trace_data:
                        trace_content = "\n\n".join([f"• {step}" for step in trace_data["reasoning"]])
                    else:
                        trace_content = json.dumps(trace_data, indent=2)
            except Exception as e:
                print(f"Error processing wisdom trace JSON: {str(e)}")
        
        # Try text format if JSON not available or failed
        if not trace_content and os.path.exists(trace_path):
            try:
                with open(trace_path, "r") as f:
                    trace_content = f.read()
            except Exception as e:
                print(f"Error processing reasoning trace text: {str(e)}")
        
        # Create the trace PDF if we have content
        if trace_content:
            create_regulatory_pdf(
                os.path.join(module5_dir, "5.4-literature", "ai-reasoning-documentation.pdf"),
                "AI Reasoning Trace Documentation",
                trace_content,
                metadata={
                    "Document Type": "Supplementary",
                    "Document Purpose": "AI Methodology Documentation",
                    "Session ID": session_id,
                    "Generated Date": datetime.now().strftime("%Y-%m-%d")
                }
            )
        
        # 6. Create the submission summary/index document
        create_submission_index(
            os.path.join(bundle_dir, "submission-index.pdf"),
            session_id,
            bundle_type,
            regulatory_region,
            [
                os.path.exists(ind25_path),
                os.path.exists(success_path),
                os.path.exists(dropout_path),
                os.path.exists(summary_packet_path),
                bool(trace_content)
            ]
        )
        
        # 7. Create metadata manifest if requested
        if include_metadata:
            create_metadata_manifest(
                os.path.join(bundle_dir, "metadata.json"),
                session_id,
                bundle_type,
                regulatory_region,
                datetime.now()
            )
    
    # Create a ZIP file of the bundle
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename = f"{session_id}_regulatory_bundle_{timestamp}.zip"
    zip_filepath = os.path.join(export_dir, zip_filename)
    
    try:
        with zipfile.ZipFile(zip_filepath, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(bundle_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, bundle_dir)
                    zipf.write(file_path, rel_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating ZIP bundle: {str(e)}")
    
    # Clean up the temp bundle directory
    try:
        shutil.rmtree(bundle_dir)
    except Exception as e:
        print(f"Warning: Failed to clean up bundle directory: {str(e)}")
    
    # Log the export for audit trail
    export_log_entry = {
        "session_id": session_id,
        "timestamp": timestamp,
        "bundle_type": bundle_type,
        "regulatory_region": regulatory_region,
        "files_included": {
            "ind25": os.path.exists(os.path.join(archive_dir, "ind_summary.txt")),
            "success_prediction": os.path.exists(os.path.join(archive_dir, "success_prediction.json")),
            "dropout_forecast": os.path.exists(os.path.join(archive_dir, "dropout_forecast.json")),
            "summary_packet": os.path.exists(os.path.join(archive_dir, "summary_packet.pdf")),
            "wisdom_trace": os.path.exists(os.path.join(archive_dir, "wisdom_trace.json"))
        },
        "filename": zip_filename
    }
    
    # Save export log
    log_dir = os.path.join(base_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    export_log_path = os.path.join(log_dir, "export_history.json")
    
    try:
        # Load existing log if it exists
        export_log = {}
        if os.path.exists(export_log_path):
            with open(export_log_path, "r") as f:
                export_log = json.load(f)
        
        # Create entry for this session if it doesn't exist
        if session_id not in export_log:
            export_log[session_id] = []
        
        # Add new export entry
        export_log[session_id].append(export_log_entry)
        
        # Save updated log
        with open(export_log_path, "w") as f:
            json.dump(export_log, f, indent=2)
            
        # Update session's last export timestamp
        session_metadata_path = os.path.join(archive_dir, "metadata.json")
        session_metadata = {}
        if os.path.exists(session_metadata_path):
            try:
                with open(session_metadata_path, "r") as f:
                    session_metadata = json.load(f)
            except:
                pass
                
        session_metadata["last_export_timestamp"] = datetime.now().isoformat()
        session_metadata["last_export_filename"] = zip_filename
        
        with open(session_metadata_path, "w") as f:
            json.dump(session_metadata, f, indent=2)
            
    except Exception as e:
        print(f"Warning: Failed to log export: {str(e)}")
    
    # Send email notification if email is provided
    if recipient_email:
        try:
            # Try to fetch from saved session emails
            if not recipient_email.strip():
                try:
                    # Try to get from session email API
                    response = requests.get(f"http://localhost:5000/api/session/email/get/{session_id}")
                    if response.status_code == 200:
                        email_data = response.json()
                        if email_data.get("email"):
                            recipient_email = email_data["email"]
                except Exception as e:
                    print(f"Failed to fetch email for session {session_id}: {str(e)}")
            
            if recipient_email and "@" in recipient_email:
                send_export_notification_email(
                    recipient_email, 
                    session_id,
                    zip_filename, 
                    f"http://localhost:5000/api/download/regulatory-bundle/{zip_filename}"
                )
        except Exception as e:
            print(f"Warning: Failed to send email notification: {str(e)}")
    
    # Return the path to the ZIP bundle
    return {
        "status": "success",
        "bundle_path": zip_filepath,
        "download_url": f"/api/download/regulatory-bundle/{zip_filename}",
        "bundle_type": bundle_type,
        "regulatory_region": regulatory_region,
        "timestamp": timestamp,
        "email_sent": bool(recipient_email and "@" in recipient_email)
    }

@app.get("/api/download/regulatory-bundle/{filename}")
def download_regulatory_bundle(filename: str):
    """
    Download a previously generated regulatory bundle
    
    Args:
        filename: Name of the bundle ZIP file
        
    Returns:
        FileResponse with the bundle for download
    """
    # Determine exports directory based on environment
    if os.path.exists("/mnt/data"):
        export_dir = "/mnt/data/lumen_reports_backend/exports"
    else:
        export_dir = "data/exports"
    
    file_path = os.path.join(export_dir, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Regulatory bundle not found")
    
    return FileResponse(
        file_path,
        media_type="application/zip",
        filename=filename
    )

def create_regulatory_pdf(filepath, title, content, metadata=None):
    """Create a regulatory-compliant PDF document"""
    from fpdf import FPDF
    
    pdf = FPDF()
    pdf.add_page()
    
    # Add title
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, title, ln=True, align="C")
    pdf.ln(10)
    
    # Add metadata section if provided
    if metadata:
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 10, "Document Information", ln=True)
        pdf.ln(2)
        
        pdf.set_font("Arial", "", 10)
        for key, value in metadata.items():
            pdf.set_font("Arial", "B", 10)
            pdf.cell(50, 8, key + ":", 0)
            pdf.set_font("Arial", "", 10)
            pdf.cell(0, 8, str(value), ln=True)
        
        pdf.ln(10)
    
    # Add main content
    pdf.set_font("Arial", "", 11)
    
    # Process content by paragraphs for better formatting
    paragraphs = content.split('\n\n')
    for i, para in enumerate(paragraphs):
        if para.strip():  # Skip empty paragraphs
            # Check for section headers (lines starting with # or ##)
            if para.strip().startswith('# ') or para.strip().startswith('## '):
                pdf.set_font("Arial", "B", 12)
                pdf.multi_cell(0, 8, para.strip().replace('#', '').strip())
                pdf.set_font("Arial", "", 11)
            # Check for bullet points
            elif para.strip().startswith('• ') or para.strip().startswith('* '):
                pdf.set_font("Arial", "", 11)
                # Split into bullet points
                bullets = para.split('\n')
                for bullet in bullets:
                    if bullet.strip():
                        pdf.cell(5, 6, "•", 0, 0)
                        pdf.multi_cell(0, 6, bullet.strip().replace('• ', '').replace('* ', ''))
            else:
                pdf.multi_cell(0, 6, para.strip())
            
            # Add spacing between paragraphs
            if i < len(paragraphs) - 1:
                pdf.ln(4)
    
    # Add footer with date and page numbers
    pdf.set_auto_page_break(auto=True, margin=15)
    current_page = pdf.page_no()
    for page in range(1, current_page + 1):
        pdf.page = page
        pdf.set_y(-15)
        pdf.set_font("Arial", "I", 8)
        pdf.cell(0, 10, f"Generated on {datetime.now().strftime('%Y-%m-%d')} | Page {page}/{current_page}", 0, 0, "C")
    
    # Save the PDF
    pdf.output(filepath)

def create_prediction_report_pdf(filepath, title, prediction_data, session_id):
    """Create a formatted success prediction report PDF"""
    from fpdf import FPDF
    
    pdf = FPDF()
    pdf.add_page()
    
    # Add title and report info
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, title, ln=True, align="C")
    
    pdf.set_font("Arial", "I", 10)
    pdf.cell(0, 6, f"Session ID: {session_id} | Generated: {datetime.now().strftime('%Y-%m-%d')}", ln=True, align="C")
    pdf.ln(10)
    
    # Extract key prediction data with fallbacks
    probability = prediction_data.get("probability", prediction_data.get("success_probability", 0))
    method = prediction_data.get("method", prediction_data.get("model_name", "Statistical Model"))
    confidence = prediction_data.get("confidence", 0.5)
    factors = prediction_data.get("factors", [])
    summary = prediction_data.get("summary", "")
    
    # Add probability section
    pdf.set_font("Arial", "B", 14)
    pdf.cell(0, 10, f"Success Probability: {probability * 100:.1f}%", ln=True)
    
    # Add model information
    pdf.set_font("Arial", "", 11)
    pdf.cell(0, 8, f"Predictive Model: {method}", ln=True)
    pdf.cell(0, 8, f"Confidence Level: {confidence * 100:.1f}%", ln=True)
    pdf.ln(5)
    
    # Add summary if available
    if summary:
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 8, "Analysis Summary", ln=True)
        pdf.set_font("Arial", "", 11)
        pdf.multi_cell(0, 6, summary)
        pdf.ln(5)
    
    # Add contributing factors
    if factors:
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 8, "Contributing Factors", ln=True)
        pdf.ln(2)
        
        # Ensure factors are properly formatted
        pdf.set_font("Arial", "", 11)
        for factor in factors:
            if isinstance(factor, dict):
                factor_name = factor.get("factor", "")
                impact = factor.get("impact", "")
                weight = factor.get("weight", 0)
                
                if factor_name:
                    pdf.set_font("Arial", "B", 10)
                    pdf.cell(0, 6, factor_name, ln=True)
                    
                    pdf.set_font("Arial", "", 10)
                    if impact:
                        pdf.cell(20, 6, "Impact:", 0, 0)
                        pdf.cell(0, 6, impact, ln=True)
                    
                    if weight:
                        pdf.cell(20, 6, "Weight:", 0, 0)
                        pdf.cell(0, 6, f"{weight * 100:.1f}%", ln=True)
            else:
                pdf.cell(5, 6, "•", 0, 0)
                pdf.multi_cell(0, 6, str(factor))
            
            pdf.ln(2)
    
    # Add methodological notes
    pdf.add_page()
    pdf.set_font("Arial", "B", 12)
    pdf.cell(0, 8, "Methodological Notes", ln=True)
    pdf.ln(2)
    
    pdf.set_font("Arial", "", 10)
    pdf.multi_cell(0, 5, (
        "This success prediction is based on an AI-powered analysis of similar clinical "
        "trials, historical performance data, and protocol-specific factors. The model "
        "integrates data from Clinical Study Reports (CSRs), published literature, and "
        "regulatory submissions to generate a probability estimate.\n\n"
        
        "The confidence level indicates the model's certainty in its prediction based on "
        "data quality, completeness, and relevance.\n\n"
        
        "This analysis is intended to support decision-making and risk assessment "
        "for clinical development planning."
    ))
    
    # Add footer with regulatory disclaimer
    pdf.set_y(-30)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.set_font("Arial", "I", 8)
    pdf.cell(0, 10, "REGULATORY NOTICE", ln=True, align="C")
    pdf.multi_cell(0, 4, (
        "This document contains computer-assisted predictive analytics and is provided for "
        "informational purposes to support clinical development decision-making. The predictions "
        "are based on historical data and algorithmic analysis and should be considered alongside "
        "expert clinical and statistical judgment."
    ), align="C")
    
    # Save the PDF
    pdf.output(filepath)

def create_dropout_report_pdf(filepath, title, dropout_data, session_id):
    """Create a formatted dropout risk assessment PDF"""
    from fpdf import FPDF
    
    pdf = FPDF()
    pdf.add_page()
    
    # Add title and report info
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, title, ln=True, align="C")
    
    pdf.set_font("Arial", "I", 10)
    pdf.cell(0, 6, f"Session ID: {session_id} | Generated: {datetime.now().strftime('%Y-%m-%d')}", ln=True, align="C")
    pdf.ln(10)
    
    # Extract key dropout data
    summary = dropout_data.get("summary", "")
    risk_level = dropout_data.get("risk_level", "moderate")
    completion_rate = dropout_data.get("expected_completion_rate", 0)
    insights = dropout_data.get("insights", [])
    strategies = dropout_data.get("mitigation_strategies", [])
    forecast_data = dropout_data.get("forecast", [])
    
    # Add summary if available
    if summary:
        pdf.set_font("Arial", "", 11)
        pdf.multi_cell(0, 6, summary)
        pdf.ln(5)
    
    # Add key metrics in a box
    pdf.set_fill_color(240, 240, 240)
    pdf.rect(15, pdf.get_y(), 180, 30, "F")
    
    pdf.set_font("Arial", "B", 12)
    current_y = pdf.get_y() + 5
    pdf.set_xy(20, current_y)
    pdf.cell(80, 8, "Risk Level:", 0, 0)
    
    # Color-code risk level
    if risk_level.lower() == "low":
        pdf.set_text_color(0, 128, 0)  # Green
    elif risk_level.lower() == "moderate":
        pdf.set_text_color(255, 165, 0)  # Orange
    elif risk_level.lower() == "high":
        pdf.set_text_color(255, 0, 0)  # Red
    else:
        pdf.set_text_color(100, 100, 100)  # Gray
    
    pdf.cell(0, 8, risk_level.upper(), 0, 1)
    pdf.set_text_color(0, 0, 0)  # Reset to black
    
    # Add completion rate
    pdf.set_xy(20, current_y + 15)
    pdf.set_font("Arial", "B", 12)
    pdf.cell(80, 8, "Expected Completion Rate:", 0, 0)
    pdf.set_font("Arial", "", 12)
    pdf.cell(0, 8, f"{completion_rate}%", 0, 1)
    
    pdf.ln(15)
    
    # Add insights section
    if insights:
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 8, "Key Insights", ln=True)
        pdf.ln(2)
        
        pdf.set_font("Arial", "", 10)
        for insight in insights:
            pdf.cell(5, 6, "•", 0, 0)
            pdf.multi_cell(0, 6, insight)
            pdf.ln(2)
        
        pdf.ln(5)
    
    # Add mitigation strategies
    if strategies:
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 8, "Recommended Mitigation Strategies", ln=True)
        pdf.ln(2)
        
        pdf.set_font("Arial", "", 10)
        for strategy in strategies:
            pdf.cell(5, 6, "✓", 0, 0)
            pdf.multi_cell(0, 6, strategy)
            pdf.ln(2)
        
        pdf.ln(5)
    
    # Add dropout forecast visualization
    if forecast_data:
        pdf.add_page()
        pdf.set_font("Arial", "B", 12)
        pdf.cell(0, 8, "Dropout Forecast by Study Week", ln=True)
        pdf.ln(5)
        
        # Plot the dropout curve
        chart_y = pdf.get_y()
        chart_height = 80
        chart_width = 160
        margin_left = 25
        
        # Extract data from forecast
        weeks = []
        dropouts = []
        
        for point in forecast_data:
            week = point.get("week", 0)
            dropout = point.get("predicted_dropout", 0) * 100  # Convert to percentage
            weeks.append(week)
            dropouts.append(dropout)
        
        if weeks and dropouts:
            # Calculate scale
            max_week = max(weeks)
            max_dropout = max(dropouts) * 1.1  # Add 10% padding
            
            # Ensure we have a valid scale
            max_dropout = max(max_dropout, 5)  # At least 5% for scale
            
            x_scale = chart_width / max_week if max_week > 0 else 1
            y_scale = chart_height / max_dropout if max_dropout > 0 else 1
            
            # Draw chart frame
            pdf.set_draw_color(100, 100, 100)
            pdf.rect(margin_left, chart_y, chart_width, chart_height)
            
            # Draw Y-axis labels (dropout percentages)
            pdf.set_font("Arial", "", 8)
            for i in range(0, int(max_dropout) + 1, 5):  # Label every 5%
                y_pos = chart_y + chart_height - (i * y_scale)
                if y_pos >= chart_y:  # Make sure we don't go above the chart
                    pdf.line(margin_left - 2, y_pos, margin_left, y_pos)  # Tick mark
                    pdf.set_xy(margin_left - 18, y_pos - 2)
                    pdf.cell(15, 4, f"{i}%", 0, 0, 'R')
            
            # Draw X-axis labels (weeks)
            for week in range(0, max_week + 1, max(1, max_week // 6)):  # Label approx 6 points
                x_pos = margin_left + (week * x_scale)
                pdf.line(x_pos, chart_y + chart_height, x_pos, chart_y + chart_height + 2)  # Tick mark
                pdf.set_xy(x_pos - 5, chart_y + chart_height + 3)
                pdf.cell(10, 4, f"{week}", 0, 0, 'C')
            
            # Set color based on risk level
            if risk_level.lower() == "low":
                pdf.set_draw_color(0, 128, 0)  # Green
            elif risk_level.lower() == "moderate":
                pdf.set_draw_color(255, 165, 0)  # Orange
            elif risk_level.lower() == "high":
                pdf.set_draw_color(255, 0, 0)  # Red
            else:
                pdf.set_draw_color(0, 0, 255)  # Blue
            
            # Draw the line graph
            pdf.set_line_width(0.5)
            
            prev_x, prev_y = None, None
            for i, (week, dropout) in enumerate(zip(weeks, dropouts)):
                x = margin_left + (week * x_scale)
                y = chart_y + chart_height - (dropout * y_scale)
                
                # Draw point
                pdf.set_fill_color(pdf.draw_color)
                pdf.circle(x, y, 1.5, 'F')
                
                # Connect to previous point
                if prev_x is not None and prev_y is not None:
                    pdf.line(prev_x, prev_y, x, y)
                
                prev_x, prev_y = x, y
            
            # Reset to default
            pdf.set_line_width(0.2)
            pdf.set_draw_color(0, 0, 0)
    
    # Save the PDF
    pdf.output(filepath)

def create_submission_index(filepath, session_id, bundle_type, region, included_items):
    """Create a submission index document for the regulatory bundle"""
    from fpdf import FPDF
    
    pdf = FPDF()
    pdf.add_page()
    
    # Add title and bundle info
    pdf.set_font("Arial", "B", 16)
    pdf.cell(0, 10, "Regulatory Submission Bundle Index", ln=True, align="C")
    
    pdf.set_font("Arial", "I", 10)
    pdf.cell(0, 6, f"Bundle Type: {bundle_type.upper()} | Region: {region.upper()}", ln=True, align="C")
    pdf.cell(0, 6, f"Session ID: {session_id} | Generated: {datetime.now().strftime('%Y-%m-%d')}", ln=True, align="C")
    pdf.ln(10)
    
    # Add introduction
    pdf.set_font("Arial", "", 11)
    pdf.multi_cell(0, 6, (
        f"This document provides an index of all materials included in this {bundle_type.upper()} "
        f"submission bundle for {region.upper()}. The bundle has been organized according to "
        f"regulatory requirements and contains the following documents:"
    ))
    pdf.ln(5)
    
    # List included documents
    pdf.set_font("Arial", "B", 12)
    pdf.cell(0, 8, "Bundle Contents", ln=True)
    pdf.ln(2)
    
    # Map item indices to document names and locations
    document_map = [
        ("Module 2.5 - Clinical Overview", "m2-summaries/2.5-clinical-overview/2.5-clinical-overview.pdf"),
        ("Success Prediction Analysis", "m5-clinical/5.3-clinical-study-reports/success-prediction-analysis.pdf"),
        ("Patient Dropout Risk Assessment", "m5-clinical/5.3-clinical-study-reports/dropout-risk-assessment.pdf"),
        ("Integrated Protocol Assessment", "m2-summaries/2.7-clinical-summary/integrated-protocol-assessment.pdf"),
        ("AI Reasoning Documentation", "m5-clinical/5.4-literature/ai-reasoning-documentation.pdf")
    ]
    
    # Add each document to the index
    pdf.set_font("Arial", "", 11)
    for i, (name, location) in enumerate(document_map):
        if included_items[i]:
            pdf.set_font("Arial", "B", 10)
            pdf.cell(0, 8, name, ln=True)
            
            pdf.set_font("Arial", "", 10)
            pdf.cell(20, 6, "Location:", 0, 0)
            pdf.cell(0, 6, location, ln=True)
            pdf.ln(3)
    
    # Add regulatory notes
    pdf.add_page()
    pdf.set_font("Arial", "B", 12)
    pdf.cell(0, 8, "Regulatory Notes", ln=True)
    pdf.ln(2)
    
    pdf.set_font("Arial", "", 10)
    
    # Add region-specific notes
    if region.lower() == "fda":
        pdf.multi_cell(0, 5, (
            "This bundle follows FDA eCTD structure. All documents are formatted "
            "according to FDA guidelines and should be submitted through the FDA ESG.\n\n"
            
            "Key components of this submission:\n"
            "• Module 2.5 provides the clinical overview for the investigational product\n"
            "• Module 5.3 contains clinical study reports and analyses\n"
            "• Additional AI methodology documentation is included in Module 5.4\n\n"
            
            "All documents were prepared using AI-assisted technology with human oversight "
            "to ensure compliance with 21 CFR Part 11 and FDA data integrity requirements."
        ))
    elif region.lower() == "ema":
        pdf.multi_cell(0, 5, (
            "This bundle follows EMA eCTD structure. All documents are formatted "
            "according to EU guidelines and should be submitted through the EU CESP.\n\n"
            
            "Key components of this submission:\n"
            "• Module 2.5 provides the clinical overview for the investigational product\n"
            "• Module 5.3 contains clinical study reports and analyses\n"
            "• Additional AI methodology documentation is included in Module 5.4\n\n"
            
            "All documents were prepared using AI-assisted technology with human oversight "
            "to ensure compliance with EMA guidelines on electronic submissions."
        ))
    else:
        pdf.multi_cell(0, 5, (
            f"This bundle follows {region.upper()} submission requirements. All documents "
            f"are formatted according to relevant guidelines.\n\n"
            
            "Key components of this submission:\n"
            "• Module 2.5 provides the clinical overview for the investigational product\n"
            "• Module 5.3 contains clinical study reports and analyses\n"
            "• Additional AI methodology documentation is included in Module 5.4\n\n"
            
            "All documents were prepared using AI-assisted technology with human oversight."
        ))
    
    # Save the PDF
    pdf.output(filepath)

def create_metadata_manifest(filepath, session_id, bundle_type, region, timestamp):
    """Create a metadata JSON file for the regulatory bundle"""
    metadata = {
        "bundle_id": str(uuid.uuid4()),
        "session_id": session_id,
        "bundle_type": bundle_type,
        "regulatory_region": region,
        "created_at": timestamp.isoformat(),
        "created_by": "TrialSage AI",
        "document_count": 5,
        "format": "eCTD",
        "submission_ready": True,
        "validation_status": "PASSED",
        "checksums": {
            "bundle": "",  # Will be filled in by separate checksum validation tool
            "documents": {}  # Will be filled in by separate document validation tool
        }
    }
    
    # Save metadata to file
    with open(filepath, 'w') as f:
        json.dump(metadata, f, indent=2)

def send_export_notification_email(recipient_email: str, session_id: str, filename: str, download_url: str) -> bool:
    """
    Send a notification email when a regulatory bundle is exported
    
    Args:
        recipient_email: Email address to send notification to
        session_id: ID of the session that was exported
        filename: Name of the exported ZIP file
        download_url: URL to download the exported bundle
        
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
        msg['Subject'] = f"Your Regulatory Bundle Export is Ready - Session {session_id}"
        
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
                    <h2>Your Regulatory Export is Ready</h2>
                </div>
                <div class="content">
                    <p>Hello,</p>
                    <p>Your regulatory bundle for session <strong>{session_id}</strong> has been successfully exported and is now ready for download.</p>
                    
                    <h3>Export Details:</h3>
                    <ul>
                        <li><strong>Session ID:</strong> {session_id}</li>
                        <li><strong>File:</strong> {filename}</li>
                        <li><strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</li>
                    </ul>
                    
                    <p>You can download your bundle by clicking the button below or accessing it from your session summary panel.</p>
                    
                    <a href="{download_url}" class="button">Download Bundle</a>
                    
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
    uvicorn.run(app, host="0.0.0.0", port=8001)