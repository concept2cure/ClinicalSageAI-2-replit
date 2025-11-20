"""
Module 2 AI Narrative Generator

This module provides advanced AI-powered generation of Module 2 CTD documents for IND submissions,
implementing production-ready features with thorough error handling and integration with
project metadata for a complete end-to-end solution.

Features:
- Section-specific templates with proper formatting
- Enhanced prompts with domain-specific context
- Comprehensive error handling and logging
- Adaptive metadata extraction to maximize document quality
- Complete audit trail with document version tracking
"""

import io, os, datetime, logging, traceback, json
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from docxtpl import DocxTemplate
from openai import OpenAI, OpenAIError

from ind_automation.db import load as load_meta, append_history, save as save_meta

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_narratives")

# Validate OpenAI API key
OPENAI_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_KEY:
    logger.error("OPENAI_API_KEY environment variable not set")
    raise RuntimeError("Set OPENAI_API_KEY env var in Replit Secrets")

# Initialize OpenAI client
client = OpenAI(api_key=OPENAI_KEY)
router = APIRouter(prefix="/api/ind")

# Module 2 template paths (section-specific templates)
TEMPLATES = {
    "quality": "ind_automation/templates/module2/quality.docx.j2",
    "nonclinical": "ind_automation/templates/module2/nonclinical.docx.j2",
    "clinical": "ind_automation/templates/module2/clinical.docx.j2"
}

# Enhanced prompts with detailed regulatory context
PROMPTS = {
    "quality": """
You are an FDA regulatory writing expert creating a high-quality Module 2.3 Quality Overall Summary for an IND submission.
Draft a comprehensive Quality Overall Summary for the drug product "{{drug_name}}" (IND {{ind_number|default('Pending')}}).

Format your response according to ICH M4Q guidelines with the following sections:
1. Introduction
2. Drug Substance
   - General Information
   - Manufacture
   - Characterization
   - Control of Drug Substance
   - Reference Standards or Materials
   - Container Closure System
   - Stability
3. Drug Product
   - Description and Composition
   - Pharmaceutical Development
   - Manufacture
   - Control of Excipients
   - Control of Drug Product
   - Reference Standards or Materials
   - Container Closure System
   - Stability

Include this drug substance and product information: 
{{cmc_details}}

Remember: This is for an initial IND submission, so focus on information critical for Phase I clinical trials.
Write in a formal regulatory style, emphasizing safety and quality control processes.
""",

    "nonclinical": """
You are an FDA regulatory writing expert creating a Module 2.4 Nonclinical Overview for an IND submission.

Draft a comprehensive Nonclinical Overview for "{{drug_name}}" (IND {{ind_number|default('Pending')}}).

Format your response according to ICH M4S guidelines with these sections:
1. Overview of the Nonclinical Testing Strategy
2. Pharmacology
   - Primary Pharmacodynamics
   - Secondary Pharmacodynamics
   - Safety Pharmacology
   - Pharmacodynamic Drug Interactions
3. Pharmacokinetics
   - Absorption
   - Distribution
   - Metabolism
   - Excretion
   - Pharmacokinetic Drug Interactions
   - Other Pharmacokinetic Studies
4. Toxicology
   - Single-Dose Toxicity
   - Repeat-Dose Toxicity
   - Genotoxicity
   - Carcinogenicity
   - Reproductive and Developmental Toxicity
   - Local Tolerance
   - Other Toxicity Studies
5. Integrated Overview and Conclusions

Include these key nonclinical findings and safety considerations:
{{nonclinical_details}}

Remember: This is for an initial IND submission to support first-in-human clinical trials. Focus on safety findings 
relevant to the proposed clinical protocol and highlight any risk mitigation strategies.
Write in a formal regulatory style with accurate scientific terminology.
""",

    "clinical": """
You are an FDA regulatory writing expert creating a Module 2.5 Clinical Overview for an IND submission.

Draft a comprehensive Clinical Overview for "{{drug_name}}" (IND {{ind_number|default('Pending')}}).

Format your response according to ICH E3 guidelines with these sections:
1. Product Development Rationale
2. Overview of Biopharmaceutics
3. Overview of Clinical Pharmacology
4. Overview of Efficacy
5. Overview of Safety
6. Benefits and Risks Conclusions

Include the following clinical information and protocol details:
{{clinical_details}}

Remember: For an initial IND submission, focus on the rationale for the proposed clinical investigation,
potential risks and their management, expected therapeutic benefits, and a critical analysis of available data.
If no clinical data are available yet, emphasize the nonclinical data supporting the clinical protocol design.
Write in a formal regulatory style with appropriate medical terminology.
"""
}

# Models for request/response validation
class NarrativeGenerationRequest(BaseModel):
    force_regenerate: bool = Field(False, description="Force regeneration even if a narrative already exists")
    additional_context: Dict[str, Any] = Field({}, description="Additional context to include in the prompt")

class NarrativeMetadata(BaseModel):
    section: str
    pid: str
    timestamp: str
    version: int = 1
    status: str = "completed"

# Helper functions
def _get_section_name(section: str) -> str:
    """Return a human-readable section name"""
    names = {
        "quality": "Quality Overall Summary (2.3)",
        "nonclinical": "Nonclinical Overview (2.4)",
        "clinical": "Clinical Overview (2.5)"
    }
    return names.get(section, section.capitalize())

def _extract_metadata(meta: Dict[str, Any], section: str) -> Dict[str, str]:
    """
    Extract and organize metadata relevant to the specific module 2 section
    """
    # Common metadata for all sections
    result = {
        "drug_name": meta.get("drug_name", ""),
        "ind_number": meta.get("ind_number", ""),
        "sponsor": meta.get("sponsor", ""),
        "submission_date": datetime.date.today().isoformat()
    }
    
    # Section-specific metadata with fallbacks to ensure completeness
    if section == "quality":
        cmc_details = []
        if "batch_number" in meta:
            cmc_details.append(f"Batch Number: {meta['batch_number']}")
        if "dosage_form" in meta:
            cmc_details.append(f"Dosage Form: {meta['dosage_form']}")
        if "strength" in meta:
            cmc_details.append(f"Strength: {meta['strength']}")
        if "manufacturer" in meta:
            cmc_details.append(f"Manufacturer: {meta['manufacturer']}")
        if "drug_substance" in meta:
            cmc_details.append(f"Drug Substance Information: {meta['drug_substance']}")
            
        # If minimal data available, provide a basic description
        if not cmc_details:
            cmc_details = ["The drug product is in development."]
            
        result["cmc_details"] = "\n".join(cmc_details)
        
    elif section == "nonclinical":
        nonclinical_details = []
        if "animal_models" in meta:
            nonclinical_details.append(f"Animal Models Used: {meta['animal_models']}")
        if "toxicity_findings" in meta:
            nonclinical_details.append(f"Key Toxicity Findings: {meta['toxicity_findings']}")
        if "adme_summary" in meta:
            nonclinical_details.append(f"ADME Summary: {meta['adme_summary']}")
            
        # If minimal data available, provide instruction to focus on safety
        if not nonclinical_details:
            nonclinical_details = ["Provide a comprehensive overview based on standard nonclinical studies for this class of compound."]
            
        result["nonclinical_details"] = "\n".join(nonclinical_details)
        
    elif section == "clinical":
        clinical_details = []
        if "protocol" in meta and meta["protocol"]:
            clinical_details.append(f"Protocol Summary: {meta['protocol']}")
        if "study_phase" in meta:
            clinical_details.append(f"Study Phase: {meta['study_phase']}")
        if "patient_population" in meta:
            clinical_details.append(f"Target Population: {meta['patient_population']}")
        if "primary_endpoint" in meta:
            clinical_details.append(f"Primary Endpoint: {meta['primary_endpoint']}")
            
        # If minimal data available, focus on trial design
        if not clinical_details:
            if "protocol" in meta and meta["protocol"]:
                clinical_details = [f"Based on the protocol information: {meta['protocol']}"]
            else:
                clinical_details = ["Focus on the rationale for initial clinical investigation."]
            
        result["clinical_details"] = "\n".join(clinical_details)
    
    return result

def _render_document(doc_context: Dict[str, Any], pid: str, section: str) -> StreamingResponse:
    """
    Render a document using the appropriate template and context
    """
    try:
        template_path = TEMPLATES.get(section)
        if not os.path.exists(template_path):
            logger.error(f"Template not found: {template_path}")
            raise HTTPException(500, f"Template for {section} not found")
            
        tpl = DocxTemplate(template_path)
        tpl.render(doc_context)
        
        buf = io.BytesIO()
        tpl.save(buf)
        buf.seek(0)
        
        # Record in history
        document_id = f"module2_{section}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
        version = doc_context.get("version", 1)
        
        history_entry = {
            "serial": doc_context.get("serial_number", "n/a"),
            "module2_section": section,
            "section_name": _get_section_name(section),
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "document_id": document_id,
            "version": version
        }
        
        append_history(pid, history_entry)
        
        # Save the narrative to the project metadata for future reference
        meta = load_meta(pid)
        if meta:
            meta.setdefault("module2_narratives", {})[section] = {
                "content": doc_context.get("narrative", ""),
                "last_updated": datetime.datetime.utcnow().isoformat(),
                "version": version
            }
            save_meta(pid, meta)
        
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'attachment; filename=Module2_{section}_v{version}_{pid}.docx'
            }
        )
    except Exception as e:
        logger.error(f"Error rendering document: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, f"Failed to generate document: {str(e)}")

def _generate_narrative(meta: Dict[str, Any], section: str) -> str:
    """
    Generate a narrative using OpenAI for the specified section and metadata
    """
    try:
        # Extract and format metadata for the prompt
        context = _extract_metadata(meta, section)
        
        # Get the base prompt and replace template variables
        prompt_template = PROMPTS[section]
        prompt = prompt_template
        
        # Replace all variables in the prompt
        for key, value in context.items():
            placeholder = f"{{{{{key}}}}}"
            if placeholder in prompt:
                prompt = prompt.replace(placeholder, str(value))
        
        # Call OpenAI with appropriate parameters
        completion = client.chat.completions.create(
            model="gpt-4o",  # Use the latest model for best quality
            messages=[
                {"role": "system", "content": "You are an expert regulatory writer specializing in IND submissions to the FDA."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,  # Lower temperature for more consistent, factual output
            max_tokens=4000,  # Allow sufficient space for comprehensive narratives
        )
        
        # Extract and return the generated narrative
        narrative = completion.choices[0].message.content
        return narrative
        
    except OpenAIError as e:
        logger.error(f"OpenAI API error: {str(e)}")
        raise HTTPException(502, f"AI service error: {str(e)}")
    except Exception as e:
        logger.error(f"Error generating narrative: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(500, f"Error generating narrative: {str(e)}")

# API Endpoints
@router.post("/{pid}/module2/{section}")
async def generate_narrative(
    pid: str, 
    section: str,
    request: NarrativeGenerationRequest = None,
    background_tasks: BackgroundTasks = None
):
    """
    Generate a Module 2 narrative document for the specified section
    
    Args:
        pid: The project ID
        section: The Module 2 section (quality, nonclinical, or clinical)
        request: Optional request parameters
        background_tasks: FastAPI background tasks
        
    Returns:
        StreamingResponse: The generated document as a downloadable file
    """
    # Initialize request if not provided
    if request is None:
        request = NarrativeGenerationRequest()
    
    # Validate section
    if section not in PROMPTS:
        raise HTTPException(400, "Section must be 'quality', 'nonclinical', or 'clinical'")
    
    # Load project metadata
    meta = load_meta(pid)
    if not meta:
        raise HTTPException(404, "Project not found")
    
    # Check if we have an existing narrative (unless force_regenerate is True)
    existing_narrative = None
    if not request.force_regenerate and meta.get("module2_narratives", {}).get(section):
        existing_narrative = meta["module2_narratives"][section]["content"]
        version = meta["module2_narratives"][section].get("version", 1) + 1
    else:
        version = 1
    
    # Generate or use existing narrative
    if existing_narrative and not request.force_regenerate:
        narrative = existing_narrative
        logger.info(f"Using existing {section} narrative for project {pid}")
    else:
        # Generate new narrative
        logger.info(f"Generating new {section} narrative for project {pid}")
        narrative = _generate_narrative(meta, section)
    
    # Prepare full context for document rendering
    doc_context = {
        "narrative": narrative,
        "version": version,
        **meta,
        **_extract_metadata(meta, section)
    }
    
    # Merge in any additional context from the request
    if request.additional_context:
        doc_context.update(request.additional_context)
    
    # Render and return the document
    return _render_document(doc_context, pid, section)

@router.get("/{pid}/module2/{section}/status")
async def get_narrative_status(pid: str, section: str):
    """
    Get the status of a Module 2 narrative
    
    Args:
        pid: The project ID
        section: The Module 2 section (quality, nonclinical, or clinical)
        
    Returns:
        JSON response with narrative metadata
    """
    # Validate section
    if section not in PROMPTS:
        raise HTTPException(400, "Section must be 'quality', 'nonclinical', or 'clinical'")
    
    # Load project metadata
    meta = load_meta(pid)
    if not meta:
        raise HTTPException(404, "Project not found")
    
    # Check if we have an existing narrative
    if meta.get("module2_narratives", {}).get(section):
        narrative_meta = meta["module2_narratives"][section]
        return {
            "exists": True,
            "last_updated": narrative_meta.get("last_updated"),
            "version": narrative_meta.get("version", 1),
            "section_name": _get_section_name(section)
        }
    else:
        return {
            "exists": False,
            "section_name": _get_section_name(section)
        }

@router.get("/{pid}/module2")
async def list_narratives(pid: str):
    """
    List all Module 2 narratives for a project
    
    Args:
        pid: The project ID
        
    Returns:
        JSON response with list of narratives and their metadata
    """
    # Load project metadata
    meta = load_meta(pid)
    if not meta:
        raise HTTPException(404, "Project not found")
    
    result = []
    narratives = meta.get("module2_narratives", {})
    
    for section in PROMPTS.keys():
        if section in narratives:
            result.append({
                "section": section,
                "section_name": _get_section_name(section),
                "last_updated": narratives[section].get("last_updated"),
                "version": narratives[section].get("version", 1),
                "exists": True
            })
        else:
            result.append({
                "section": section,
                "section_name": _get_section_name(section),
                "exists": False
            })
    
    return {"narratives": result}