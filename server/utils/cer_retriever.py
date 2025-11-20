"""cer_retriever.py – simple vector search over CER chunks (pgvector)"""
from sqlalchemy.orm import Session
from server.db import SessionLocal
from server.models.doc_chunk import DocChunk
from pgvector.sqlalchemy import vector_l2_distance
from openai import OpenAI

client = OpenAI()
EMBED_MODEL = 'text-embedding-3-small'

def embed(text: str):
    return client.embeddings.create(input=text, model=EMBED_MODEL).data[0].embedding

def retrieve_chunks(query: str, k: int = 5):
    db: Session = SessionLocal()
    qvec = embed(query)
    chunks = (
        db.query(DocChunk, vector_l2_distance(DocChunk.embedding, qvec).label('dist'))
        .order_by('dist')
        .limit(k)
        .all()
    )
    return [c.DocChunk.content for c in chunks]