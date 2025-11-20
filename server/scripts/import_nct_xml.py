#!/usr/bin/env python3

"""
XML Clinical Trial Data Importer for TrialSage

This script processes XML files from ClinicalTrials.gov (NCT format) and 
converts them into a structured JSON format that can be imported into the TrialSage database.
"""

import sys
import os
import json
import glob
import xml.etree.ElementTree as ET
from datetime import datetime

def extract_text(element):
    """Extract text from an element, handling 'textblock' children."""
    if element is None:
        return ""
    
    # Check if there's a textblock child
    textblock = element.find(".//textblock")
    if textblock is not None and textblock.text:
        return textblock.text.strip()
    
    # Return direct text content
    return element.text.strip() if element.text else ""

def process_sponsors(sponsors_element):
    """Process sponsors element to extract lead sponsor."""
    if sponsors_element is None:
        return ""
    
    lead_sponsor = sponsors_element.find("./lead_sponsor/agency")
    if lead_sponsor is not None and lead_sponsor.text:
        return lead_sponsor.text.strip()
    
    return ""

def process_conditions(condition_elements):
    """Process condition elements to extract indications."""
    if not condition_elements:
        return []
    
    indications = []
    
    for condition in condition_elements:
        if condition.text:
            indications.append(condition.text.strip())
    
    return indications

def process_interventions(intervention_elements):
    """Process intervention elements to extract interventions."""
    if not intervention_elements:
        return []
    
    interventions = []
    
    for intervention in intervention_elements:
        intervention_type = intervention.find("./intervention_type")
        intervention_name = intervention.find("./intervention_name")
        
        if intervention_name is not None and intervention_name.text:
            intervention_data = {
                "name": intervention_name.text.strip(),
                "type": intervention_type.text.strip() if intervention_type is not None and intervention_type.text else ""
            }
            interventions.append(intervention_data)
    
    return interventions

def process_eligibility(eligibility_element):
    """Process eligibility element to extract criteria."""
    if eligibility_element is None:
        return ""
    
    criteria = eligibility_element.find("./criteria")
    
    if criteria is not None:
        return extract_text(criteria)
    
    # Alternative approach if criteria not found
    inclusion = eligibility_element.find("./criteria/textblock")
    if inclusion is not None:
        return extract_text(inclusion)
    
    return ""

def process_dates(study_element):
    """Process date elements to extract study dates."""
    result = {
        "start_date": "",
        "completion_date": "",
        "primary_completion_date": ""
    }
    
    # Start date
    start_date = study_element.find("./start_date")
    if start_date is not None and start_date.text:
        result["start_date"] = start_date.text.strip()
    
    # Primary completion date
    primary_completion = study_element.find("./primary_completion_date")
    if primary_completion is not None and primary_completion.text:
        result["primary_completion_date"] = primary_completion.text.strip()
    
    # Completion date
    completion = study_element.find("./completion_date")
    if completion is not None and completion.text:
        result["completion_date"] = completion.text.strip()
    
    return result

def process_xml_file(file_path):
    """Process a single NCT XML file and return structured data."""
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Extract file information
        file_name = os.path.basename(file_path)
        file_size = os.path.getsize(file_path)
        
        # Extract study identifier
        id_info = root.find(".//id_info/nct_id")
        nct_id = id_info.text.strip() if id_info is not None and id_info.text else ""
        
        # Extract basic study information
        brief_title = root.find(".//brief_title")
        official_title = root.find(".//official_title")
        phase_element = root.find(".//phase")
        study_type = root.find(".//study_type")
        
        # Extract detailed description
        detailed_description = root.find(".//detailed_description")
        brief_summary = root.find(".//brief_summary")
        
        # Extract sponsor information
        sponsors = root.find(".//sponsors")
        
        # Extract conditions/indications
        conditions = root.findall(".//condition")
        
        # Extract interventions
        interventions = root.findall(".//intervention")
        
        # Extract eligibility criteria
        eligibility = root.find(".//eligibility")
        
        # Extract date information
        dates = process_dates(root)
        
        # Build the structured data
        study_data = {
            "nctrialId": nct_id,
            "title": brief_title.text.strip() if brief_title is not None and brief_title.text else "",
            "officialTitle": official_title.text.strip() if official_title is not None and official_title.text else "",
            "phase": phase_element.text.strip() if phase_element is not None and phase_element.text else "N/A",
            "sponsor": process_sponsors(sponsors),
            "indication": ", ".join(process_conditions(conditions)),
            "studyType": study_type.text.strip() if study_type is not None and study_type.text else "",
            "description": extract_text(brief_summary),
            "detailedDescription": extract_text(detailed_description),
            "interventions": process_interventions(interventions),
            "eligibilityCriteria": process_eligibility(eligibility),
            "startDate": dates["start_date"],
            "completionDate": dates["completion_date"],
            "primaryCompletionDate": dates["primary_completion_date"],
            "fileName": file_name,
            "fileSize": file_size,
            "date": dates["start_date"],  # Using start date as the main date
            "source": "ClinicalTrials.gov",
            "drugName": next((i["name"] for i in process_interventions(interventions) 
                             if i["type"].lower() in ["drug", "biological"]), "")
        }
        
        return study_data
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")
        return None

def main():
    """Main function to process XML files."""
    if len(sys.argv) < 2:
        print("Usage: python import_nct_xml.py <directory_path>")
        sys.exit(1)
    
    directory_path = sys.argv[1]
    
    if not os.path.isdir(directory_path):
        print(f"Error: {directory_path} is not a valid directory")
        sys.exit(1)
    
    # Find all NCT XML files in the directory
    xml_files = glob.glob(os.path.join(directory_path, "NCT*.xml"))
    
    if not xml_files:
        print(f"No NCT XML files found in {directory_path}")
        sys.exit(1)
    
    print(f"Found {len(xml_files)} NCT XML files to process")
    
    # Process each file
    processed_studies = []
    processed_count = 0
    error_count = 0
    
    for file_path in xml_files:
        print(f"Processing {os.path.basename(file_path)}...")
        study_data = process_xml_file(file_path)
        
        if study_data:
            processed_studies.append(study_data)
            processed_count += 1
        else:
            error_count += 1
    
    # Create output structure
    output_data = {
        "processing_date": datetime.now().isoformat(),
        "processed_count": processed_count,
        "error_count": error_count,
        "studies": processed_studies
    }
    
    # Write to output file
    with open("processed_trials.json", "w") as f:
        json.dump(output_data, f, indent=2)
    
    print(f"Processing complete. {processed_count} studies processed, {error_count} errors.")
    print(f"Results saved to processed_trials.json")

if __name__ == "__main__":
    main()