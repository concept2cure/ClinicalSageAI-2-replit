# 🧠 SagePlus | CSR Search Engine
# Provides functions for searching CSRs by embeddings and structured fields

import os
import json
import sqlite3
import numpy as np
from typing import List, Dict, Any, Optional, Union, Tuple
import math
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Constants
HF_API_KEY = os.getenv("HF_API_KEY")
if not HF_API_KEY:
    raise EnvironmentError("Missing Hugging Face API key. Please set HF_API_KEY in your environment.")

HF_EMBEDDING_URL = "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2"
HEADERS = {"Authorization": f"Bearer {HF_API_KEY}"}

PROCESSED_CSR_DIR = "data/processed_csrs"
VECTOR_STORE_DIR = "data/vector_store"
DB_PATH = os.path.join(VECTOR_STORE_DIR, "csr_metadata.db")

# In-memory embedding store for faster similarity search
embedding_store = []

def load_embeddings_to_memory():
    """Load all CSR embeddings into memory for faster search"""
    global embedding_store
    embedding_store = []
    
    # Ensure directories exist
    os.makedirs(PROCESSED_CSR_DIR, exist_ok=True)
    
    # Load all JSON files with embeddings
    for filename in os.listdir(PROCESSED_CSR_DIR):
        if filename.endswith('.json'):
            try:
                with open(os.path.join(PROCESSED_CSR_DIR, filename), 'r') as f:
                    data = json.load(f)
                    
                # Only include files with embeddings
                if "embedding" in data:
                    embedding_store.append({
                        "csr_id": data.get("csr_id", ""),
                        "title": data.get("title", ""),
                        "embedding": data["embedding"],
                        "indication": data.get("indication", ""),
                        "phase": data.get("phase", ""),
                        "sample_size": data.get("sample_size", 0),
                        "outcome": data.get("outcome", "")
                    })
            except Exception as e:
                print(f"Error loading {filename}: {e}")
                
    print(f"🔍 Loaded {len(embedding_store)} embedded CSRs into memory.")
    return len(embedding_store)

def fast_search_by_embedding(query_embedding, top_k=5, filters=None):
    """Search for similar CSRs using in-memory embeddings"""
    if not query_embedding or not embedding_store:
        return []
        
    # Calculate similarities for all CSRs in memory
    results = []
    
    for csr in embedding_store:
        # Calculate cosine similarity using NumPy for speed
        a = np.array(query_embedding, dtype=np.float32)
        b = np.array(csr["embedding"], dtype=np.float32)
        
        # Calculate similarity
        dot_product = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        
        if norm_a * norm_b == 0:
            similarity = 0.0
        else:
            similarity = dot_product / (norm_a * norm_b)
        
        # Apply filters if provided
        include = True
        if filters:
            if filters.get("indication") and filters["indication"].lower() not in csr.get("indication", "").lower():
                include = False
            if filters.get("phase") and filters["phase"] != csr.get("phase"):
                include = False
            if filters.get("outcome") and filters["outcome"].lower() not in csr.get("outcome", "").lower():
                include = False
            if filters.get("min_sample_size") is not None and csr.get("sample_size", 0) < filters["min_sample_size"]:
                include = False
        
        if include:
            results.append({**csr, "similarity": float(similarity)})
    
    # Sort by similarity
    results.sort(key=lambda x: x["similarity"], reverse=True)
    
    # Return top results
    return results[:top_k]

class CSRSearchEngine:
    """Search engine for finding CSRs by embedding similarity and field filtering"""
    
    def __init__(self):
        """Initialize the search engine"""
        self._ensure_directories()
        self._ensure_database()
        # Load embeddings to memory on initialization
        self.reload_embeddings()
        
    def reload_embeddings(self):
        """Reload all embeddings from disk to memory"""
        return load_embeddings_to_memory()
        
    def fast_search(self, query_text: str, limit: int = 5, filters: Dict = None) -> List[Dict[str, Any]]:
        """Perform a fast search using in-memory embeddings"""
        # Generate embedding for query text
        query_embedding = self.create_embedding(query_text)
        if not query_embedding:
            return []
            
        # Use in-memory search for better performance
        return fast_search_by_embedding(query_embedding, top_k=limit, filters=filters)
        
    def _ensure_directories(self):
        """Ensure all required directories exist"""
        os.makedirs(PROCESSED_CSR_DIR, exist_ok=True)
        os.makedirs(VECTOR_STORE_DIR, exist_ok=True)
        
    def _ensure_database(self):
        """Ensure the SQLite database exists and has the correct schema"""
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Create tables if they don't exist
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS csr_metadata (
            csr_id TEXT PRIMARY KEY,
            title TEXT,
            indication TEXT,
            phase TEXT,
            sample_size INTEGER,
            outcome TEXT,
            import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS csr_embeddings (
            csr_id TEXT PRIMARY KEY,
            embedding BLOB,
            FOREIGN KEY (csr_id) REFERENCES csr_metadata(csr_id)
        )
        ''')
        
        # Create indices for common search fields
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_indication ON csr_metadata(indication)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_phase ON csr_metadata(phase)')
        
        conn.commit()
        conn.close()
        
    def import_csr(self, csr_file_path: str) -> bool:
        """Import a single CSR JSON file into the search engine"""
        try:
            with open(csr_file_path, 'r') as f:
                csr_data = json.load(f)
                
            # Validate required fields
            if not csr_data.get('csr_id'):
                print(f"Error: Missing csr_id in {csr_file_path}")
                return False
                
            # Store metadata in SQLite
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            cursor.execute('''
            INSERT OR REPLACE INTO csr_metadata
            (csr_id, title, indication, phase, sample_size, outcome)
            VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                csr_data.get('csr_id'),
                csr_data.get('title', ''),
                csr_data.get('indication', ''),
                csr_data.get('phase', ''),
                csr_data.get('sample_size', 0),
                csr_data.get('outcome', '')
            ))
            
            # Store embedding if available
            embedding = csr_data.get('embedding')
            if embedding:
                # Convert embedding to bytes for storage
                embedding_bytes = self._embedding_to_bytes(embedding)
                
                cursor.execute('''
                INSERT OR REPLACE INTO csr_embeddings
                (csr_id, embedding)
                VALUES (?, ?)
                ''', (csr_data.get('csr_id'), embedding_bytes))
            
            conn.commit()
            conn.close()
            return True
            
        except Exception as e:
            print(f"Error importing CSR {csr_file_path}: {e}")
            return False
            
    def import_directory(self, directory: str = PROCESSED_CSR_DIR) -> int:
        """Import all CSR JSON files from a directory"""
        imported_count = 0
        
        for filename in os.listdir(directory):
            if filename.endswith('.json'):
                file_path = os.path.join(directory, filename)
                if self.import_csr(file_path):
                    imported_count += 1
                    
        return imported_count
        
    def _embedding_to_bytes(self, embedding: List[float]) -> bytes:
        """Convert embedding list to bytes for SQLite storage"""
        return np.array(embedding, dtype=np.float32).tobytes()
        
    def _bytes_to_embedding(self, embedding_bytes: bytes) -> List[float]:
        """Convert bytes back to embedding list"""
        return np.frombuffer(embedding_bytes, dtype=np.float32).tolist()
        
    def create_embedding(self, text: str) -> List[float]:
        """Create embedding for a text string using Hugging Face API"""
        try:
            response = requests.post(
                HF_EMBEDDING_URL,
                headers=HEADERS,
                json={"inputs": text}
            )
            
            if response.status_code != 200:
                print(f"Error from Hugging Face API: {response.text}")
                return []
                
            return response.json()
            
        except Exception as e:
            print(f"Error creating embedding: {e}")
            return []
            
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors using NumPy for better performance"""
        if not vec1 or not vec2:
            return 0.0
            
        try:
            # Convert to numpy arrays for faster computation
            a = np.array(vec1, dtype=np.float32)
            b = np.array(vec2, dtype=np.float32)
            
            # Calculate cosine similarity
            dot_product = np.dot(a, b)
            norm_a = np.linalg.norm(a)
            norm_b = np.linalg.norm(b)
            
            if norm_a * norm_b == 0:
                return 0.0
                
            return dot_product / (norm_a * norm_b)
        except Exception:
            # Fallback to pure Python if NumPy calculation fails
            dot_product = sum(a * b for a, b in zip(vec1, vec2))
            mag1 = math.sqrt(sum(a * a for a in vec1))
            mag2 = math.sqrt(sum(b * b for b in vec2))
            
            if mag1 * mag2 == 0:
                return 0.0
                
            return dot_product / (mag1 * mag2)
        
    def search_by_embedding(self, query_text: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search for CSRs by text query using embedding similarity"""
        # Create embedding for query
        query_embedding = self.create_embedding(query_text)
        if not query_embedding:
            return []
            
        # Get all CSR embeddings from the database
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT csr_id, embedding FROM csr_embeddings
        ''')
        
        rows = cursor.fetchall()
        results = []
        
        for row in rows:
            csr_id = row['csr_id']
            embedding_bytes = row['embedding']
            embedding = self._bytes_to_embedding(embedding_bytes)
            
            # Calculate similarity
            similarity = self.cosine_similarity(query_embedding, embedding)
            
            results.append({
                'csr_id': csr_id,
                'similarity': similarity
            })
            
        # Get metadata for top matches
        sorted_results = sorted(results, key=lambda x: x['similarity'], reverse=True)[:limit]
        
        if not sorted_results:
            conn.close()
            return []
            
        # Get metadata for top matches
        csr_ids = [r['csr_id'] for r in sorted_results]
        placeholders = ','.join(['?'] * len(csr_ids))
        
        cursor.execute(f'''
        SELECT * FROM csr_metadata
        WHERE csr_id IN ({placeholders})
        ''', csr_ids)
        
        metadata_rows = cursor.fetchall()
        metadata_dict = {row['csr_id']: dict(row) for row in metadata_rows}
        
        # Combine results with metadata
        enriched_results = []
        for result in sorted_results:
            csr_id = result['csr_id']
            if csr_id in metadata_dict:
                enriched_results.append({
                    **metadata_dict[csr_id],
                    'similarity': result['similarity']
                })
                
        conn.close()
        return enriched_results
        
    def search_by_field(self, 
                       indication: Optional[str] = None,
                       phase: Optional[str] = None,
                       outcome: Optional[str] = None,
                       min_sample_size: Optional[int] = None,
                       limit: int = 20) -> List[Dict[str, Any]]:
        """Search for CSRs by field values"""
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        query = "SELECT * FROM csr_metadata WHERE 1=1"
        params = []
        
        if indication:
            query += " AND indication LIKE ?"
            params.append(f"%{indication}%")
            
        if phase:
            query += " AND phase = ?"
            params.append(phase)
            
        if outcome:
            query += " AND outcome LIKE ?"
            params.append(f"%{outcome}%")
            
        if min_sample_size is not None:
            query += " AND sample_size >= ?"
            params.append(min_sample_size)
            
        query += " LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        results = [dict(row) for row in rows]
        conn.close()
        
        return results
        
    def get_csr_details(self, csr_id: str) -> Dict[str, Any]:
        """Get full details of a specific CSR"""
        # First try to get from database
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
        SELECT * FROM csr_metadata WHERE csr_id = ?
        ''', (csr_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return {}
            
        # Then try to get full data from file
        csr_file = os.path.join(PROCESSED_CSR_DIR, f"{csr_id}.json")
        
        if os.path.exists(csr_file):
            with open(csr_file, 'r') as f:
                return json.load(f)
        
        # If file doesn't exist, return database row
        return dict(row)
        
    def combined_search(self, 
                       query_text: Optional[str] = None,
                       indication: Optional[str] = None,
                       phase: Optional[str] = None,
                       outcome: Optional[str] = None,
                       min_sample_size: Optional[int] = None,
                       limit: int = 10) -> List[Dict[str, Any]]:
        """Perform combined search using both embedding and field filters"""
        # If no query text, just do field search
        if not query_text:
            return self.search_by_field(
                indication=indication,
                phase=phase,
                outcome=outcome,
                min_sample_size=min_sample_size,
                limit=limit
            )
            
        # First, get embedding-based results
        embedding_results = self.search_by_embedding(query_text, limit=limit*2)
        
        # Apply field filters to embedding results
        filtered_results = []
        
        for result in embedding_results:
            matches_filters = True
            
            if indication and indication.lower() not in result.get('indication', '').lower():
                matches_filters = False
                
            if phase and phase != result.get('phase'):
                matches_filters = False
                
            if outcome and outcome.lower() not in result.get('outcome', '').lower():
                matches_filters = False
                
            if min_sample_size is not None and result.get('sample_size', 0) < min_sample_size:
                matches_filters = False
                
            if matches_filters:
                filtered_results.append(result)
                
        # Sort by similarity and return top matches
        sorted_results = sorted(filtered_results, key=lambda x: x.get('similarity', 0), reverse=True)
        
        return sorted_results[:limit]
        
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the CSR database"""
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Get total count
        cursor.execute("SELECT COUNT(*) FROM csr_metadata")
        total_count = cursor.fetchone()[0]
        
        # Get indication distribution
        cursor.execute("""
        SELECT indication, COUNT(*) as count 
        FROM csr_metadata 
        GROUP BY indication 
        ORDER BY count DESC
        LIMIT 10
        """)
        indications = dict(cursor.fetchall())
        
        # Get phase distribution
        cursor.execute("""
        SELECT phase, COUNT(*) as count 
        FROM csr_metadata 
        GROUP BY phase
        """)
        phases = dict(cursor.fetchall())
        
        # Get outcome distribution
        cursor.execute("""
        SELECT outcome, COUNT(*) as count 
        FROM csr_metadata 
        GROUP BY outcome
        LIMIT 10
        """)
        outcomes = dict(cursor.fetchall())
        
        conn.close()
        
        return {
            "total_csrs": total_count,
            "indications": indications,
            "phases": phases,
            "outcomes": outcomes
        }

if __name__ == "__main__":
    # Example usage
    search_engine = CSRSearchEngine()
    
    # Import all CSRs in the processed directory
    imported = search_engine.import_directory()
    print(f"Imported {imported} CSRs into the search engine")
    
    # Example search query
    if imported > 0:
        results = search_engine.search_by_embedding("Phase 2 trial in multiple sclerosis with positive outcome")
        print(f"Found {len(results)} matching CSRs")
        for i, result in enumerate(results):
            print(f"{i+1}. {result['title']} (Similarity: {result['similarity']:.2f})")