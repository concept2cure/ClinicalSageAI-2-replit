"""
Enhanced Document Processor for Regulatory Metadata Extraction

This script processes documents and extracts regulatory metadata including:
- eCTD section classification
- Document type identification
- Regional regulatory tags
- Page number extraction from PDF files
"""

import os
import re
import json
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import fitz  # PyMuPDF for PDF processing
from sqlalchemy.orm import Session
from tqdm import tqdm
from openai import OpenAI

from server.db import SessionLocal, engine, Base
from server.models.csr import CSR
from server.models.doc_chunks import DocumentChunk

# Initialize OpenAI client
client = OpenAI()

# eCTD Section mappings based on ICH M4 guidelines
ECTD_SECTIONS = {
    # Module 1: Administrative and Prescribing Information
    '1.1': 'Forms and Application Letters',
    '1.2': 'Cover Letters',
    '1.3': 'Administrative Information',
    '1.4': 'Prescribing Information',
    
    # Module 2: Common Technical Document Summaries
    '2.1': 'Table of Contents of the CTD',
    '2.2': 'CTD Introduction',
    '2.3': 'Quality Overall Summary',
    '2.4': 'Nonclinical Overview',
    '2.5': 'Clinical Overview',
    '2.6': 'Nonclinical Written and Tabulated Summaries',
    '2.7': 'Clinical Summary',
    
    # Module 3: Quality
    '3.1': 'Index',
    '3.2': 'Body of Data',
    
    # Module 4: Nonclinical Study Reports
    '4.1': 'Index',
    '4.2': 'Study Reports',
    '4.3': 'Literature References',
    
    # Module 5: Clinical Study Reports
    '5.1': 'Index',
    '5.2': 'Tabular Listing of All Clinical Studies',
    '5.3': 'Clinical Study Reports',
    '5.4': 'Literature References'
}

# Document type patterns for automatic classification
DOC_TYPE_PATTERNS = {
    'CSR': [
        r'clinical study report',
        r'study report',
        r'protocol.*report',
        r'final.*report.*study'
    ],
    'ICH_Guideline': [
        r'ich.*guideline',
        r'international.*harmonisation',
        r'harmonization.*guideline',
        r'ich\s+[a-z]\d+'
    ],
    'FDA_Guidance': [
        r'fda.*guidance',
        r'guidance.*document',
        r'draft.*guidance',
        r'final.*guidance'
    ],
    'EMA_Guideline': [
        r'ema.*guideline',
        r'european.*medicines.*agency',
        r'emea.*guideline',
        r'chmp.*guideline'
    ],
    'Protocol': [
        r'protocol',
        r'study.*protocol',
        r'clinical.*protocol'
    ],
    'SAP': [
        r'statistical.*analysis.*plan',
        r'sap\b',
        r'analysis.*plan'
    ],
    'IB': [
        r'investigator.*brochure',
        r'investigators.*brochure',
        r'ib\b'
    ]
}

# Regional regulatory authority patterns
REGION_PATTERNS = {
    'FDA': [r'fda', r'food.*drug.*administration', r'united states', r'us\b', r'usa'],
    'EMA': [r'ema', r'european.*medicines.*agency', r'emea', r'europe', r'eu\b'],
    'PMDA': [r'pmda', r'pharmaceuticals.*medical.*devices.*agency', r'japan', r'jp\b'],
    'Health_Canada': [r'health.*canada', r'canada', r'hc\b', r'ca\b'],
    'TGA': [r'tga', r'therapeutic.*goods.*administration', r'australia', r'au\b'],
    'NMPA': [r'nmpa', r'china.*drug.*administration', r'china', r'cn\b'],
    'ICH': [r'ich', r'international.*harmonisation', r'harmonization']
}

class EnhancedDocumentProcessor:
    """Processes documents with enhanced regulatory metadata extraction"""
    
    def __init__(self):
        self.db = SessionLocal()
        
    def extract_text_from_pdf(self, pdf_path: str) -> Dict[int, str]:
        """Extract text from PDF with page numbers"""
        try:
            doc = fitz.open(pdf_path)
            pages = {}
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                text = page.get_text()
                pages[page_num + 1] = text  # 1-indexed page numbers
            doc.close()
            return pages
        except Exception as e:
            print(f"Error extracting text from PDF {pdf_path}: {e}")
            return {}
    
    def classify_document_type(self, content: str, title: str = "") -> str:
        """Classify document type based on content and title"""
        text = (title + " " + content).lower()
        
        for doc_type, patterns in DOC_TYPE_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    return doc_type
        
        return "Unknown"
    
    def extract_region_tags(self, content: str, title: str = "") -> List[str]:
        """Extract regional regulatory tags from document content"""
        text = (title + " " + content).lower()
        found_regions = []
        
        for region, patterns in REGION_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    if region not in found_regions:
                        found_regions.append(region)
        
        # Default to FDA if no regions detected
        if not found_regions:
            found_regions = ["FDA"]
            
        return found_regions
    
    def classify_ectd_section(self, content: str, doc_type: str, title: str = "") -> Optional[str]:
        """Classify eCTD section based on document content and type"""
        text = (title + " " + content).lower()
        
        # CSR documents typically go in Module 5
        if doc_type == "CSR":
            if re.search(r'study.*report', text):
                return "5.3.5.1"  # Individual Study Reports
            return "5.3"
        
        # ICH Guidelines reference documents
        elif doc_type == "ICH_Guideline":
            return "2.4"  # Nonclinical Overview
        
        # FDA Guidance documents
        elif doc_type == "FDA_Guidance":
            return "1.3"  # Administrative Information
        
        # Protocol documents
        elif doc_type == "Protocol":
            return "5.3.5.1"  # Individual Study Reports
        
        # Statistical Analysis Plans
        elif doc_type == "SAP":
            return "5.3.5.2"  # Statistical Analysis Plan
        
        # Investigator Brochures
        elif doc_type == "IB":
            return "2.5"  # Clinical Overview
        
        return None
    
    def use_ai_for_metadata_extraction(self, content: str, title: str = "") -> Dict[str, Any]:
        """Use OpenAI to extract metadata when pattern matching is insufficient"""
        try:
            prompt = f"""
            Analyze this regulatory document and extract metadata:
            
            Title: {title}
            Content (first 1000 chars): {content[:1000]}
            
            Please identify:
            1. Document type (CSR, ICH_Guideline, FDA_Guidance, EMA_Guideline, Protocol, SAP, IB, or Other)
            2. Appropriate eCTD section (e.g., 5.3.5.1, 2.4, 1.3)
            3. Regional regulatory authorities mentioned (FDA, EMA, PMDA, Health_Canada, TGA, NMPA, ICH)
            
            Respond in JSON format:
            {{"doc_type": "", "ectd_section": "", "regions": []}}
            """
            
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            return result
            
        except Exception as e:
            print(f"Error using AI for metadata extraction: {e}")
            return {"doc_type": "Unknown", "ectd_section": None, "regions": ["FDA"]}
    
    def chunk_text_with_pages(self, text: str, page_pages: Dict[int, str], chunk_size: int = 800) -> List[Tuple[str, Optional[int]]]:
        """Chunk text while preserving page number information"""
        chunks_with_pages = []
        words = text.split()
        current_page = 1
        
        # Create page boundaries mapping
        page_word_boundaries = {}
        word_count = 0
        for page_num, page_text in page_pages.items():
            page_words = len(page_text.split())
            page_word_boundaries[page_num] = (word_count, word_count + page_words)
            word_count += page_words
        
        # Create chunks with page tracking
        for i in range(0, len(words), chunk_size):
            chunk_words = words[i:i + chunk_size]
            chunk_text = " ".join(chunk_words)
            
            # Determine which page this chunk primarily belongs to
            chunk_start_word = i
            chunk_page = None
            for page_num, (start_word, end_word) in page_word_boundaries.items():
                if start_word <= chunk_start_word < end_word:
                    chunk_page = page_num
                    break
            
            chunks_with_pages.append((chunk_text, chunk_page))
        
        return chunks_with_pages
    
    def process_document(self, doc_id: str, title: str, content: str, file_path: Optional[str] = None) -> int:
        """Process a single document and create enhanced document chunks"""
        
        # Extract page information if PDF file is available
        page_texts = {}
        if file_path and file_path.endswith('.pdf'):
            page_texts = self.extract_text_from_pdf(file_path)
        
        # Classify document using pattern matching
        doc_type = self.classify_document_type(content, title)
        region_tags = self.extract_region_tags(content, title)
        ectd_section = self.classify_ectd_section(content, doc_type, title)
        
        # Use AI for enhanced classification if pattern matching is insufficient
        if doc_type == "Unknown" or not ectd_section:
            ai_metadata = self.use_ai_for_metadata_extraction(content, title)
            if doc_type == "Unknown":
                doc_type = ai_metadata.get("doc_type", "Unknown")
            if not ectd_section:
                ectd_section = ai_metadata.get("ectd_section")
            if ai_metadata.get("regions"):
                region_tags.extend(ai_metadata["regions"])
                region_tags = list(set(region_tags))  # Remove duplicates
        
        # Delete existing chunks for this document
        self.db.query(DocumentChunk).filter(DocumentChunk.doc_id == doc_id).delete()
        
        # Create chunks with enhanced metadata
        chunks_created = 0
        if page_texts:
            # Use page-aware chunking for PDFs
            chunks_with_pages = self.chunk_text_with_pages(content, page_texts)
        else:
            # Standard chunking for non-PDF content
            words = content.split()
            chunk_size = 800
            chunks_with_pages = []
            for i in range(0, len(words), chunk_size):
                chunk_text = " ".join(words[i:i + chunk_size])
                chunks_with_pages.append((chunk_text, None))
        
        for chunk_index, (chunk_content, page_number) in enumerate(chunks_with_pages):
            try:
                # Generate embedding
                embedding_response = client.embeddings.create(
                    input=chunk_content,
                    model="text-embedding-3-small"
                )
                embedding = embedding_response.data[0].embedding
                
                # Create enhanced document chunk
                chunk = DocumentChunk(
                    doc_id=doc_id,
                    doc_title=title,
                    chunk_index=chunk_index,
                    content=chunk_content,
                    embedding=embedding,
                    ectd_section=ectd_section,
                    page_number=page_number,
                    doc_type=doc_type,
                    region_tag=region_tags
                )
                
                self.db.add(chunk)
                chunks_created += 1
                
            except Exception as e:
                print(f"Error processing chunk {chunk_index} for document {doc_id}: {e}")
        
        self.db.commit()
        return chunks_created
    
    def process_all_documents(self) -> int:
        """Process all approved documents in the database"""
        approved_docs = self.db.query(CSR).filter(CSR.status == "approved").all()
        print(f"Found {len(approved_docs)} approved documents to process")
        
        total_chunks = 0
        for doc in tqdm(approved_docs, desc="Processing documents"):
            if not doc.content:
                print(f"Skipping document {doc.id} - no content")
                continue
            
            title = getattr(doc, 'title', f"Document {doc.id}")
            chunks_created = self.process_document(str(doc.id), title, doc.content)
            total_chunks += chunks_created
            print(f"Processed document {doc.id} ({title}): {chunks_created} chunks created")
        
        return total_chunks
    
    def process_directory(self, directory_path: str, file_pattern: str = "*.pdf") -> int:
        """Process all files in a directory"""
        from glob import glob
        
        files = glob(os.path.join(directory_path, file_pattern))
        print(f"Found {len(files)} files to process in {directory_path}")
        
        total_chunks = 0
        for file_path in tqdm(files, desc="Processing files"):
            try:
                file_name = os.path.basename(file_path)
                doc_id = f"file_{file_name}"
                
                if file_path.endswith('.pdf'):
                    # Extract text from PDF
                    page_texts = self.extract_text_from_pdf(file_path)
                    content = "\n".join(page_texts.values())
                else:
                    # Read text file
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                
                if content.strip():
                    chunks_created = self.process_document(doc_id, file_name, content, file_path)
                    total_chunks += chunks_created
                    print(f"Processed file {file_name}: {chunks_created} chunks created")
                
            except Exception as e:
                print(f"Error processing file {file_path}: {e}")
        
        return total_chunks
    
    def close(self):
        """Close database connection"""
        self.db.close()

def main():
    """Main function to run the enhanced document processor"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Enhanced Document Processor with Regulatory Metadata")
    parser.add_argument("--mode", choices=["database", "directory"], default="database",
                        help="Processing mode: database (process approved CSRs) or directory (process files)")
    parser.add_argument("--directory", type=str, default="./attached_assets",
                        help="Directory to process (when mode=directory)")
    parser.add_argument("--pattern", type=str, default="*.pdf",
                        help="File pattern to match (when mode=directory)")
    
    args = parser.parse_args()
    
    # Ensure database tables exist
    Base.metadata.create_all(engine)
    
    processor = EnhancedDocumentProcessor()
    
    try:
        if args.mode == "database":
            total_chunks = processor.process_all_documents()
            print(f"✅ Processing complete! Created {total_chunks} enhanced chunks from database documents")
        
        elif args.mode == "directory":
            total_chunks = processor.process_directory(args.directory, args.pattern)
            print(f"✅ Processing complete! Created {total_chunks} enhanced chunks from directory files")
        
        # Verify results
        chunk_count = processor.db.query(DocumentChunk).count()
        enhanced_count = processor.db.query(DocumentChunk).filter(
            DocumentChunk.ectd_section.isnot(None)
        ).count()
        
        print(f"📊 Database Summary:")
        print(f"   Total chunks: {chunk_count}")
        print(f"   Enhanced chunks with eCTD sections: {enhanced_count}")
        print(f"   Enhancement rate: {enhanced_count/chunk_count*100:.1f}%" if chunk_count > 0 else "")
        
    finally:
        processor.close()

if __name__ == "__main__":
    main()