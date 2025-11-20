"""
Vector Indexer and Retriever for ICH Specialist Service

This module handles vector indexing and retrieval operations for ICH guidelines
and CSR documents, using OpenAI embeddings and Pinecone as a vector store.
"""
import os
import json
import time
from typing import Dict, Any, List, Optional, Tuple
import hashlib

import openai
import pinecone
import structlog

from services.ich_ingest.config import settings

# Configure logger
logger = structlog.get_logger(__name__)

class VectorIndexer:
    """Handles vector indexing operations for ICH guidelines and CSR documents"""
    
    def __init__(self):
        """Initialize vector indexer with OpenAI and Pinecone"""
        # Set up OpenAI client
        openai.api_key = settings.OPENAI_API_KEY
        
        # Set up Pinecone
        pinecone.init(
            api_key=settings.PINECONE_API_KEY, 
            environment=settings.PINECONE_ENV
        )
        
        # Check if index exists, if not create it
        if settings.PINECONE_INDEX not in pinecone.list_indexes():
            pinecone.create_index(
                name=settings.PINECONE_INDEX,
                dimension=1536,  # OpenAI embedding dimension
                metric="cosine"
            )
        
        self.index = pinecone.Index(settings.PINECONE_INDEX)
        
        # Create processed file tracking
        self.processed_file = os.path.join(settings.DATA_DIR, settings.PROCESSED_FILE)
        self.processed_docs = self._load_processed_docs()
        
        logger.info("Vector indexer initialized", 
                    index=settings.PINECONE_INDEX,
                    processed_docs_count=len(self.processed_docs))
    
    def _load_processed_docs(self) -> Dict[str, Dict[str, Any]]:
        """Load the list of processed documents from JSON file"""
        if os.path.exists(self.processed_file):
            try:
                with open(self.processed_file, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                logger.error("Error loading processed documents file", error=str(e))
                return {}
        else:
            logger.info("No processed documents file found, creating new one")
            return {}
    
    def _save_processed_docs(self) -> None:
        """Save the current list of processed documents to JSON file"""
        try:
            os.makedirs(os.path.dirname(self.processed_file), exist_ok=True)
            with open(self.processed_file, 'w') as f:
                json.dump(self.processed_docs, f, indent=2)
            logger.info("Saved processed documents file", count=len(self.processed_docs))
        except IOError as e:
            logger.error("Error saving processed documents file", error=str(e))
    
    def _generate_document_id(self, text: str, metadata: Dict[str, Any]) -> str:
        """Generate a unique ID for a document based on content hash and metadata"""
        content_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        source = metadata.get('source', 'unknown')
        doc_type = metadata.get('type', 'unknown')
        return f"{source}_{doc_type}_{content_hash[:10]}"
    
    async def _generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of texts
        
        Args:
            texts: List of text chunks
            
        Returns:
            List of embeddings
        """
        embeddings = []
        batch_size = 20  # Process in batches to avoid rate limits
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            try:
                response = await openai.Embedding.acreate(
                    input=batch,
                    model="text-embedding-ada-002"
                )
                batch_embeddings = [data["embedding"] for data in response["data"]]
                embeddings.extend(batch_embeddings)
                
                # Sleep briefly to avoid rate limiting
                if i + batch_size < len(texts):
                    time.sleep(0.5)
                    
            except Exception as e:
                logger.error("Error generating embeddings", 
                            error=str(e), 
                            batch_start=i, 
                            batch_size=len(batch))
                raise
        
        return embeddings
    
    def _chunk_text(self, text: str, chunk_size: int = None, overlap: int = None) -> List[str]:
        """
        Split text into overlapping chunks
        
        Args:
            text: Text to chunk
            chunk_size: Maximum chunk size in characters (default from settings)
            overlap: Overlap between chunks in characters (default from settings)
            
        Returns:
            List of text chunks
        """
        if chunk_size is None:
            chunk_size = settings.CHUNK_SIZE
        
        if overlap is None:
            overlap = settings.CHUNK_OVERLAP
        
        # Ensure chunk_size > overlap
        if chunk_size <= overlap:
            chunk_size = overlap + 100
            logger.warning("Adjusted chunk size to be larger than overlap", 
                          new_chunk_size=chunk_size, 
                          overlap=overlap)
        
        chunks = []
        start = 0
        text_length = len(text)
        
        # Split by paragraphs first then further chunk if needed
        paragraphs = text.split('\n\n')
        current_chunk = ""
        
        for paragraph in paragraphs:
            # If adding this paragraph would exceed chunk size
            if len(current_chunk) + len(paragraph) > chunk_size:
                # If current chunk is not empty, add it to chunks
                if current_chunk:
                    chunks.append(current_chunk.strip())
                
                # If paragraph itself is longer than chunk_size, split it further
                if len(paragraph) > chunk_size:
                    # Split large paragraph into sentences or hard break if needed
                    sentences = paragraph.split('. ')
                    current_chunk = ""
                    
                    for sentence in sentences:
                        if len(current_chunk) + len(sentence) > chunk_size:
                            if current_chunk:
                                chunks.append(current_chunk.strip())
                            
                            # If sentence itself is longer than chunk_size, hard break
                            if len(sentence) > chunk_size:
                                for i in range(0, len(sentence), chunk_size - overlap):
                                    chunks.append(sentence[i:i+chunk_size].strip())
                            else:
                                current_chunk = sentence
                        else:
                            if current_chunk:
                                current_chunk += ". " + sentence
                            else:
                                current_chunk = sentence
                else:
                    current_chunk = paragraph
            else:
                if current_chunk:
                    current_chunk += "\n\n" + paragraph
                else:
                    current_chunk = paragraph
        
        # Add the last chunk if it's not empty
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        logger.info("Text chunked successfully", 
                   original_text_length=text_length, 
                   chunk_count=len(chunks), 
                   avg_chunk_length=sum(len(c) for c in chunks)/max(1, len(chunks)))
        
        return chunks
    
    async def index_document(self, 
                            text: str,
                            metadata: Dict[str, Any],
                            chunks: Optional[List[str]] = None,
                            document_id: Optional[str] = None) -> int:
        """
        Index a document by chunking and generating embeddings
        
        Args:
            text: Full document text
            metadata: Document metadata (source, type, etc.)
            chunks: Optional pre-chunked text (if not provided, chunking will be performed)
            document_id: Optional document ID (if not provided, one will be generated)
            
        Returns:
            Number of chunks indexed
        """
        if not document_id:
            document_id = self._generate_document_id(text, metadata)
        
        # Check if document has already been processed
        if document_id in self.processed_docs:
            logger.info("Document already processed, skipping", 
                       document_id=document_id, 
                       metadata=metadata)
            return 0
        
        start_time = time.time()
        
        # Chunk the text if chunks not provided
        if not chunks:
            chunks = self._chunk_text(text)
        
        # Generate embeddings for chunks
        try:
            embeddings = await self._generate_embeddings(chunks)
            
            # Prepare vectors for Pinecone
            vectors = []
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                chunk_id = f"{document_id}_chunk_{i}"
                chunk_metadata = {
                    **metadata,
                    "chunk_index": i,
                    "chunk_count": len(chunks),
                    "text": chunk[:1000],  # Store first 1000 chars in metadata for quick access
                    "document_id": document_id
                }
                
                vectors.append((chunk_id, embedding, chunk_metadata))
            
            # Upsert vectors in batches
            batch_size = 100
            for i in range(0, len(vectors), batch_size):
                batch = vectors[i:i+batch_size]
                vector_batch = [(id, emb, meta) for id, emb, meta in batch]
                
                self.index.upsert(vectors=vector_batch)
                
                logger.info("Indexed batch of vectors", 
                           batch_number=i//batch_size+1, 
                           batch_size=len(batch), 
                           document_id=document_id)
            
            # Record the processed document
            self.processed_docs[document_id] = {
                "metadata": metadata,
                "chunk_count": len(chunks),
                "indexed_at": time.time(),
                "processing_time": time.time() - start_time
            }
            
            # Save the updated processed list
            self._save_processed_docs()
            
            logger.info("Document indexed successfully", 
                       document_id=document_id, 
                       chunk_count=len(chunks), 
                       processing_time=time.time() - start_time)
            
            return len(chunks)
            
        except Exception as e:
            logger.error("Error indexing document", 
                        document_id=document_id, 
                        error=str(e), 
                        metadata=metadata)
            raise
    
    async def delete_document(self, document_id: str) -> bool:
        """
        Delete a document and all its chunks from the vector store
        
        Args:
            document_id: ID of the document to delete
            
        Returns:
            True if document was deleted, False otherwise
        """
        if document_id not in self.processed_docs:
            logger.warning("Document not found for deletion", document_id=document_id)
            return False
        
        try:
            # Get number of chunks
            chunk_count = self.processed_docs[document_id]["chunk_count"]
            
            # Delete all chunks
            chunk_ids = [f"{document_id}_chunk_{i}" for i in range(chunk_count)]
            self.index.delete(ids=chunk_ids)
            
            # Remove from processed docs
            del self.processed_docs[document_id]
            self._save_processed_docs()
            
            logger.info("Document deleted successfully", 
                       document_id=document_id, 
                       chunk_count=chunk_count)
            
            return True
            
        except Exception as e:
            logger.error("Error deleting document", 
                        document_id=document_id, 
                        error=str(e))
            return False


class VectorRetriever:
    """Handles vector retrieval operations for ICH guidelines and CSR documents"""
    
    def __init__(self):
        """Initialize vector retriever with Pinecone"""
        # Set up OpenAI client
        openai.api_key = settings.OPENAI_API_KEY
        
        # Set up Pinecone
        pinecone.init(
            api_key=settings.PINECONE_API_KEY, 
            environment=settings.PINECONE_ENV
        )
        
        self.index = pinecone.Index(settings.PINECONE_INDEX)
        logger.info("Vector retriever initialized", index=settings.PINECONE_INDEX)
    
    async def _generate_query_embedding(self, query: str) -> List[float]:
        """Generate an embedding for a query text"""
        try:
            response = await openai.Embedding.acreate(
                input=query,
                model="text-embedding-ada-002"
            )
            return response["data"][0]["embedding"]
        except Exception as e:
            logger.error("Error generating query embedding", error=str(e))
            raise
    
    async def retrieve(self, 
                      query: str, 
                      module: Optional[str] = None,
                      document_type: Optional[str] = None,
                      top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Retrieve relevant documents for a query
        
        Args:
            query: Query text
            module: Optional ICH module to filter by (e.g., E6, E3)
            document_type: Optional document type to filter by (e.g., protocol, csr)
            top_k: Number of results to return
            
        Returns:
            List of document chunks with metadata
        """
        start_time = time.time()
        
        # Generate embedding for the query
        query_embedding = await self._generate_query_embedding(query)
        
        # Prepare filter if needed
        filter_dict = {}
        if module:
            filter_dict["module"] = module
        if document_type:
            filter_dict["type"] = document_type
        
        # Perform the query
        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True,
            filter=filter_dict if filter_dict else None
        )
        
        # Process results
        retrieved_chunks = []
        for match in results["matches"]:
            retrieved_chunks.append({
                "id": match["id"],
                "score": match["score"],
                "metadata": match["metadata"],
                "text": match["metadata"].get("text", ""),
                "document_id": match["metadata"].get("document_id", "")
            })
        
        logger.info("Retrieved documents for query", 
                   query_length=len(query), 
                   result_count=len(retrieved_chunks), 
                   top_score=retrieved_chunks[0]["score"] if retrieved_chunks else None,
                   processing_time=time.time() - start_time)
        
        return retrieved_chunks