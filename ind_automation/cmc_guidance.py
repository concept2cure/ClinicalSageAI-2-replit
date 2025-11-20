"""
cmc_guidance.py

Utility functions to provide regulatory CMC guidelines and AI-generated CMC guidance.
This module is independent from the main ai_advisor to avoid circular dependencies.

Functions:
    get_cmc_guidelines() -> list
    generate_cmc_guidance(project_data: dict, include_common_advice: bool = True) -> dict
"""
from datetime import datetime
import openai
import json

# Static list of CMC guidelines. You can also import these from ai_advisor if available.
CMC_GUIDELINES = [
    "Provide detailed drug substance information including chemical structure, physicochemical properties, biological activity, and synthesis process.",
    "Provide comprehensive drug product formulation details including composition, excipient rationale, stability data supporting shelf life, and storage conditions.",
    "Describe manufacturing facilities and equipment, including location, equipment used, and production capacity.",
    "Ensure comprehensive documentation and record keeping for traceability and GMP compliance.",
    "Update CMC data across IND, NDA/BLA, and post-approval submissions to reflect development stages and process changes.",
    "Include stability data supporting the proposed shelf life and storage conditions for both the drug substance and drug product.",
    "Provide release specifications and analytical methods for drug substance and drug product.",
    "Describe manufacturing processes, control strategies, and in-process controls.",
    "Include information on raw materials, reagents, and intermediates used in synthesis or formulation."
]


def get_cmc_guidelines() -> list:
    """Return the list of CMC regulatory guidelines."""
    return CMC_GUIDELINES


async def generate_cmc_guidance(project_data: dict, include_common_advice: bool = True) -> dict:
    """
    Generate comprehensive CMC guidance and recommendations for a given project.

    Parameters:
        project_data (dict): CMC-related project data with keys like 'drug_substance_info', 'drug_product_info',
            'manufacturing_facility', 'documentation'.
        include_common_advice (bool): Whether to include generic advice scenarios in the prompt.

    Returns:
        dict: Contains 'guidance', 'tips', 'requirements', 'insights', and 'timestamp'.
    """
    # Build a concise project summary from available CMC fields
    summary_parts = []
    ds = project_data.get('drug_substance_info', {})
    if ds:
        summary_parts.append(
            f"Drug Substance: chemical structure {ds.get('chemical_structure', '')}, "
            f"physicochemical properties {ds.get('physicochemical_properties', '')}, "
            f"synthesis process {ds.get('synthesis_process', '')}."
        )
    dp = project_data.get('drug_product_info', {})
    if dp:
        summary_parts.append(
            f"Drug Product: formulation composition {dp.get('formulation_composition', '')}, "
            f"excipient rationale {dp.get('excipient_rationale', '')}, "
            f"release specifications {dp.get('release_specifications', '')}."
        )
    mf = project_data.get('manufacturing_facility', {})
    if mf:
        summary_parts.append(
            f"Manufacturing Facility: location {mf.get('location', '')}, equipment {mf.get('equipment', '')}, "
            f"capacity {mf.get('capacity', '')}."
        )
    doc = project_data.get('documentation', {})
    if doc:
        summary_parts.append(
            f"Documentation: control strategy {doc.get('control_strategy', '')}, "
            f"record keeping {doc.get('record_keeping', '')}."
        )
    project_summary = " ".join(summary_parts) if summary_parts else "No specific CMC details provided."

    # Compose the prompt for ChatGPT
    system_message = (
        "You are an expert regulatory CMC advisor for biotechnology and pharmaceutical submissions. "
        "Provide clear, structured guidance based on current regulations and best practices, "
        "including necessary quality and compliance considerations."
    )
    user_message = (
        f"Project summary: {project_summary}\n"
        f"CMC regulatory guidelines: {CMC_GUIDELINES}\n"
        f"Common advice included: {include_common_advice}\n"
        "Generate a JSON object with the following keys: guidance (overall narrative), "
        "tips (list of actionable recommendations), requirements (list of key regulatory requirements), "
        "insights (any notable observations)."
    )

    # Call OpenAI's ChatGPT model
    try:
        response = await openai.chat.completions.create(
            model='gpt-4o',
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": user_message},
            ],
            temperature=0.2,
            max_tokens=800,
        )
        content = response.choices[0].message.content
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            data = {
                'guidance': content,
                'tips': [],
                'requirements': [],
                'insights': []
            }
        # Ensure required keys exist
        data.setdefault('guidance', '')
        data.setdefault('tips', [])
        data.setdefault('requirements', [])
        data.setdefault('insights', [])
        data['timestamp'] = datetime.now().isoformat()
        return data
    except Exception as e:
        return {
            'guidance': f"Error generating CMC guidance: {str(e)}",
            'tips': [],
            'requirements': [],
            'insights': [],
            'timestamp': datetime.now().isoformat()
        }
