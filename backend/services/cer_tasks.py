"""
CER Tasks Module

This module handles background tasks for Clinical Evaluation Reports,
including enhanced PDF generation and email notifications.
"""
from typing import Dict, Any
from fastapi import BackgroundTasks
import io
import os
import json
from datetime import datetime

# Import local modules
from cer_narrative import generate_cer_narrative
from server.faers_client import get_faers_data

def get_current_user(user_id: str) -> Dict[str, Any]:
    """
    Retrieve user information.
    This is a simplified example - in a real application,
    you would query your database for user information.
    """
    # Placeholder implementation - replace with actual database query
    return {
        "id": user_id,
        "email": f"{user_id}@example.com",
        "name": f"User {user_id}"
    }

async def schedule_pdf_generation(
    ndc_code: str, 
    background_tasks: BackgroundTasks,
    user_id: str
):
    """
    Schedules the enhanced PDF generation as a background task.
    Immediately returns a message that the PDF is being generated.
    Once complete, an email notification is sent to the user.
    
    Args:
        ndc_code: The NDC code for the product
        background_tasks: FastAPI background tasks
        user_id: ID of the current user (for notification)
        
    Returns:
        Message indicating the task has been scheduled
    """
    # Define the background task function
    def task():
        try:
            # Get user information (for notification)
            user = get_current_user(user_id)
            
            # Generate the PDF
            pdf_bytes = generate_enhanced_pdf(ndc_code)
            
            # Save the PDF to disk
            filename = save_pdf_to_file(pdf_bytes, ndc_code)
            
            # Send notification email (placeholder - implement your email logic)
            print(f"PDF generated successfully as {filename}. Would send email to {user['email']}.")
            
            # Log completion
            with open("cer_generation_log.txt", "a") as log_file:
                log_file.write(f"{datetime.now().isoformat()}: PDF for NDC {ndc_code} generated successfully\n")
                
        except Exception as e:
            # Log error
            with open("cer_generation_log.txt", "a") as log_file:
                log_file.write(f"{datetime.now().isoformat()}: Error generating PDF for NDC {ndc_code}: {str(e)}\n")
    
    # Add the task to the background tasks
    background_tasks.add_task(task)
    
    # Return immediate response
    return {
        "message": f"CER PDF generation for NDC {ndc_code} has been scheduled",
        "status": "processing",
        "user_id": user_id
    }

def generate_enhanced_pdf(ndc_code: str) -> bytes:
    """
    Generate an enhanced PDF report for a Clinical Evaluation Report.
    
    Args:
        ndc_code: The NDC code for the product
        
    Returns:
        bytes: The generated PDF as bytes
    """
    # Fetch FAERS data
    faers_data = get_faers_data(ndc_code)
    
    # Generate CER narrative
    cer_text = generate_cer_narrative(faers_data)
    
    # Create a simple PDF using ReportLab
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    
    # Create the report content
    elements = []
    
    # Title
    elements.append(Paragraph(f"Clinical Evaluation Report for NDC {ndc_code}", styles['Title']))
    elements.append(Spacer(1, 0.25*inch))
    
    # Extract product name from FAERS data if available
    product_name = "Unknown Product"
    if "results" in faers_data and len(faers_data["results"]) > 0:
        result = faers_data["results"][0]
        if "openfda" in result:
            openfda = result["openfda"]
            if "brand_name" in openfda and len(openfda["brand_name"]) > 0:
                product_name = openfda["brand_name"][0]
            elif "generic_name" in openfda and len(openfda["generic_name"]) > 0:
                product_name = openfda["generic_name"][0]
    
    elements.append(Paragraph(f"Product: {product_name}", styles['Heading1']))
    elements.append(Spacer(1, 0.25*inch))
    
    # Add generation timestamp
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    elements.append(Paragraph(f"Generated: {timestamp}", styles['Normal']))
    elements.append(Spacer(1, 0.25*inch))
    
    # CER Narrative
    elements.append(Paragraph("Clinical Evaluation Report Narrative:", styles['Heading2']))
    elements.append(Spacer(1, 0.1*inch))
    
    # Split the narrative into paragraphs and add each one
    paragraphs = cer_text.split('\n\n')
    for para in paragraphs:
        if para.strip():
            elements.append(Paragraph(para, styles['Normal']))
            elements.append(Spacer(1, 0.1*inch))
    
    # Build the PDF
    doc.build(elements)
    
    # Get the PDF bytes
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes

def save_pdf_to_file(pdf_bytes: bytes, ndc_code: str) -> str:
    """
    Save a generated PDF to a file
    
    Args:
        pdf_bytes: The PDF as bytes
        ndc_code: The NDC code for the filename
        
    Returns:
        str: The filename of the saved PDF
    """
    # Ensure the exports directory exists
    os.makedirs("data/exports", exist_ok=True)
    
    # Create filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"CER_{ndc_code}_{timestamp}.pdf"
    filepath = os.path.join("data/exports", filename)
    
    # Write the bytes to file
    with open(filepath, "wb") as f:
        f.write(pdf_bytes)
    
    return filename