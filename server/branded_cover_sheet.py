#!/usr/bin/env python3
"""
Branded Cover Sheet Generator
This module provides functions to create professional branded cover sheets for
all LumenTrialGuide.AI exports including Summary Packets and Regulatory Bundles.
"""

import os
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from fpdf import FPDF

def generate_cover_sheet(pdf: FPDF, 
                        title: str,
                        session_id: str,
                        persona: str = "Regulatory",
                        sections: List[str] = None,
                        protocol_metadata: Dict = None,
                        report_type: str = "Summary Intelligence Packet") -> None:
    """
    Generate a branded professional cover sheet for reports and exports
    
    Args:
        pdf: FPDF object to add the cover sheet to
        title: Main title for the cover sheet
        session_id: Unique session identifier
        persona: User persona (Regulatory, Clinical, etc.)
        sections: List of sections included in the report
        protocol_metadata: Dictionary with protocol metadata (molecule, indication, etc.)
        report_type: Type of report (Summary Packet, Regulatory Bundle, etc.)
    """
    # Add new page for cover sheet
    pdf.add_page()
    
    # Set default background color
    pdf.set_fill_color(248, 250, 252)  # Very light blue-gray background
    pdf.rect(0, 0, 210, 297, 'F')  # Fill whole page
    
    # Add header with company logo placeholder
    # In production, this would use an actual logo image
    pdf.set_fill_color(25, 113, 194)  # Brand blue
    pdf.rect(0, 0, 210, 40, 'F')  # Blue header bar
    
    # Add white logo text
    pdf.set_font("Arial", "B", 24)
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(15, 15)
    pdf.cell(0, 10, "LumenTrialGuide.AI", 0, 1, 'L')
    
    # Add document type
    pdf.set_font("Arial", "I", 12)
    pdf.set_xy(15, 25)
    pdf.cell(0, 10, report_type, 0, 1, 'L')
    
    # Add divider
    pdf.set_fill_color(230, 236, 245)  # Light blue-gray
    pdf.rect(15, 50, 180, 1, 'F')
    
    # Add main title
    pdf.set_font("Arial", "B", 20)
    pdf.set_text_color(30, 41, 59)  # Dark blue-gray
    pdf.set_xy(15, 60)
    pdf.multi_cell(0, 10, title, 0, 'L')
    
    # Add metadata section
    pdf.set_fill_color(240, 245, 250)  # Even lighter blue-gray
    pdf.rect(15, 90, 180, 50, 'F')
    pdf.set_font("Arial", "B", 11)
    pdf.set_text_color(30, 41, 59)
    pdf.set_xy(20, 95)
    pdf.cell(50, 8, "Session ID:", 0, 0)
    pdf.set_font("Arial", "", 11)
    pdf.cell(0, 8, session_id, 0, 1)
    
    pdf.set_font("Arial", "B", 11)
    pdf.set_xy(20, 105)
    pdf.cell(50, 8, "Persona:", 0, 0)
    pdf.set_font("Arial", "", 11)
    pdf.cell(0, 8, persona, 0, 1)
    
    pdf.set_font("Arial", "B", 11)
    pdf.set_xy(20, 115)
    pdf.cell(50, 8, "Generated:", 0, 0)
    pdf.set_font("Arial", "", 11)
    pdf.cell(0, 8, datetime.now().strftime("%Y-%m-%d %H:%M"), 0, 1)
    
    # Add protocol metadata if available
    if protocol_metadata:
        y_pos = 150
        pdf.set_font("Arial", "B", 14)
        pdf.set_xy(15, y_pos)
        pdf.cell(0, 10, "Protocol Information", 0, 1)
        y_pos += 15
        
        # Molecule name
        if protocol_metadata.get("molecule"):
            pdf.set_font("Arial", "B", 11)
            pdf.set_xy(20, y_pos)
            pdf.cell(50, 8, "Molecule:", 0, 0)
            pdf.set_font("Arial", "", 11)
            pdf.cell(0, 8, protocol_metadata.get("molecule", "Not specified"), 0, 1)
            y_pos += 10
        
        # Indication
        if protocol_metadata.get("indication"):
            pdf.set_font("Arial", "B", 11)
            pdf.set_xy(20, y_pos)
            pdf.cell(50, 8, "Indication:", 0, 0)
            pdf.set_font("Arial", "", 11)
            pdf.cell(0, 8, protocol_metadata.get("indication", "Not specified"), 0, 1)
            y_pos += 10
            
        # Phase
        if protocol_metadata.get("phase"):
            pdf.set_font("Arial", "B", 11)
            pdf.set_xy(20, y_pos)
            pdf.cell(50, 8, "Phase:", 0, 0)
            pdf.set_font("Arial", "", 11)
            pdf.cell(0, 8, protocol_metadata.get("phase", "Not specified"), 0, 1)
            y_pos += 10
        
        # Study design
        if protocol_metadata.get("design"):
            pdf.set_font("Arial", "B", 11)
            pdf.set_xy(20, y_pos)
            pdf.cell(50, 8, "Design:", 0, 0)
            pdf.set_font("Arial", "", 11) 
            pdf.cell(0, 8, protocol_metadata.get("design", "Not specified"), 0, 1)
            y_pos += 10
    
    # Add included sections if available
    if sections:
        y_pos = 220
        pdf.set_font("Arial", "B", 14)
        pdf.set_xy(15, y_pos)
        pdf.cell(0, 10, "Included Intelligence Sections:", 0, 1)
        y_pos += 15
        
        for section in sections:
            pdf.set_font("Arial", "", 11)
            pdf.set_xy(20, y_pos)
            pdf.cell(5, 8, "•", 0, 0)
            pdf.cell(0, 8, section, 0, 1)
            y_pos += 8
    
    # Add footer with "Powered by" text
    pdf.set_font("Arial", "I", 9)
    pdf.set_text_color(100, 116, 139)  # Slate-500
    pdf.set_xy(0, 280)
    pdf.cell(0, 8, "Powered by LumenTrialGuide.AI - Intelligent Clinical Study Analysis", 0, 1, 'C')
    pdf.cell(0, 8, "Generated on " + datetime.now().strftime("%Y-%m-%d at %H:%M:%S"), 0, 1, 'C')

def load_session_metadata(session_id: str) -> Dict:
    """
    Load and extract protocol metadata from session files
    
    Args:
        session_id: Unique session identifier
        
    Returns:
        Dictionary with protocol metadata
    """
    # Determine archive directory based on environment
    if os.path.exists("/mnt/data"):
        # Production environment
        base_dir = "/mnt/data/lumen_reports_backend"
    else:
        # Development environment
        base_dir = "data"
    
    archive_dir = os.path.join(base_dir, "sessions", session_id)
    
    metadata = {
        "molecule": "Investigational Product",
        "indication": "Not specified",
        "phase": "Not specified",
        "design": "Not specified"
    }
    
    # Try to load protocol analysis if available
    protocol_analysis_path = os.path.join(archive_dir, "protocol_analysis.json")
    if os.path.exists(protocol_analysis_path):
        try:
            with open(protocol_analysis_path, "r") as f:
                analysis = json.load(f)
                
                # Extract metadata from protocol analysis
                metadata["indication"] = analysis.get("indication", metadata["indication"])
                metadata["phase"] = analysis.get("phase", metadata["phase"])
                metadata["design"] = analysis.get("design_type", metadata["design"])
        except Exception as e:
            print(f"Error loading protocol analysis: {str(e)}")
    
    # Try to load session activity log to gather more metadata
    activity_log_path = os.path.join(archive_dir, "session_activity.json")
    if os.path.exists(activity_log_path):
        try:
            with open(activity_log_path, "r") as f:
                activities = json.load(f)
                
                # Look for molecule/drug information in activity log
                for activity in activities:
                    if "molecule" in activity.get("description", "").lower():
                        parts = activity.get("description", "").split(":")
                        if len(parts) > 1:
                            metadata["molecule"] = parts[1].strip()
                            break
        except Exception as e:
            print(f"Error loading session activity log: {str(e)}")
    
    return metadata