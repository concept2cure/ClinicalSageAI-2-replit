import os
import json
from openai import OpenAI

# Ensure the API key is set in the environment
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def generate_cer_narrative(faers_data):
    """
    Generate a regulatory-compliant Clinical Evaluation Report narrative using FDA FAERS data.
    
    Args:
        faers_data (dict): FAERS data from the FDA API
        
    Returns:
        str: Generated CER narrative text
    """
    # Format data for better prompt structure
    try:
        # Format as readable JSON to make the prompt more effective
        formatted_data = json.dumps(faers_data, indent=2)
        
        prompt = f"""
        Generate a comprehensive Clinical Evaluation Report narrative based on the following FDA FAERS data:
        
        {formatted_data}
        
        Include the following sections:
        1. Executive Summary
        2. Product Information (based on available data)
        3. Adverse Events Analysis
           - Frequency and distribution
           - Severity assessment
           - Patient demographics (if available)
        4. Clinical Significance Assessment
        5. Benefit-Risk Analysis
        6. Comparative Safety Assessment
        7. Conclusions and Recommendations
        
        Follow regulatory guidelines for CER formatting. Be factual and evidence-based.
        If data is limited, acknowledge limitations but provide analysis of available information.
        """
        
        response = client.chat.completions.create(
            model="gpt-4o",  # the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )
        
        return response.choices[0].message.content
    except Exception as e:
        return f"Error generating CER narrative: {str(e)}"