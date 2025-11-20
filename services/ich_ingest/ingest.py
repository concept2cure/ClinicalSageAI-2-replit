#!/usr/bin/env python
"""
ICH Guidelines Ingestion Tool

This script processes ICH guideline documents from attached_assets directory
and indexes them into our vector database using the VectorIndexer class.
It extracts text, identifies the ICH module, and creates appropriate metadata.
"""
import os
import sys
import asyncio
import argparse
import glob
from typing import List, Dict, Any, Optional
import json
import structlog
import PyPDF2
from pathlib import Path
import re

# Add parent directory to path to import from services
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from services.ich_ingest.indexer import VectorIndexer
from services.ich_ingest.config import settings

# Configure logger
logger = structlog.get_logger(__name__)

# ICH module regex patterns
ICH_MODULE_PATTERNS = [
    (r'Q1[A-Z\d\(\)]*', 'Q1', 'Stability Testing'),
    (r'Q2[A-Z\d\(\)]*', 'Q2', 'Analytical Validation'),
    (r'Q3[A-Z\d\(\)]*', 'Q3', 'Impurities and Residual Solvents'),
    (r'Q4[A-Z\d\(\)]*', 'Q4', 'Pharmacopoeias'),
    (r'Q5[A-Z\d\(\)]*', 'Q5', 'Quality of Biotechnological Products'),
    (r'Q6[A-Z\d\(\)]*', 'Q6', 'Specifications'),
    (r'Q7[A-Z\d\(\)]*', 'Q7', 'Good Manufacturing Practice'),
    (r'Q8[A-Z\d\(\)]*', 'Q8', 'Pharmaceutical Development'),
    (r'Q9[A-Z\d\(\)]*', 'Q9', 'Quality Risk Management'),
    (r'Q10[A-Z\d\(\)]*', 'Q10', 'Pharmaceutical Quality System'),
    (r'Q11[A-Z\d\(\)]*', 'Q11', 'Development and Manufacture of Drug Substances'),
    (r'Q12[A-Z\d\(\)]*', 'Q12', 'Lifecycle Management'),
    (r'Q13[A-Z\d\(\)]*', 'Q13', 'Continuous Manufacturing'),
    (r'Q14[A-Z\d\(\)]*', 'Q14', 'Analytical Procedure Development'),
    (r'M4[A-Z\d\(\)]*', 'M4', 'CTD Organization'),
    (r'M7[A-Z\d\(\)]*', 'M7', 'Mutagenic Impurities'),
    (r'E\d+[A-Z\d\(\)]*', 'E', 'Efficacy'),
    (r'S\d+[A-Z\d\(\)]*', 'S', 'Safety'),
    (r'eCTD', 'eCTD', 'Electronic Common Technical Document'),
]

class ICHDocumentProcessor:
    """Process ICH guideline documents and extract relevant information"""
    
    def __init__(self, indexer: VectorIndexer):
        """Initialize with a VectorIndexer instance"""
        self.indexer = indexer
        self.processed_count = 0
        self.error_count = 0
    
    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract text content from a PDF file"""
        try:
            with open(pdf_path, 'rb') as f:
                pdf_reader = PyPDF2.PdfReader(f)
                text = ""
                for page_num in range(len(pdf_reader.pages)):
                    page = pdf_reader.pages[page_num]
                    text += page.extract_text() + "\n\n"
                
                # Clean up text: remove excessive newlines and spaces
                text = re.sub(r'\n{3,}', '\n\n', text)
                text = re.sub(r' {2,}', ' ', text)
                
                return text
        except Exception as e:
            logger.error("Error extracting text from PDF", 
                        pdf_path=pdf_path, 
                        error=str(e))
            self.error_count += 1
            return ""
    
    def identify_ich_module(self, text: str, filename: str) -> Dict[str, str]:
        """Identify the ICH module from text content or filename"""
        # First try to find in the text
        for pattern, module, description in ICH_MODULE_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return {"module": module, "specific": re.search(pattern, text, re.IGNORECASE).group(0), "description": description}
        
        # If not found in text, try filename
        for pattern, module, description in ICH_MODULE_PATTERNS:
            if re.search(pattern, filename, re.IGNORECASE):
                return {"module": module, "specific": re.search(pattern, filename, re.IGNORECASE).group(0), "description": description}
        
        # Default to unknown if not found
        return {"module": "unknown", "specific": "unknown", "description": "Unknown ICH guideline"}
    
    def extract_metadata(self, text: str, filename: str) -> Dict[str, Any]:
        """Extract metadata from document text and filename"""
        # Get basic info from filename
        file_basename = os.path.basename(filename)
        file_ext = os.path.splitext(file_basename)[1].lower()
        
        # Identify document type
        doc_type = "guideline"
        if "concept" in file_basename.lower() or "concept" in text.lower():
            doc_type = "concept_paper"
        elif "presentation" in file_basename.lower() or "presentation" in text.lower():
            doc_type = "presentation"
        elif "implementation" in file_basename.lower() or "implementation" in text.lower():
            doc_type = "implementation"
        elif "workplan" in file_basename.lower() or "work plan" in text.lower():
            doc_type = "workplan"
        
        # Try to extract version info
        version_match = re.search(r'[vV]ersion\s+(\d+\.\d+)', text)
        version = version_match.group(1) if version_match else "unknown"
        
        # Try to extract date
        date_patterns = [
            r'(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})',
            r'((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})',
            r'(\d{4}-\d{2}-\d{2})',
            r'(\d{2}/\d{2}/\d{4})',
            r'(\d{2}\.\d{2}\.\d{4})'
        ]
        
        date = "unknown"
        for pattern in date_patterns:
            date_match = re.search(pattern, text)
            if date_match:
                date = date_match.group(1)
                break
        
        # Identify ICH module
        ich_info = self.identify_ich_module(text, filename)
        
        # Extract title - look for prominent text near the beginning
        title_patterns = [
            r'^([^\n]{10,150})\n',
            r'Title[:\s]+([^\n]{10,150})'
        ]
        
        title = file_basename
        for pattern in title_patterns:
            title_match = re.search(pattern, text[:1000])
            if title_match:
                title = title_match.group(1).strip()
                break
        
        # Build metadata
        metadata = {
            "source": file_basename,
            "source_path": filename,
            "type": doc_type,
            "file_type": file_ext.replace('.', ''),
            "title": title,
            "date": date,
            "version": version,
            "module": ich_info["module"],
            "specific_guideline": ich_info["specific"],
            "module_description": ich_info["description"],
            "indexed_at": None  # Will be filled by the indexer
        }
        
        return metadata
    
    async def process_document(self, filepath: str) -> bool:
        """Process a single document and index it"""
        try:
            logger.info("Processing document", filepath=filepath)
            
            # Extract text based on file type
            if filepath.lower().endswith('.pdf'):
                text = self.extract_text_from_pdf(filepath)
            else:
                # Read text files directly
                with open(filepath, 'r', encoding='utf-8') as f:
                    text = f.read()
            
            if not text:
                logger.error("Empty text extracted from document", filepath=filepath)
                self.error_count += 1
                return False
            
            # Extract metadata
            metadata = self.extract_metadata(text, filepath)
            
            # Index the document
            chunk_count = await self.indexer.index_document(
                text=text,
                metadata=metadata
            )
            
            if chunk_count > 0:
                logger.info("Successfully indexed document", 
                           filepath=filepath, 
                           chunks=chunk_count,
                           module=metadata["module"],
                           specific=metadata["specific_guideline"])
                self.processed_count += 1
                return True
            else:
                logger.info("Document already processed or skipped", 
                           filepath=filepath,
                           module=metadata["module"],
                           specific=metadata["specific_guideline"])
                return False
                
        except Exception as e:
            logger.error("Error processing document", 
                        filepath=filepath, 
                        error=str(e))
            self.error_count += 1
            return False
    
    async def process_documents(self, filepaths: List[str]) -> Dict[str, int]:
        """Process multiple documents"""
        results = await asyncio.gather(*[self.process_document(fp) for fp in filepaths])
        
        return {
            "total": len(filepaths),
            "processed": self.processed_count,
            "errors": self.error_count,
            "skipped": len(filepaths) - self.processed_count - self.error_count
        }


async def main():
    """Main entry point for the script"""
    parser = argparse.ArgumentParser(description="ICH Guidelines Ingestion Tool")
    parser.add_argument("--directory", "-d", 
                        default="attached_assets",
                        help="Directory containing ICH guideline documents")
    parser.add_argument("--pattern", "-p", 
                        default="ICH_*.pdf",
                        help="File pattern to match (e.g., 'ICH_*.pdf')")
    parser.add_argument("--clear-processed", "-c", 
                        action="store_true",
                        help="Clear the processed documents file and reprocess all documents")
    args = parser.parse_args()
    
    logger.info("Starting ICH Guidelines ingestion", 
               directory=args.directory, 
               pattern=args.pattern)
    
    # Initialize vector indexer
    indexer = VectorIndexer()
    
    if args.clear_processed:
        if os.path.exists(indexer.processed_file):
            os.remove(indexer.processed_file)
            logger.info("Cleared processed documents file", file=indexer.processed_file)
    
    # Find matching files
    directory_path = Path(args.directory)
    file_pattern = str(directory_path / args.pattern)
    all_files = glob.glob(file_pattern)
    
    # Include the pattern without ICH for more matches
    other_pattern = args.pattern.replace("ICH_", "")
    if other_pattern != args.pattern:
        other_files = glob.glob(str(directory_path / other_pattern))
        all_files.extend(other_files)
    
    # Add explicit documents if required
    explicit_docs = [
        "attached_assets/Q3C Concept Paper_0_0.pdf",
        "attached_assets/Q3A(R2) Guideline.pdf",
        "attached_assets/Q2R2-Q14_EWG_Concept_Paper.pdf",
        "attached_assets/Q2_Q14 ICH_Step_4_Presentation_2023_1106_0.pdf",
        "attached_assets/ICH_Q1Q5C_ConceptPaper_Final_2022_1114.pdf",
        "attached_assets/ICH_Q1_Step2_Presentation_2025_0411_0.pdf",
        "attached_assets/ICH_Q1EWG_Step2_Draft_Guideline_2025_0411.pdf",
        "attached_assets/Annex 4 - Maintenance Procedure for Q3C, Q3D, and M7_0.pdf",
        "attached_assets/Annex 4 - Maintenance Procedure for Q3C, Q3D, and M7.pdf",
        "attached_assets/ICH_Q3D(R2)_Step4Presentation_2022_0527.pdf",
        "attached_assets/ICH_Q3E_EWG_WorkPlan_2024_0214.pdf",
        "attached_assets/the_eCTD_Change_Control_Process_v1_9.pdf",
        "attached_assets/ICH_Implementation_Definitions_V1.2_2024_0602.pdf",
        "attached_assets/20250424_CST_AOR Enyzmax Forte Preliminary Study Design and Sample Size Estimation v1.0 (1).pdf",
        "attached_assets/Q3B(R2) Concept Paper.pdf",
        "attached_assets/Q12EWG_Step4_IntroTrainingPresentation_2020_0206.pdf"
    ]
    
    for doc in explicit_docs:
        if os.path.exists(doc) and doc not in all_files:
            all_files.append(doc)
    
    logger.info("Found files", count=len(all_files))
    
    if not all_files:
        logger.error("No matching files found", directory=args.directory, pattern=args.pattern)
        return
    
    # Process files
    processor = ICHDocumentProcessor(indexer)
    results = await processor.process_documents(all_files)
    
    logger.info("ICH Guidelines ingestion complete", 
               total=results["total"],
               processed=results["processed"],
               errors=results["errors"],
               skipped=results["skipped"])


if __name__ == "__main__":
    asyncio.run(main())