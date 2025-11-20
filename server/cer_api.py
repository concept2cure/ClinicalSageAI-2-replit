#!/usr/bin/env python3
"""
CER API Module

This script provides a command-line interface for generating CER reports
using the FAERS API and OpenAI.
"""
import argparse
import json
import os
from faers_client import get_faers_data
from cer_narrative import generate_cer_narrative

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Generate CER Report')
    parser.add_argument('--ndc_code', required=True, help='NDC code for the product')
    parser.add_argument('--output', required=True, help='Output file path for JSON report')
    
    args = parser.parse_args()
    
    try:
        # Fetch FAERS data for the NDC code
        faers_data = get_faers_data(args.ndc_code)
        
        # Generate CER narrative
        cer_narrative = generate_cer_narrative(faers_data)
        
        # Create the report object
        report = {
            "success": True,
            "ndc_code": args.ndc_code,
            "cer_report": cer_narrative,
            "data_source": "FDA FAERS Database"
        }
        
        # Write the report to the output file
        with open(args.output, 'w') as f:
            json.dump(report, f)
        
        # Success exit code
        exit(0)
    except Exception as e:
        # Create error report
        error_report = {
            "success": False,
            "ndc_code": args.ndc_code,
            "error": str(e)
        }
        
        # Write the error report to the output file
        with open(args.output, 'w') as f:
            json.dump(error_report, f)
        
        # Error exit code
        exit(1)

if __name__ == "__main__":
    main()