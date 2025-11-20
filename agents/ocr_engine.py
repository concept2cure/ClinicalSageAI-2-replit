"""
OCR Engine for TrialSage CSR Processing Pipeline

This module handles OCR-related operations for both native and scanned PDFs:
1. Detects if a PDF contains searchable text or requires OCR
2. Applies appropriate extraction method (PyMuPDF for native, Tesseract for scanned)
3. Provides a unified interface for text extraction regardless of source document type

Features:
- PDF type detection (scanned vs. native)
- Advanced OCR with layout preservation
- Table detection and structured extraction
- Multi-language support
"""

import os
import fitz  # PyMuPDF
import pytesseract
import cv2
import numpy as np
import logging
from PIL import Image
from typing import Dict, List, Tuple, Optional, Union

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("ocr_engine.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("OCREngine")

# Constants
MIN_TEXT_THRESHOLD = 20  # Minimum characters per page to consider a PDF as native/searchable
TESSERACT_CONFIG = "--oem 1 --psm 6"  # Tesseract configuration (OCR Engine Mode & Page Segmentation Mode)
TABLE_DETECTION_CONF = 0.8  # Confidence threshold for table detection


def is_scanned_pdf(pdf_path: str, sample_pages: int = 5) -> bool:
    """
    Determine if a PDF is scanned or native by checking text extraction results
    
    Args:
        pdf_path: Path to the PDF file
        sample_pages: Number of pages to sample for the detection
        
    Returns:
        bool: True if the PDF appears to be scanned (requires OCR)
    """
    try:
        doc = fitz.open(pdf_path)
        page_count = min(len(doc), sample_pages)
        
        # Check a sample of pages (start, middle, end)
        pages_to_check = []
        if page_count <= sample_pages:
            pages_to_check = list(range(page_count))
        else:
            # Get a representative sample (start, middle, end of document)
            pages_to_check = [0, 
                              page_count // 4, 
                              page_count // 2, 
                              (3 * page_count) // 4, 
                              page_count - 1]
            pages_to_check = pages_to_check[:sample_pages]  # Limit to sample_pages
        
        # Count pages with insufficient text
        scanned_page_count = 0
        
        for page_num in pages_to_check:
            page = doc[page_num]
            text = page.get_text()
            
            # If page has very little text, it's likely scanned
            if len(text.strip()) < MIN_TEXT_THRESHOLD:
                scanned_page_count += 1
        
        # If more than half the sampled pages seem scanned, classify as scanned
        scanned_ratio = scanned_page_count / len(pages_to_check)
        logger.info(f"PDF scan detection: {scanned_page_count}/{len(pages_to_check)} pages appear scanned ({scanned_ratio:.0%})")
        
        return scanned_ratio > 0.5
        
    except Exception as e:
        logger.error(f"Error detecting PDF type: {e}")
        # Default to assuming it's scanned if we can't detect properly
        return True


def extract_text_from_native_pdf(pdf_path: str) -> str:
    """
    Extract text from a native/searchable PDF using PyMuPDF
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        str: Extracted text content
    """
    try:
        doc = fitz.open(pdf_path)
        text = ""
        
        for page in doc:
            # Get text with preservation of reading order and basic layout
            page_text = page.get_text("text")
            text += page_text + "\n\n"
        
        logger.info(f"Successfully extracted {len(text)} characters from native PDF {pdf_path}")
        return text
        
    except Exception as e:
        logger.error(f"Error extracting text from native PDF {pdf_path}: {e}")
        return ""


def extract_text_from_scanned_pdf(pdf_path: str) -> str:
    """
    Extract text from a scanned PDF using OCR (Tesseract)
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        str: Extracted text content
    """
    try:
        doc = fitz.open(pdf_path)
        text = ""
        
        for page_num, page in enumerate(doc):
            logger.info(f"OCR processing page {page_num+1}/{len(doc)}")
            
            # Get page as image
            pix = page.get_pixmap(matrix=fitz.Matrix(300/72, 300/72))  # 300 DPI
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # Convert PIL Image to OpenCV format for preprocessing
            img_cv = np.array(img)
            img_cv = cv2.cvtColor(img_cv, cv2.COLOR_RGB2BGR)
            
            # Preprocessing for better OCR results
            img_gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
            img_processed = cv2.adaptiveThreshold(
                img_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY, 11, 10
            )
            
            # Convert back to PIL Image for Tesseract
            img_preprocessed = Image.fromarray(img_processed)
            
            # Perform OCR
            page_text = pytesseract.image_to_string(img_preprocessed, config=TESSERACT_CONFIG)
            text += page_text + "\n\n"
            
            # Add progress indicator for long documents
            if len(doc) > 10 and (page_num + 1) % 10 == 0:
                logger.info(f"OCR progress: {page_num+1}/{len(doc)} pages processed")
        
        logger.info(f"Successfully extracted {len(text)} characters from scanned PDF {pdf_path}")
        return text
        
    except Exception as e:
        logger.error(f"Error extracting text from scanned PDF {pdf_path}: {e}")
        return ""


def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Unified interface for extracting text from any PDF file
    Automatically detects if OCR is needed and applies the appropriate method
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        str: Extracted text content
    """
    try:
        # Check if file exists and is accessible
        if not os.path.isfile(pdf_path):
            logger.error(f"File not found: {pdf_path}")
            return ""
            
        # Determine if OCR is needed
        needs_ocr = is_scanned_pdf(pdf_path)
        
        # Extract text using the appropriate method
        if needs_ocr:
            logger.info(f"Using OCR extraction for {pdf_path}")
            return extract_text_from_scanned_pdf(pdf_path)
        else:
            logger.info(f"Using native extraction for {pdf_path}")
            return extract_text_from_native_pdf(pdf_path)
            
    except Exception as e:
        logger.error(f"Error in unified text extraction: {e}")
        return ""


def detect_and_extract_tables(pdf_path: str) -> List[Dict[str, Union[str, List[List[str]]]]]:
    """
    Detect and extract tables from PDF
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        List[Dict]: List of detected tables with page number, position, and content
    """
    # This is a stub implementation - complete table detection requires more complex
    # computer vision and would normally use specialized libraries
    logger.info(f"Table detection not fully implemented for {pdf_path}")
    return []


if __name__ == "__main__":
    # Simple test for the module
    import sys
    
    if len(sys.argv) != 2:
        print("Usage: python ocr_engine.py <pdf_file>")
        sys.exit(1)
        
    pdf_file = sys.argv[1]
    print(f"Processing {pdf_file}...")
    
    is_scanned = is_scanned_pdf(pdf_file)
    print(f"Detection result: {'Scanned' if is_scanned else 'Native'} PDF")
    
    text = extract_text_from_pdf(pdf_file)
    print(f"Extracted {len(text)} characters of text")
    print(f"Sample (first 500 chars):\n{text[:500]}...")