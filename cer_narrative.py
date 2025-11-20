#!/usr/bin/env python
"""
CER Narrative Generator

This module generates clinical evaluation report (CER) narratives
based on FAERS (FDA Adverse Event Reporting System) data.
"""
import json
import argparse
import sys
import re
import os
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("cer_narrative.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("cer_narrative")

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
    # Initialize OpenAI client if API key is available
    if os.environ.get("OPENAI_API_KEY"):
        openai_client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    else:
        logger.warning("OpenAI API key not found in environment variables")
        openai_client = None
        OPENAI_AVAILABLE = False
except ImportError:
    logger.warning("OpenAI package not installed, using basic generation instead")
    OPENAI_AVAILABLE = False
    openai_client = None

def get_product_details(faers_data):
    """Extract product details from FAERS data response"""
    product_name = None
    manufacturer = None
    
    if "results" in faers_data and len(faers_data["results"]) > 0:
        result = faers_data["results"][0]
        if "openfda" in result:
            openfda = result["openfda"]
            if "brand_name" in openfda and len(openfda["brand_name"]) > 0:
                product_name = openfda["brand_name"][0]
            elif "generic_name" in openfda and len(openfda["generic_name"]) > 0:
                product_name = openfda["generic_name"][0]
                
            if "manufacturer_name" in openfda and len(openfda["manufacturer_name"]) > 0:
                manufacturer = openfda["manufacturer_name"][0]
    
    return product_name, manufacturer

def extract_adverse_events(faers_data):
    """Extract and categorize adverse events from FAERS data"""
    adverse_events = {}
    total_reports = 0
    
    if "results" in faers_data:
        total_reports = len(faers_data["results"])
        
        for result in faers_data["results"]:
            if "patient" in result and "reaction" in result["patient"]:
                for reaction in result["patient"]["reaction"]:
                    if "reactionmeddrapt" in reaction:
                        event = reaction["reactionmeddrapt"]
                        if event in adverse_events:
                            adverse_events[event] += 1
                        else:
                            adverse_events[event] = 1
    
    # Sort by frequency
    sorted_events = sorted(adverse_events.items(), key=lambda x: x[1], reverse=True)
    
    return sorted_events, total_reports

def generate_severity_assessment(adverse_events, total_reports):
    """Generate an assessment of event severity based on frequencies"""
    serious_terms = ["death", "fatal", "hospitalization", "disability", "life threatening", 
                    "congenital anomaly", "birth defect", "required intervention"]
    
    serious_events = []
    common_events = []
    
    # Calculate percentages and categorize
    for event, count in adverse_events:
        percentage = (count / total_reports) * 100
        
        event_data = {
            "name": event,
            "count": count,
            "percentage": percentage
        }
        
        # Check if event contains serious terms
        is_serious = any(term in event.lower() for term in serious_terms)
        
        if is_serious or percentage > 5:
            serious_events.append(event_data)
        elif percentage > 1:
            common_events.append(event_data)
    
    return serious_events, common_events

def format_date(date_str):
    """Convert date format"""
    try:
        date_obj = datetime.strptime(date_str, "%Y%m%d")
        return date_obj.strftime("%B %d, %Y")
    except:
        return date_str

def generate_enhanced_cer_with_openai(faers_data, product_name, manufacturer_info, adverse_events, total_reports, serious_events, common_events):
    """
    Generate an enhanced CER narrative using OpenAI's capabilities
    
    Args:
        faers_data: Dictionary containing FAERS API response
        product_name: Product name
        manufacturer_info: Manufacturer information
        adverse_events: List of all adverse events
        total_reports: Total number of reports
        serious_events: List of serious adverse events
        common_events: List of common adverse events
        
    Returns:
        str: Enhanced CER narrative text
    """
    try:
        if not OPENAI_AVAILABLE or not openai_client:
            logger.warning("OpenAI not available or client not initialized, falling back to standard generation")
            return None
            
        logger.info(f"Generating enhanced CER with OpenAI for {product_name}")
        
        # Create a detailed system prompt for the model
        system_prompt = """You are an expert medical writer specialized in creating Clinical Evaluation Reports (CERs) for regulatory compliance. 
Your task is to generate a comprehensive, professional CER based on FDA Adverse Event Reporting System (FAERS) data.
Follow these guidelines:
1. Use formal, regulatory-appropriate language
2. Organize the report with clear section headings
3. Provide evidence-based analysis of safety concerns
4. Include actionable recommendations based on the data severity
5. Conclude with a balanced assessment of the product's safety profile
6. Format using Markdown for readability
7. Maintain an objective tone throughout"""

        # Prepare user prompt with the data
        serious_events_text = ""
        for event in serious_events[:10]:
            serious_events_text += f"- {event['name']}: {event['count']} reports ({event['percentage']:.1f}% of total reports)\n"
            
        common_events_text = ""
        for event in common_events[:15]:
            common_events_text += f"- {event['name']}: {event['count']} reports ({event['percentage']:.1f}% of total reports)\n"
        
        user_prompt = f"""Please generate a Clinical Evaluation Report for {product_name}{manufacturer_info} based on the following FAERS data:

PRODUCT INFORMATION:
- Product name: {product_name}
- Manufacturer: {manufacturer_info.replace(" manufactured by ", "") if manufacturer_info else "Unknown"}

DATA SUMMARY:
- Total adverse event reports analyzed: {total_reports}
- Number of serious adverse events identified: {len(serious_events)}
- Number of common adverse events identified: {len(common_events)}

SIGNIFICANT ADVERSE EVENTS:
{serious_events_text}

COMMON ADVERSE EVENTS:
{common_events_text}

Please structure the report with the following sections:
1. Executive Summary
2. Product Information
3. Data Sources and Methodology
4. Safety Analysis
5. Clinical Assessment
6. Recommendations
7. Conclusion

The report should be comprehensive yet concise, focusing on clinical significance rather than just statistics."""

        # Generate the report with OpenAI
        response = openai_client.chat.completions.create(
            model="gpt-4o",  # the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=2000
        )
        
        # Extract and return the generated narrative
        enhanced_narrative = response.choices[0].message.content
        
        # Add a generation note at the top
        current_date = datetime.now().strftime("%B %d, %Y")
        enhanced_narrative = f"# Clinical Evaluation Report (CER) for {product_name}{manufacturer_info}\nDate of Report: {current_date}\n\n" + enhanced_narrative
        
        logger.info(f"Successfully generated enhanced CER with OpenAI for {product_name}")
        return enhanced_narrative
        
    except Exception as e:
        logger.error(f"Error generating enhanced CER with OpenAI: {str(e)}")
        return None  # Fall back to standard generation


def generate_cer_narrative(faers_data, product_name="", use_enhanced=True):
    """
    Generate a structured clinical evaluation report narrative
    
    Args:
        faers_data: Dictionary containing FAERS API response
        product_name: Optional product name override
        use_enhanced: Whether to use enhanced generation with OpenAI when available
        
    Returns:
        str: Formatted CER narrative text
    """
    # Extract product details if not provided
    if not product_name:
        extracted_name, manufacturer = get_product_details(faers_data)
        product_name = extracted_name or "Unknown Product"
        manufacturer_info = f" manufactured by {manufacturer}" if manufacturer else ""
    else:
        manufacturer_info = ""
    
    # Extract and analyze adverse events
    adverse_events, total_reports = extract_adverse_events(faers_data)
    serious_events, common_events = generate_severity_assessment(adverse_events, total_reports)
    
    # Try enhanced generation first if available and requested
    if use_enhanced and OPENAI_AVAILABLE and openai_client:
        enhanced_narrative = generate_enhanced_cer_with_openai(
            faers_data, 
            product_name, 
            manufacturer_info, 
            adverse_events, 
            total_reports, 
            serious_events, 
            common_events
        )
        
        if enhanced_narrative:
            return enhanced_narrative
    
    # Fall back to standard generation
    # Begin constructing the narrative
    current_date = datetime.now().strftime("%B %d, %Y")
    
    narrative = f"""Clinical Evaluation Report (CER) for {product_name}{manufacturer_info}
Date of Report: {current_date}

SUMMARY OF SAFETY DATA ANALYSIS
==============================

This Clinical Evaluation Report presents an analysis of safety data for {product_name} based on {total_reports} adverse event reports from the FDA Adverse Event Reporting System (FAERS).

1. OVERVIEW OF REPORTED EVENTS
-----------------------------
Total number of adverse event reports analyzed: {total_reports}
Data collection period: Based on available FAERS data
"""

    # Add serious events section if applicable
    if serious_events:
        narrative += f"""
2. SIGNIFICANT ADVERSE EVENTS
---------------------------
The following significant adverse events were identified, listed by frequency:

"""
        for event in serious_events[:10]:  # Limit to top 10
            narrative += f"- {event['name']}: {event['count']} reports ({event['percentage']:.1f}% of total reports)\n"
    
    # Add common events section
    if common_events:
        narrative += f"""
3. COMMON ADVERSE EVENTS
----------------------
Other commonly reported adverse events include:

"""
        for event in common_events[:15]:  # Limit to top 15
            narrative += f"- {event['name']}: {event['count']} reports ({event['percentage']:.1f}% of total reports)\n"
    
    # Add clinical assessment
    narrative += f"""
4. CLINICAL ASSESSMENT
-------------------
Based on the frequency and nature of the reported adverse events, the following clinical assessment can be made:

"""
    
    # Generate appropriate assessment based on data
    if len(serious_events) > 5 and any(event['percentage'] > 10 for event in serious_events):
        narrative += "The data indicates a SIGNIFICANT SAFETY CONCERN. The high frequency of serious adverse events suggests the need for careful risk-benefit assessment and potentially enhanced monitoring or risk mitigation strategies."
    elif len(serious_events) > 0:
        narrative += "The safety profile shows NOTABLE ADVERSE EVENTS that warrant monitoring. While serious events have been reported, their frequency does not necessarily indicate a disproportionate risk compared to similar products."
    else:
        narrative += "The observed safety profile appears GENERALLY CONSISTENT with expectations. No unexpected serious concerns were identified in the analyzed dataset."
    
    # Add recommendations
    narrative += f"""

5. RECOMMENDATIONS
----------------
Based on this evaluation, the following recommendations are made:

"""
    
    if len(serious_events) > 5:
        narrative += """- Consider enhanced surveillance for the identified serious adverse events
- Review product labeling to ensure adequate warnings for the most significant events
- Evaluate potential risk factors that may contribute to serious adverse events
- Consider whether a Risk Evaluation and Mitigation Strategy (REMS) may be appropriate"""
    else:
        narrative += """- Continue routine monitoring of adverse events
- Consider updating product information if new patterns emerge
- No immediate changes to risk management activities are deemed necessary based on current data"""
    
    # Add conclusion
    narrative += f"""

6. CONCLUSION
-----------
This clinical evaluation based on {total_reports} FAERS reports provides insight into the post-market safety profile of {product_name}. """
    
    if total_reports < 10:
        narrative += "However, the limited number of reports suggests caution in drawing definitive conclusions. Continued monitoring is recommended."
    elif total_reports < 50:
        narrative += "While the dataset offers valuable insights, the moderate number of reports suggests that findings should be interpreted with appropriate caution."
    else:
        narrative += "The substantial number of reports provides a robust basis for assessing the product's safety profile in real-world use."
    
    return narrative

def main():
    """Command line entry point"""
    parser = argparse.ArgumentParser(description="Generate CER narrative from FAERS data")
    parser.add_argument("--ndc", required=True, help="NDC code to query")
    parser.add_argument("--input", help="Optional JSON file with FAERS data (if not provided, uses server/faers_client.py)")
    parser.add_argument("--no-enhanced", action="store_true", help="Disable enhanced generation with OpenAI")
    parser.add_argument("--basic", action="store_true", help="Alias for --no-enhanced")
    args = parser.parse_args()
    
    # Check if enhanced generation should be disabled
    use_enhanced = not (args.no_enhanced or args.basic)
    
    if args.input:
        # Load data from file
        try:
            with open(args.input, 'r') as f:
                faers_data = json.load(f)
            logger.info(f"Loaded FAERS data from file: {args.input}")
        except Exception as e:
            logger.error(f"Error loading input file: {str(e)}")
            print(f"Error: Could not load input file: {str(e)}", file=sys.stderr)
            sys.exit(1)
    else:
        # Try to import the FAERS client
        try:
            sys.path.append(".")
            from server.faers_client import get_faers_data
            logger.info(f"Querying FAERS API for NDC code: {args.ndc}")
            faers_data = get_faers_data(args.ndc)
            
            if not faers_data or not faers_data.get("results"):
                logger.warning(f"No FAERS data found for NDC code: {args.ndc}")
                print(f"Warning: No FAERS data found for NDC code: {args.ndc}", file=sys.stderr)
        except ImportError:
            logger.error("FAERS client module not found")
            print("Error: server/faers_client.py not found and no input file provided", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            logger.error(f"Error querying FAERS API: {str(e)}")
            print(f"Error: Failed to query FAERS API: {str(e)}", file=sys.stderr)
            sys.exit(1)
    
    # Generate narrative with specified options
    logger.info(f"Generating CER narrative (enhanced={use_enhanced})")
    narrative = generate_cer_narrative(faers_data, use_enhanced=use_enhanced)
    
    # Print to stdout
    print(narrative)

if __name__ == "__main__":
    main()