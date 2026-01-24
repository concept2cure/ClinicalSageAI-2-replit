# 🧠 SagePlus | CSR Database Integration (Phase 3: Vector Database Storage)
# Stores vectorized CSR data in a searchable vector database

import os
import json
import time
from typing import List, Dict, Any
import pymongo
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection settings
MONGODB_URI = os.getenv("MONGODB_URI") or "mongodb://localhost:27017/"
DB_NAME = "trialsage"
CSR_COLLECTION = "csr_reports"
VECTOR_COLLECTION = "csr_vectors"

class CSRDatabase:
    """Class to handle database operations for CSR data and vectors"""
    
    def __init__(self):
        """Initialize database connections"""
        self.client = pymongo.MongoClient(MONGODB_URI)
        self.db = self.client[DB_NAME]
        self.csr_collection = self.db[CSR_COLLECTION]
        self.vector_collection = self.db[VECTOR_COLLECTION]
        
        # Create indexes for efficient querying
        self.csr_collection.create_index("indication")
        self.csr_collection.create_index("phase")
        self.csr_collection.create_index("nct_id", unique=True)
        
    def store_csr_data(self, csr_data: Dict[str, Any]) -> str:
        """Store structured CSR data in the database"""
        try:
            # Use NCT ID as a unique identifier if available
            nct_id = csr_data.get('nct_id')
            if nct_id:
                # Update if exists, insert if not
                result = self.csr_collection.update_one(
                    {"nct_id": nct_id},
                    {"$set": csr_data},
                    upsert=True
                )
                return str(result.upserted_id or nct_id)
            else:
                # No NCT ID, just insert
                result = self.csr_collection.insert_one(csr_data)
                return str(result.inserted_id)
        except Exception as e:
            print(f"Error storing CSR data: {e}")
            return None
            
    def store_vector_data(self, csr_id: str, summary: str, embedding: List[float]) -> bool:
        """Store vector embeddings for similarity search"""
        try:
            result = self.vector_collection.update_one(
                {"csr_id": csr_id},
                {
                    "$set": {
                        "csr_id": csr_id,
                        "summary": summary,
                        "embedding": embedding,
                        "updated_at": time.time()
                    }
                },
                upsert=True
            )
            return True
        except Exception as e:
            print(f"Error storing vector data: {e}")
            return False
            
    def search_similar_trials(self, query_embedding: List[float], limit: int = 5) -> List[Dict]:
        """Search for similar trials using vector similarity"""
        # This is a simplified implementation - would need a proper vector database
        # like ChromaDB or Weaviate for production use
        pipeline = [
            {
                "$addFields": {
                    "similarity": {
                        "$sum": {
                            "$map": {
                                "input": {"$zip": {"inputs": ["$embedding", query_embedding]}},
                                "in": {"$multiply": ["$$this.0", "$$this.1"]}
                            }
                        }
                    }
                }
            },
            {"$sort": {"similarity": -1}},
            {"$limit": limit},
            {"$project": {"_id": 0, "csr_id": 1, "summary": 1, "similarity": 1}}
        ]
        
        results = list(self.vector_collection.aggregate(pipeline))
        
        # Get the full CSR data for each result
        enriched_results = []
        for result in results:
            csr_data = self.csr_collection.find_one({"_id": result["csr_id"]})
            if csr_data:
                result["csr_data"] = csr_data
                enriched_results.append(result)
                
        return enriched_results
        
    def filter_trials(self, filters: Dict[str, Any], limit: int = 20) -> List[Dict]:
        """Filter trials by structured fields like indication, phase, etc."""
        query = {k: v for k, v in filters.items() if v}
        return list(self.csr_collection.find(query, limit=limit))
        
    def get_trial_by_nct(self, nct_id: str) -> Dict:
        """Get a specific trial by NCT ID"""
        return self.csr_collection.find_one({"nct_id": nct_id})
        
    def import_from_json_files(self, directory: str) -> int:
        """Import CSR data from JSON files"""
        files = [f for f in os.listdir(directory) if f.endswith(".json")]
        imported_count = 0
        
        for file in files:
            file_path = os.path.join(directory, file)
            try:
                with open(file_path, 'r') as f:
                    csr_data = json.load(f)
                    
                # Store the structured data
                csr_id = self.store_csr_data(csr_data)
                
                # Store the vector embedding if available
                embedding = csr_data.get('embedding')
                summary = csr_data.get('text_summary')
                if csr_id and embedding and summary:
                    self.store_vector_data(csr_id, summary, embedding)
                    imported_count += 1
                    
            except Exception as e:
                print(f"Error importing {file}: {e}")
                
        return imported_count

# Example usage
if __name__ == "__main__":
    db = CSRDatabase()
    count = db.import_from_json_files("csr_vectors")
    print(f"Imported {count} CSR reports into the database")