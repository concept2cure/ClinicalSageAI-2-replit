#!/usr/bin/env python
"""
ICH Wiz Indexer

This module provides the functionality to index ICH guidelines documents 
in a vector database for semantic search.
"""
import os
import json
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Any, Union, Tuple

import openai
import pinecone
import structlog

from services.ich_wiz.config import settings

# Initialize structured logging
logger = structlog.get_logger(__name__)

class PineconeIndexer:
    """
    Indexer that uses Pinecone as a vector database for semantic search.
    """
    
    def __init__(
        self,
        api_key: str,
        environment: str,
        index_name: str,
        dimension: int = 1536,  # OpenAI embedding dimension
    ):
        """
        Initialize the Pinecone indexer.
        
        Args:
            api_key: Pinecone API key
            environment: Pinecone environment
            index_name: Name of the Pinecone index
            dimension: Dimension of the embeddings
        """
        self.api_key = api_key
        self.environment = environment
        self.index_name = index_name
        self.dimension = dimension
        self.pc = None
        self.index = None
        
        self._init_pinecone()
        
    def _init_pinecone(self):
        """Initialize the Pinecone client and index."""
        try:
            # Initialize Pinecone
            self.pc = pinecone.Pinecone(api_key=self.api_key, environment=self.environment)
            
            # Check if index exists
            existing_indexes = [index.name for index in self.pc.list_indexes()]
            
            if self.index_name not in existing_indexes:
                logger.info(f"Creating Pinecone index: {self.index_name}")
                self.pc.create_index(
                    name=self.index_name,
                    dimension=self.dimension,
                    metric="cosine"
                )
                # Wait for index to be ready
                time.sleep(5)
            
            # Connect to index
            self.index = self.pc.Index(self.index_name)
            logger.info(f"Connected to Pinecone index: {self.index_name}")
            
        except Exception as e:
            logger.error(f"Error initializing Pinecone: {str(e)}")
            raise
    
    def get_embedding(self, text: str) -> List[float]:
        """
        Get an embedding for the given text using OpenAI's embedding model.
        
        Args:
            text: The text to embed
            
        Returns:
            List of floats representing the embedding
        """
        try:
            response = openai.embeddings.create(
                model="text-embedding-3-large",
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Error getting embedding: {str(e)}")
            raise
    
    def index_document(
        self,
        document_id: str,
        text: str,
        metadata: Dict[str, Any],
        namespace: Optional[str] = None
    ) -> bool:
        """
        Index a document in Pinecone.
        
        Args:
            document_id: Unique ID for the document
            text: The text content to index
            metadata: Additional metadata to store with the vector
            namespace: Optional namespace for the vector
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Get embedding for text
            embedding = self.get_embedding(text)
            
            # Add text to metadata
            metadata["text"] = text
            
            # Upsert to Pinecone
            self.index.upsert(
                vectors=[
                    {
                        "id": document_id,
                        "values": embedding,
                        "metadata": metadata
                    }
                ],
                namespace=namespace
            )
            
            return True
        except Exception as e:
            logger.error(f"Error indexing document: {str(e)}")
            return False
    
    def search_similar(
        self,
        query: str,
        top_k: int = 5,
        namespace: Optional[str] = None,
        filter: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar documents to the query.
        
        Args:
            query: The query text
            top_k: Number of results to return
            namespace: Optional namespace to search in
            filter: Optional filter for the search
            
        Returns:
            List of match dictionaries with id, score, and metadata
        """
        try:
            # Get embedding for query
            query_embedding = self.get_embedding(query)
            
            # Query Pinecone
            results = self.index.query(
                vector=query_embedding,
                top_k=top_k,
                namespace=namespace,
                filter=filter,
                include_metadata=True
            )
            
            return results.matches
        except Exception as e:
            logger.error(f"Error searching similar documents: {str(e)}")
            return []
    
    def delete_document(
        self,
        document_id: str,
        namespace: Optional[str] = None
    ) -> bool:
        """
        Delete a document from the index.
        
        Args:
            document_id: ID of the document to delete
            namespace: Optional namespace of the document
            
        Returns:
            True if successful, False otherwise
        """
        try:
            self.index.delete(ids=[document_id], namespace=namespace)
            return True
        except Exception as e:
            logger.error(f"Error deleting document: {str(e)}")
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the index.
        
        Returns:
            Dictionary of index statistics
        """
        try:
            return self.index.describe_index_stats()
        except Exception as e:
            logger.error(f"Error getting index stats: {str(e)}")
            return {}