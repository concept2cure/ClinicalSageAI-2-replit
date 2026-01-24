
import os
import json
import glob
import hashlib
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("knowledge_utils")

# Define directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
CONTENT_DIR = os.path.join(DATA_DIR, "processed_knowledge")
METADATA_DIR = os.path.join(DATA_DIR, "knowledge_metadata")
PDF_DIR = os.path.join(BASE_DIR, "attached_assets")

# Ensure directories exist
os.makedirs(CONTENT_DIR, exist_ok=True)
os.makedirs(METADATA_DIR, exist_ok=True)

class KnowledgeBase:
    def __init__(self):
        self.metadata_collection = self._load_metadata()
    
    def _load_metadata(self) -> List[Dict[str, Any]]:
        """Load all metadata files into memory."""
        metadata_files = glob.glob(os.path.join(METADATA_DIR, '*.json'))
        metadata_collection = []
        
        for metadata_file in metadata_files:
            if metadata_file.endswith('ingestion_summary.json'):
                continue
            
            try:
                with open(metadata_file, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                    metadata_collection.append(metadata)
            except Exception as e:
                logger.error(f"Error loading metadata from {metadata_file}: {str(e)}")
        
        return metadata_collection
    
    def get_document_content(self, document_id: str) -> Optional[str]:
        """Get the content of a specific document by ID."""
        content_file = os.path.join(CONTENT_DIR, f"{document_id}.txt")
        
        try:
            with open(content_file, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error loading content from {content_file}: {str(e)}")
            return None
    
    def search(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search for documents containing the query."""
        results = []
        
        # Split the query into terms
        query_terms = query.split()
        
        for metadata in self.metadata_collection:
            document_id = metadata['document_id']
            content = self.get_document_content(document_id)
            
            if not content:
                continue
            
            # Check if any query term exists in content
            if any(term.lower() in content.lower() for term in query_terms):
                # Calculate relevance score based on term frequency
                term_frequencies = [content.lower().count(term.lower()) for term in query_terms]
                relevance_score = sum(term_frequencies) / len(content.split())
                
                # Create snippet
                first_pos = min([content.lower().find(term.lower()) for term in query_terms 
                               if content.lower().find(term.lower()) != -1], default=0)
                start_pos = max(0, first_pos - 100)
                end_pos = min(len(content), first_pos + 300)
                snippet = content[start_pos:end_pos] + "..."
                
                results.append({
                    'document_id': document_id,
                    'metadata': metadata,
                    'relevance_score': relevance_score,
                    'snippet': snippet
                })
        
        # Sort by relevance score (highest first)
        results.sort(key=lambda x: x['relevance_score'], reverse=True)
        return results[:limit]
    
    def get_ich_guideline(self, guideline_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific ICH guideline by its ID (e.g., Q1A, Q2)."""
        for metadata in self.metadata_collection:
            document_title = metadata.get('document_title', '').upper()
            filename = metadata.get('filename', '').upper()
            
            if (guideline_id.upper() in document_title or 
                guideline_id.upper() in filename):
                content = self.get_document_content(metadata['document_id'])
                return {
                    'document_id': metadata['document_id'],
                    'metadata': metadata,
                    'content': content
                }
        
        return None
    
    def get_documents_by_type(self, doc_type: str) -> List[Dict[str, Any]]:
        """Get all documents of a specific type."""
        results = []
        
        for metadata in self.metadata_collection:
            if metadata.get('document_type') == doc_type:
                results.append(metadata)
        
        return results
    
    def get_documents_by_category(self, category: str) -> List[Dict[str, Any]]:
        """Get all documents in a specific category."""
        results = []
        
        for metadata in self.metadata_collection:
            if metadata.get('document_category') == category:
                results.append(metadata)
        
        return results
    
    def get_ich_guidelines(self) -> List[Dict[str, Any]]:
        """Get all ICH guidelines."""
        return self.get_documents_by_type('ich_guideline')
    
    def get_knowledge_stats(self) -> Dict[str, Any]:
        """Get statistics about the knowledge base."""
        document_types = {}
        document_categories = {}
        
        for metadata in self.metadata_collection:
            doc_type = metadata.get('document_type', 'unknown')
            doc_category = metadata.get('document_category', 'unknown')
            
            document_types[doc_type] = document_types.get(doc_type, 0) + 1
            document_categories[doc_category] = document_categories.get(doc_category, 0) + 1
        
        return {
            'total_documents': len(self.metadata_collection),
            'document_types': document_types,
            'document_categories': document_categories,
            'last_updated': datetime.now().isoformat()
        }

def extract_ich_info(filename: str) -> Dict[str, str]:
    """Extract information from ICH guideline filename."""
    info = {
        'guideline_id': '',
        'version': '',
        'topic': ''
    }
    
    # Extract guideline ID (e.g., Q1A, Q2, etc.)
    if 'Q1A' in filename:
        info['guideline_id'] = 'Q1A'
        info['topic'] = 'Stability Testing'
    elif 'Q1B' in filename:
        info['guideline_id'] = 'Q1B'
        info['topic'] = 'Photostability Testing'
    elif 'Q2' in filename:
        info['guideline_id'] = 'Q2'
        info['topic'] = 'Validation of Analytical Procedures'
    elif 'Q12' in filename:
        info['guideline_id'] = 'Q12'
        info['topic'] = 'Lifecycle Management'
    
    # Extract version
    if '(R2)' in filename or 'R2' in filename:
        info['version'] = 'R2'
    elif '(R1)' in filename or 'R1' in filename:
        info['version'] = 'R1'
    
    return info

def create_knowledge_index() -> Dict[str, Any]:
    """Create an index of all documents in the knowledge base."""
    kb = KnowledgeBase()
    stats = kb.get_knowledge_stats()
    
    # Get ICH guidelines
    ich_guidelines = kb.get_ich_guidelines()
    
    # Sort guidelines by ID
    ich_guidelines.sort(key=lambda x: x.get('document_title', ''))
    
    return {
        'stats': stats,
        'ich_guidelines': ich_guidelines,
        'last_indexed': datetime.now().isoformat()
    }

def generate_knowledge_report() -> None:
    """Generate a report of the knowledge base."""
    index = create_knowledge_index()
    
    # Save the index
    index_path = os.path.join(DATA_DIR, 'knowledge_index.json')
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2)
    
    logger.info(f"Knowledge index saved to {index_path}")
    
    # Print a summary
    print("Knowledge Base Summary")
    print("-" * 40)
    print(f"Total Documents: {index['stats']['total_documents']}")
    print("\nDocument Types:")
    for doc_type, count in index['stats']['document_types'].items():
        print(f"  {doc_type}: {count}")
    
    print("\nICH Guidelines:")
    for guideline in index['ich_guidelines']:
        print(f"  {guideline.get('document_title', 'Unknown Title')}")
    
    print(f"\nLast Indexed: {index['last_indexed']}")

def main():
    """Main function for utility commands."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Knowledge Base Utilities')
    parser.add_argument('command', choices=['stats', 'index', 'search'], help='Command to execute')
    parser.add_argument('--query', help='Search query (used with search command)')
    parser.add_argument('--limit', type=int, default=5, help='Number of results to return')
    
    args = parser.parse_args()
    
    if args.command == 'stats':
        kb = KnowledgeBase()
        stats = kb.get_knowledge_stats()
        print(json.dumps(stats, indent=2))
    
    elif args.command == 'index':
        generate_knowledge_report()
    
    elif args.command == 'search':
        if not args.query:
            print("Error: search command requires --query argument")
            return
        
        kb = KnowledgeBase()
        results = kb.search(args.query, args.limit)
        
        if not results:
            print("No results found.")
            return
        
        print(f"Found {len(results)} results:")
        for i, result in enumerate(results):
            print(f"\nResult {i+1}: {result['metadata']['document_title']}")
            print(f"  Type: {result['metadata'].get('document_type', 'Unknown')}")
            print(f"  Relevance: {result['relevance_score']:.4f}")
            print(f"  Snippet: {result['snippet']}")

if __name__ == "__main__":
    main()
