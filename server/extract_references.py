#!/usr/bin/env python3
# trialsage/extract_references.py
# Bridge script to extract CSR references from text

import os
import sys
import json
import re
from typing import List, Dict, Any
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from trialsage.services.deep_csr_analyzer import extract_csr_references
except ImportError:
    logger.error("Failed to import deep_csr_analyzer. Make sure it's in the correct path.")
    # Fallback function in case the import fails
    def extract_csr_references(text: str) -> List[Dict[str, Any]]:
        """Emergency fallback function for CSR citation extraction"""
        logger.warning("Using fallback citation extraction - limited functionality")
        
        # Basic regex pattern for CSR references like "CSR-12345", "CSR_12345", etc.
        basic_patterns = [
            r"CSR[_\s-]?(\d{5})",
            r"Clinical Study Report[_\s-]?(\d{5})",
            r"Trial[_\s-]?(\d{5})",
            r"Study[_\s-]?(\d{5})",
        ]
        
        results = []
        for pattern in basic_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                csr_id = f"CSR-{match.group(1)}"
                
                # Get some context around the match
                start = max(0, match.start() - 100)
                end = min(len(text), match.end() + 100)
                context = text[start:end]
                
                results.append({
                    "csr_id": csr_id,
                    "citation_type": "explicit",
                    "relevance": "medium",
                    "context": context,
                    "fallback": True
                })
        
        if not results:
            # If no explicit references, provide a fallback with warning
            results.append({
                "csr_id": "FALLBACK-000001",
                "citation_type": "semantic",
                "relevance": "low",
                "context": "No explicit CSR references found in text. Deep semantic matching is not available in fallback mode.",
                "fallback": True
            })
        
        return results

def main():
    """
    Main function to extract CSR references from an input file
    
    Takes a filepath as a command-line argument, reads the text,
    extracts CSR references, and prints the result as JSON to stdout.
    """
    if len(sys.argv) != 2:
        logger.error("Usage: python3 extract_references.py <filepath>")
        print(json.dumps({"error": "Invalid arguments", "references": []}))
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    try:
        # Read the text from the file
        with open(filepath, 'r', encoding='utf-8') as f:
            text = f.read()
        
        if not text:
            logger.error("Input file is empty")
            print(json.dumps({"error": "Input file is empty", "references": []}))
            sys.exit(1)
        
        # Extract CSR references
        try:
            references = extract_csr_references(text)
            logger.info(f"Extracted {len(references)} CSR references")
            
            # Print the result as JSON
            print(json.dumps({
                "textLength": len(text),
                "referenceCount": len(references),
                "references": references
            }))
            
        except Exception as e:
            logger.error(f"Error extracting CSR references: {str(e)}")
            print(json.dumps({
                "error": f"Failed to extract references: {str(e)}",
                "textLength": len(text),
                "references": []
            }))
            sys.exit(1)
        
    except Exception as e:
        logger.error(f"Error reading file {filepath}: {str(e)}")
        print(json.dumps({"error": f"Failed to read file: {str(e)}", "references": []}))
        sys.exit(1)

if __name__ == "__main__":
    main()