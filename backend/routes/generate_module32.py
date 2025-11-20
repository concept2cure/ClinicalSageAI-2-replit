"""
Route handler for generating ICH Module 3.2 CMC documentation using OpenAI GPT-4 Turbo.
Accepts structured input from frontend, orchestrates prompt injection, and returns draft content.
Now includes PDF export functionality for download-ready compliance documentation.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import openai
import logging
import uuid
import os
from datetime import datetime
from fpdf import FPDF

router = APIRouter()
logger = logging.getLogger(__name__)

# Ensure export directory exists
EXPORT_DIR = "generated_documents"
os.makedirs(EXPORT_DIR, exist_ok=True)

class CMCInput(BaseModel):
    drug_name: str
    molecular_formula: str
    synthesis_steps: str
    formulation_details: str
    manufacturing_controls: str
    analytical_methods: str

def save_as_pdf(content: str, drug_name: str, file_id: str) -> str:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_font("Arial", size=10)
    for line in content.split('\n'):
        pdf.multi_cell(0, 10, line)
    pdf_filename = f"{EXPORT_DIR}/module32_{drug_name.replace(' ', '_')}_{file_id}.pdf"
    pdf.output(pdf_filename)
    return pdf_filename

@router.post("/module32", tags=["Module 3.2 Generation"])
async def generate_module32(data: CMCInput):
    try:
        prompt = f"""
        Draft an ICH CTD Module 3.2 CMC document based on the following inputs:

        Drug Name: {data.drug_name}
        Molecular Formula: {data.molecular_formula}
        Synthesis Steps: {data.synthesis_steps}
        Formulation Details: {data.formulation_details}
        Manufacturing Controls: {data.manufacturing_controls}
        Analytical Methods: {data.analytical_methods}

        Format this content using appropriate CTD section headers and structured technical language as if for regulatory submission.
        """

        response = openai.ChatCompletion.create(
            model="gpt-4-turbo",
            messages=[
                {"role": "system", "content": "You are a regulatory CMC expert trained in ICH guidelines."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=2500
        )

        result = response.choices[0].message.content.strip()
        logger.info("Module 3.2 draft generated successfully for drug: %s", data.drug_name)

        # Save to text and PDF
        file_id = str(uuid.uuid4())
        txt_filename = f"{EXPORT_DIR}/module32_{data.drug_name.replace(' ', '_')}_{file_id}.txt"
        with open(txt_filename, "w", encoding="utf-8") as f:
            f.write(result)

        pdf_filename = save_as_pdf(result, data.drug_name, file_id)

        return {
            "status": "success",
            "module32_draft": result,
            "export_paths": {
                "txt": txt_filename,
                "pdf": pdf_filename
            },
            "drug": data.drug_name,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error("Failed to generate Module 3.2: %s", str(e))
        raise HTTPException(status_code=500, detail="AI generation failed. Please try again later.")