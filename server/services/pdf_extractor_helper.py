#!/usr/bin/env python3
"""
PDF Extractor Helper
Uses pdfplumber for table extraction and PyPDF2 for text/metadata
"""

import sys
import json
import pdfplumber
from PyPDF2 import PdfReader

def extract_pdf(filepath):
    """Extract text, tables, and metadata from a PDF file"""
    result = {
        'text': '',
        'tables': [],
        'metadata': {},
        'quality': {
            'textLength': 0,
            'tableCount': 0,
            'confidence': 0.0
        }
    }
    
    try:
        # Extract metadata and text using PyPDF2
        with open(filepath, 'rb') as f:
            pdf_reader = PdfReader(f)
            
            # Metadata
            info = pdf_reader.metadata
            if info:
                result['metadata'] = {
                    'pages': len(pdf_reader.pages),
                    'author': info.get('/Author', ''),
                    'title': info.get('/Title', ''),
                    'subject': info.get('/Subject', ''),
                    'creator': info.get('/Creator', ''),
                    'producer': info.get('/Producer', ''),
                    'creationDate': str(info.get('/CreationDate', ''))
                }
            else:
                result['metadata']['pages'] = len(pdf_reader.pages)
            
            # Extract text from all pages
            text_parts = []
            for page in pdf_reader.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)
            
            result['text'] = '\n\n'.join(text_parts)
        
        # Extract tables using pdfplumber
        with pdfplumber.open(filepath) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        if table and len(table) > 0:
                            # Filter out None values and convert to strings
                            cleaned_table = [
                                [str(cell) if cell is not None else '' for cell in row]
                                for row in table if row
                            ]
                            
                            if cleaned_table:
                                result['tables'].append({
                                    'page': page_num,
                                    'data': cleaned_table,
                                    'rowCount': len(cleaned_table),
                                    'columnCount': len(cleaned_table[0]) if cleaned_table else 0
                                })
        
        # Calculate quality metrics
        result['quality']['textLength'] = len(result['text'])
        result['quality']['tableCount'] = len(result['tables'])
        
        # Simple confidence score based on content presence
        confidence = 0.0
        if result['quality']['textLength'] > 1000:
            confidence += 0.5
        if result['quality']['tableCount'] > 0:
            confidence += 0.3
        if result['metadata'].get('pages', 0) > 10:
            confidence += 0.2
        
        result['quality']['confidence'] = min(confidence, 1.0)
        
    except Exception as e:
        raise Exception(f"PDF extraction failed: {str(e)}")
    
    return result

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file path provided'}), file=sys.stderr)
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    try:
        result = extract_pdf(filepath)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)
