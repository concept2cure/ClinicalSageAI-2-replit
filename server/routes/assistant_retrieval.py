"""
Assistant Retrieval API routes for context-aware assistant.
Provides semantic search over document chunks using pgvector.
Enhanced with Relation Extraction, Advanced QA, and Summarization capabilities.
"""

from typing import List, Dict, Any, Optional, Tuple
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import json
import time
import asyncio
import re
import hashlib
from datetime import datetime
import logging

import openai
from pgvector.sqlalchemy import Vector
from sqlalchemy.sql import func
from sqlalchemy import Column, Integer, String, Text, ForeignKey, create_engine, ARRAY, UniqueConstraint, Index, Float, DateTime
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.dialects.postgresql import ARRAY as PostgresArray

# Use operator for vector similarity - pgvector style
from sqlalchemy import text

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create a router
router = APIRouter()

# Base class for SQLAlchemy models
Base = declarative_base()

# Document Chunk model with vector embeddings and regulatory metadata
class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    
    # --- Existing Fields ---
    id = Column(Integer, primary_key=True)
    doc_id = Column(String(255), nullable=False, index=True)
    doc_title = Column(String(255), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=False)  # OpenAI embedding dimension is 1536

    # --- New Regulatory Metadata Fields ---
    ectd_section = Column(String(255), nullable=True, index=True)  # e.g., '5.3.5.1'
    page_number = Column(Integer, nullable=True)
    doc_type = Column(String(255), nullable=True, index=True)  # e.g., 'CSR', 'ICH_Guideline'
    region_tag = Column(ARRAY(String), nullable=True)  # e.g., ['FDA', 'EMA']

    # Unique constraint to prevent duplicate chunks
    __table_args__ = (UniqueConstraint('doc_id', 'chunk_index', name='_doc_chunk_uc'),)

# Regulatory Relations model for knowledge graph
class RegulatoryRelation(Base):
    __tablename__ = "regulatory_relations"
    
    id = Column(Integer, primary_key=True)
    doc_id = Column(String(255), nullable=False, index=True)
    relation_type = Column(String(100), nullable=False, index=True)
    subject = Column(Text)
    predicate = Column(Text)
    object = Column(Text)
    confidence = Column(Float, default=0.5)
    source_method = Column(String(50))
    tenant_id = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# Regulatory relation extraction patterns
REGULATORY_PATTERNS = {
    'requirement': [
        r'(?:must|shall|required to|obligated to)\s+([^\.]+)',
        r'it is (?:mandatory|required|obligatory) (?:to|that)\s+([^\.]+)',
        r'(?:sponsor|manufacturer|applicant) (?:must|shall)\s+([^\.]+)'
    ],
    'prohibition': [
        r'(?:must not|shall not|prohibited from|may not)\s+([^\.]+)',
        r'it is (?:prohibited|forbidden) (?:to|that)\s+([^\.]+)'
    ],
    'recommendation': [
        r'(?:should|recommended to|advised to)\s+([^\.]+)',
        r'it is (?:recommended|suggested) (?:to|that)\s+([^\.]+)'
    ],
    'timeline': [
        r'within (\d+)\s+(?:days|months|years)',
        r'no later than\s+([^\.]+)',
        r'by\s+(?:the end of|no later than)\s+([^\.]+)'
    ],
    'submission': [
        r'submit\s+(?:the|a|an)?\s*([^\.]+)',
        r'file\s+(?:the|a|an)?\s*([^\.]+)',
        r'provide\s+(?:the|a|an)?\s*([^\.]+)'
    ]
}

# Database session dependency
def get_db():
    """Database dependency"""
    import os
    database_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/postgres')
    engine = create_engine(database_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Helper function to extract relations from text
def extract_relations(text: str, tenant_id: str) -> List[Dict[str, Any]]:
    """Extract regulatory relationships from text"""
    relations = []
    
    # Extract pattern-based relations
    for relation_type, patterns in REGULATORY_PATTERNS.items():
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                relations.append({
                    'type': relation_type,
                    'text': match.group(0),
                    'object': match.group(1) if match.groups() else match.group(0),
                    'confidence': 0.8,
                    'source': 'pattern',
                    'tenant_id': tenant_id,
                    'extracted_at': datetime.utcnow().isoformat()
                })
    
    # Deduplicate similar relations
    unique_relations = []
    seen_hashes = set()
    
    for rel in relations:
        rel_hash = hashlib.md5(
            json.dumps(rel, sort_keys=True).encode()
        ).hexdigest()[:8]
        
        if rel_hash not in seen_hashes:
            seen_hashes.add(rel_hash)
            unique_relations.append(rel)
    
    return unique_relations

# Helper function to get tenant ID from request
def get_tenant_id(request: Request) -> str:
    """Extract tenant ID from request headers or use default"""
    tenant_id = request.headers.get('tenant-id', 'default')
    return tenant_id

@router.post("/retrieve")
async def retrieve(request: Request, db: Session = Depends(get_db)):
    """
    Retrieve relevant document chunks based on semantic search
    """
    # Parse request body
    try:
        body = await request.body()
        data = json.loads(body) if body else {}
        query = data.get("query", "")
    except Exception as e:
        return {"error": "Invalid request format", "details": str(e)}
    
    # Generate embedding for the query
    openai_client = openai.OpenAI()
    embedding_response = openai_client.embeddings.create(
        model="text-embedding-ada-002",
        input=query
    )
    query_embedding = embedding_response.data[0].embedding
    
    # Perform similarity search using pgvector
    results = db.execute(
        text("""
            SELECT id, doc_id, doc_title, chunk_index, content, 
                   ectd_section, page_number, doc_type, region_tag
            FROM document_chunks 
            ORDER BY embedding <=> :embedding 
            LIMIT 5
        """),
        {"embedding": str(query_embedding)}
    ).fetchall()
    
    # Format results with enhanced regulatory metadata
    formatted_results = []
    for row in results:
        formatted_results.append({
            "doc_id": row[1],
            "doc_title": row[2],
            "content": row[4],
            "chunk_index": row[3],
            "ectd_section": row[5],
            "page_number": row[6],
            "doc_type": row[7],
            "region_tag": row[8]
        })
    
    return {"results": formatted_results}

@router.post("/extract_relations")
async def extract_document_relations(request: Request, db: Session = Depends(get_db)):
    """
    Extract regulatory relationships from document text
    
    Request body:
    {
        "text": "Document text to analyze",
        "doc_id": "Optional document ID for storing relations"
    }
    """
    try:
        tenant_id = get_tenant_id(request)
        data = await request.json()
        text = data.get("text", "")
        doc_id = data.get("doc_id")
        
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        
        # Extract relations
        relations = extract_relations(text, tenant_id)
        
        # If doc_id provided, store relations in database
        if doc_id and relations:
            for relation in relations:
                try:
                    db.execute(
                        text("""
                            INSERT INTO regulatory_relations 
                            (doc_id, relation_type, subject, predicate, object, 
                             confidence, source_method, tenant_id, created_at)
                            VALUES 
                            (:doc_id, :type, :subject, :predicate, :object,
                             :confidence, :source, :tenant_id, NOW())
                            ON CONFLICT DO NOTHING
                        """),
                        {
                            "doc_id": doc_id,
                            "type": relation.get('type'),
                            "subject": relation.get('text', ''),
                            "predicate": relation.get('type', ''),
                            "object": relation.get('object', ''),
                            "confidence": relation.get('confidence', 0.5),
                            "source": relation.get('source', 'unknown'),
                            "tenant_id": tenant_id
                        }
                    )
                except Exception as e:
                    logger.warning(f"Failed to store relation: {e}")
            
            db.commit()
        
        return {
            "success": True,
            "relations": relations,
            "count": len(relations),
            "tenant_id": tenant_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting relations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/advanced_qa")
async def advanced_question_answering(request: Request, db: Session = Depends(get_db)):
    """
    Advanced question answering with tenant-isolated document context
    
    Request body:
    {
        "question": "User's question",
        "doc_type": "Optional: CSR, ICH_Guideline, etc.",
        "region_tags": ["FDA", "EMA"],
        "max_chunks": 5
    }
    """
    try:
        tenant_id = get_tenant_id(request)
        data = await request.json()
        question = data.get("question", "")
        doc_type = data.get("doc_type")
        region_tags = data.get("region_tags", [])
        max_chunks = data.get("max_chunks", 5)
        
        if not question:
            raise HTTPException(status_code=400, detail="Question is required")
        
        # Generate embedding for the question
        openai_client = openai.OpenAI()
        embedding_response = openai_client.embeddings.create(
            model="text-embedding-ada-002",
            input=question
        )
        question_embedding = embedding_response.data[0].embedding
        
        # Build tenant-isolated query
        query_parts = [
            "SELECT id, doc_id, doc_title, chunk_index, content,",
            "ectd_section, page_number, doc_type, region_tag,",
            "1 - (embedding <=> :embedding) as similarity",
            "FROM document_chunks",
            "WHERE tenant_id = :tenant_id"
        ]
        
        params = {
            "embedding": str(question_embedding),
            "tenant_id": tenant_id
        }
        
        if doc_type:
            query_parts.append("AND doc_type = :doc_type")
            params["doc_type"] = doc_type
        
        if region_tags:
            # PostgreSQL array overlap operator
            query_parts.append("AND region_tag && ARRAY[:region_tags]")
            params["region_tags"] = region_tags
        
        query_parts.extend([
            "ORDER BY embedding <=> :embedding",
            f"LIMIT {max_chunks}"
        ])
        
        # Execute query
        results = db.execute(
            text(" ".join(query_parts)),
            params
        ).fetchall()
        
        if not results:
            return {
                "answer": "I couldn't find relevant information to answer your question.",
                "confidence": 0.0,
                "citations": [],
                "tenant_id": tenant_id
            }
        
        # Prepare context from retrieved chunks
        context_parts = []
        citations = []
        
        for row in results:
            context_parts.append(f"[{row.doc_title}] {row.content}")
            citations.append({
                "doc_id": row.doc_id,
                "doc_title": row.doc_title,
                "page_number": row.page_number,
                "ectd_section": row.ectd_section,
                "similarity": float(row.similarity) if row.similarity else 0.0
            })
        
        context = "\n\n".join(context_parts)
        
        # Generate answer using GPT-4
        system_prompt = """You are a regulatory compliance expert AI assistant.
Answer the question based ONLY on the provided context from regulatory documents.
Be precise and cite specific sections when possible.
If the context doesn't contain enough information, say so clearly."""
        
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}
            ],
            temperature=0.3,
            max_tokens=500
        )
        
        answer = response.choices[0].message.content
        
        # Calculate confidence based on similarity scores
        avg_similarity = sum(c["similarity"] for c in citations) / len(citations) if citations else 0.0
        
        # Extract any relations from the answer
        answer_relations = extract_relations(answer, tenant_id)
        
        return {
            "answer": answer,
            "confidence": avg_similarity,
            "citations": citations,
            "extracted_relations": answer_relations,
            "tenant_id": tenant_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in advanced QA: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/summarize_document")
async def summarize_regulatory_document(request: Request, db: Session = Depends(get_db)):
    """
    Generate domain-specific summary of a regulatory document
    
    Request body:
    {
        "doc_id": "Document ID to summarize",
        "summary_type": "key_findings|obligations|changes"
    }
    """
    try:
        tenant_id = get_tenant_id(request)
        data = await request.json()
        doc_id = data.get("doc_id")
        summary_type = data.get("summary_type", "key_findings")
        
        if not doc_id:
            raise HTTPException(status_code=400, detail="doc_id is required")
        
        if summary_type not in ["key_findings", "obligations", "changes"]:
            raise HTTPException(status_code=400, detail="Invalid summary_type")
        
        # Retrieve document chunks
        chunks = db.execute(
            text("""
                SELECT content, doc_type, ectd_section, page_number, doc_title
                FROM document_chunks
                WHERE doc_id = :doc_id AND tenant_id = :tenant_id
                ORDER BY chunk_index
            """),
            {"doc_id": doc_id, "tenant_id": tenant_id}
        ).fetchall()
        
        if not chunks:
            raise HTTPException(status_code=404, detail=f"No chunks found for document {doc_id}")
        
        # Extract document info
        doc_type = chunks[0].doc_type if chunks[0].doc_type else 'general'
        doc_title = chunks[0].doc_title if chunks[0].doc_title else f'Document {doc_id}'
        
        # Limit text for summarization
        max_chunks_for_summary = 20
        text_chunks = [chunk.content for chunk in chunks[:max_chunks_for_summary]]
        full_text = "\n".join(text_chunks)
        
        # Generate summary based on type
        openai_client = openai.OpenAI()
        
        if summary_type == "key_findings":
            prompt = f"""Extract the key findings from this {doc_type} document titled '{doc_title}'.
Focus on:
- Main conclusions or results
- Critical safety information
- Regulatory implications
- Important timelines or deadlines

Text:
{full_text[:4000]}

Provide a structured summary with bullet points."""
        
        elif summary_type == "obligations":
            prompt = f"""Extract all regulatory obligations and requirements from this {doc_type} document.
List each obligation with:
- What must be done
- Who is responsible
- Timeline (if specified)
- Consequences of non-compliance (if mentioned)

Text:
{full_text[:4000]}"""
        
        else:  # changes
            prompt = f"""Identify and summarize any changes, updates, or amendments mentioned in this document.
Focus on:
- What changed
- When it changed
- Impact of the change
- Transition requirements

Text:
{full_text[:4000]}"""
        
        # Generate summary
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a regulatory expert specializing in pharmaceutical and medical device documentation."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1000
        )
        
        summary = response.choices[0].message.content
        
        # Extract relations from summary
        summary_relations = extract_relations(summary, tenant_id)
        
        # Calculate metrics
        word_count = len(full_text.split())
        summary_word_count = len(summary.split())
        compression_ratio = summary_word_count / word_count if word_count > 0 else 0
        
        return {
            "doc_id": doc_id,
            "doc_title": doc_title,
            "doc_type": doc_type,
            "summary_type": summary_type,
            "summary": summary,
            "chunks_analyzed": min(len(chunks), max_chunks_for_summary),
            "total_chunks": len(chunks),
            "extracted_relations": summary_relations,
            "metrics": {
                "original_word_count": word_count,
                "summary_word_count": summary_word_count,
                "compression_ratio": compression_ratio
            },
            "tenant_id": tenant_id,
            "generated_at": datetime.utcnow().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in document summarization: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stream_with_context")
async def chat_stream_with_context(request: Request, db: Session = Depends(get_db)):
    """
    Stream OpenAI completions with document context for citations
    """
    # Parse request
    data = await request.json()
    messages = data.get("messages", [])
    query = data.get("query", "")
    
    # Generate embedding for the query
    openai_client = openai.OpenAI()
    embedding_response = openai_client.embeddings.create(
        model="text-embedding-ada-002",
        input=query
    )
    query_embedding = embedding_response.data[0].embedding
    
    # Perform similarity search using pgvector
    results = []
    try:
        results = db.execute(
            text("""
                SELECT id, doc_id, doc_title, chunk_index, content, 
                       ectd_section, page_number, doc_type, region_tag
                FROM document_chunks 
                ORDER BY embedding <=> :embedding 
                LIMIT 5
            """),
            {"embedding": str(query_embedding)}
        ).fetchall()
    except Exception as e:
        print(f"Vector search error: {e}")
    
    # Format context
    context = ""
    citations = []
    
    if results:
        context = "Here are some relevant document excerpts that might help with the response:\n\n"
        for i, row in enumerate(results):
            formatted_citation = {
                "doc_id": row[1],
                "doc_title": row[2] or f"Document {row[1]}",
                "content": row[4],
                "chunk_index": row[3],
                "ectd_section": row[5],
                "page_number": row[6],
                "doc_type": row[7],
                "region_tag": row[8],
                "idx": i+1
            }
            citations.append(formatted_citation)
            page_info = f" (page {row[6]})" if row[6] else ""
            section_info = f" [{row[5]}]" if row[5] else ""
            context += f"[{i+1}] From {row[2] or f'Document {row[1]}'}{section_info}{page_info}: {row[4]}\n\n"
    
    # Prepare system message with context
    system_message = {
        "role": "system",
        "content": """You are TrialSage Assistant, an expert in clinical trials, regulatory research, and drug development.
Use your knowledge to help the user with their clinical trial and regulatory questions.
If the information is available in the provided context, make sure to reference it using citation numbers like [1], [2], etc.
Be accurate, helpful, and clear in your responses."""
    }
    
    if context:
        system_message["content"] += f"\n\n{context}"
    
    # Add system message to the beginning of the messages
    full_messages = [system_message] + messages
    
    def gen():
        # First, send the metadata with citation information
        metadata_json = json.dumps({
            "metadata": {
                "citations": citations
            }
        })
        yield f"{metadata_json}\n"
        
        # Then stream the actual response
        try:
            stream = openai_client.chat.completions.create(
                model="gpt-4o",  # the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
                messages=full_messages,
                stream=True,
            )
            
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            yield f"\n\nError generating response: {str(e)}"
    
    return StreamingResponse(gen(), media_type="text/event-stream")