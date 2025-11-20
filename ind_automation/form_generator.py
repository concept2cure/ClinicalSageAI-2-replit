"""
Form Generator for IND Wizard

This module handles the generation of FDA forms based on project data.
"""

import os
from typing import Dict, Any
from datetime import datetime
from io import BytesIO

def generate_form_1571(project_data: Dict[str, Any]) -> BytesIO:
    """
    Generate a Form FDA 1571 for an IND application.
    
    In a real implementation, this would use a template to generate a DOCX file.
    For demonstration purposes, this just creates a simple placeholder document.
    
    Args:
        project_data: Dictionary containing project data
        
    Returns:
        BytesIO object containing the generated form
    """
    # Create a simple text representation of the form
    form_content = f"""
FORM FDA 1571 - INVESTIGATIONAL NEW DRUG APPLICATION (IND)

1. NAME OF SPONSOR:
   {project_data.get('sponsor', 'N/A')}

2. DATE OF SUBMISSION:
   {datetime.now().strftime('%m/%d/%Y')}

3. NAME OF INVESTIGATIONAL DRUG:
   {project_data.get('drug_name', 'N/A')}

4. PHASE(S) OF CLINICAL INVESTIGATION TO BE CONDUCTED:
   [ ] Phase 1   [ ] Phase 2   [ ] Phase 3   [ ] Other

5. IND NUMBER (if previously assigned):
   {project_data.get('project_id', 'NEW')}

6. INDICATION(S):
   Investigational treatment

7. CONTACT INFORMATION:
   Principal Investigator: {project_data.get('pi_name', 'N/A')}
   Address: {project_data.get('pi_address', 'N/A')}
   Protocol: {project_data.get('protocol', 'N/A')}
   NCT Number: {project_data.get('nct_number', 'N/A')}
   
8. CONTENTS OF APPLICATION:
   [X] 1. Table of Contents
   [X] 2. Introductory statement and general investigational plan
   [X] 3. Investigator's brochure
   [X] 4. Protocol(s)
   [X] 5. Chemistry, manufacturing, and control data
   [X] 6. Pharmacology and toxicology data
   [X] 7. Previous human experience
   [X] 8. Additional information
"""
    
    # In a real implementation, this would create an actual DOCX file
    # For now, just return the text as bytes
    return BytesIO(form_content.encode('utf-8'))

def generate_form_1572(project_data: Dict[str, Any]) -> BytesIO:
    """
    Generate a Form FDA 1572 for Statement of Investigator.
    
    Args:
        project_data: Dictionary containing project data
        
    Returns:
        BytesIO object containing the generated form
    """
    # Create a simple text representation of the form
    form_content = f"""
FORM FDA 1572 - STATEMENT OF INVESTIGATOR

1. NAME AND ADDRESS OF INVESTIGATOR:
   {project_data.get('pi_name', 'N/A')}
   {project_data.get('pi_address', 'N/A')}

2. EDUCATION, TRAINING, AND EXPERIENCE:
   (See attached curriculum vitae)

3. NAME AND ADDRESS OF ANY MEDICAL SCHOOL, HOSPITAL OR OTHER RESEARCH FACILITY 
   WHERE THE CLINICAL INVESTIGATION(S) WILL BE CONDUCTED:
   {project_data.get('pi_address', 'N/A')}

4. NAME AND ADDRESS OF ANY CLINICAL LABORATORY FACILITIES TO BE USED:
   (To be determined)

5. NAME AND ADDRESS OF THE INSTITUTIONAL REVIEW BOARD (IRB) RESPONSIBLE FOR
   REVIEW AND APPROVAL OF THE INVESTIGATION(S):
   (To be determined)

6. NAMES OF SUBINVESTIGATORS:
   (To be determined)

7. NAME AND CODE NUMBER OF THE PROTOCOL(S) IN THE IND:
   {project_data.get('protocol', 'N/A')}
   
8. PHASE OF CLINICAL INVESTIGATION TO BE CONDUCTED:
   [ ] Phase 1   [ ] Phase 2   [ ] Phase 3   [ ] Other
"""
    
    # In a real implementation, this would create an actual DOCX file
    # For now, just return the text as bytes
    return BytesIO(form_content.encode('utf-8'))

def generate_form_3674(project_data: Dict[str, Any]) -> BytesIO:
    """
    Generate a Form FDA 3674 for Certification of Compliance.
    
    Args:
        project_data: Dictionary containing project data
        
    Returns:
        BytesIO object containing the generated form
    """
    # Create a simple text representation of the form
    form_content = f"""
FORM FDA 3674 - CERTIFICATION OF COMPLIANCE

1. CERTIFICATION OF COMPLIANCE WITH REQUIREMENTS OF ClinicalTrials.gov
   For submission of information to FDA (Title VIII, Section 801 of Public Law 110-85)

2. IND NUMBER:
   {project_data.get('project_id', 'NEW')}

3. NAME OF SPONSOR:
   {project_data.get('sponsor', 'N/A')}

4. NDA/BLA/STN NUMBER:
   N/A

5. PRODUCT NAME:
   {project_data.get('drug_name', 'N/A')}

6. INDICATION:
   Investigational treatment

7. CERTIFICATION STATEMENT:
   [X] I certify that the requirements of 42 U.S.C. § 282(j), Section 402(j) of the Public Health
       Service Act, enacted by Title VIII of Public Law 110-85, have been met for the referenced
       clinical trial identified in the certification form.
       
   NCT Number: {project_data.get('nct_number', 'Not yet assigned')}
"""
    
    # In a real implementation, this would create an actual DOCX file
    # For now, just return the text as bytes
    return BytesIO(form_content.encode('utf-8'))

def generate_form_3454(project_data: Dict[str, Any]) -> BytesIO:
    """
    Generate a Form FDA 3454 for Financial Disclosure.
    
    Args:
        project_data: Dictionary containing project data
        
    Returns:
        BytesIO object containing the generated form
    """
    # Create a simple text representation of the form
    form_content = f"""
FORM FDA 3454 - CERTIFICATION: FINANCIAL INTERESTS AND ARRANGEMENTS OF CLINICAL INVESTIGATORS

1. NAME OF APPLICANT:
   {project_data.get('sponsor', 'N/A')}

2. IND NUMBER:
   {project_data.get('project_id', 'NEW')}

3. PRODUCT:
   {project_data.get('drug_name', 'N/A')}

4. CERTIFICATION STATEMENT:
   [X] I certify, as the sponsor of the clinical investigation, that I have not entered
       into any financial arrangement with the clinical investigators, whereby the value
       of compensation to the investigator could be affected by the outcome of the
       investigation.
       
5. INVESTIGATOR:
   {project_data.get('pi_name', 'N/A')}
   {project_data.get('pi_address', 'N/A')}
"""
    
    # In a real implementation, this would create an actual DOCX file
    # For now, just return the text as bytes
    return BytesIO(form_content.encode('utf-8'))

# Form generator factory
form_generators = {
    "1571": generate_form_1571,
    "1572": generate_form_1572,
    "3674": generate_form_3674,
    "3454": generate_form_3454
}

def generate_form(form_type: str, project_data: Dict[str, Any]) -> BytesIO:
    """
    Generate a form document based on the form type and project data.
    
    Args:
        form_type: Type of form to generate ("1571", "1572", etc.)
        project_data: Dictionary containing project data
        
    Returns:
        BytesIO object containing the generated form
        
    Raises:
        ValueError: If the form type is not supported
    """
    if form_type in form_generators:
        return form_generators[form_type](project_data)
    else:
        raise ValueError(f"Unsupported form type: {form_type}")