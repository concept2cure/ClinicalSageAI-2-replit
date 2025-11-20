
import os
import json
import argparse
import logging
from datetime import datetime
import hashlib
from typing import List, Dict, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("knowledge_search")

# Define directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONTENT_DIR = os.path.join(DATA_DIR, "processed_knowledge")
METADATA_DIR = os.path.join(DATA_DIR, "knowledge_metadata")

def load_metadata() -> List[Dict[str, Any]]:
    """Load all metadata files into memory."""
    metadata_files = [f for f in os.listdir(METADATA_DIR) if f.endswith('.json') and f != "ingestion_summary.json"]
    metadata_collection = []
    
    for metadata_file in metadata_files:
        try:
            with open(os.path.join(METADATA_DIR, metadata_file), 'r', encoding='utf-8') as f:
                metadata = json.load(f)
                metadata_collection.append(metadata)
        except Exception as e:
            logger.error(f"Error loading metadata from {metadata_file}: {str(e)}")
    
    return metadata_collection

def get_document_content(document_id: str) -> Optional[str]:
    """Get the content of a document by ID."""
    content_path = os.path.join(CONTENT_DIR, f"{document_id}.txt")
    try:
        with open(content_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        logger.error(f"Error loading content from {content_path}: {str(e)}")
        return None

def calculate_relevance_score(query_terms: List[str], content: str, metadata: Dict[str, Any]) -> float:
    """Calculate a simple relevance score based on term frequency."""
    content_lower = content.lower()
    
    # Calculate term frequency
    term_frequencies = [content_lower.count(term.lower()) for term in query_terms]
    
    # Apply weights to different metadata fields
    title_boost = sum(1.5 for term in query_terms if term.lower() in metadata.get('document_title', '').lower())
    guideline_boost = 1.0 if metadata.get('document_type') == 'ich_guideline' else 0.5
    
    # Calculate final score
    score = sum(term_frequencies) + title_boost + guideline_boost
    
    # Normalize to a 0-1 range (assuming a reasonable maximum score of 100)
    return min(score / 50.0, 1.0)

def search_content(query: str, metadata_collection: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Search for documents containing the query."""
    # Split the query into terms
    query_terms = query.split()
    results = []
    
    # Special handling for ICH guideline search
    if query.upper().startswith("ICH") or query.upper().startswith("Q"):
        guideline_number = None
        for term in query_terms:
            if term.upper().startswith("Q") and any(c.isdigit() for c in term):
                guideline_number = term.upper()
                break
        
        if guideline_number:
            ich_results = search_ich_guidelines(guideline_number, metadata_collection)
            if ich_results:
                return ich_results
    
    # Regular search across all documents
    for metadata in metadata_collection:
        document_id = metadata['document_id']
        content = get_document_content(document_id)
        
        if not content:
            continue
        
        # Check if any query term exists in content
        if any(term.lower() in content.lower() for term in query_terms):
            # Calculate relevance score
            relevance_score = calculate_relevance_score(query_terms, content, metadata)
            
            # Create snippet
            snippet = create_snippet(content, query_terms)
            
            results.append({
                'document_id': document_id,
                'metadata': metadata,
                'relevance_score': relevance_score,
                'snippet': snippet
            })
    
    # Sort by relevance score (highest first)
    results.sort(key=lambda x: x['relevance_score'], reverse=True)
    return results

def search_ich_guidelines(guideline_number: str, metadata_collection: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Specialized search for ICH guidelines by guideline number."""
    results = []
    
    for metadata in metadata_collection:
        document_title = metadata.get('document_title', '').upper()
        filename = metadata.get('filename', '').upper()
        document_class = metadata.get('document_class', '').upper()
        
        matches_guideline = (
            guideline_number in document_title or 
            guideline_number in filename or
            guideline_number.replace('Q', 'Q ') in document_title or
            guideline_number.lower() in document_class
        )
        
        if matches_guideline:
            content = get_document_content(metadata['document_id'])
            if not content:
                continue
                
            # Get a snippet from the beginning of the document
            snippet = content[:500] + "..."
            
            results.append({
                'document_id': metadata['document_id'],
                'metadata': metadata,
                'relevance_score': 0.95,  # High score for direct guideline matches
                'snippet': snippet
            })
    
    return results

def create_snippet(content: str, query_terms: List[str]) -> str:
    """Create a snippet of text around query terms."""
    content_lower = content.lower()
    max_snippet_length = 500
    
    # Find first occurrence of any query term
    first_pos = min([content_lower.find(term.lower()) for term in query_terms 
                    if content_lower.find(term.lower()) != -1], default=0)
    
    # Calculate snippet start and end positions
    start_pos = max(0, first_pos - 100)
    end_pos = min(len(content), first_pos + max_snippet_length - 100)
    
    # Adjust to not break words
    while start_pos > 0 and content[start_pos] != ' ':
        start_pos -= 1
    
    while end_pos < len(content) and content[end_pos] != ' ':
        end_pos += 1
    
    # Get snippet
    snippet = content[start_pos:end_pos]
    
    # Add ellipses
    if start_pos > 0:
        snippet = "..." + snippet
    if end_pos < len(content):
        snippet = snippet + "..."
    
    return snippet

def display_results(results, limit=5):
    """Display the search results."""
    if not results:
        print("No results found.")
        return
    
    print(f"Found {len(results)} results. Displaying top {min(limit, len(results))}:")
    print("-" * 80)
    
    for i, result in enumerate(results[:limit]):
        metadata = result['metadata']
        print(f"Result {i+1}: {metadata['filename']}")
        print(f"Document Type: {metadata.get('document_type', 'Unknown')} - {metadata.get('document_class', 'Unknown')}")
        if 'guideline_type' in metadata:
            print(f"Guideline Type: {metadata['guideline_type']} (Version: {metadata['version']})")
        print(f"Relevance Score: {result['relevance_score']:.2f}")
        print("\nSnippet:")
        print(result['snippet'])
        print("-" * 80)

def main():
    parser = argparse.ArgumentParser(description='Search through processed ICH guidelines and other knowledge')
    parser.add_argument('query', type=str, help='The search query')
    parser.add_argument('--limit', type=int, default=5, help='Maximum number of results to display')
    parser.add_argument('--type', type=str, choices=['all', 'ich', 'regulatory'], default='all', 
                        help='Filter by document type')
    parser.add_argument('--guideline', type=str, help='Search for specific ICH guideline (e.g., Q1A, Q2)')
    args = parser.parse_args()
    
    print(f"Searching for: '{args.query}'")
    metadata_collection = load_metadata()
    print(f"Loaded metadata for {len(metadata_collection)} documents")
    
    # Filter by document type if specified
    if args.type != 'all':
        if args.type == 'ich':
            metadata_collection = [m for m in metadata_collection if m.get('document_type') == 'ich_guideline']
        elif args.type == 'regulatory':
            metadata_collection = [m for m in metadata_collection if m.get('document_category') == 'regulatory']
    
    # Search for specific guideline if specified
    if args.guideline:
        results = search_ich_guidelines(args.guideline.upper(), metadata_collection)
    else:
        results = search_content(args.query, metadata_collection)
    
    display_results(results, args.limit)

if __name__ == "__main__":
    main()
