"""
AI Regulatory Advisor for IND Wizard

This module provides AI-powered regulatory guidance for IND applications.
It helps users navigate the complex regulatory requirements and provides
context-specific advice based on their project details.
"""

import os
import json
from typing import Dict, Any, List, Tuple
from datetime import datetime
import openai

# Initialize OpenAI API
openai.api_key = os.environ.get("OPENAI_API_KEY")

# Knowledge base of regulatory requirements and guidelines
REGULATORY_GUIDELINES = {
    "general_ind": [
        "INDs must be submitted to the FDA before beginning clinical investigations",
        "The IND application consists of Form FDA 1571 and supporting documentation",
        "A 30-day safety review period begins upon FDA receipt of the IND",
        "Clinical investigations may proceed if FDA doesn't place the IND on clinical hold within 30 days"
    ],
    "cmc_requirements": [
        "Include information on the drug substance and drug product",
        "Stability data should support proposed expiration period",
        "Manufacturing processes should be described in detail",
        "Release specifications and analytical methods must be provided",
        "Provide detailed drug substance information including chemical structure, physicochemical properties, biological activity, and synthesis process with raw materials and reagents",
        "Provide comprehensive drug product formulation details such as composition and excipient rationale, plus stability data supporting shelf life and storage",
        "Describe manufacturing facilities and equipment including locations, production capacity, quality control and quality assurance systems",
        "Ensure comprehensive documentation and record-keeping to maintain traceability and demonstrate compliance with Good Manufacturing Practices (GMP)",
        "Update CMC data across IND, NDA/BLA, and post-approval submissions to reflect development stage and process changes"
    ],
    "clinical_protocol": [
        ,def get_regulatory_guidance
        "Protocol must include clear objectives and endpoints",
        "Subject selection and monitoring procedures must be detailed",
        "Informed consent processes must comply with 21 CFR Part 50",
        "Safety monitoring plan must be comprehensive"
    ],
    "pharmacology_toxicology": [
        "Preclinical data must support proposed clinical investigations",
        "Animal studies should identify potential safety concerns",
        "Safety pharmacology studies are required",
        "Toxicokinetic data should be provided when appropriate"
    ]
}

# Common advice for specific IND scenarios
COMMON_ADVICE = {
    "first_time_ind": [
        "Consider requesting a pre-IND meeting with the FDA",
        "Ensure all sections of Form FDA 1571 are completed",
        "Include a well-structured investigator's brochure",
        "Provide a comprehensive overview of preclinical findings"
    ],
    "orphan_drug": [
        "Consider applying for Orphan Drug Designation simultaneously with IND",
        "Include prevalence data supporting orphan status",
        "Outline how the drug addresses an unmet medical need",
        "Document any known adverse events thoroughly"
    ],
    "expedited_programs": [
        "Fast Track designation can be requested with initial IND",
        "Breakthrough Therapy designation requires preliminary clinical evidence",
        "Include data supporting serious or life-threatening condition indication",
        "Document how the drug offers advantage over available therapies"
    ]
}

def get_regulatory_guidance(section: str) -> List[str]:
    """
    Get regulatory guidance for a specific IND section.
    
    Args:
        section: The IND section (e.g., 'general_ind', 'cmc_requirements')
        
    Returns:
        List of regulatory guidance items
    """
    return REGULATORY_GUIDELINES.get(section, [])

def get_common_advice(scenario: str) -> List[str]:
    """
    Get common advice for a specific IND scenario.
    
    Args:
        scenario: The scenario (e.g., 'first_time_ind', 'orphan_drug')
        
    Returns:
        List of advice items
    """
    return COMMON_ADVICE.get(scenario, [])

async def generate_ai_guidance(project_data: Dict[str, Any], context: str = None) -> Dict[str, Any]:
    """
    Generate AI-powered regulatory guidance based on project data.
    
    Args:
        project_data: Dictionary containing project data
        context: Optional context or specific question
        
    Returns:
        Dictionary containing guidance, tips, and insights
    """
    try:
        # Default response if OpenAI API key is not available
        if not openai.api_key:
            return {
                "guidance": "To receive AI-powered regulatory guidance, please configure the OpenAI API key.",
                "tips": get_common_advice("first_time_ind"),
                "requirements": get_regulatory_guidance("general_ind"),
                "insights": [],
                "timestamp": datetime.now().isoformat()
            }
        
        # Format project data for prompt
        project_summary = f"""
Drug: {project_data.get('drug_name', 'Unknown')}
Sponsor: {project_data.get('sponsor', 'Unknown')}
Protocol: {project_data.get('protocol', 'Unknown')}
Principal Investigator: {project_data.get('pi_name', 'Unknown')}
NCT Number: {project_data.get('nct_number', 'Not assigned')}
"""

        # Create context-specific prompt
        prompt = f"""
As an FDA regulatory expert, provide guidance for an IND application with these details:

{project_summary}

{context if context else 'Provide comprehensive guidance on IND preparation for this drug.'}

Your response should include:
1. Specific guidance related to this drug and indication
2. Key regulatory requirements to address 
3. Potential challenges to anticipate
4. Recommendations for expediting the review process

Format your response as JSON with keys: "guidance" (main advice), "requirements" (list of key requirements), 
"challenges" (list of potential issues), and "recommendations" (list of specific recommendations).
"""

        # Generate guidance using OpenAI
        response = await openai.chat.completions.create(
            model="gpt-4o",  # Use the latest model
            messages=[
                {"role": "system", "content": "You are an expert FDA regulatory affairs consultant with 20+ years of experience in IND submissions."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1500,
            response_format={"type": "json_object"}
        )
        
        # Extract and parse response
        ai_response = json.loads(response.choices[0].message.content)
        
        # Combine AI guidance with pre-defined regulatory guidance
        result = {
            "guidance": ai_response.get("guidance", ""),
            "tips": ai_response.get("recommendations", []),
            "requirements": ai_response.get("requirements", []),
            "insights": ai_response.get("challenges", []),
            "timestamp": datetime.now().isoformat()
        }
        
        return result
        
    except Exception as e:
        # Fallback response in case of API error
        return {
            "guidance": f"AI guidance currently unavailable: {str(e)}. Using standard guidance instead.",
            "tips": get_common_advice("first_time_ind"),
            "requirements": get_regulatory_guidance("general_ind"),
            "insights": ["Consider consulting with an FDA regulatory affairs expert for personalized guidance."],
            "timestamp": datetime.now().isoformat()
        }

async def analyze_form_completeness(form_type: str, form_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyze the completeness and quality of a filled FDA form.
    
    Args:
        form_type: The form type (e.g., '1571', '1572')
        form_data: Dictionary containing form field data
        
    Returns:
        Dictionary containing analysis results
    """
    try:
        # Critical fields for each form type
        critical_fields = {
            "1571": ["sponsor", "drug_name", "protocol", "pi_name"],
            "1572": ["pi_name", "pi_address", "protocol"],
            "3674": ["sponsor", "drug_name", "protocol"],
            "3454": ["sponsor", "drug_name", "pi_name"]
        }
        
        # Check for missing critical fields
        missing_fields = [field for field in critical_fields.get(form_type, []) 
                         if not form_data.get(field)]
        
        # Generate completeness score
        form_fields = critical_fields.get(form_type, [])
        if not form_fields:
            completeness_score = 100  # Default if no critical fields defined
        else:
            completed_fields = len(form_fields) - len(missing_fields)
            completeness_score = int((completed_fields / len(form_fields)) * 100)
        
        # Generate recommendations based on missing fields
        recommendations = []
        if missing_fields:
            recommendations.append(f"Please complete the following critical fields: {', '.join(missing_fields)}")
        
        # Add form-specific advice
        if form_type == "1571":
            recommendations.append("Ensure all sections of the IND application are properly referenced in the form")
            recommendations.append("Double-check that the investigational plan aligns with the protocol objectives")
        elif form_type == "1572":
            recommendations.append("Verify that all sub-investigators are listed")
            recommendations.append("Ensure IRB information is current and accurate")
        elif form_type == "3674":
            recommendations.append("Confirm the ClinicalTrials.gov registration status is accurately reflected")
            recommendations.append("Verify the certification statement is appropriate for your specific situation")
        elif form_type == "3454":
            recommendations.append("Ensure all financial disclosures are properly documented")
            recommendations.append("Verify all investigators and sub-investigators are included in financial disclosure")
        
        # Only use OpenAI if available and if form has sufficient data
        if openai.api_key and completeness_score > 50:
            # Create form-specific prompt
            prompt = f"""
As an FDA regulatory expert, analyze this partially completed Form FDA {form_type} for completeness and quality:

{json.dumps(form_data, indent=2)}

Provide specific recommendations to improve this form submission. Be specific about any information that appears 
to be missing, incomplete, or that might raise questions during FDA review.

Format your response as a JSON array of strings, with each string containing one specific recommendation.
"""

            # Generate guidance using OpenAI
            response = await openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert FDA regulatory affairs consultant specializing in IND form review."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=800,
                response_format={"type": "json_object"}
            )
            
            # Extract and parse AI recommendations
            ai_response = json.loads(response.choices[0].message.content)
            if isinstance(ai_response, list):
                # If API returned a list directly
                ai_recommendations = ai_response
            else:
                # If API returned an object with recommendations field
                ai_recommendations = ai_response.get("recommendations", [])
            
            # Combine AI recommendations with predefined ones
            recommendations.extend(ai_recommendations)
        
        return {
            "completeness_score": completeness_score,
            "missing_fields": missing_fields,
            "recommendations": recommendations,
            "is_complete": completeness_score == 100,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        # Fallback response in case of error
        return {
            "completeness_score": 0,
            "missing_fields": [],
            "recommendations": [f"Error analyzing form: {str(e)}", "Please review all fields for completeness."],
            "is_complete": False,
            "timestamp": datetime.now().isoformat()
        }

async def generate_submission_plan(project_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate an AI-powered IND submission plan with timeline and checklist.
    
    Args:
        project_data: Dictionary containing project data
        
    Returns:
        Dictionary containing submission plan details
    """
    try:
        # Default timeline phases (estimated in weeks)
        default_timeline = [
            {"phase": "Pre-IND preparations", "duration": 6, "activities": [
                "Finalize preclinical study reports",
                "Complete CMC documentation",
                "Draft clinical protocol",
                "Prepare Investigator's Brochure"
            ]},
            {"phase": "Pre-IND meeting", "duration": 4, "activities": [
                "Prepare pre-IND meeting request",
                "Develop pre-IND briefing package",
                "Conduct pre-IND meeting",
                "Address FDA feedback"
            ]},
            {"phase": "IND preparation", "duration": 8, "activities": [
                "Finalize all IND components",
                "Complete Form FDA 1571",
                "Complete Form FDA 1572",
                "Complete Form FDA 3674",
                "Complete Form FDA 3454",
                "Internal quality review"
            ]},
            {"phase": "IND submission and follow-up", "duration": 5, "activities": [
                "Submit IND to FDA",
                "Address any FDA questions during 30-day review",
                "Prepare for clinical study initiation if IND is allowed to proceed"
            ]}
        ]
        
        # Standard IND checklist
        standard_checklist = [
            {"item": "Cover Letter", "required": True, "completed": False},
            {"item": "Form FDA 1571", "required": True, "completed": False},
            {"item": "Table of Contents", "required": True, "completed": False},
            {"item": "Introductory Statement", "required": True, "completed": False},
            {"item": "General Investigational Plan", "required": True, "completed": False},
            {"item": "Investigator's Brochure", "required": True, "completed": False},
            {"item": "Clinical Protocol", "required": True, "completed": False},
            {"item": "Chemistry, Manufacturing, and Controls", "required": True, "completed": False},
            {"item": "Pharmacology and Toxicology Information", "required": True, "completed": False},
            {"item": "Previous Human Experience", "required": False, "completed": False},
            {"item": "Additional Information", "required": False, "completed": False},
            {"item": "Form FDA 1572", "required": True, "completed": False},
            {"item": "Form FDA 3674", "required": True, "completed": False},
            {"item": "Form FDA 3454", "required": True, "completed": False},
            {"item": "Environmental Assessment or Claim for Exclusion", "required": True, "completed": False}
        ]
        
        # If OpenAI API key is available, generate personalized plan
        if openai.api_key:
            # Format project data for prompt
            project_summary = f"""
Drug: {project_data.get('drug_name', 'Unknown')}
Sponsor: {project_data.get('sponsor', 'Unknown')}
Protocol: {project_data.get('protocol', 'Unknown')}
Principal Investigator: {project_data.get('pi_name', 'Unknown')}
NCT Number: {project_data.get('nct_number', 'Not assigned')}
"""

            prompt = f"""
As an FDA regulatory expert, create a customized IND submission plan for:

{project_summary}

Your response should include:
1. A personalized timeline with phases and durations (in weeks)
2. A detailed checklist of required documents
3. Key success factors specific to this drug
4. Strategic recommendations

Format your response as JSON with keys: "timeline" (array of phases with duration and activities), 
"checklist" (array of required items with completion status), "key_factors" (array of important considerations), 
and "strategic_recommendations" (array of specific strategic advice).
"""

            # Generate plan using OpenAI
            response = await openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert FDA regulatory affairs consultant specializing in IND submission planning."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=1500,
                response_format={"type": "json_object"}
            )
            
            # Extract and parse response
            ai_response = json.loads(response.choices[0].message.content)
            
            # Use AI-generated timeline and checklist if available, otherwise use defaults
            timeline = ai_response.get("timeline", default_timeline)
            checklist = ai_response.get("checklist", standard_checklist)
            key_factors = ai_response.get("key_factors", [])
            recommendations = ai_response.get("strategic_recommendations", [])
            
            return {
                "timeline": timeline,
                "checklist": checklist,
                "key_success_factors": key_factors,
                "strategic_recommendations": recommendations,
                "estimated_duration_weeks": sum(phase.get("duration", 0) for phase in timeline),
                "timestamp": datetime.now().isoformat()
            }
        
        # Default response if OpenAI API is not available
        return {
            "timeline": default_timeline,
            "checklist": standard_checklist,
            "key_success_factors": [
                "Complete and accurate preclinical data",
                "Well-designed clinical protocol",
                "Thorough CMC documentation",
                "Prompt responses to FDA inquiries"
            ],
            "strategic_recommendations": [
                "Consider requesting a pre-IND meeting",
                "Ensure all preclinical studies follow GLP standards",
                "Develop a robust safety monitoring plan",
                "Prepare for potential clinical holds by anticipating FDA concerns"
            ],
            "estimated_duration_weeks": sum(phase.get("duration", 0) for phase in default_timeline),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        # Fallback response in case of error
        return {
            "timeline": default_timeline,
            "checklist": standard_checklist,
            "key_success_factors": [
                "Complete and accurate preclinical data",
                "Well-designed clinical protocol",
                "Thorough CMC documentation",
                "Prompt responses to FDA inquiries"
            ],
            "strategic_recommendations": [
                f"Error generating custom plan: {str(e)}",
                "Consider consulting with an FDA regulatory affairs expert",
                "Follow standard IND submission best practices"
            ],
            "estimated_duration_weeks": sum(phase.get("duration", 0) for phase in default_timeline),
            "timestamp": datetime.now().isoformat()
        }

async def get_ai_guidance_for_form(form_type: str, project_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get AI-powered guidance specific to a particular form type.
    
    Args:
        form_type: The form type (e.g., '1571', '1572')
        project_data: Dictionary containing project data
        
    Returns:
        Dictionary containing form-specific guidance
    """
    # Form-specific guidance (non-AI fallback)
    form_guidance = {
        "1571": {
            "description": "Form FDA 1571 is the primary application form for an IND. It serves as a cover document and provides the FDA with essential information about the sponsor, the investigational drug, and the proposed clinical investigation.",
            "tips": [
                "Ensure all sections are completed accurately",
                "Double-check contact information",
                "Include all phases of investigation that may be conducted",
                "Clearly indicate the type of submission"
            ],
            "common_issues": [
                "Missing or incomplete sections",
                "Inconsistency with supporting documents",
                "Improper classification of submission type",
                "Unclear identification of drug substance"
            ]
        },
        "1572": {
            "description": "Form FDA 1572 is the Statement of Investigator form that must be completed by each investigator who participates in clinical investigations conducted under an IND.",
            "tips": [
                "Ensure all education and training information is current",
                "List all sub-investigators who will assist",
                "Include all facilities where the investigation will be conducted",
                "Carefully review commitment statements before signing"
            ],
            "common_issues": [
                "Outdated credentials or information",
                "Missing sub-investigators",
                "Incomplete facility information",
                "Inconsistency with clinical protocol"
            ]
        },
        "3674": {
            "description": "Form FDA 3674 certifies compliance with the requirements to register applicable clinical trials on ClinicalTrials.gov.",
            "tips": [
                "Verify ClinicalTrials.gov registration status before completing",
                "Ensure NCT number is accurate if already registered",
                "Select the appropriate certification statement",
                "Include explanation if certification requirements not applicable"
            ],
            "common_issues": [
                "Incorrect certification statement selection",
                "Missing or invalid NCT number",
                "Failure to register trial before submission",
                "Inconsistency with ClinicalTrials.gov record"
            ]
        },
        "3454": {
            "description": "Form FDA 3454 is used for financial disclosure by clinical investigators, certifying that no financial arrangements exist that could affect the outcome of the study.",
            "tips": [
                "Collect financial disclosure information from all investigators",
                "Include all required certifications",
                "Document any exceptions thoroughly",
                "Keep detailed records of financial interest determinations"
            ],
            "common_issues": [
                "Incomplete investigator disclosures",
                "Missing certification for certain investigators",
                "Inadequate documentation for financial interests",
                "Failure to update when new investigators added"
            ]
        }
    }
    
    try:
        # If OpenAI API key is available, generate personalized guidance
        if openai.api_key:
            # Form-specific prompts
            form_descriptions = {
                "1571": "Form FDA 1571 (Investigational New Drug Application)",
                "1572": "Form FDA 1572 (Statement of Investigator)",
                "3674": "Form FDA 3674 (Certification of Compliance with ClinicalTrials.gov)",
                "3454": "Form FDA 3454 (Financial Disclosure by Clinical Investigators)"
            }
            
            form_description = form_descriptions.get(form_type, f"Form FDA {form_type}")
            
            # Format project data for prompt
            project_summary = f"""
Drug: {project_data.get('drug_name', 'Unknown')}
Sponsor: {project_data.get('sponsor', 'Unknown')}
Protocol: {project_data.get('protocol', 'Unknown')}
Principal Investigator: {project_data.get('pi_name', 'Unknown')}
NCT Number: {project_data.get('nct_number', 'Not assigned')}
"""

            prompt = f"""
As an FDA regulatory expert, provide detailed guidance for completing {form_description} for:

{project_summary}

Your response should include:
1. A detailed description of the form's purpose and significance
2. Form-specific tips tailored to this project
3. Common issues or mistakes to avoid
4. Field-by-field guidance for critical sections

Format your response as JSON with keys: "description", "tips" (array), "common_issues" (array), 
and "field_guidance" (object with field names as keys and guidance as values).
"""

            # Generate guidance using OpenAI
            response = await openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert FDA regulatory affairs consultant specializing in IND form completion."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=1000,
                response_format={"type": "json_object"}
            )
            
            # Extract and parse response
            ai_response = json.loads(response.choices[0].message.content)
            
            # Combine AI guidance with standard guidance
            result = {
                "description": ai_response.get("description", form_guidance[form_type]["description"]),
                "tips": ai_response.get("tips", form_guidance[form_type]["tips"]),
                "common_issues": ai_response.get("common_issues", form_guidance[form_type]["common_issues"]),
                "field_guidance": ai_response.get("field_guidance", {}),
                "timestamp": datetime.now().isoformat()
            }
            
            return result
        
        # Default response if OpenAI API is not available
        return {
            **form_guidance.get(form_type, {
                "description": f"Form FDA {form_type} is required for IND submissions.",
                "tips": ["Complete all sections accurately", "Review carefully before submission"],
                "common_issues": ["Missing information", "Inconsistency with supporting documents"]
            }),
            "field_guidance": {},
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        # Fallback response in case of error
        return {
            **form_guidance.get(form_type, {
                "description": f"Form FDA {form_type} is required for IND submissions.",
                "tips": ["Complete all sections accurately", "Review carefully before submission"],
                "common_issues": ["Missing information", "Inconsistency with supporting documents"]
            }),
            "field_guidance": {},
            "error": f"Error generating AI guidance: {str(e)}",
            "timestamp": datetime.now().isoformat()
        
        
        }