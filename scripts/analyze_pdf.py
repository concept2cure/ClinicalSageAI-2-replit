#!/usr/bin/env python3
"""
PDF Structure Analyzer

This script extracts the structure and content of a PDF file for analysis.
"""

import os
import sys
from pdfminer.high_level import extract_text, extract_pages
from pdfminer.layout import LAParams, LTTextContainer

def analyze_pdf_structure(pdf_path):
    """
    Analyze the structure of a PDF document
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        A dictionary containing the structure information
    """
    if not os.path.exists(pdf_path):
        print(f"Error: File not found: {pdf_path}")
        return None
    
    print(f"Analyzing PDF: {pdf_path}")
    
    # Extract text from the PDF
    try:
        text = extract_text(pdf_path)
        print(f"Total extracted text length: {len(text)} characters")
    except Exception as e:
        print(f"Error extracting text: {e}")
        return None

    # Analyze page structure
    page_data = []
    try:
        for i, page_layout in enumerate(extract_pages(pdf_path)):
            page_info = {
                'page_num': i + 1,
                'text_elements': [],
                'text_content': ''
            }
            
            for element in page_layout:
                if isinstance(element, LTTextContainer):
                    text_content = element.get_text().strip()
                    if text_content:
                        page_info['text_elements'].append({
                            'text': text_content,
                            'bbox': element.bbox,
                            'height': element.height,
                            'width': element.width
                        })
                        page_info['text_content'] += text_content + "\n"
            
            page_data.append(page_info)
            
            # Print summary for this page
            print(f"\nPage {i+1} Summary:")
            print(f"  Text elements: {len(page_info['text_elements'])}")
            
            # Print first few text elements
            for j, elem in enumerate(page_info['text_elements'][:5]):
                print(f"  Element {j+1}: {elem['text'][:50]}...")
                
            if i == 0:  # First page usually has title and metadata
                print("\nPossible Title/Headers from first page:")
                for elem in page_info['text_elements']:
                    if elem['height'] > 12 and len(elem['text']) < 100:  # Likely headers
                        print(f"  {elem['text']}")
    
    except Exception as e:
        print(f"Error analyzing page structure: {e}")
    
    # Try to identify sections and structure
    try:
        # Look for patterns that might indicate section headers
        section_patterns = [
            "CLINICAL EVALUATION REPORT",
            "EXECUTIVE SUMMARY",
            "INTRODUCTION",
            "SCOPE",
            "DEVICE DESCRIPTION",
            "LITERATURE REVIEW",
            "CLINICAL DATA",
            "RISK ANALYSIS",
            "CONCLUSION"
        ]
        
        print("\nIdentified Sections:")
        for pattern in section_patterns:
            if pattern.lower() in text.lower():
                print(f"  Found section: {pattern}")
    
    except Exception as e:
        print(f"Error identifying sections: {e}")
    
    return {
        'num_pages': len(page_data),
        'pages': page_data,
        'full_text': text
    }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python analyze_pdf.py <pdf_file_path>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    analyze_pdf_structure(pdf_path)