#!/usr/bin/env python3
"""
PDF Extraction Script using pdfplumber and PyPDF2
Extracts text and tables from CSR PDFs and outputs structured JSON
"""

import sys
import json
import pdfplumber
from PyPDF2 import PdfReader

def extract_pdf(pdf_path):
    """Extract text and tables from PDF"""
    result = {
        "text": "",
        "tables": [],
        "metadata": {
            "pageCount": 0
        }
    }
    
    try:
        # Use PyPDF2 for basic text extraction
        pdf_reader = PdfReader(pdf_path)
        result["metadata"]["pageCount"] = len(pdf_reader.pages)
        
        # Extract text from all pages
        text_parts = []
        for page_num, page in enumerate(pdf_reader.pages, start=1):
            page_text = page.extract_text()
            if page_text:
                text_parts.append(f"--- Page {page_num} ---\n{page_text}")
        
        result["text"] = "\n\n".join(text_parts)
        
        # Use pdfplumber for table extraction
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                tables = page.extract_tables()
                if tables:
                    for table_idx, table in enumerate(tables):
                        if table and len(table) > 0:
                            # First row as headers
                            headers = table[0] if table else []
                            rows = table[1:] if len(table) > 1 else []
                            
                            result["tables"].append({
                                "page": page_num,
                                "headers": headers,
                                "rows": rows,
                                "tableIndex": table_idx
                            })
        
        return result
        
    except Exception as e:
        # Return error in JSON format
        return {
            "error": str(e),
            "text": "",
            "tables": [],
            "metadata": {"pageCount": 0}
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No PDF path provided"}))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    result = extract_pdf(pdf_path)
    print(json.dumps(result))
